-- =====================================================================
-- PrepIQ · Pendiente para el proyecto ptbqyymhwmfotfxupvzk (28 oct)
--
-- Rediseño de cocina y meseros (migración 20261028000100_kds_lista.sql).
-- El conector de Supabase pidió confirmación (borra y recrea una regla
-- de unicidad, una política y disparadores; NO borra datos) y no se
-- alcanzó a responder. Pégalo completo en Supabase → SQL Editor → Run.
-- Se puede correr más de una vez sin problema.
-- =====================================================================

-- =====================================================================
-- PrepIQ · 0013 · KDS en lista (rediseño de cocina)
--
--   * Un ticket por UNIDAD y estación: 3 arracheras = 3 tickets, aunque
--     sean de la misma mesa y mesero. Los tickets anteriores (varios
--     renglones) se siguen mostrando igual.
--   * "Enviar también a": una línea puede ir a estaciones extra además
--     de su ruta normal (cambios, apoyo entre estaciones).
--   * Cocina sin PIN: la pantalla de cocina (dispositivo KDS / pase)
--     opera sin token de operador. Quién está en cada estación sale del
--     horario publicado y se puede corregir en vivo (alguien no llegó,
--     alguien cubre otra estación). Cada evento guarda ese equipo.
--   * "Listo" es terminado para cocina: la orden puede cerrarse sin que
--     alguien marque "entregado". Al reabrir, el cronómetro sigue donde
--     se quedó (no cuenta el tiempo que estuvo terminado).
--   * Libro de recetas para cocina (sin costos).
-- Sin borrados de datos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.kitchen_tickets drop constraint if exists kitchen_tickets_send_id_station_id_key;
create index if not exists kitchen_tickets_send on public.kitchen_tickets (send_id);

alter table public.kitchen_tickets
  add column if not exists order_item_id  uuid references public.order_items(id) on delete cascade,
  add column if not exists unit_no        int,
  add column if not exists unit_count     int,
  -- Tiempo que estuvo terminado antes de reabrirse (no cuenta en el ciclo).
  add column if not exists paused_seconds int not null default 0,
  -- Ticket enviado a una estación fuera de la ruta normal del producto.
  add column if not exists extra_station  boolean not null default false;

alter table public.order_items
  add column if not exists extra_station_ids uuid[] not null default '{}';

-- Producto del renglón (para abrir su receta desde el KDS).
alter table public.ticket_items
  add column if not exists menu_item_id uuid references public.menu_items(id) on delete set null;
update public.ticket_items ti set menu_item_id = oi.menu_item_id
from public.order_items oi where oi.id = ti.order_item_id and ti.menu_item_id is null;

-- Equipo de la estación al momento del evento (atribución sin PIN).
alter table public.ticket_events add column if not exists crew uuid[];

-- ---------------------------------------------------------------------
-- Equipo por estación: horario publicado + correcciones en vivo
-- ---------------------------------------------------------------------
create table if not exists public.station_assignments (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  business_date  date not null,
  station_id     uuid not null references public.stations(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  -- true = está en esta estación hoy; false = no está (aunque el horario diga).
  present        boolean not null,
  changed_by     uuid references public.staff(id),
  authorized_by  uuid references public.staff(id),
  device_id      uuid references public.devices(id) on delete set null,
  changed_at     timestamptz not null default now(),
  unique (business_date, station_id, staff_id)
);
create index if not exists station_assignments_day on public.station_assignments (restaurant_id, business_date);
alter table public.station_assignments enable row level security;
drop policy if exists station_assignments_select on public.station_assignments;
create policy station_assignments_select on public.station_assignments for select to authenticated
  using (app.p(restaurant_id, 'kds.view'));
grant select on public.station_assignments to authenticated;

drop trigger if exists station_assignments_same_rest_station on public.station_assignments;
create trigger station_assignments_same_rest_station before insert or update on public.station_assignments
  for each row execute function app.check_same_restaurant('stations', 'station_id');
drop trigger if exists station_assignments_same_rest_staff on public.station_assignments;
create trigger station_assignments_same_rest_staff before insert or update on public.station_assignments
  for each row execute function app.check_same_restaurant('staff', 'staff_id');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'station_assignments') then
    alter publication supabase_realtime add table public.station_assignments;
  end if;
