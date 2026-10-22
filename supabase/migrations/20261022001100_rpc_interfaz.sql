-- =====================================================================
-- PrepIQ · 0011 · RPC de apoyo a la interfaz
-- =====================================================================

-- Estado de asistencia del operador (reloj checador): última marca,
-- acciones válidas y turno de hoy. No expone datos de otras personas.
-- (volatile: resolve_actor registra actividad del dispositivo)
create or replace function public.rpc_punch_status(p_restaurant_id uuid, p_actor_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; v_staff uuid; v_last public.time_punches; v_next text[]; v_shift public.shifts;
begin
  v_ctx := app.resolve_actor(p_restaurant_id, p_actor_token);
  v_staff := (v_ctx->>'staff_id')::uuid;
  v_last := app.last_punch(v_staff);
  v_next := case
    when v_last.kind is null or v_last.kind = 'salida' then array['entrada']
    when v_last.kind in ('entrada', 'fin_descanso') then array['inicio_descanso', 'salida']
    when v_last.kind = 'inicio_descanso' then array['fin_descanso', 'salida']
  end;
  if v_last.kind is not null and v_last.kind <> 'salida' and v_last.at < now() - interval '18 hours' then
    v_next := array['entrada'];  -- turno anterior sin cerrar: se permite nueva entrada y se reporta
  end if;
  select * into v_shift from public.shifts where staff_id = v_staff and status = 'publicado'
    and ends_at > now() - interval '2 hours' and starts_at < now() + interval '14 hours'
    order by starts_at limit 1;
  return jsonb_build_object(
    'staff_id', v_staff,
    'staff_name', (select display_name from public.staff where id = v_staff),
    'last_punch', case when v_last.id is not null then jsonb_build_object('kind', v_last.kind, 'at', v_last.at) end,
    'allowed', to_jsonb(v_next),
    'shift', case when v_shift.id is not null then jsonb_build_object('starts_at', v_shift.starts_at, 'ends_at', v_shift.ends_at,
      'station', (select name from public.stations where id = v_shift.station_id)) end,
    'server_time', now());
end $$;

-- Copia una semana de turnos, valida empalmes y regresa cuántos se omitieron.
-- (Complementa rpc_schedule_copy_week con el conteo de omitidos.)
create or replace function public.rpc_schedule_week_summary(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.has_perm(p_restaurant_id, 'schedule.manage') then perform app.fail('permiso_denegado'); end if;
  return jsonb_build_object(
    'drafts', (select count(*) from public.shifts where restaurant_id = p_restaurant_id and status = 'borrador' and starts_at >= p_from and starts_at < p_to),
    'published', (select count(*) from public.shifts where restaurant_id = p_restaurant_id and status = 'publicado' and starts_at >= p_from and starts_at < p_to),
    'open_shifts', (select count(*) from public.shifts where restaurant_id = p_restaurant_id and status <> 'cancelado' and staff_id is null and starts_at >= p_from and starts_at < p_to),
    'hours_by_staff', coalesce((select jsonb_object_agg(staff_id, h) from (
      select staff_id, round(sum(extract(epoch from ends_at - starts_at) / 3600 - break_minutes / 60.0)::numeric, 1) h
      from public.shifts where restaurant_id = p_restaurant_id and status <> 'cancelado' and staff_id is not null
        and starts_at >= p_from and starts_at < p_to group by staff_id) x), '{}'::jsonb),
    'time_off', coalesce((select jsonb_agg(jsonb_build_object('staff_id', staff_id, 'starts_at', starts_at, 'ends_at', ends_at, 'status', status))
      from public.time_off_requests where restaurant_id = p_restaurant_id and status in ('pendiente', 'aprobada')
        and ends_at > p_from and starts_at < p_to), '[]'::jsonb)
  );
end $$;

grant execute on function public.rpc_punch_status(uuid, uuid), public.rpc_schedule_week_summary(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.rpc_punch_status(uuid, uuid), public.rpc_schedule_week_summary(uuid, timestamptz, timestamptz) from anon, public;
