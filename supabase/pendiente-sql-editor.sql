-- =====================================================================
-- PrepIQ · Pendiente para el proyecto ptbqyymhwmfotfxupvzk
--
-- Todo el esquema ya está instalado. Estas 2 funciones no se pudieron
-- aplicar por el conector de Supabase porque contienen DELETE (el conector
-- pide confirmación manual para eso y se agota el tiempo).
--
-- Cómo aplicarlo (1 minuto):
--   Supabase → tu proyecto → SQL Editor → New query → pega TODO este
--   archivo → Run. Debe decir "Success. No rows returned".
--
-- Es seguro correrlo más de una vez. No borra datos al instalarse: los
-- DELETE solo se ejecutan cuando se llama a cada función.
-- Copia idéntica de lo que hay en supabase/migrations (0008 y 0010).
-- =====================================================================

-- Quitar el PIN de un colaborador (Administración → Personal → "Quitar PIN").
create or replace function public.rpc_staff_clear_pin(p_restaurant_id uuid, p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.authorize(p_restaurant_id, null, 'staff.manage');
  delete from app.staff_pins where staff_id = p_staff_id and restaurant_id = p_restaurant_id;
  update public.staff set pin_set_at = null where id = p_staff_id and restaurant_id = p_restaurant_id;
  update app.device_sessions set ended_at = now() where staff_id = p_staff_id and ended_at is null;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.rpc_staff_clear_pin(uuid, uuid) from public, anon;
grant execute on function public.rpc_staff_clear_pin(uuid, uuid) to authenticated;

-- Mantenimiento: limpia registros técnicos de más de 30 días. No toca datos
-- de negocio (órdenes, tickets, inventario, asistencia).
create or replace function app.housekeeping() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare a int; b int; c int; d int;
begin
  delete from app.processed_ops where created_at < now() - interval '30 days'; get diagnostics a = row_count;
  delete from app.pin_attempts where at < now() - interval '30 days'; get diagnostics b = row_count;
  delete from app.device_sessions where coalesce(ended_at, expires_at) < now() - interval '30 days'; get diagnostics c = row_count;
  delete from app.override_grants where expires_at < now() - interval '30 days'; get diagnostics d = row_count;
  return jsonb_build_object('processed_ops', a, 'pin_attempts', b, 'device_sessions', c, 'override_grants', d);
end $$;

revoke execute on function app.housekeeping() from public, anon, authenticated;