end $$;

-- Quién está en una estación ahora:
--   (turnos publicados en esa estación que cubren este momento, con 30 min
--    de anticipación) + (agregados en vivo) − (quitados en vivo)
--   − (movidos en vivo a otra estación).
create or replace function app.station_crew(p_station uuid, p_at timestamptz default now())
returns uuid[] language sql stable security definer set search_path = public, app, extensions, pg_temp as $$
  with st as (
    select s.id, s.restaurant_id, app.business_date(s.restaurant_id, p_at) as bd
    from public.stations s where s.id = p_station
  ), manual as (
    select a.staff_id, a.station_id, a.present from public.station_assignments a, st
    where a.restaurant_id = st.restaurant_id and a.business_date = st.bd
  ), sched as (
    select sh.staff_id from public.shifts sh, st
    where sh.station_id = st.id and sh.status = 'publicado' and sh.staff_id is not null
      and sh.starts_at <= p_at + interval '30 minutes' and sh.ends_at > p_at
  )
  select coalesce(array_agg(x.staff_id order by s.display_name), '{}'::uuid[])
  from (
    select staff_id from sched
    where staff_id not in (select m.staff_id from manual m, st where m.station_id = st.id and not m.present)
      and staff_id not in (select m.staff_id from manual m, st where m.station_id <> st.id and m.present)
    union
    select m.staff_id from manual m, st where m.station_id = st.id and m.present
  ) x join public.staff s on s.id = x.staff_id and s.active
$$;

-- ---------------------------------------------------------------------
-- Eventos con equipo de la estación
-- ---------------------------------------------------------------------
create or replace function app.ticket_event(
  p_ticket public.kitchen_tickets, p_action text, p_from public.ticket_status,
  p_ctx jsonb, p_op uuid, p_reason text default null, p_note text default null,
  p_ticket_item uuid default null
) returns uuid language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare v_id uuid;
begin
  insert into public.ticket_events(restaurant_id, ticket_id, ticket_item_id, action, from_status, to_status,
    reason, note, staff_id, device_id, authorized_by, op_id, crew)
  values (p_ticket.restaurant_id, p_ticket.id, p_ticket_item, p_action, p_from, p_ticket.status,
    p_reason, p_note, (p_ctx->>'staff_id')::uuid, (p_ctx->>'device_id')::uuid,
    coalesce((p_ctx->>'authorized_by')::uuid, (p_ctx->>'staff_id')::uuid), p_op,
    app.station_crew(p_ticket.station_id))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Cocina sin PIN: la pantalla de cocina/pase actúa como dispositivo.
-- Solo acciones de cocina; lo demás (prioridad, cambios de equipo) sigue
-- pidiendo autorización de un gerente con su PIN.
-- ---------------------------------------------------------------------
insert into app.device_mode_permissions(mode, permission) values
  ('kds', 'kds.bump'), ('kds', 'kds.reopen'), ('kds', 'kds.block'), ('kds', 'menu.86'), ('kds', 'incidents.create'),
  ('expo', 'kds.bump'), ('expo', 'kds.reopen'), ('expo', 'kds.block'), ('expo', 'menu.86'), ('expo', 'incidents.create')
on conflict do nothing;

create or replace function app.authorize(p_restaurant uuid, p_token uuid, p_perm text, p_override uuid default null,
  p_grace interval default null)
returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare
  v_ctx jsonb;
  v_grant app.override_grants;
  v_dev public.devices;
