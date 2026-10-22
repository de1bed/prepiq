-- =====================================================================
-- PrepIQ · 0008 · Alta de restaurante, membresías, dispositivos y PIN
-- =====================================================================

-- Crear organización + restaurante; quien lo crea queda como administrador.
create or replace function public.rpc_create_restaurant(
  p_org_name text, p_restaurant_name text, p_display_name text,
  p_timezone text default 'America/Mexico_City', p_currency text default 'MXN'
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_org uuid; v_rest uuid; v_staff uuid;
begin
  if auth.uid() is null then perform app.fail('no_autenticado'); end if;
  if exists (select 1 from public.devices where user_id = auth.uid()) then
    perform app.fail('cuenta_de_dispositivo', null, 'Usa una cuenta personal para crear un restaurante.');
  end if;
  insert into public.organizations(name, created_by) values (p_org_name, auth.uid()) returning id into v_org;
  insert into public.org_members(organization_id, user_id, role) values (v_org, auth.uid(), 'propietario');
  insert into public.restaurants(organization_id, name, timezone, currency)
  values (v_org, p_restaurant_name, p_timezone, upper(p_currency)) returning id into v_rest;
  insert into public.staff(restaurant_id, user_id, display_name, roles)
  values (v_rest, auth.uid(), p_display_name, array['admin']::public.app_role[]) returning id into v_staff;
  insert into public.label_templates(restaurant_id, name, is_default) values (v_rest, 'Estándar 50×30 mm', true);
  return jsonb_build_object('ok', true, 'organization_id', v_org, 'restaurant_id', v_rest, 'staff_id', v_staff);
end $$;

-- Agregar otro restaurante a una organización existente.
create or replace function public.rpc_add_restaurant(
  p_organization_id uuid, p_restaurant_name text, p_display_name text, p_timezone text default 'America/Mexico_City'
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_rest uuid;
begin
  if not exists (select 1 from public.org_members where organization_id = p_organization_id and user_id = auth.uid()) then
    perform app.fail('permiso_denegado');
  end if;
  insert into public.restaurants(organization_id, name, timezone) values (p_organization_id, p_restaurant_name, p_timezone)
    returning id into v_rest;
  insert into public.staff(restaurant_id, user_id, display_name, roles)
  values (v_rest, auth.uid(), p_display_name, array['admin']::public.app_role[]);
  insert into public.label_templates(restaurant_id, name, is_default) values (v_rest, 'Estándar 50×30 mm', true);
  return jsonb_build_object('ok', true, 'restaurant_id', v_rest);
end $$;

-- Mis contextos: restaurantes donde soy persona, dispositivo u org-admin.
create or replace function public.rpc_my_contexts()
returns jsonb language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'staff_id', s.id, 'restaurant_id', s.restaurant_id, 'restaurant_name', r.name, 'display_name', s.display_name,
        'roles', s.roles, 'timezone', r.timezone, 'currency', r.currency, 'settings', r.settings, 'is_demo', r.is_demo,
        'permissions', (select coalesce(jsonb_agg(distinct rp.permission), '[]'::jsonb) from app.role_permissions rp where rp.role = any (s.roles))
      ) order by r.name) from public.staff s join public.restaurants r on r.id = s.restaurant_id
      where s.user_id = auth.uid() and s.active and r.active), '[]'::jsonb),
    'device', (select jsonb_build_object('device_id', d.id, 'restaurant_id', d.restaurant_id, 'restaurant_name', r.name,
        'name', d.name, 'mode', d.mode, 'station_id', d.station_id, 'timezone', r.timezone, 'currency', r.currency,
        'settings', r.settings, 'is_demo', r.is_demo)
      from public.devices d join public.restaurants r on r.id = d.restaurant_id where d.user_id = auth.uid() and d.active),
    'pending_requests', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'restaurant_name', r.name, 'kind', j.kind,
        'status', j.status, 'created_at', j.created_at))
      from public.join_requests j join public.restaurants r on r.id = j.restaurant_id
      where j.user_id = auth.uid() and j.status = 'pendiente'), '[]'::jsonb),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('organization_id', o.id, 'name', o.name, 'role', m.role))
      from public.org_members m join public.organizations o on o.id = m.organization_id where m.user_id = auth.uid()), '[]'::jsonb)
  )
$$;

