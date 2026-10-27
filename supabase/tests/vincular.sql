-- =====================================================================
-- PrepIQ · Pruebas: vincular dispositivos con QR / código de un solo uso
-- Ejecutar después de criticos.sql (misma base con semilla).
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
set client_min_messages = notice;

create or replace function pg_temp.login(p_email text) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'usuario de prueba no existe: %', p_email; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.sub', v::text, false);
  return v;
end $$;
create or replace function pg_temp.logout() returns void language sql as $$
  select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)
$$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALLÓ: %', p_msg; end if;
  raise notice 'ok  %', p_msg;
end $$;
create or replace function pg_temp.fails(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code then raise notice 'ok  % (→ %)', p_msg, sqlerrm; return; end if;
    raise exception 'FALLÓ: % — se esperaba "%" y fue "%"', p_msg, p_code, sqlerrm;
  end;
  raise exception 'FALLÓ: % — se esperaba error "%" y no hubo error', p_msg, p_code;
end $$;
create or replace function pg_temp.rid() returns uuid language sql as $$
  select id from public.restaurants where name = 'Taquería Demo'
$$;

-- =====================================================================
-- V1. Solo administración genera códigos; el equipo vincula sin sesión
-- =====================================================================
do $$
declare r jsonb; pk jsonb; p jsonb; v_code text; v_dev public.devices; v_user auth.users; v_comal uuid;
begin
  select id into v_comal from public.stations where restaurant_id = pg_temp.rid() and name = 'Comal';
  perform pg_temp.login('elena@demo.prepiq.test');
  perform pg_temp.fails(format('select public.rpc_device_pairing_create(%L, ''Tableta X'', ''kds'')', pg_temp.rid()),
    'permiso_denegado', 'una mesera no puede generar códigos de equipo');

  perform pg_temp.login('ana@demo.prepiq.test');
  r := public.rpc_device_pairing_create(pg_temp.rid(), 'Tableta comal 2', 'kds', v_comal);
  v_code := r->>'code';
  perform pg_temp.ok(v_code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$', 'código legible XXXX-XXXX (sin 0/O/1/I/L)');
  perform pg_temp.ok(not exists (select 1 from app.device_pairings where code_hash = v_code or code_hash = replace(v_code, '-', '')),
    'el código no se guarda en claro');

  perform pg_temp.logout();
  pk := public.rpc_device_pairing_peek(lower(replace(v_code, '-', ' ')));
  perform pg_temp.ok((pk->>'ok')::boolean and pk->>'name' = 'Tableta comal 2' and pk->>'station_name' = 'Comal',
    'vista previa sin sesión (acepta minúsculas y espacios)');

  p := public.rpc_device_pair(v_code);
  select * into v_dev from public.devices where id = (p->>'device_id')::uuid;
  select * into v_user from auth.users where id = v_dev.user_id;
  perform pg_temp.ok(v_dev.mode = 'kds' and v_dev.station_id = v_comal and v_dev.name = 'Tableta comal 2', 'dispositivo creado con modo y estación');
  perform pg_temp.ok(v_user.email = p->>'email' and v_user.email_confirmed_at is not null, 'cuenta del equipo creada y confirmada');
  perform pg_temp.ok(v_user.encrypted_password = extensions.crypt(p->>'password', v_user.encrypted_password)
    and length(p->>'password') >= 32, 'contraseña aleatoria guardada solo como hash');
  perform pg_temp.ok(exists (select 1 from auth.identities where user_id = v_user.id and provider = 'email'), 'identidad de correo registrada');

  perform pg_temp.fails(format('select public.rpc_device_pair(%L)', v_code), 'codigo_usado', 'el código sirve una sola vez');
  perform pg_temp.fails('select public.rpc_device_pair(''ZZZZ-ZZZZ'')', 'codigo_invalido', 'código inexistente');
  perform pg_temp.ok(public.rpc_device_pairing_peek(v_code)->>'error' = 'codigo_usado', 'la vista previa avisa que ya se usó');

  -- La nueva cuenta funciona como dispositivo: contexto y PIN.
  perform pg_temp.login(v_user.email);
  perform pg_temp.ok(public.rpc_my_contexts()->'device'->>'device_id' = v_dev.id::text, 'el equipo abre en su contexto de dispositivo');
  perform pg_temp.ok((public.rpc_device_login('3333')->>'ok')::boolean, 'las personas entran con su PIN en el equipo nuevo');
  perform pg_temp.fails('select public.rpc_create_restaurant(''x'', ''Otro'', ''x'')', 'cuenta_de_dispositivo',
    'una cuenta de equipo no puede crear restaurantes');

  perform pg_temp.login('ana@demo.prepiq.test');
  perform pg_temp.ok(public.rpc_device_pairing_status(pg_temp.rid(), (r->>'pairing_id')::uuid)->>'status' = 'usado',
    'administración ve que el código se usó');
  perform set_config('test.device', v_dev.id::text, false);
  perform set_config('test.device_user', v_user.id::text, false);
end $$;

-- =====================================================================
-- V2. Vencimiento y cancelación
-- =====================================================================
do $$
declare r jsonb;
begin
  perform pg_temp.login('ana@demo.prepiq.test');
  r := public.rpc_device_pairing_create(pg_temp.rid(), 'Reloj entrada', 'kiosko');
  update app.device_pairings set expires_at = now() - interval '1 second' where id = (r->>'pairing_id')::uuid;
  perform pg_temp.logout();
  perform pg_temp.fails(format('select public.rpc_device_pair(%L)', r->>'code'), 'codigo_vencido', 'un código vencido no sirve');

  perform pg_temp.login('ana@demo.prepiq.test');
  r := public.rpc_device_pairing_create(pg_temp.rid(), 'Reloj entrada', 'kiosko');
  perform public.rpc_device_pairing_cancel(pg_temp.rid(), (r->>'pairing_id')::uuid);
  perform pg_temp.ok(public.rpc_device_pairing_peek(r->>'code')->>'error' = 'codigo_cancelado', 'un código cancelado no sirve');
  perform pg_temp.fails(format('select public.rpc_device_pairing_create(%L, '''', ''kds'')', pg_temp.rid()),
    'nombre_requerido', 'el equipo necesita nombre');
end $$;

-- =====================================================================
-- V3. Reemplazo: misma pantalla, equipo nuevo; la cuenta anterior queda bloqueada
-- =====================================================================
do $$
declare r jsonb; p jsonb; v_dev uuid := current_setting('test.device')::uuid; v_old uuid := current_setting('test.device_user')::uuid;
  v_token uuid;
begin
  perform pg_temp.login((select email from auth.users where id = v_old));
  v_token := (public.rpc_device_login('3333')->>'token')::uuid;
  perform pg_temp.login('ana@demo.prepiq.test');
  r := public.rpc_device_pairing_create(pg_temp.rid(), null, null, null, v_dev);
  perform pg_temp.ok((r->>'replaces')::boolean and r->>'name' = 'Tableta comal 2', 'el reemplazo conserva nombre y modo');
  perform pg_temp.logout();
  p := public.rpc_device_pair(r->>'code');
  perform pg_temp.ok((p->>'device_id')::uuid = v_dev, 'se reutiliza el mismo dispositivo (historial intacto)');
  perform pg_temp.ok((select user_id from public.devices where id = v_dev) <> v_old, 'el dispositivo usa la cuenta nueva');
  perform pg_temp.ok((select banned_until > now() from auth.users where id = v_old), 'la cuenta anterior queda bloqueada');
  perform pg_temp.ok((select ended_at is not null from app.device_sessions where id = v_token), 'las sesiones de PIN abiertas se cierran');
  perform pg_temp.login((select email from auth.users where id = v_old));
  perform pg_temp.ok(public.rpc_my_contexts()->'device' = 'null'::jsonb, 'la cuenta anterior ya no ve el restaurante');
end $$;

-- =====================================================================
-- V4. Privilegios
-- =====================================================================
do $$
begin
  perform pg_temp.ok(not has_function_privilege('anon', 'public.rpc_device_pairing_create(uuid, text, text, uuid, uuid, int)', 'execute'),
    'sin sesión no se pueden generar códigos');
  perform pg_temp.ok(has_function_privilege('anon', 'public.rpc_device_pair(text)', 'execute')
    and has_function_privilege('anon', 'public.rpc_device_pairing_peek(text)', 'execute'), 'el equipo sin sesión puede vincular');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'app.device_pairings', 'select')
    and not has_table_privilege('anon', 'app.device_pairings', 'select'), 'los códigos no se pueden leer por la API');
end $$;

select pg_temp.logout();
\echo '✔ Pruebas de vinculación pasaron.'