begin
  if auth.uid() is null then perform app.fail('no_autenticado'); end if;
  v_dev := app.my_device(p_restaurant);
  if p_token is null and v_dev.id is not null and v_dev.mode in ('kds', 'expo') then
    -- Pantalla de cocina sin operador: actúa el dispositivo; el equipo de
    -- la estación se registra en cada evento (app.ticket_event).
    update public.devices set last_seen_at = now() where id = v_dev.id
      and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
    v_ctx := jsonb_build_object('staff_id', null, 'device_id', v_dev.id, 'device_mode', v_dev.mode);
    if exists (select 1 from app.device_mode_permissions dp where dp.mode = v_dev.mode and dp.permission = p_perm) then
      return v_ctx;
    end if;
  else
    v_ctx := app.resolve_actor(p_restaurant, p_token, p_grace);
    if app.staff_has_perm((v_ctx->>'staff_id')::uuid, p_perm) then
      return v_ctx || jsonb_build_object('authorized_by', v_ctx->>'staff_id');
    end if;
  end if;
  if p_override is not null then
    update app.override_grants g set used_at = now()
    where g.id = p_override and g.restaurant_id = p_restaurant and g.permission = p_perm
      and g.requested_by_user = auth.uid() and g.used_at is null and g.expires_at > now()
    returning * into v_grant;
    if v_grant.id is not null and app.staff_has_perm(v_grant.authorizer_staff, p_perm) then
      return v_ctx || jsonb_build_object('authorized_by', v_grant.authorizer_staff);
    end if;
    perform app.fail('autorizacion_invalida', p_perm, 'La autorización expiró o ya se usó. Pídela de nuevo.');
  end if;
  perform app.fail('permiso_denegado', p_perm, 'Se requiere autorización de un gerente.');
end $$;

-- ---------------------------------------------------------------------
-- Ciclo: listo − llegada − bloqueado − tiempo terminado antes de reabrir
-- ---------------------------------------------------------------------
create or replace function app.ticket_cycle_minutes(t public.kitchen_tickets) returns numeric
language sql immutable set search_path = public, app, extensions, pg_temp as $$
  select case when t.ready_at is not null and t.fired_at is not null then
    round(greatest(extract(epoch from t.ready_at - t.fired_at) - t.blocked_seconds - coalesce(t.paused_seconds, 0), 0)::numeric / 60, 2) end
$$;

-- ---------------------------------------------------------------------
-- Envío a cocina: un ticket por unidad y estación
-- ---------------------------------------------------------------------
create or replace function app.send_order(p_order uuid, p_send_id uuid, p_ctx jsonb, p_fire_course int)
returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare
  v_order public.orders;
  v_server text;
  v_ticket public.kitchen_tickets;
  v_line record;
  v_unit int;
  v_held boolean;
  v_tickets jsonb := '[]'::jsonb;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not exists (select 1 from public.order_items where order_id = p_order and status = 'pendiente') then
    return v_tickets;
  end if;
  select display_name into v_server from public.staff where id = v_order.server_staff_id;

  -- Destinos: rutas del producto + estaciones extra elegidas por el mesero.
  for v_line in
    with lines as (
      select i.*, mi.prep_minutes, mi.complexity from public.order_items i
      join public.menu_items mi on mi.id = i.menu_item_id
      where i.order_id = p_order and i.status = 'pendiente'
    ), dest as (
      select l.id as item_id, r.station_id, false as extra from lines l
      join public.menu_item_routes r on r.menu_item_id = l.menu_item_id
      union
      select l.id, x.station_id, true from lines l cross join lateral unnest(l.extra_station_ids) as x(station_id)
      where not exists (select 1 from public.menu_item_routes r where r.menu_item_id = l.menu_item_id and r.station_id = x.station_id)
    )
    select l.id, l.course, l.qty, l.prep_minutes, l.complexity, l.created_at, d.station_id, bool_or(d.extra) as extra
    from lines l join dest d on d.item_id = l.id
    group by l.id, l.course, l.qty, l.prep_minutes, l.complexity, l.created_at, d.station_id
    order by l.course, l.created_at, l.id, d.station_id
  loop
    v_held := p_fire_course is not null and v_line.course > p_fire_course;
    for v_unit in 1..v_line.qty loop
      insert into public.kitchen_tickets(restaurant_id, service_day_id, order_id, station_id, send_id, order_number,
        order_type, table_label, server_name, status, course, target_minutes, complexity_points, fired_at,
        order_item_id, unit_no, unit_count, extra_station)
      values (v_order.restaurant_id, v_order.service_day_id, p_order, v_line.station_id,
        app.uuid_v5_like(p_send_id, v_line.course),
        v_order.number, v_order.order_type, v_order.table_label, v_server,
        (case when v_held then 'en_espera' else 'nuevo' end)::public.ticket_status,
        v_line.course, v_line.prep_minutes, v_line.complexity,
        case when v_held then null else now() end,
        v_line.id, v_unit, v_line.qty, v_line.extra)
      returning * into v_ticket;

      insert into public.ticket_items(restaurant_id, ticket_id, order_item_id, component, display_name, qty,
        modifiers, notes, seat, is_change, sort, menu_item_id)
      select v_order.restaurant_id, v_ticket.id, i.id, r.component,
             coalesce(i.kitchen_name, i.name) || coalesce(' · ' || r.component, ''),
             1, i.modifiers, i.notes, i.seat, i.replaces_item_id is not null,
             row_number() over (order by r.sort, r.component nulls first), i.menu_item_id
      from public.order_items i
      join public.menu_item_routes r on r.menu_item_id = i.menu_item_id and r.station_id = v_line.station_id
      where i.id = v_line.id;
      if not found then
        -- Estación extra: el producto completo, sin componente.
        insert into public.ticket_items(restaurant_id, ticket_id, order_item_id, component, display_name, qty,
          modifiers, notes, seat, is_change, sort, menu_item_id)
        select v_order.restaurant_id, v_ticket.id, i.id, null, coalesce(i.kitchen_name, i.name),
               1, i.modifiers, i.notes, i.seat, i.replaces_item_id is not null, 1, i.menu_item_id
        from public.order_items i where i.id = v_line.id;
      end if;

      perform app.ticket_event(v_ticket, 'crear', null, p_ctx, p_send_id);
      v_tickets := v_tickets || jsonb_build_object('id', v_ticket.id, 'station_id', v_ticket.station_id,
        'status', v_ticket.status, 'course', v_ticket.course);
    end loop;
  end loop;

  -- Marcar líneas como enviadas y registrar consumo teórico (idempotente).
  for v_item in select id from public.order_items where order_id = p_order and status = 'pendiente' loop
    update public.order_items set status = 'enviado', sent_at = now(), send_id = p_send_id where id = v_item.id;
    perform app.inventory_post_sale(v_item.id, p_ctx);
  end loop;
  return v_tickets;
