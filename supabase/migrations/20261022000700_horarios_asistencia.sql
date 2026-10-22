-- =====================================================================
-- PrepIQ · 0007 · Horarios, disponibilidad, cambios de turno y asistencia
--
-- * Turnos con timestamptz: un turno 18:00–02:00 cruza medianoche sin trucos.
--   La interfaz muestra en la zona horaria del restaurante.
-- * No se calcula nómina. Solo horas registradas vs. programadas.
-- * Las marcas de asistencia nunca se editan ni borran: se corrigen con una
--   solicitud aprobada que anula y/o agrega marcas.
-- =====================================================================

create type public.shift_status as enum ('borrador', 'publicado', 'cancelado');
create type public.punch_kind as enum ('entrada', 'inicio_descanso', 'fin_descanso', 'salida');
create type public.punch_source as enum ('kiosko', 'personal', 'correccion');
create type public.swap_status as enum ('pendiente', 'aceptada', 'aprobada', 'rechazada', 'cancelada');

create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  staff_id       uuid references public.staff(id) on delete cascade,   -- null = turno abierto
  role           public.app_role,
  station_id     uuid references public.stations(id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  break_minutes  int not null default 0 check (break_minutes between 0 and 240),
  notes          text,
  status         public.shift_status not null default 'borrador',
  published_at   timestamptz,
  created_by     uuid references public.staff(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '16 hours'),
  constraint shifts_no_overlap exclude using gist (
    staff_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelado' and staff_id is not null)
);
create index on public.shifts (restaurant_id, starts_at);
create trigger shifts_touch before update on public.shifts
  for each row execute function app.touch_updated_at();
create trigger shifts_audit after insert or update or delete on public.shifts
  for each row execute function app.audit();
create trigger shifts_same_rest_staff before insert or update on public.shifts
  for each row execute function app.check_same_restaurant('staff', 'staff_id');
create trigger shifts_same_rest_station before insert or update on public.shifts
  for each row execute function app.check_same_restaurant('stations', 'station_id');

-- Publicado → si se edita, se mantiene publicado pero queda en auditoría.
create or replace function public.rpc_schedule_publish(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; v_n int;
begin
  v_ctx := app.authorize(p_restaurant_id, null, 'schedule.manage');
  update public.shifts set status = 'publicado', published_at = now()
  where restaurant_id = p_restaurant_id and status = 'borrador' and starts_at >= p_from and starts_at < p_to;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'published', v_n);
end $$;

-- Copiar una semana de turnos a otra (como borrador).
create or replace function public.rpc_schedule_copy_week(p_restaurant_id uuid, p_from_week_start timestamptz, p_to_week_start timestamptz)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; v_n int := 0; s record; v_delta interval := p_to_week_start - p_from_week_start;
begin
  v_ctx := app.authorize(p_restaurant_id, null, 'schedule.manage');
  for s in select * from public.shifts where restaurant_id = p_restaurant_id and status <> 'cancelado'
           and starts_at >= p_from_week_start and starts_at < p_from_week_start + interval '7 days' loop
    begin
      insert into public.shifts(restaurant_id, staff_id, role, station_id, starts_at, ends_at, break_minutes, notes, created_by)
      values (s.restaurant_id, s.staff_id, s.role, s.station_id, s.starts_at + v_delta, s.ends_at + v_delta,
        s.break_minutes, s.notes, (v_ctx->>'staff_id')::uuid);
      v_n := v_n + 1;
    exception when exclusion_violation then null;  -- ya hay un turno que se empalma: se omite
    end;
  end loop;
  return jsonb_build_object('ok', true, 'copied', v_n);
end $$;

create table public.staff_availability (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  weekday        int not null check (weekday between 0 and 6),   -- 0 = domingo
  start_time     time not null,
  end_time       time not null,   -- si end_time <= start_time, cruza medianoche
  kind           text not null default 'disponible' check (kind in ('disponible', 'no_disponible')),
  note           text,
  created_at     timestamptz not null default now()
);
create index on public.staff_availability (staff_id);
create trigger staff_availability_same_rest before insert or update on public.staff_availability
  for each row execute function app.check_same_restaurant('staff', 'staff_id');

create table public.time_off_requests (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null check (ends_at > starts_at),
  reason         text,
  status         public.request_status not null default 'pendiente',
  created_at     timestamptz not null default now(),
  decided_by     uuid references public.staff(id),
  decided_at     timestamptz,
  decision_note  text
);
create index on public.time_off_requests (restaurant_id, status);

create table public.shift_swap_requests (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  shift_id       uuid not null references public.shifts(id) on delete cascade,
  from_staff     uuid not null references public.staff(id) on delete cascade,
  to_staff       uuid references public.staff(id) on delete cascade,  -- null = lo ofrece a quien lo tome
  status         public.swap_status not null default 'pendiente',
  note           text,
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  decided_by     uuid references public.staff(id),
  decided_at     timestamptz,
  decision_note  text
);
create index on public.shift_swap_requests (restaurant_id, status);

-- Solicitudes de ausencia y cambios de turno.
create or replace function public.rpc_time_off(
  p_restaurant_id uuid, p_action text, p_request_id uuid default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; r public.time_off_requests; v_id uuid;
begin
  v_ctx := app.resolve_actor(p_restaurant_id, null);
  if p_action = 'solicitar' then
    if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then perform app.fail('rango_invalido'); end if;
    insert into public.time_off_requests(restaurant_id, staff_id, starts_at, ends_at, reason)
    values (p_restaurant_id, (v_ctx->>'staff_id')::uuid, p_starts_at, p_ends_at, p_note) returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;
  select * into r from public.time_off_requests where id = p_request_id and restaurant_id = p_restaurant_id for update;
  if r.id is null then perform app.fail('no_encontrado'); end if;
  if r.status <> 'pendiente' then perform app.fail('solicitud_ya_resuelta'); end if;
  if p_action = 'cancelar' then
    if r.staff_id <> (v_ctx->>'staff_id')::uuid then perform app.fail('permiso_denegado'); end if;
    update public.time_off_requests set status = 'cancelada' where id = r.id;
  elsif p_action in ('aprobar', 'rechazar') then
    v_ctx := app.authorize(p_restaurant_id, null, 'schedule.manage');
    if r.staff_id = (v_ctx->>'staff_id')::uuid and not app.is_org_admin(p_restaurant_id) then
      perform app.fail('autoaprobacion_no_permitida');
    end if;
    update public.time_off_requests set status = case when p_action = 'aprobar' then 'aprobada' else 'rechazada' end::public.request_status,
      decided_by = (v_ctx->>'staff_id')::uuid, decided_at = now(), decision_note = p_note where id = r.id;
  else
    perform app.fail('accion_invalida', p_action);
  end if;
  return jsonb_build_object('ok', true, 'id', r.id);
end $$;

create or replace function public.rpc_shift_swap(
  p_restaurant_id uuid, p_action text, p_shift_id uuid default null, p_request_id uuid default null,
  p_to_staff uuid default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; v_me uuid; s public.shifts; r public.shift_swap_requests; v_id uuid;
begin
  v_ctx := app.resolve_actor(p_restaurant_id, null);
  v_me := (v_ctx->>'staff_id')::uuid;
  if p_action = 'solicitar' then
    select * into s from public.shifts where id = p_shift_id and restaurant_id = p_restaurant_id;
    if s.id is null or s.staff_id <> v_me then perform app.fail('turno_no_propio'); end if;
    if s.status <> 'publicado' or s.starts_at < now() then perform app.fail('turno_no_intercambiable'); end if;
    insert into public.shift_swap_requests(restaurant_id, shift_id, from_staff, to_staff, note)
    values (p_restaurant_id, s.id, v_me, p_to_staff, p_note) returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;
  select * into r from public.shift_swap_requests where id = p_request_id and restaurant_id = p_restaurant_id for update;
  if r.id is null then perform app.fail('no_encontrado'); end if;
  if p_action = 'aceptar' then
    if r.status <> 'pendiente' then perform app.fail('solicitud_ya_resuelta'); end if;
    if r.from_staff = v_me or (r.to_staff is not null and r.to_staff <> v_me) then perform app.fail('permiso_denegado'); end if;
    update public.shift_swap_requests set status = 'aceptada', to_staff = v_me, accepted_at = now() where id = r.id;
  elsif p_action = 'cancelar' then
    if r.from_staff <> v_me or r.status not in ('pendiente', 'aceptada') then perform app.fail('permiso_denegado'); end if;
    update public.shift_swap_requests set status = 'cancelada' where id = r.id;
  elsif p_action in ('aprobar', 'rechazar') then
    v_ctx := app.authorize(p_restaurant_id, null, 'schedule.manage');
    if p_action = 'aprobar' then
      if r.status <> 'aceptada' then perform app.fail('falta_aceptacion', null, 'Un compañero debe aceptar primero.'); end if;
      begin
        update public.shifts set staff_id = r.to_staff where id = r.shift_id;
      exception when exclusion_violation then
        perform app.fail('turno_empalmado', null, 'La persona ya tiene un turno en ese horario.');
      end;
    end if;
    update public.shift_swap_requests set status = case when p_action = 'aprobar' then 'aprobada' else 'rechazada' end::public.swap_status,
      decided_by = (v_ctx->>'staff_id')::uuid, decided_at = now(), decision_note = p_note where id = r.id;
  else
    perform app.fail('accion_invalida', p_action);
  end if;
  return jsonb_build_object('ok', true, 'id', r.id);
end $$;

-- ---------------------------------------------------------------------
-- Asistencia
-- ---------------------------------------------------------------------
create table public.time_punches (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  kind           public.punch_kind not null,
  at             timestamptz not null,
  recorded_at    timestamptz not null default clock_timestamp(),
  source         public.punch_source not null,
  -- Si se capturó sin conexión: hora del dispositivo (el servidor la acepta
  -- dentro de una ventana y la marca para revisión).
  offline        boolean not null default false,
  device_id      uuid references public.devices(id) on delete set null,
  shift_id       uuid references public.shifts(id) on delete set null,
  correction_id  uuid,
  voided         boolean not null default false,
  voided_at      timestamptz,
  voided_by      uuid references public.staff(id),
  void_reason    text,
  note           text
);
create index on public.time_punches (restaurant_id, staff_id, at);

create or replace function app.punches_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform app.fail('historial_inmutable'); end if;
  -- Solo se permite marcar como anulada.
  if (to_jsonb(new) - array['voided', 'voided_at', 'voided_by', 'void_reason'])
     <> (to_jsonb(old) - array['voided', 'voided_at', 'voided_by', 'void_reason']) or old.voided then
    perform app.fail('historial_inmutable');
  end if;
  return new;
end $$;
create trigger time_punches_guard before update or delete on public.time_punches
  for each row execute function app.punches_guard();

create table public.punch_corrections (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  action         text not null check (action in ('agregar', 'modificar', 'anular')),
  punch_id       uuid references public.time_punches(id),
  kind           public.punch_kind,
  requested_at   timestamptz,
  reason         text not null check (length(trim(reason)) > 0),
  status         public.request_status not null default 'pendiente',
  requested_by   uuid not null references public.staff(id),
  created_at     timestamptz not null default now(),
  decided_by     uuid references public.staff(id),
  decided_at     timestamptz,
  decision_note  text,
  check (action = 'agregar' or punch_id is not null),
  check (action = 'anular' or (kind is not null and requested_at is not null))
);
create index on public.punch_corrections (restaurant_id, status);

create or replace function app.last_punch(p_staff uuid) returns public.time_punches
language sql stable security definer set search_path = public, app, pg_temp as $$
  select * from public.time_punches where staff_id = p_staff and not voided order by at desc, recorded_at desc limit 1
$$;

-- Registrar marca. En kiosko: el token viene del PIN. Personal: según ajuste
-- `allow_personal_punch` del restaurante.
create or replace function public.rpc_punch(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_kind text, p_client_at timestamptz default null,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; v_staff uuid; v_last public.time_punches; v_at timestamptz := clock_timestamp(); v_offline boolean := false;
  v_kind public.punch_kind; v_shift uuid; v_row public.time_punches; v_warn text;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'punch');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'attendance.self');
  v_staff := (v_ctx->>'staff_id')::uuid;
  if (v_ctx->>'device_id') is null and not app.setting_bool(p_restaurant_id, 'allow_personal_punch', false) then
    perform app.fail('marcar_solo_en_kiosko', null, 'Registra tu entrada en el reloj del restaurante.');
  end if;
  if p_kind not in ('entrada', 'inicio_descanso', 'fin_descanso', 'salida') then perform app.fail('tipo_invalido'); end if;
  v_kind := p_kind::public.punch_kind;

  if p_client_at is not null and abs(extract(epoch from now() - p_client_at)) > 120 then
    if p_client_at < now() - interval '12 hours' or p_client_at > now() + interval '5 minutes' then
      perform app.fail('hora_fuera_de_rango', null, 'Pide una corrección al gerente.');
    end if;
    v_at := p_client_at; v_offline := true;
  end if;

  v_last := app.last_punch(v_staff);
  -- Secuencia válida.
  if v_kind = 'entrada' then
    if v_last.kind is not null and v_last.kind <> 'salida' then
      if v_last.at > v_at - interval '18 hours' then
        perform app.fail('ya_hay_entrada', to_char(v_last.at, 'YYYY-MM-DD HH24:MI'), 'Registra tu salida primero.');
      end if;
      v_warn := 'turno_anterior_sin_salida';
      insert into public.incidents(restaurant_id, kind, description, created_by)
      values (p_restaurant_id, 'otro', 'Asistencia: turno anterior sin salida (' || to_char(v_last.at, 'YYYY-MM-DD HH24:MI') || '). Requiere corrección.', v_staff);
    end if;
  elsif v_kind = 'inicio_descanso' then
    if v_last.kind not in ('entrada', 'fin_descanso') or v_last.kind is null then perform app.fail('secuencia_invalida', 'Sin entrada activa'); end if;
  elsif v_kind = 'fin_descanso' then
    if v_last.kind is distinct from 'inicio_descanso' then perform app.fail('secuencia_invalida', 'No estás en descanso'); end if;
  elsif v_kind = 'salida' then
    if v_last.kind is null or v_last.kind = 'salida' then perform app.fail('secuencia_invalida', 'Sin entrada activa'); end if;
    if v_last.kind = 'inicio_descanso' then
      insert into public.time_punches(restaurant_id, staff_id, kind, at, source, offline, device_id, note)
      values (p_restaurant_id, v_staff, 'fin_descanso', v_at,
        case when (v_ctx->>'device_id') is null then 'personal' else 'kiosko' end::public.punch_source,
        v_offline, (v_ctx->>'device_id')::uuid, 'Cierre automático de descanso al salir');
    end if;
  end if;
  if v_last.at is not null and v_at < v_last.at then perform app.fail('hora_anterior_a_ultima_marca'); end if;

  select id into v_shift from public.shifts where staff_id = v_staff and status = 'publicado'
    and v_at between starts_at - interval '2 hours' and ends_at + interval '2 hours'
    order by abs(extract(epoch from starts_at - v_at)) limit 1;

  insert into public.time_punches(restaurant_id, staff_id, kind, at, source, offline, device_id, shift_id, note)
  values (p_restaurant_id, v_staff, v_kind, v_at,
    case when (v_ctx->>'device_id') is null then 'personal' else 'kiosko' end::public.punch_source,
    v_offline, (v_ctx->>'device_id')::uuid, v_shift, p_note)
  returning * into v_row;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'punch', to_jsonb(v_row), 'warning', v_warn,
    'staff_name', (select display_name from public.staff where id = v_staff)));
