-- =====================================================================
-- PrepIQ · 0009 · Indicadores y reportes
-- Todo se calcula con datos reales registrados. Nada de cifras inventadas.
--   * Tiempo de ciclo = listo − marchado − tiempo bloqueado (faltantes).
--   * A tiempo = ciclo ≤ objetivo del ticket (máx. tiempo de sus productos).
--   * Reprocesos, anulaciones y faltantes con motivos.
--   * Diferencia teórico vs. contado por conteo aprobado.
-- =====================================================================

create or replace function app.ticket_cycle_minutes(t public.kitchen_tickets) returns numeric
language sql immutable as $$
  select case when t.ready_at is not null and t.fired_at is not null then
    round(greatest(extract(epoch from t.ready_at - t.fired_at) - t.blocked_seconds, 0)::numeric / 60, 2) end
$$;

create or replace function public.report_kitchen(
  p_restaurant_id uuid, p_from timestamptz, p_to timestamptz, p_station_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v jsonb;
begin
  if not app.has_perm(p_restaurant_id, 'reports.view') then perform app.fail('permiso_denegado', 'reports.view'); end if;
  with t as (
    select k.*, app.ticket_cycle_minutes(k) as cycle,
      case when k.started_at is not null and k.fired_at is not null
        then round(extract(epoch from k.started_at - k.fired_at)::numeric / 60, 2) end as wait
    from public.kitchen_tickets k
    where k.restaurant_id = p_restaurant_id and k.created_at >= p_from and k.created_at < p_to
      and (p_station_id is null or k.station_id = p_station_id)
  ), by_station as (
    select s.id as station_id, s.name,
      count(t.id) filter (where t.status <> 'anulado') as tickets,
      count(t.id) filter (where t.ready_at is not null) as completed,
      round(avg(t.cycle), 1) as avg_cycle,
      round((percentile_cont(0.5) within group (order by t.cycle))::numeric, 1) as p50_cycle,
      round((percentile_cont(0.9) within group (order by t.cycle))::numeric, 1) as p90_cycle,
      round(avg(t.wait), 1) as avg_wait,
      round(100.0 * count(t.id) filter (where t.cycle <= t.target_minutes) / nullif(count(t.id) filter (where t.cycle is not null), 0), 1) as on_time_pct,
      sum(t.reopen_count) as reopens,
      count(t.id) filter (where t.blocked_seconds > 0 or t.blocked) as blocked_tickets,
      round(sum(t.blocked_seconds)::numeric / 60, 1) as blocked_minutes,
      sum(t.complexity_points) filter (where t.status <> 'anulado') as complexity_points
    from public.stations s left join t on t.station_id = s.id
    where s.restaurant_id = p_restaurant_id and (p_station_id is null or s.id = p_station_id)
    group by s.id, s.name
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'stations', coalesce((select jsonb_agg(to_jsonb(b) order by b.name) from by_station b), '[]'::jsonb),
    'reopen_reasons', coalesce((select jsonb_object_agg(reason, n) from (
        select e.reason, count(*) n from public.ticket_events e join t on t.id = e.ticket_id
        where e.action = 'reabrir' group by e.reason) x), '{}'::jsonb),
    'void_reasons', coalesce((select jsonb_object_agg(void_reason, n) from (
        select i.void_reason, count(*) n from public.order_items i
        where i.restaurant_id = p_restaurant_id and i.voided_at >= p_from and i.voided_at < p_to and i.status = 'anulado'
        group by i.void_reason) x), '{}'::jsonb),
    'voids_after_send', (select count(*) from public.order_items i where i.restaurant_id = p_restaurant_id
        and i.voided_at >= p_from and i.voided_at < p_to and i.sent_at is not null),
    'shortages', (select count(*) from public.incidents x where x.restaurant_id = p_restaurant_id and x.kind = 'faltante'
        and x.created_at >= p_from and x.created_at < p_to),
    'orders', (select count(*) from public.orders o where o.restaurant_id = p_restaurant_id
        and o.created_at >= p_from and o.created_at < p_to and o.status <> 'anulada'),
    'by_hour', coalesce((select jsonb_agg(h order by h.hour) from (
        select extract(hour from t.fired_at at time zone r.timezone)::int as hour, count(*) as tickets,
               round(avg(t.cycle), 1) as avg_cycle
        from t join public.restaurants r on r.id = t.restaurant_id
        where t.fired_at is not null group by 1) h), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Indicadores del equipo para el encabezado del KDS (jornada abierta).
-- Metas de EQUIPO, no clasificación individual.
create or replace function public.kds_team_stats(p_restaurant_id uuid, p_station_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v jsonb; v_day uuid; v_goal numeric;
begin
  if not app.has_perm(p_restaurant_id, 'kds.view') then perform app.fail('permiso_denegado', 'kds.view'); end if;
  select id into v_day from public.service_days where restaurant_id = p_restaurant_id and status = 'abierta';
  select coalesce((settings->>'team_on_time_goal_pct')::numeric, 85) into v_goal from public.restaurants where id = p_restaurant_id;
  select jsonb_build_object(
    'service_day_id', v_day,
    'goal_pct', v_goal,
    'completed', count(*) filter (where ready_at is not null),
    'on_time', count(*) filter (where ready_at is not null and app.ticket_cycle_minutes(k) <= target_minutes),
    'on_time_pct', round(100.0 * count(*) filter (where ready_at is not null and app.ticket_cycle_minutes(k) <= target_minutes)
                   / nullif(count(*) filter (where ready_at is not null), 0), 0),
    'reopens', coalesce(sum(reopen_count), 0),
    'queue', count(*) filter (where status in ('nuevo', 'en_preparacion')),
    'queue_points', coalesce(sum(complexity_points) filter (where status in ('nuevo', 'en_preparacion')), 0),
    'blocked', count(*) filter (where blocked),
    'points_done', coalesce(sum(complexity_points) filter (where ready_at is not null), 0)
  ) into v
  from public.kitchen_tickets k
  where k.restaurant_id = p_restaurant_id and k.service_day_id = v_day
    and (p_station_id is null or k.station_id = p_station_id) and k.status <> 'anulado';
  return v;
end $$;

-- Línea de tiempo de un ticket: ¿por qué se retrasó?
create or replace function public.report_ticket_timeline(p_restaurant_id uuid, p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.has_perm(p_restaurant_id, 'kds.view') then perform app.fail('permiso_denegado'); end if;
  return (select jsonb_build_object(
    'ticket', app.ticket_json(p_ticket_id),
    'cycle_minutes', app.ticket_cycle_minutes(k),
    'station_name', (select name from public.stations where id = k.station_id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'action', e.action, 'from', e.from_status,
        'to', e.to_status, 'reason', e.reason, 'note', e.note, 'staff', s.display_name, 'authorized_by', a.display_name,
        'device', d.name) order by e.at)
      from public.ticket_events e left join public.staff s on s.id = e.staff_id
      left join public.staff a on a.id = e.authorized_by and e.authorized_by <> e.staff_id
      left join public.devices d on d.id = e.device_id
      where e.ticket_id = k.id), '[]'::jsonb),
    'order', app.order_json(k.order_id))
  from public.kitchen_tickets k where k.id = p_ticket_id and k.restaurant_id = p_restaurant_id);
end $$;

-- Diferencias de un conteo aprobado (teórico vs. contado).
create or replace function public.report_count_variance(p_restaurant_id uuid, p_count_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v_cost boolean := app.has_perm(p_restaurant_id, 'inventory.view_cost');
begin
  if not app.has_perm(p_restaurant_id, 'inventory.view') then perform app.fail('permiso_denegado'); end if;
  return (select jsonb_build_object(
    'count', to_jsonb(c),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'ingredient_id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'category', i.category,
        'counted', l.counted_base,
        'theoretical', coalesce(l.theoretical_base, app.theoretical_at(i.id, c.as_of)),
        'variance', coalesce(l.variance_base, l.counted_base - app.theoretical_at(i.id, c.as_of)),
        'variance_pct', round(100 * coalesce(l.variance_base, l.counted_base - app.theoretical_at(i.id, c.as_of))
                        / nullif(abs(coalesce(l.theoretical_base, app.theoretical_at(i.id, c.as_of))), 0), 1),
        'variance_value', case when v_cost then round(coalesce(l.variance_base, l.counted_base - app.theoretical_at(i.id, c.as_of))
                          * app.unit_cost_of(i.id), 2) end
      ) order by i.category nulls last, i.name)
      from public.inventory_count_lines l join public.ingredients i on i.id = l.ingredient_id where l.count_id = c.id), '[]'::jsonb))
  from public.inventory_counts c where c.id = p_count_id and c.restaurant_id = p_restaurant_id);
