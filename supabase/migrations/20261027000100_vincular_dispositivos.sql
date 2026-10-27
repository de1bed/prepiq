-- =====================================================================
-- PrepIQ · 0013 · Vincular dispositivos con QR (sin crear cuentas a mano)
--
-- Flujo:
--   1. Administración genera un código de un solo uso (válido 15 min) para
--      un equipo: nombre, modo y estación. La pantalla lo muestra como QR y
--      como texto (XXXX-XXXX) por si el equipo no tiene cámara.
--   2. El equipo abre /vincular (escaneando el QR o tecleando el código).
--   3. rpc_device_pair crea la cuenta del equipo con una contraseña
--      aleatoria que nadie conoce ni necesita (la app inicia sesión sola)
--      y registra el dispositivo. El código queda usado.
--   Reemplazo: un código con device_id vuelve a vincular un equipo existente
--   (tableta nueva o navegador borrado); la cuenta anterior queda bloqueada.
--
-- El código es el secreto: solo se guarda su hash. 31^8 combinaciones,
-- un solo uso y 15 min de vigencia.
-- =====================================================================

create table app.device_pairings (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  code_hash       text not null unique,
  name            text not null check (length(trim(name)) between 1 and 60),
  mode            public.device_mode not null,
  station_id      uuid references public.stations(id) on delete set null,
  device_id       uuid references public.devices(id) on delete cascade,   -- reemplazo de un equipo existente
  created_by      uuid references public.staff(id),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  used_device_id  uuid references public.devices(id) on delete set null,
  canceled_at     timestamptz
);
create index on app.device_pairings (restaurant_id, created_at desc);

create or replace function app.pairing_hash(p_code text) returns text
language sql immutable set search_path = public, app, extensions, pg_temp as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
$$;

create or replace function app.pairing_status(p app.device_pairings) returns text
language sql stable set search_path = public, app, pg_temp as $$
  select case when p.used_at is not null then 'usado'
              when p.canceled_at is not null then 'cancelado'
              when p.expires_at <= now() then 'vencido'
              else 'pendiente' end
$$;

-- Generar código (administración).
create or replace function public.rpc_device_pairing_create(
  p_restaurant_id uuid, p_name text, p_mode text, p_station_id uuid default null,
  p_device_id uuid default null, p_minutes int default 15
) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare
  v_ctx jsonb; v_dev public.devices; v_name text := nullif(trim(p_name), ''); v_mode public.device_mode;
  v_station uuid := p_station_id; v_code text; v_bytes bytea; v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_row app.device_pairings; i int; v_try int := 0;
begin
  v_ctx := app.authorize(p_restaurant_id, null, 'devices.manage');
  if p_device_id is not null then
    select * into v_dev from public.devices where id = p_device_id and restaurant_id = p_restaurant_id;
    if v_dev.id is null then perform app.fail('dispositivo_no_encontrado'); end if;
    v_name := coalesce(v_name, v_dev.name);
    v_mode := coalesce(nullif(p_mode, '')::public.device_mode, v_dev.mode);
    v_station := coalesce(p_station_id, v_dev.station_id);
  else
    if v_name is null then perform app.fail('nombre_requerido', null, 'Ponle nombre al equipo (p. ej. "Tableta parrilla").'); end if;
    if p_mode is null or p_mode not in (select unnest(enum_range(null::public.device_mode))::text) then
      perform app.fail('modo_invalido', p_mode);
    end if;
    v_mode := p_mode::public.device_mode;
  end if;
  if v_station is not null and not exists (select 1 from public.stations where id = v_station and restaurant_id = p_restaurant_id) then
    perform app.fail('estacion_no_encontrada');
  end if;
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    begin
      insert into app.device_pairings(restaurant_id, code_hash, name, mode, station_id, device_id, created_by, expires_at)
      values (p_restaurant_id, app.pairing_hash(v_code), v_name, v_mode, v_station, p_device_id,
        (v_ctx->>'staff_id')::uuid, now() + make_interval(mins => least(greatest(coalesce(p_minutes, 15), 2), 60)))
      returning * into v_row;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'pairing_id', v_row.id, 'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4),
    'expires_at', v_row.expires_at, 'name', v_row.name, 'mode', v_row.mode, 'replaces', p_device_id is not null);
end $$;

