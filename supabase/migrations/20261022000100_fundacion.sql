-- =====================================================================
-- PrepIQ · 0001 · Fundación
-- Organizaciones, restaurantes, personas, roles, permisos, dispositivos,
-- sesiones de operador (PIN), idempotencia y auditoría.
--
-- Convenciones:
--   * Tablas de negocio en `public` (expuestas por la API de Supabase con RLS).
--   * Utilidades y datos privados en `app` (no expuesto por la API).
--   * Las operaciones de servicio (órdenes, tickets, inventario, asistencia)
--     se escriben SOLO mediante funciones RPC `security definer` que validan
--     permisos, registran actor y son idempotentes (p_op_id).
--   * Errores de negocio: `raise exception '<codigo>' using detail, hint`.
--     El cliente distingue errores de negocio (no reintentar) de errores de
--     red (reintentar).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'gerente', 'cocinero', 'mesero');
create type public.device_mode as enum ('kds', 'expo', 'pos', 'kiosko');
create type public.join_kind as enum ('persona', 'dispositivo');
create type public.request_status as enum ('pendiente', 'aprobada', 'rechazada', 'cancelada');

-- ---------------------------------------------------------------------
-- Utilidades genéricas
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Lanza un error de negocio con código estable para el cliente.
create or replace function app.fail(p_code text, p_detail text default null, p_hint text default null)
returns void language plpgsql as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail  = coalesce(p_detail, ''),
    hint    = coalesce(p_hint, '');
end $$;

-- ---------------------------------------------------------------------
-- Organización y restaurante
-- ---------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 120),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

create table public.org_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'admin' check (role in ('propietario', 'admin')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.restaurants (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete restrict,
  name              text not null check (length(trim(name)) between 2 and 120),
  timezone          text not null default 'America/Mexico_City',
  -- Hora local en que cambia el "día de negocio" (un servicio que cruza
  -- medianoche pertenece al día anterior hasta esta hora).
  day_cutover_hour  int  not null default 5 check (day_cutover_hour between 0 and 12),
  currency          text not null default 'MXN' check (length(currency) = 3),
  -- Configuración operativa (terminología, umbrales del KDS, metas de equipo).
  settings          jsonb not null default '{}'::jsonb,
  is_demo           boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.restaurants (organization_id);
create trigger restaurants_touch before update on public.restaurants
  for each row execute function app.touch_updated_at();

-- Validar la zona horaria al guardar.
create or replace function app.check_timezone() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    perform app.fail('zona_horaria_invalida', new.timezone);
  end if;
  return new;
end $$;
create trigger restaurants_tz before insert or update of timezone on public.restaurants
  for each row execute function app.check_timezone();

-- Secreto por restaurante para derivar el identificador del PIN (HMAC).
-- También guarda el código para que personas/dispositivos soliciten unirse
-- (rotable, visible solo para administración mediante RPC).
create table app.restaurant_secrets (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  pin_pepper    bytea not null default extensions.gen_random_bytes(32),
  join_code     text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8))
);

create or replace function app.restaurant_after_insert() returns trigger
language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
begin
  insert into app.restaurant_secrets(restaurant_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger restaurants_secret after insert on public.restaurants
  for each row execute function app.restaurant_after_insert();

-- Día de negocio actual según zona horaria y hora de corte.
create or replace function app.business_date(p_restaurant uuid, p_at timestamptz default now())
returns date language sql stable security definer set search_path = public, app, pg_temp as $$
  select ((p_at at time zone r.timezone) - make_interval(hours => r.day_cutover_hour))::date
  from public.restaurants r where r.id = p_restaurant
$$;

-- ---------------------------------------------------------------------
-- Personas (colaboradores) y roles
-- ---------------------------------------------------------------------
create table public.staff (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  display_name   text not null check (length(trim(display_name)) between 1 and 80),
  -- Un colaborador puede tener varios roles (p. ej. cocinero y mesero).
  roles          public.app_role[] not null default '{}' check (cardinality(roles) between 1 and 4),
  -- Número de empleado opcional (reloj checador / búsqueda).
  employee_code  text check (employee_code ~ '^[A-Za-z0-9-]{1,12}$'),
  -- El PIN vive en app.staff_pins (HMAC, nunca en claro, fuera de la API).
  pin_set_at     timestamptz,
  color          text check (color ~ '^#[0-9a-fA-F]{6}$'),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, user_id),
  unique (restaurant_id, employee_code)
);
create index on public.staff (user_id);
create trigger staff_touch before update on public.staff
  for each row execute function app.touch_updated_at();