end $$;

-- ---------------------------------------------------------------------
-- "Enviar también a": rpc_order_submit_v2 valida las estaciones extra de
-- cada línea, las deja disponibles durante la transacción y delega en
-- rpc_order_submit. Un disparador las guarda en la línea pendiente.
-- ---------------------------------------------------------------------
create or replace function app.order_item_extra_stations() returns trigger
language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare v_map jsonb;
begin
  if new.status <> 'pendiente' then return new; end if;
  v_map := nullif(current_setting('prepiq.extra_stations', true), '')::jsonb;
  if v_map is not null and v_map ? new.id::text then
    new.extra_station_ids := array(select jsonb_array_elements_text(v_map->new.id::text)::uuid);
  end if;
  return new;
end $$;
drop trigger if exists order_items_extra_stations on public.order_items;
create trigger order_items_extra_stations before insert or update on public.order_items
  for each row execute function app.order_item_extra_stations();

create or replace function public.rpc_order_submit_v2(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order jsonb, p_send text default 'todo'
) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare
  v_map jsonb := '{}'::jsonb;
  v_item jsonb;
  v_ids uuid[];
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) loop
    if jsonb_typeof(v_item->'extra_station_ids') = 'array' then
      select coalesce(array_agg(distinct s.id), '{}') into v_ids
      from jsonb_array_elements_text(v_item->'extra_station_ids') e
      join public.stations s on s.id = e::uuid and s.restaurant_id = p_restaurant_id and s.active;
      if cardinality(v_ids) <> (select count(distinct e) from jsonb_array_elements_text(v_item->'extra_station_ids') e) then
        perform app.fail('estacion_invalida', null, 'Una de las estaciones extra no existe o está inactiva.');
      end if;
      v_map := v_map || jsonb_build_object(v_item->>'id', to_jsonb(v_ids));
    end if;
  end loop;
  perform set_config('prepiq.extra_stations', v_map::text, true);
  return public.rpc_order_submit(p_op_id, p_restaurant_id, p_actor_token, p_order, p_send);