-- Estado de un código (la pantalla de administración espera a que se use).
create or replace function public.rpc_device_pairing_status(p_restaurant_id uuid, p_pairing_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare p app.device_pairings;
begin
  if not app.has_perm(p_restaurant_id, 'devices.manage') then perform app.fail('permiso_denegado', 'devices.manage'); end if;
  select * into p from app.device_pairings where id = p_pairing_id and restaurant_id = p_restaurant_id;
  if p.id is null then perform app.fail('no_encontrado'); end if;
  return jsonb_build_object('ok', true, 'status', app.pairing_status(p), 'device_id', p.used_device_id,
    'used_at', p.used_at, 'expires_at', p.expires_at);
end $$;

create or replace function public.rpc_device_pairing_cancel(p_restaurant_id uuid, p_pairing_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.authorize(p_restaurant_id, null, 'devices.manage');
  update app.device_pairings set canceled_at = now()
  where id = p_pairing_id and restaurant_id = p_restaurant_id and used_at is null and canceled_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- Vista previa para el equipo antes de vincular (no requiere sesión).
create or replace function public.rpc_device_pairing_peek(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare p app.device_pairings; v_status text;
begin
  select * into p from app.device_pairings where code_hash = app.pairing_hash(p_code);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'codigo_invalido'); end if;
  v_status := app.pairing_status(p);
  if v_status <> 'pendiente' then return jsonb_build_object('ok', false, 'error', 'codigo_' || v_status); end if;
  return jsonb_build_object('ok', true,
    'restaurant_name', (select name from public.restaurants where id = p.restaurant_id),
    'name', p.name, 'mode', p.mode, 'replaces', p.device_id is not null,
    'station_name', (select name from public.stations where id = p.station_id),
    'expires_at', p.expires_at);
end $$;

-- Vincular: crea la cuenta del equipo (contraseña aleatoria) y el dispositivo.
-- Devuelve las credenciales UNA vez para que la app inicie sesión sola.
create or replace function public.rpc_device_pair(p_code text)
returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare
  p app.device_pairings; v_status text; v_uid uuid := gen_random_uuid(); v_email text; v_pw text;
  v_dev uuid; v_old_user uuid;
begin
  select * into p from app.device_pairings where code_hash = app.pairing_hash(p_code) for update;
  if p.id is null then perform app.fail('codigo_invalido', null, 'Revisa el código o genera uno nuevo en Administración → Dispositivos.'); end if;
  v_status := app.pairing_status(p);
  if v_status <> 'pendiente' then
    perform app.fail('codigo_' || v_status, null, 'Genera un código nuevo en Administración → Dispositivos.');
  end if;
  if not exists (select 1 from public.restaurants where id = p.restaurant_id and active) then
    perform app.fail('restaurante_inactivo');
  end if;

  v_email := 'equipo-' || replace(v_uid::text, '-', '') || '@dispositivos.prepiq.invalid';
  v_pw := encode(extensions.gen_random_bytes(24), 'hex');
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
    created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"prepiq_device":true}'::jsonb,
    jsonb_build_object('name', p.name, 'prepiq_device', true), '', '', '', '', now(), now());
  insert into auth.identities(id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  if p.device_id is null then
    insert into public.devices(restaurant_id, user_id, name, mode, station_id)
    values (p.restaurant_id, v_uid, p.name, p.mode, p.station_id) returning id into v_dev;
  else
    select user_id into v_old_user from public.devices where id = p.device_id for update;
    update public.devices set user_id = v_uid, name = p.name, mode = p.mode, station_id = p.station_id, active = true
    where id = p.device_id returning id into v_dev;
    if v_dev is null then perform app.fail('dispositivo_no_encontrado'); end if;
    update app.device_sessions set ended_at = now() where device_id = v_dev and ended_at is null;
    -- La cuenta anterior del equipo ya no sirve: se bloquea y se revocan sus sesiones.
    update auth.users set banned_until = now() + interval '100 years' where id = v_old_user;
    update auth.refresh_tokens set revoked = true where user_id = v_old_user::text and not coalesce(revoked, false);
  end if;

  update app.device_pairings set used_at = now(), used_device_id = v_dev where id = p.id;
  return jsonb_build_object('ok', true, 'email', v_email, 'password', v_pw, 'device_id', v_dev,
    'device_name', p.name, 'mode', p.mode,
    'restaurant_name', (select name from public.restaurants where id = p.restaurant_id));
end $$;

revoke execute on function app.pairing_hash(text), app.pairing_status(app.device_pairings) from public, anon, authenticated;
revoke execute on function public.rpc_device_pairing_create(uuid, text, text, uuid, uuid, int),
  public.rpc_device_pairing_status(uuid, uuid), public.rpc_device_pairing_cancel(uuid, uuid),
  public.rpc_device_pairing_peek(text), public.rpc_device_pair(text) from public, anon;
grant execute on function public.rpc_device_pairing_create(uuid, text, text, uuid, uuid, int),
  public.rpc_device_pairing_status(uuid, uuid), public.rpc_device_pairing_cancel(uuid, uuid) to authenticated;
-- El equipo todavía no tiene sesión cuando vincula.
grant execute on function public.rpc_device_pairing_peek(text), public.rpc_device_pair(text) to anon, authenticated;