-- Solicitar unirse con el código del restaurante (persona o dispositivo).
create or replace function public.rpc_join_request(p_join_code text, p_kind text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_rest public.restaurants; v_id uuid;
begin
  if auth.uid() is null then perform app.fail('no_autenticado'); end if;
  select r.* into v_rest from public.restaurants r join app.restaurant_secrets rs on rs.restaurant_id = r.id
  where rs.join_code = upper(trim(p_join_code)) and r.active;
  if v_rest.id is null then perform app.fail('codigo_invalido'); end if;
  if exists (select 1 from public.staff where restaurant_id = v_rest.id and user_id = auth.uid())
     or exists (select 1 from public.devices where user_id = auth.uid()) then
    perform app.fail('ya_vinculado');
  end if;
  insert into public.join_requests(restaurant_id, user_id, kind, display_name)
  values (v_rest.id, auth.uid(), p_kind::public.join_kind, p_display_name)
  on conflict (restaurant_id, user_id) where status = 'pendiente' do update set display_name = excluded.display_name, kind = excluded.kind
  returning id into v_id;
  return jsonb_build_object('ok', true, 'request_id', v_id, 'restaurant_name', v_rest.name);
end $$;

-- Aprobar solicitud. Persona: crea colaborador o vincula uno existente.
-- Dispositivo: crea el dispositivo con modo y estación.
-- p_args persona: {roles:[...], staff_id?:uuid}; dispositivo: {mode, station_id?, name?}
create or replace function public.rpc_join_decide(p_request_id uuid, p_approve boolean, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare j public.join_requests; v_ctx jsonb; v_id uuid; v_roles public.app_role[];
begin
  select * into j from public.join_requests where id = p_request_id for update;
  if j.id is null then perform app.fail('no_encontrado'); end if;
  v_ctx := app.authorize(j.restaurant_id, null, case when j.kind = 'persona' then 'staff.manage' else 'devices.manage' end);
  if j.status <> 'pendiente' then perform app.fail('solicitud_ya_resuelta'); end if;
  if not p_approve then
    update public.join_requests set status = 'rechazada', decided_at = now(), decided_by = (v_ctx->>'staff_id')::uuid,
      decision_note = p_args->>'note' where id = j.id;
    return jsonb_build_object('ok', true);
  end if;
  perform set_config('app.internal_staff_write', 'on', true);
  if j.kind = 'persona' then
    select coalesce(array_agg(x::public.app_role), '{}') into v_roles from jsonb_array_elements_text(coalesce(p_args->'roles', '[]'::jsonb)) x;
    if (p_args->>'staff_id') is not null then
      update public.staff set user_id = j.user_id where id = (p_args->>'staff_id')::uuid and restaurant_id = j.restaurant_id
        and user_id is null returning id into v_id;
      if v_id is null then perform app.fail('colaborador_no_vinculable'); end if;
    else
      if cardinality(v_roles) = 0 then perform app.fail('roles_requeridos'); end if;
      insert into public.staff(restaurant_id, user_id, display_name, roles) values (j.restaurant_id, j.user_id, j.display_name, v_roles)
      returning id into v_id;
    end if;
  else
    insert into public.devices(restaurant_id, user_id, name, mode, station_id)
    values (j.restaurant_id, j.user_id, coalesce(nullif(trim(p_args->>'name'), ''), j.display_name),
      coalesce((p_args->>'mode')::public.device_mode, 'kds'), (p_args->>'station_id')::uuid)
    returning id into v_id;
  end if;
  update public.join_requests set status = 'aprobada', decided_at = now(), decided_by = (v_ctx->>'staff_id')::uuid where id = j.id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.rpc_rotate_join_code(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_code text;
begin
  perform app.authorize(p_restaurant_id, null, 'config.manage');
  update app.restaurant_secrets set join_code = upper(substr(md5(gen_random_uuid()::text), 1, 8)) where restaurant_id = p_restaurant_id
    returning join_code into v_code;
  return jsonb_build_object('ok', true, 'join_code', v_code);
end $$;

create or replace function public.rpc_get_join_code(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not (app.has_perm(p_restaurant_id, 'staff.manage') or app.has_perm(p_restaurant_id, 'devices.manage')) then
    perform app.fail('permiso_denegado');
  end if;
  return jsonb_build_object('ok', true, 'join_code', (select join_code from app.restaurant_secrets where restaurant_id = p_restaurant_id));
end $$;

-- Asignar PIN a un colaborador. Si p_pin es null se genera uno aleatorio
-- (recomendado: evita que alguien deduzca PINes ajenos). Se devuelve una sola vez.
create or replace function public.rpc_staff_set_pin(p_restaurant_id uuid, p_staff_id uuid, p_pin text default null, p_length int default 4)
returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare v_pin text := p_pin; v_try int := 0;
begin
  perform app.authorize(p_restaurant_id, null, 'staff.manage');
  if not exists (select 1 from public.staff where id = p_staff_id and restaurant_id = p_restaurant_id) then
    perform app.fail('colaborador_no_encontrado');
  end if;
  if p_length not between 4 and 6 then perform app.fail('longitud_invalida'); end if;
  loop
    if p_pin is null then
      v_pin := lpad((floor(random() * power(10, p_length)))::bigint::text, p_length, '0');
    end if;
    begin
      insert into app.staff_pins(staff_id, restaurant_id, pin_lookup)
      values (p_staff_id, p_restaurant_id, app.pin_lookup(p_restaurant_id, v_pin))
      on conflict (staff_id) do update set pin_lookup = excluded.pin_lookup;
      update public.staff set pin_set_at = now() where id = p_staff_id;
      exit;
    exception when unique_violation then
      if p_pin is not null then perform app.fail('pin_no_disponible', null, 'Elige otro PIN.'); end if;
      v_try := v_try + 1;
      if v_try > 50 then perform app.fail('pin_no_disponible', null, 'Usa un PIN más largo.'); end if;
    end;
  end loop;
  -- Cierra sesiones abiertas del colaborador en dispositivos.
  update app.device_sessions set ended_at = now() where staff_id = p_staff_id and ended_at is null;
  return jsonb_build_object('ok', true, 'pin', v_pin);
end $$;

create or replace function public.rpc_staff_clear_pin(p_restaurant_id uuid, p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.authorize(p_restaurant_id, null, 'staff.manage');
  delete from app.staff_pins where staff_id = p_staff_id and restaurant_id = p_restaurant_id;
  update public.staff set pin_set_at = null where id = p_staff_id and restaurant_id = p_restaurant_id;
  update app.device_sessions set ended_at = now() where staff_id = p_staff_id and ended_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Operador en dispositivo compartido
-- ---------------------------------------------------------------------
-- Devuelve un token de operador. No lanza error con PIN incorrecto (así el
-- intento fallido queda registrado para el límite de intentos).
create or replace function public.rpc_device_login(p_pin text, p_hours int default 12)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_dev public.devices; v_staff public.staff; v_id uuid; v_token uuid; v_fails int;
begin
  select * into v_dev from public.devices where user_id = auth.uid() and active;
  if v_dev.id is null then perform app.fail('no_es_dispositivo'); end if;
  select count(*) into v_fails from app.pin_attempts where user_id = auth.uid() and not success and at > now() - interval '10 minutes';
  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'error', 'pin_bloqueado', 'hint', 'Demasiados intentos. Espera 10 minutos o pide ayuda a un gerente.');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'error', 'pin_invalido');
  end if;
  v_id := app.staff_by_pin(v_dev.restaurant_id, p_pin);
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'pin_incorrecto', 'remaining', greatest(0, 4 - v_fails));
  end if;
  select * into v_staff from public.staff where id = v_id;
  -- En modo kiosko las sesiones son cortas (marcar y salir).
  insert into app.device_sessions(restaurant_id, device_id, staff_id, expires_at)
  values (v_dev.restaurant_id, v_dev.id, v_id,
    now() + case when v_dev.mode = 'kiosko' then interval '2 minutes' else make_interval(hours => least(greatest(p_hours, 1), 16)) end)
  returning id into v_token;
  update public.devices set last_seen_at = now() where id = v_dev.id;
  return jsonb_build_object('ok', true, 'token', v_token, 'staff_id', v_staff.id, 'display_name', v_staff.display_name,
    'roles', v_staff.roles,
    'permissions', (select coalesce(jsonb_agg(distinct permission), '[]'::jsonb) from app.role_permissions where role = any (v_staff.roles)),
    'expires_at', (select expires_at from app.device_sessions where id = v_token));
end $$;

create or replace function public.rpc_device_logout(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  update app.device_sessions ds set ended_at = now()
  from public.devices d where ds.id = p_token and d.id = ds.device_id and d.user_id = auth.uid() and ds.ended_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- Pase de autorización de gerente (PIN) para un permiso específico.
create or replace function public.rpc_request_override(p_restaurant_id uuid, p_pin text, p_permission text)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_staff uuid; v_id uuid; v_fails int;
begin
  if not app.is_member(p_restaurant_id) then perform app.fail('sin_acceso_restaurante'); end if;
  select count(*) into v_fails from app.pin_attempts where user_id = auth.uid() and not success and at > now() - interval '10 minutes';
  if v_fails >= 5 then return jsonb_build_object('ok', false, 'error', 'pin_bloqueado'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'error', 'pin_invalido'); end if;
  v_staff := app.staff_by_pin(p_restaurant_id, p_pin);
  if v_staff is null then return jsonb_build_object('ok', false, 'error', 'pin_incorrecto'); end if;
  if not app.staff_has_perm(v_staff, p_permission) then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso', 'hint', 'Esa persona no puede autorizar esta acción.');
  end if;
  insert into app.override_grants(restaurant_id, authorizer_staff, requested_by_user, permission)
  values (p_restaurant_id, v_staff, auth.uid(), p_permission) returning id into v_id;
  return jsonb_build_object('ok', true, 'override', v_id,
    'authorizer_name', (select display_name from public.staff where id = v_staff));
end $$;

-- Verificación periódica del dispositivo (sesión de operador vigente).
create or replace function public.rpc_device_session_check(p_token uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce((select jsonb_build_object('ok', true, 'expires_at', ds.expires_at, 'staff_id', ds.staff_id)
    from app.device_sessions ds join public.devices d on d.id = ds.device_id
    where ds.id = p_token and d.user_id = auth.uid() and ds.ended_at is null and ds.expires_at > now()),
    jsonb_build_object('ok', false))
$$;

-- Personas visibles para el kiosko / asignaciones: solo nombre y roles.
create or replace function public.rpc_staff_directory(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when app.is_member(p_restaurant_id) then coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'display_name', s.display_name, 'roles', s.roles, 'color', s.color, 'active', s.active,
      'has_pin', s.pin_set_at is not null, 'has_account', s.user_id is not null, 'employee_code', s.employee_code)
      order by s.display_name), '[]'::jsonb) end
  from public.staff s where s.restaurant_id = p_restaurant_id
$$;