create table app.staff_pins (
  staff_id       uuid primary key references public.staff(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  pin_lookup     text not null,
  unique (restaurant_id, pin_lookup)
);

-- Datos de contacto: solo administración y la propia persona.
create table public.staff_private (
  staff_id       uuid primary key references public.staff(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  phone          text,
  email          text,
  emergency_contact text,
  notes          text,
  updated_at     timestamptz not null default now()
);
create trigger staff_private_touch before update on public.staff_private
  for each row execute function app.touch_updated_at();

-- Matriz de permisos por rol (global). Ver docs/02-flujos-y-permisos.md.
create table app.role_permissions (
  role       public.app_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into app.role_permissions(role, permission)
select 'admin'::public.app_role, p from unnest(array[
  'config.manage','staff.manage','devices.manage','menu.manage','menu.86',
  'service.open_close','orders.create','orders.edit_any','orders.view_all','orders.void_sent',
  'orders.priority','orders.close_any','kds.view','kds.bump','kds.reopen','kds.block',
  'inventory.view','inventory.receive','inventory.waste','inventory.count','inventory.approve_count',
  'inventory.manage','inventory.adjust','inventory.view_cost','inventory.produce',
  'labels.print','labels.reprint','labels.manage','schedule.manage','schedule.view_team',
  'attendance.self','attendance.manage','reports.view','incidents.create','incidents.manage',
  'audit.view'
]) p
union all
select 'gerente', p from unnest(array[
  'menu.86','service.open_close','orders.create','orders.edit_any','orders.view_all','orders.void_sent',
  'orders.priority','orders.close_any','kds.view','kds.bump','kds.reopen','kds.block',
  'inventory.view','inventory.receive','inventory.waste','inventory.count','inventory.approve_count',
  'inventory.adjust','inventory.view_cost','inventory.produce','labels.print','labels.reprint',
  'schedule.manage','schedule.view_team','attendance.self','attendance.manage','reports.view',
  'incidents.create','incidents.manage','audit.view'
]) p
union all
select 'cocinero', p from unnest(array[
  'menu.86','kds.view','kds.bump','kds.reopen','kds.block','inventory.view','inventory.waste',
  'inventory.count','inventory.produce','labels.print','attendance.self','incidents.create'
]) p
union all
select 'mesero', p from unnest(array[
  'orders.create','orders.view_all','kds.view','attendance.self','incidents.create'
]) p;

-- ---------------------------------------------------------------------
-- Dispositivos compartidos (tableta de cocina, terminal de meseros, reloj)
-- Un dispositivo es una cuenta de Supabase Auth vinculada al restaurante.
-- Las personas se identifican en él con PIN y obtienen un token de operador.
-- ---------------------------------------------------------------------
create table public.devices (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 60),
  mode           public.device_mode not null,
  station_id     uuid, -- FK se agrega con las estaciones
  active         boolean not null default true,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.devices (restaurant_id);
create trigger devices_touch before update on public.devices
  for each row execute function app.touch_updated_at();

-- Permisos de lectura mínimos de un dispositivo según su modo.
create table app.device_mode_permissions (
  mode       public.device_mode not null,
  permission text not null,
  primary key (mode, permission)
);
insert into app.device_mode_permissions values
  ('kds','kds.view'), ('expo','kds.view'), ('expo','orders.view_all'),
  ('pos','orders.view_all'), ('pos','kds.view'), ('kiosko','attendance.kiosk');

-- Sesiones de operador en un dispositivo: el id es el token secreto.
create table app.device_sessions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  device_id      uuid not null references public.devices(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  started_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  ended_at       timestamptz
);
create index on app.device_sessions (device_id, ended_at);

create table app.pin_attempts (
  id         bigserial primary key,
  user_id    uuid not null,
  at         timestamptz not null default now(),
  success    boolean not null
);
create index on app.pin_attempts (user_id, at desc);

-- Solicitudes para unirse a un restaurante con el código.
create table public.join_requests (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           public.join_kind not null,
  display_name   text not null check (length(trim(display_name)) between 1 and 80),
  status         public.request_status not null default 'pendiente',
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.staff(id),
  decision_note  text
);
create unique index join_requests_one_pending on public.join_requests (restaurant_id, user_id)
  where status = 'pendiente';

-- ---------------------------------------------------------------------
-- Resolución de identidad y permisos
-- ---------------------------------------------------------------------
create or replace function app.my_staff_id(p_restaurant uuid)
returns uuid language sql stable security definer set search_path = public, app, pg_temp as $$
  select s.id from public.staff s
  where s.restaurant_id = p_restaurant and s.user_id = auth.uid() and s.active
$$;

create or replace function app.my_device(p_restaurant uuid)
returns public.devices language sql stable security definer set search_path = public, app, pg_temp as $$
  select d.* from public.devices d
  where d.user_id = auth.uid() and d.restaurant_id = p_restaurant and d.active
$$;

create or replace function app.is_org_admin(p_restaurant uuid)
returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from public.restaurants r
    join public.org_members m on m.organization_id = r.organization_id
    where r.id = p_restaurant and m.user_id = auth.uid()
  )
$$;

create or replace function app.is_member(p_restaurant uuid)
returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.my_staff_id(p_restaurant) is not null
      or exists (select 1 from public.devices d where d.user_id = auth.uid()
                 and d.restaurant_id = p_restaurant and d.active)
      or app.is_org_admin(p_restaurant)
$$;

create or replace function app.staff_has_perm(p_staff uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from public.staff s
    join app.role_permissions rp on rp.role = any (s.roles)
    where s.id = p_staff and s.active and rp.permission = p_perm
  )
$$;

-- ¿El usuario autenticado (persona o dispositivo) tiene el permiso? Usado por RLS.
create or replace function app.has_perm(p_restaurant uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.is_org_admin(p_restaurant)
      or app.staff_has_perm(app.my_staff_id(p_restaurant), p_perm)
      or exists (
        select 1 from public.devices d
        join app.device_mode_permissions dp on dp.mode = d.mode
        where d.user_id = auth.uid() and d.restaurant_id = p_restaurant and d.active
          and dp.permission = p_perm)
$$;

create or replace function app.pin_lookup(p_restaurant uuid, p_pin text)
returns text language plpgsql stable security definer set search_path = public, app, extensions, pg_temp as $$
declare v_pepper bytea;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    perform app.fail('pin_invalido', null, 'El PIN debe tener de 4 a 6 dígitos.');
  end if;
  select pin_pepper into v_pepper from app.restaurant_secrets where restaurant_id = p_restaurant;
  return encode(extensions.hmac(convert_to(p_pin, 'UTF8'), v_pepper, 'sha256'), 'hex');
end $$;

-- Limita intentos de PIN por cuenta (dispositivo o persona): 5 fallos en 10 min.
create or replace function app.check_pin_rate() returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_fails int;
begin
  select count(*) into v_fails from app.pin_attempts
  where user_id = auth.uid() and not success and at > now() - interval '10 minutes';
  if v_fails >= 5 then
    perform app.fail('pin_bloqueado', null, 'Demasiados intentos. Espera unos minutos o pide ayuda a un gerente.');
  end if;
end $$;

create or replace function app.staff_by_pin(p_restaurant uuid, p_pin text)
returns uuid language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_staff uuid;
begin
  perform app.check_pin_rate();
  select s.id into v_staff from app.staff_pins sp join public.staff s on s.id = sp.staff_id and s.active
  where sp.restaurant_id = p_restaurant and sp.pin_lookup = app.pin_lookup(p_restaurant, p_pin);
  insert into app.pin_attempts(user_id, success) values (auth.uid(), v_staff is not null);
  return v_staff;
end $$;

-- Contexto de una operación: quién la hace (persona) y desde dónde (dispositivo).
-- En un dispositivo compartido se requiere token de operador (sesión por PIN).
-- p_grace: para operaciones que pueden llegar tarde por falta de conexión
-- (marcas de asistencia), acepta una sesión ya cerrada/vencida si inició
-- dentro de esa ventana; la RPC valida que la hora de la acción caiga dentro
-- de la sesión (session_started_at / session_ended_at en el contexto).
create or replace function app.resolve_actor(p_restaurant uuid, p_token uuid, p_grace interval default null)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_dev public.devices;
  v_ds app.device_sessions;
  v_staff uuid;
begin
  if auth.uid() is null then perform app.fail('no_autenticado'); end if;
  v_dev := app.my_device(p_restaurant);
  if v_dev.id is not null then
    if p_token is null then
      perform app.fail('operador_requerido', null, 'Identifícate con tu PIN en este dispositivo.');
    end if;
    select ds.* into v_ds from app.device_sessions ds
    join public.staff s on s.id = ds.staff_id and s.active
    where ds.id = p_token and ds.device_id = v_dev.id
      and ((ds.ended_at is null and ds.expires_at > now())
           or (p_grace is not null and ds.started_at > now() - p_grace));
    if v_ds.id is null then
      perform app.fail('sesion_operador_expirada', null, 'Vuelve a ingresar tu PIN.');
    end if;
    update public.devices set last_seen_at = now() where id = v_dev.id
      and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
    return jsonb_build_object('staff_id', v_ds.staff_id, 'device_id', v_dev.id,
      'session_started_at', v_ds.started_at, 'session_ended_at', least(coalesce(v_ds.ended_at, v_ds.expires_at), v_ds.expires_at));
  end if;
  v_staff := app.my_staff_id(p_restaurant);
  if v_staff is null then perform app.fail('sin_acceso_restaurante'); end if;
  return jsonb_build_object('staff_id', v_staff, 'device_id', null);
end $$;

-- Autorizaciones en sitio: si el actor no tiene un permiso, un gerente
-- presente ingresa su PIN y se emite un "pase" de un solo uso (10 min) para
-- ese permiso. Se valida en una llamada aparte para que los intentos fallidos
-- de PIN queden registrados (un error revertiría el registro).
create table app.override_grants (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  authorizer_staff   uuid not null references public.staff(id) on delete cascade,
  requested_by_user  uuid not null,
  permission         text not null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '10 minutes',
  used_at            timestamptz
);

-- Resuelve actor y exige permiso; acepta un pase de autorización vigente.
create or replace function app.authorize(p_restaurant uuid, p_token uuid, p_perm text, p_override uuid default null,
  p_grace interval default null)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_ctx jsonb := app.resolve_actor(p_restaurant, p_token, p_grace);
  v_grant app.override_grants;
begin
  if app.staff_has_perm((v_ctx->>'staff_id')::uuid, p_perm) then
    return v_ctx || jsonb_build_object('authorized_by', v_ctx->>'staff_id');
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
-- Idempotencia: cada operación del cliente lleva un op_id (UUID). Si llega
-- dos veces (reintento tras falla de red), la segunda devuelve el mismo
-- resultado sin repetir efectos.
-- ---------------------------------------------------------------------
create table app.processed_ops (
  op_id          uuid primary key,
  restaurant_id  uuid not null,
  kind           text not null,
  result         jsonb,
  created_at     timestamptz not null default now()
);
create index on app.processed_ops (created_at);

create or replace function app.op_begin(p_op uuid, p_restaurant uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_n int; v_row app.processed_ops;
begin
  if p_op is null then perform app.fail('op_id_requerido'); end if;
  insert into app.processed_ops(op_id, restaurant_id, kind) values (p_op, p_restaurant, p_kind)
  on conflict (op_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 1 then return null; end if;
  select * into v_row from app.processed_ops where op_id = p_op;
  if v_row.kind <> p_kind or v_row.restaurant_id <> p_restaurant then
    perform app.fail('op_id_reutilizado', p_op::text);
  end if;
  return coalesce(v_row.result, '{}'::jsonb) || jsonb_build_object('_replayed', true);
end $$;

create or replace function app.op_finish(p_op uuid, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  update app.processed_ops set result = p_result where op_id = p_op;
  return p_result;
end $$;

-- ---------------------------------------------------------------------
-- Auditoría de cambios de configuración
-- ---------------------------------------------------------------------
create table public.audit_log (
  id             bigserial primary key,
  restaurant_id  uuid references public.restaurants(id) on delete cascade,
  table_name     text not null,
  row_id         text,
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data       jsonb,
  new_data       jsonb,
  staff_id       uuid,
  user_id        uuid,
  at             timestamptz not null default now()
);
create index on public.audit_log (restaurant_id, at desc);
create index on public.audit_log (table_name, row_id);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_rest uuid;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  v_rest := coalesce((v_new->>'restaurant_id')::uuid, (v_old->>'restaurant_id')::uuid);
  if tg_table_name = 'restaurants' then v_rest := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid); end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then return new; end if;
  insert into public.audit_log(restaurant_id, table_name, row_id, action, old_data, new_data, staff_id, user_id)
  values (v_rest, tg_table_name, coalesce(v_new->>'id', v_old->>'id'), tg_op, v_old, v_new,
          case when v_rest is not null then app.my_staff_id(v_rest) end, auth.uid());
  return coalesce(new, old);
end $$;

create trigger restaurants_audit after insert or update or delete on public.restaurants
  for each row execute function app.audit();
create trigger staff_audit after insert or update or delete on public.staff
  for each row execute function app.audit();
create trigger devices_audit after insert or update or delete on public.devices
  for each row execute function app.audit();