end $$;

-- ---------------------------------------------------------------------
-- Acciones de ticket: reabrir no cuenta el tiempo que estuvo terminado
-- ---------------------------------------------------------------------
create or replace function public.rpc_ticket_action(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_ticket_id uuid, p_action text,
  p_args jsonb default '{}'::jsonb, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare
  v_prev jsonb;
  v_ctx jsonb;
  t public.kitchen_tickets;
  v_from public.ticket_status;
  v_perm text;
  v_reason text := nullif(trim(p_args->>'reason'), '');
  v_note text := nullif(trim(p_args->>'note'), '');
  v_event uuid;
  v_noop boolean := false;
  v_ti record;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'ticket_action');
  if v_prev is not null then return v_prev; end if;

  v_perm := case p_action
    when 'iniciar' then 'kds.bump' when 'listo' then 'kds.bump'
    when 'entregar' then 'kds.view'           -- pase despacha (opcional)
    when 'reabrir' then 'kds.reopen'
    when 'bloquear' then 'kds.block' when 'desbloquear' then 'kds.block'
    when 'prioridad' then 'orders.priority' when 'quitar_prioridad' then 'orders.priority'
    when 'marchar' then 'orders.create'
    else null end;
  if v_perm is null then perform app.fail('accion_invalida', p_action); end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, v_perm, p_override);

  select * into t from public.kitchen_tickets where id = p_ticket_id and restaurant_id = p_restaurant_id for update;
  if t.id is null then perform app.fail('ticket_no_encontrado'); end if;
  v_from := t.status;

  if t.status = 'anulado' and p_action not in ('bloquear', 'desbloquear') then
    perform app.fail('ticket_anulado');
  end if;

  case p_action
  when 'marchar' then
    if t.status <> 'en_espera' then v_noop := true;
    else
      update public.kitchen_tickets set status = 'nuevo', fired_at = now(), version = version + 1
        where id = t.id returning * into t;
    end if;
  when 'iniciar' then
    if t.status in ('en_preparacion', 'listo', 'entregado') then v_noop := true;
    elsif t.status = 'en_espera' then perform app.fail('ticket_en_espera', null, 'Primero hay que marcharlo.');
    else
      update public.kitchen_tickets set status = 'en_preparacion', started_at = coalesce(started_at, now()),
        version = version + 1 where id = t.id returning * into t;
    end if;
  when 'listo' then
    if t.status in ('listo', 'entregado') then v_noop := true;
    elsif t.status = 'en_espera' then perform app.fail('ticket_en_espera');
    else
      update public.ticket_items set status = 'listo', ready_at = now()
        where ticket_id = t.id and status = 'pendiente';
      update public.kitchen_tickets set status = 'listo', started_at = coalesce(started_at, now()),
        ready_at = now(), version = version + 1,
        blocked = false, blocked_since = null,
        blocked_seconds = blocked_seconds + case when blocked then extract(epoch from now() - blocked_since)::int else 0 end
        where id = t.id returning * into t;
    end if;
  when 'entregar' then
    if t.status = 'entregado' then v_noop := true;
    elsif t.status <> 'listo' then perform app.fail('ticket_no_listo', t.status::text, 'Solo se entrega un ticket listo.');
    else
      update public.kitchen_tickets set status = 'entregado', delivered_at = now(), version = version + 1
        where id = t.id returning * into t;
    end if;
  when 'reabrir' then
    if t.status not in ('listo', 'entregado') then perform app.fail('ticket_no_reabrible', t.status::text); end if;
    if v_reason is null or v_reason not in (select unnest(enum_range(null::public.reopen_reason))::text) then
      perform app.fail('motivo_requerido', null, 'Indica por qué se reabre.');
    end if;
    update public.ticket_items set status = 'pendiente', ready_at = null
      where ticket_id = t.id and status = 'listo';
    update public.kitchen_tickets set status = 'en_preparacion', ready_at = null, delivered_at = null,
      paused_seconds = paused_seconds + greatest(0, coalesce(extract(epoch from now() - ready_at)::int, 0)),
      reopen_count = reopen_count + 1, version = version + 1
      where id = t.id returning * into t;
  when 'bloquear' then
    if t.blocked then v_noop := true;
    elsif t.status not in ('nuevo', 'en_preparacion', 'en_espera') then perform app.fail('ticket_no_bloqueable', t.status::text);
    else
      if v_reason is null then perform app.fail('motivo_requerido', null, '¿Qué falta?'); end if;
      update public.kitchen_tickets set blocked = true, blocked_since = now(), blocked_reason = v_reason,
        version = version + 1 where id = t.id returning * into t;
      insert into public.incidents(restaurant_id, kind, station_id, ticket_id, description, created_by, device_id)
      values (t.restaurant_id, 'faltante', t.station_id, t.id,
        'Ticket #' || t.order_number || ': ' || v_reason || coalesce(' — ' || v_note, ''),
        (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid);
    end if;
  when 'desbloquear' then
    if not t.blocked then v_noop := true;
    else
      update public.kitchen_tickets set blocked = false, blocked_since = null,
        blocked_seconds = blocked_seconds + extract(epoch from now() - blocked_since)::int,
        version = version + 1 where id = t.id returning * into t;
    end if;
  when 'prioridad' then
    if t.priority then v_noop := true;
    else
      update public.kitchen_tickets set priority = true, priority_by = (v_ctx->>'authorized_by')::uuid,
        version = version + 1 where id = t.id returning * into t;
    end if;
  when 'quitar_prioridad' then
    if not t.priority then v_noop := true;
    else
      update public.kitchen_tickets set priority = false, version = version + 1 where id = t.id returning * into t;
    end if;
  end case;

  if not v_noop then
    v_event := app.ticket_event(t, p_action, v_from, v_ctx, p_op_id, v_reason, v_note);
    -- Reproceso explícito: vuelve a consumir inventario.
    if p_action = 'reabrir' and coalesce((p_args->>'remake')::boolean, false) then
      for v_ti in select distinct order_item_id from public.ticket_items where ticket_id = t.id and status <> 'anulado' loop
        perform app.inventory_post_remake(v_ti.order_item_id, v_event, v_ctx);
      end loop;
    end if;
  end if;

  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', v_noop, 'ticket', app.ticket_json(t.id)));
end $$;

-- ---------------------------------------------------------------------
-- Cerrar orden: "listo" ya cuenta como terminado.
-- ---------------------------------------------------------------------
create or replace function public.rpc_order_close(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order_id uuid,
  p_void boolean default false, p_reason text default null, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; o public.orders; v_pending int; v_active int; v_i record;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'order_close');
  if v_prev is not null then return v_prev; end if;
  select * into o from public.orders where id = p_order_id and restaurant_id = p_restaurant_id for update;
  if o.id is null then perform app.fail('orden_no_encontrada'); end if;
  if o.status <> 'abierta' then
    return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', true, 'order', app.order_json(o.id)));
  end if;

  if p_void then
    if p_reason is null then perform app.fail('motivo_requerido'); end if;
    v_ctx := app.authorize(p_restaurant_id, p_actor_token,
      case when exists (select 1 from public.order_items where order_id = o.id and status = 'enviado')
           then 'orders.void_sent' else 'orders.create' end, p_override);
    for v_i in select id from public.order_items where order_id = o.id and status <> 'anulado' loop
      perform app.void_item(v_i.id,
        case when p_reason in (select unnest(enum_range(null::public.void_reason))::text) then p_reason else 'otro' end,
        'Anulación de la orden', null, v_ctx, p_op_id);
    end loop;
    update public.orders set status = 'anulada', void_reason = p_reason, closed_at = now(),
      closed_by = (v_ctx->>'staff_id')::uuid where id = o.id;
  else
    v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'orders.create');
    if o.server_staff_id is distinct from (v_ctx->>'staff_id')::uuid
       and not app.staff_has_perm((v_ctx->>'staff_id')::uuid, 'orders.close_any') then
      perform app.fail('orden_de_otro_mesero');
    end if;
    select count(*) into v_pending from public.order_items where order_id = o.id and status = 'pendiente';
    if v_pending > 0 then perform app.fail('orden_con_lineas_sin_enviar', v_pending::text, 'Envíalas o quítalas antes de cerrar.'); end if;
    select count(*) into v_active from public.kitchen_tickets where order_id = o.id
      and status in ('en_espera', 'nuevo', 'en_preparacion');
    if v_active > 0 and not coalesce(p_reason = 'forzar', false) then
      perform app.fail('orden_con_tickets_activos', v_active::text, 'Hay platillos que cocina no ha terminado.');
    end if;
    update public.orders set status = 'cerrada', closed_at = now(), closed_by = (v_ctx->>'staff_id')::uuid where id = o.id;
  end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', false, 'order', app.order_json(o.id)));