end $$;

-- Mermas y consumos no vendidos por motivo e insumo.
create or replace function public.report_waste(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v_cost boolean := app.has_perm(p_restaurant_id, 'inventory.view_cost');
begin
  if not app.has_perm(p_restaurant_id, 'inventory.view') then perform app.fail('permiso_denegado'); end if;
  return jsonb_build_object(
    'by_reason', coalesce((select jsonb_agg(x) from (
      select coalesce(m.waste_reason::text, m.kind::text) as reason, count(*) as movements,
        case when v_cost then round(sum(-m.qty_base * coalesce(m.unit_cost, 0)), 2) end as value
      from public.inventory_movements m where m.restaurant_id = p_restaurant_id
        and m.kind in ('merma', 'reproceso', 'consumo_interno') and m.effective_at >= p_from and m.effective_at < p_to
      group by 1 order by 2 desc) x), '[]'::jsonb),
    'by_ingredient', coalesce((select jsonb_agg(x) from (
      select i.name, i.base_unit, m.kind, coalesce(m.waste_reason::text, '') as reason, round(sum(-m.qty_base), 2) as qty,
        case when v_cost then round(sum(-m.qty_base * coalesce(m.unit_cost, 0)), 2) end as value
      from public.inventory_movements m join public.ingredients i on i.id = m.ingredient_id
      where m.restaurant_id = p_restaurant_id and m.kind in ('merma', 'reproceso', 'consumo_interno')
        and m.effective_at >= p_from and m.effective_at < p_to
      group by i.name, i.base_unit, m.kind, m.waste_reason order by 5 desc limit 200) x), '[]'::jsonb)
  );
end $$;

-- Cobertura: productos activos sin receta activa (el teórico los ignora).
create or replace function public.report_recipe_coverage(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.has_perm(p_restaurant_id, 'inventory.view') then perform app.fail('permiso_denegado'); end if;
  return jsonb_build_object(
    'menu_items_total', (select count(*) from public.menu_items where restaurant_id = p_restaurant_id and active),
    'without_recipe', coalesce((select jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name) order by mi.name)
      from public.menu_items mi where mi.restaurant_id = p_restaurant_id and mi.active and not exists (
        select 1 from public.recipes r join public.recipe_versions rv on rv.recipe_id = r.id and rv.status = 'activa'
        where r.menu_item_id = mi.id)), '[]'::jsonb),
    'prepared_without_recipe', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) order by i.name)
      from public.ingredients i where i.restaurant_id = p_restaurant_id and i.active and i.kind = 'preparado' and not exists (
        select 1 from public.recipes r join public.recipe_versions rv on rv.recipe_id = r.id and rv.status = 'activa'
        where r.output_ingredient_id = i.id)), '[]'::jsonb)
  );
end $$;