end $$;

-- Solicitar corrección (propia o de otra persona si se es gerente).
create or replace function public.rpc_punch_correction(
  p_restaurant_id uuid, p_action text, p_correction_id uuid default null, p_staff_id uuid default null,
  p_correction_action text default null, p_punch_id uuid default null, p_kind text default null,
  p_requested_at timestamptz default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; v_me uuid; c public.punch_corrections; v_id uuid; v_new uuid; v_auto boolean := false;
begin
  v_ctx := app.resolve_actor(p_restaurant_id, null);
  v_me := (v_ctx->>'staff_id')::uuid;
  if p_action = 'solicitar' then
    p_staff_id := coalesce(p_staff_id, v_me);
    if p_staff_id <> v_me and not app.staff_has_perm(v_me, 'attendance.manage') then perform app.fail('permiso_denegado'); end if;
    if p_punch_id is not null and not exists (select 1 from public.time_punches where id = p_punch_id and staff_id = p_staff_id and not voided) then
      perform app.fail('marca_no_encontrada');
    end if;
    insert into public.punch_corrections(restaurant_id, staff_id, action, punch_id, kind, requested_at, reason, requested_by)
    values (p_restaurant_id, p_staff_id, p_correction_action, p_punch_id, p_kind::public.punch_kind, p_requested_at, p_reason, v_me)
    returning * into c;
    -- Un gerente corrigiendo a otra persona: queda aprobada por él (registrado).
    if p_staff_id <> v_me and app.staff_has_perm(v_me, 'attendance.manage') then
      v_auto := true;
    else
      return jsonb_build_object('ok', true, 'id', c.id, 'status', c.status);
    end if;
  else
    select * into c from public.punch_corrections where id = p_correction_id and restaurant_id = p_restaurant_id for update;
    if c.id is null then perform app.fail('no_encontrado'); end if;
    if c.status <> 'pendiente' then perform app.fail('solicitud_ya_resuelta'); end if;
  end if;

  if p_action = 'rechazar' or p_action = 'aprobar' or v_auto then
    v_ctx := app.authorize(p_restaurant_id, null, 'attendance.manage');
    if c.staff_id = v_me and not app.is_org_admin(p_restaurant_id) then perform app.fail('autoaprobacion_no_permitida'); end if;
    if p_action = 'rechazar' then
      update public.punch_corrections set status = 'rechazada', decided_by = v_me, decided_at = now() where id = c.id;
      return jsonb_build_object('ok', true, 'id', c.id, 'status', 'rechazada');
    end if;
    if c.action in ('modificar', 'anular') then
      update public.time_punches set voided = true, voided_at = now(), voided_by = v_me,
        void_reason = 'Corrección: ' || c.reason where id = c.punch_id and not voided;
    end if;
    if c.action in ('agregar', 'modificar') then
      insert into public.time_punches(restaurant_id, staff_id, kind, at, source, correction_id, note)
      values (p_restaurant_id, c.staff_id, c.kind, c.requested_at, 'correccion', c.id, c.reason) returning id into v_new;
    end if;
    update public.punch_corrections set status = 'aprobada', decided_by = v_me, decided_at = now() where id = c.id;
    return jsonb_build_object('ok', true, 'id', c.id, 'status', 'aprobada', 'punch_id', v_new);
  elsif p_action = 'cancelar' then
    if c.requested_by <> v_me then perform app.fail('permiso_denegado'); end if;
    update public.punch_corrections set status = 'cancelada' where id = c.id;
    return jsonb_build_object('ok', true, 'id', c.id, 'status', 'cancelada');
  end if;
  perform app.fail('accion_invalida', p_action);
end $$;

-- Sesiones de trabajo derivadas de las marcas (entrada → salida) con
-- descansos y comparación contra el turno programado. Sin cálculo de nómina.
create or replace function public.attendance_sessions(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz, p_staff_id uuid default null)
returns table (
  staff_id uuid, staff_name text, entrada timestamptz, salida timestamptz, break_minutes numeric,
  worked_minutes numeric, shift_id uuid, shift_starts timestamptz, shift_ends timestamptz,
  has_offline boolean, has_corrections boolean, open_session boolean
) language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v_me uuid := app.my_staff_id(p_restaurant_id);
begin
  if not (app.has_perm(p_restaurant_id, 'attendance.manage') or (p_staff_id is not null and p_staff_id = v_me)) then
    perform app.fail('permiso_denegado', 'attendance.manage');
  end if;
  return query
  with p as (
    select tp.*, sum(case when tp.kind = 'entrada' then 1 else 0 end)
             over (partition by tp.staff_id order by tp.at, tp.recorded_at) as sess
    from public.time_punches tp
    where tp.restaurant_id = p_restaurant_id and not tp.voided
      and tp.at >= p_from - interval '18 hours' and tp.at < p_to + interval '18 hours'
      and (p_staff_id is null or tp.staff_id = p_staff_id)
  ), b as (
    select p.*, lead(p.at) over (partition by p.staff_id, p.sess order by p.at, p.recorded_at) as next_at
    from p
  ), s as (
    select b.staff_id, b.sess,
      min(b.at) filter (where b.kind = 'entrada') as entrada,
      max(b.at) filter (where b.kind = 'salida') as salida,
      coalesce(sum(extract(epoch from b.next_at - b.at) / 60) filter (where b.kind = 'inicio_descanso'), 0) as brk,
      bool_or(b.offline) as off, bool_or(b.source = 'correccion') as corr,
      (array_agg(b.shift_id) filter (where b.shift_id is not null))[1] as shift_id
    from b group by b.staff_id, b.sess
  )
  select s.staff_id, st.display_name, s.entrada, s.salida, round(s.brk::numeric, 1),
    case when s.salida is not null then round((extract(epoch from s.salida - s.entrada) / 60 - s.brk)::numeric, 1) end,
    s.shift_id, sh.starts_at, sh.ends_at, s.off, s.corr, s.salida is null
  from s join public.staff st on st.id = s.staff_id
  left join public.shifts sh on sh.id = s.shift_id
  where s.entrada is not null and s.entrada >= p_from and s.entrada < p_to
  order by s.entrada;
end $$;