end $$;

-- ---------------------------------------------------------------------
-- Prioridad a toda una orden (con tickets por unidad, una sola autorización)
-- ---------------------------------------------------------------------
create or replace function public.rpc_order_priority(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order_id uuid, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; t public.kitchen_tickets; v_n int := 0;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'order_priority');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'orders.priority', p_override);
  for t in select * from public.kitchen_tickets where order_id = p_order_id and restaurant_id = p_restaurant_id
           and status in ('en_espera', 'nuevo', 'en_preparacion') and not priority for update loop
    update public.kitchen_tickets set priority = true, priority_by = (v_ctx->>'authorized_by')::uuid, version = version + 1
      where id = t.id returning * into t;
    perform app.ticket_event(t, 'prioridad', t.status, v_ctx, p_op_id);
    v_n := v_n + 1;
  end loop;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'tickets', v_n, 'order', app.order_json(p_order_id)));
end $$;

-- ---------------------------------------------------------------------
-- Equipo por estación (lectura y cambio en vivo)
-- ---------------------------------------------------------------------
create or replace function public.rpc_station_crew(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare v_bd date := app.business_date(p_restaurant_id);
begin
  if not app.has_perm(p_restaurant_id, 'kds.view') then perform app.fail('permiso_denegado', 'kds.view'); end if;
  return jsonb_build_object(
    'business_date', v_bd,
    'stations', coalesce((select jsonb_agg(jsonb_build_object(
        'station_id', s.id,
        'staff', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name,
            'manual', exists (select 1 from public.station_assignments a where a.business_date = v_bd
                              and a.station_id = s.id and a.staff_id = p.id and a.present)) order by p.display_name)
          from public.staff p where p.id = any (app.station_crew(s.id))), '[]'::jsonb)
      ) order by s.sort, s.name)
      from public.stations s where s.restaurant_id = p_restaurant_id and s.active), '[]'::jsonb),
    -- Para agregar a alguien: personal activo (solo nombre).
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by p.display_name)
      from public.staff p where p.restaurant_id = p_restaurant_id and p.active), '[]'::jsonb)
  );
end $$;

create or replace function public.rpc_station_crew_set(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_station_id uuid, p_staff_id uuid,
  p_present boolean, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; v_bd date := app.business_date(p_restaurant_id);
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'station_crew_set');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'service.open_close', p_override);
  if not exists (select 1 from public.stations where id = p_station_id and restaurant_id = p_restaurant_id) then
    perform app.fail('estacion_invalida');
  end if;
  if not exists (select 1 from public.staff where id = p_staff_id and restaurant_id = p_restaurant_id and active) then
    perform app.fail('colaborador_no_encontrado');
  end if;
  if p_present then
    -- Una persona está en una sola estación a la vez.
    update public.station_assignments set present = false, changed_at = now(),
      changed_by = (v_ctx->>'staff_id')::uuid, authorized_by = (v_ctx->>'authorized_by')::uuid,
      device_id = (v_ctx->>'device_id')::uuid
    where restaurant_id = p_restaurant_id and business_date = v_bd and staff_id = p_staff_id
      and station_id <> p_station_id and present;
  end if;
  insert into public.station_assignments(restaurant_id, business_date, station_id, staff_id, present,
    changed_by, authorized_by, device_id)
  values (p_restaurant_id, v_bd, p_station_id, p_staff_id, p_present,
    (v_ctx->>'staff_id')::uuid, (v_ctx->>'authorized_by')::uuid, (v_ctx->>'device_id')::uuid)
  on conflict (business_date, station_id, staff_id) do update set present = excluded.present,
    changed_at = now(), changed_by = excluded.changed_by, authorized_by = excluded.authorized_by,
    device_id = excluded.device_id;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'crew', to_jsonb(app.station_crew(p_station_id))));
end $$;

-- ---------------------------------------------------------------------
-- Libro de recetas para cocina (versión activa, sin costos)
-- ---------------------------------------------------------------------
create or replace function public.kds_recipe_book(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, extensions, pg_temp as $$
begin
  if not app.has_perm(p_restaurant_id, 'kds.view') then perform app.fail('permiso_denegado', 'kds.view'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'name', r.name, 'menu_item_id', r.menu_item_id,
      'category', mc.name,
      'stations', coalesce((select jsonb_agg(distinct rt.station_id) from public.menu_item_routes rt where rt.menu_item_id = r.menu_item_id), '[]'::jsonb),
      'version', v.version, 'yield_qty', v.yield_qty, 'yield_unit', v.yield_unit,
      'instructions', v.instructions, 'notes', v.notes,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', l.qty, 'unit', l.unit, 'notes', l.notes)
          order by l.sort, i.name)
        from public.recipe_lines l join public.ingredients i on i.id = l.ingredient_id where l.version_id = v.id), '[]'::jsonb)
    ) order by r.kind, r.name)
    from public.recipes r
    join public.recipe_versions v on v.recipe_id = r.id and v.status = 'activa'
    left join public.menu_items mi on mi.id = r.menu_item_id
    left join public.menu_categories mc on mc.id = mi.category_id
    where r.restaurant_id = p_restaurant_id), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Historial de ticket: equipo de la estación en cada evento
-- ---------------------------------------------------------------------
create or replace function public.report_ticket_timeline(p_restaurant_id uuid, p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, extensions, pg_temp as $$
begin
  if not app.has_perm(p_restaurant_id, 'kds.view') then perform app.fail('permiso_denegado'); end if;
  return (select jsonb_build_object(
    'ticket', app.ticket_json(p_ticket_id),
    'cycle_minutes', app.ticket_cycle_minutes(k),
    'station_name', (select name from public.stations where id = k.station_id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'action', e.action, 'from', e.from_status,
        'to', e.to_status, 'reason', e.reason, 'note', e.note, 'staff', s.display_name, 'authorized_by', a.display_name,
        'device', d.name,
        'crew', (select jsonb_agg(c.display_name order by c.display_name) from public.staff c where c.id = any (e.crew)))
        order by e.at)
      from public.ticket_events e left join public.staff s on s.id = e.staff_id
      left join public.staff a on a.id = e.authorized_by and e.authorized_by is distinct from e.staff_id
      left join public.devices d on d.id = e.device_id
      where e.ticket_id = k.id), '[]'::jsonb),
    'order', app.order_json(k.order_id))
  from public.kitchen_tickets k where k.id = p_ticket_id and k.restaurant_id = p_restaurant_id);
end $$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function app.station_crew(uuid, timestamptz), app.order_item_extra_stations() from public, anon, authenticated;
revoke execute on function public.rpc_order_submit_v2(uuid, uuid, uuid, jsonb, text),
  public.rpc_order_priority(uuid, uuid, uuid, uuid, uuid),
  public.rpc_station_crew(uuid), public.rpc_station_crew_set(uuid, uuid, uuid, uuid, uuid, boolean, uuid),
  public.kds_recipe_book(uuid) from public, anon;
grant execute on function public.rpc_order_submit_v2(uuid, uuid, uuid, jsonb, text),
  public.rpc_order_priority(uuid, uuid, uuid, uuid, uuid),
  public.rpc_station_crew(uuid), public.rpc_station_crew_set(uuid, uuid, uuid, uuid, uuid, boolean, uuid),
  public.kds_recipe_book(uuid) to authenticated;

-- Verificación: debe mostrar 6 funciones nuevas.
select proname from pg_proc where proname in ('rpc_order_submit_v2', 'rpc_order_priority', 'rpc_station_crew',
  'rpc_station_crew_set', 'kds_recipe_book', 'station_crew') order by 1;
