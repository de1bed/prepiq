-- =====================================================================
-- PrepIQ · 0004 · Jornadas, órdenes y tickets de cocina (KDS)
--
-- Modelo:
--   Jornada (service_day) → Orden (order) → Líneas (order_items)
--   Al ENVIAR, las líneas pendientes se agrupan en tickets por estación
--   (kitchen_tickets) con sus renglones (ticket_items). Cada envío posterior
--   crea tickets nuevos (rondas). Toda transición queda en ticket_events.
--
-- Estados de ticket (internos; las etiquetas visibles son configurables):
--   en_espera → nuevo → en_preparacion → listo → entregado
--   anulado (desde cualquiera antes de entregado, por anulación de líneas)
--   Reabrir: listo|entregado → en_preparacion (con motivo; historial intacto)
--   Bloqueo por faltante: bandera independiente del estado (el cronómetro
--   separa tiempo bloqueado de tiempo activo).
-- =====================================================================

create type public.service_day_status as enum ('abierta', 'cerrada');
create type public.order_type as enum ('mesa', 'llevar', 'barra', 'domicilio');
create type public.order_status as enum ('abierta', 'cerrada', 'anulada');
create type public.order_item_status as enum ('pendiente', 'enviado', 'anulado');
create type public.ticket_status as enum ('en_espera', 'nuevo', 'en_preparacion', 'listo', 'entregado', 'anulado');
create type public.ticket_item_status as enum ('pendiente', 'listo', 'anulado');
create type public.reopen_reason as enum (
  'error_preparacion', 'cliente_devolvio', 'falto_producto', 'marcado_por_error', 'cambio_cliente', 'otro'
);
create type public.void_reason as enum (
  'error_captura', 'cliente_cancelo', 'producto_agotado', 'demora', 'cambio_cliente', 'cortesia', 'otro'
);

-- ---------------------------------------------------------------------
-- Jornadas (día de servicio)
-- ---------------------------------------------------------------------
create table public.service_days (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  business_date      date not null,
  status             public.service_day_status not null default 'abierta',
  next_order_number  int not null default 1,
  opened_at          timestamptz not null default now(),
  opened_by          uuid references public.staff(id),
  closed_at          timestamptz,
  closed_by          uuid references public.staff(id),
  close_note         text,
  unique (restaurant_id, business_date)
);
create unique index service_days_one_open on public.service_days (restaurant_id) where status = 'abierta';

-- ---------------------------------------------------------------------
-- Órdenes
-- ---------------------------------------------------------------------
create table public.orders (
  -- El id lo genera el dispositivo (UUID) para que reintentos y modo sin
  -- conexión no dupliquen la orden.
  id                uuid primary key,
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  service_day_id    uuid not null references public.service_days(id),
  number            int not null,
  order_type        public.order_type not null default 'mesa',
  table_label       text check (table_label is null or length(trim(table_label)) between 1 and 20),
  guest_count       int check (guest_count is null or guest_count between 1 and 99),
  customer_name     text check (customer_name is null or length(customer_name) <= 60),
  notes             text check (notes is null or length(notes) <= 300),
  status            public.order_status not null default 'abierta',
  server_staff_id   uuid references public.staff(id),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.staff(id),
  created_device_id uuid references public.devices(id) on delete set null,
  client_created_at timestamptz,
  closed_at         timestamptz,
  closed_by         uuid references public.staff(id),
  void_reason       text,
  updated_at        timestamptz not null default now(),
  unique (service_day_id, number),
  check (order_type <> 'mesa' or table_label is not null)
);
create index on public.orders (restaurant_id, status, created_at desc);
create index on public.orders (service_day_id);
create trigger orders_touch before update on public.orders
  for each row execute function app.touch_updated_at();

create table public.order_items (
  id                uuid primary key,   -- generado por el dispositivo
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  order_id          uuid not null references public.orders(id) on delete cascade,
  menu_item_id      uuid not null references public.menu_items(id),
  -- Instantáneas al momento de capturar (el menú puede cambiar después).
  name              text not null,
  kitchen_name      text,
  unit_price        numeric(10, 2) not null default 0,
  qty               int not null check (qty between 1 and 99),
  -- [{"modifier_id","name","kitchen_label","price_delta","qty"}]
  modifiers         jsonb not null default '[]'::jsonb check (jsonb_typeof(modifiers) = 'array'),
  notes             text check (notes is null or length(notes) <= 200),
  course            int not null default 1 check (course between 1 and 5),
  seat              int check (seat is null or seat between 1 and 99),
  status            public.order_item_status not null default 'pendiente',
  -- Si esta línea corrige otra (cambio después de enviar).
  replaces_item_id  uuid references public.order_items(id),
  sent_at           timestamptz,
  send_id           uuid,
  voided_at         timestamptz,
  void_reason       public.void_reason,
  void_note         text,
  voided_by         uuid references public.staff(id),
  void_authorized_by uuid references public.staff(id),
  void_was_prepared boolean,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.staff(id)
);
create index on public.order_items (order_id);
create index on public.order_items (restaurant_id, created_at desc);

-- ---------------------------------------------------------------------
-- Tickets de cocina
-- ---------------------------------------------------------------------
create table public.kitchen_tickets (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  service_day_id   uuid not null references public.service_days(id),
  order_id         uuid not null references public.orders(id) on delete cascade,
  station_id       uuid not null references public.stations(id),
  send_id          uuid not null,
  -- Copia para mostrar sin joins en el KDS.
  order_number     int not null,
  order_type       public.order_type not null,
  table_label      text,
  server_name      text,
  status           public.ticket_status not null,
  course           int not null default 1,
  priority         boolean not null default false,
  priority_by      uuid references public.staff(id),
  -- Tiempo objetivo (min) y puntos de complejidad: se calculan al crear.
  target_minutes   int not null,
  complexity_points int not null default 0,
  created_at       timestamptz not null default now(),
  fired_at         timestamptz,              -- cuándo entra a la cola (sale de espera)
  started_at       timestamptz,
  ready_at         timestamptz,
  delivered_at     timestamptz,
  voided_at        timestamptz,
  -- Bloqueo por faltante (independiente del estado).
  blocked          boolean not null default false,
  blocked_since    timestamptz,
  blocked_reason   text,
  blocked_seconds  int not null default 0,
  reopen_count     int not null default 0,
  version          int not null default 1,
  updated_at       timestamptz not null default now(),
  unique (send_id, station_id)
);
create index kitchen_tickets_active on public.kitchen_tickets (restaurant_id, station_id, status)
  where status in ('en_espera', 'nuevo', 'en_preparacion', 'listo');
create index on public.kitchen_tickets (order_id);
create index on public.kitchen_tickets (restaurant_id, created_at desc);
create trigger kitchen_tickets_touch before update on public.kitchen_tickets
  for each row execute function app.touch_updated_at();

create table public.ticket_items (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  ticket_id        uuid not null references public.kitchen_tickets(id) on delete cascade,
  order_item_id    uuid not null references public.order_items(id) on delete cascade,
  component        text,
  display_name     text not null,
  qty              int not null,
  modifiers        jsonb not null default '[]'::jsonb,
  notes            text,
  seat             int,
  is_change        boolean not null default false,
  status           public.ticket_item_status not null default 'pendiente',
  ready_at         timestamptz,
  sort             int not null default 0,
  unique (ticket_id, order_item_id, component)
);
create index on public.ticket_items (order_item_id);

create table public.ticket_events (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  ticket_id      uuid not null references public.kitchen_tickets(id) on delete cascade,
  ticket_item_id uuid references public.ticket_items(id) on delete cascade,
  action         text not null,
  from_status    public.ticket_status,
  to_status      public.ticket_status,
  reason         text,
  note           text,
  staff_id       uuid references public.staff(id),
  device_id      uuid references public.devices(id) on delete set null,
  authorized_by  uuid references public.staff(id),
  op_id          uuid,
  at             timestamptz not null default now()
);
create index on public.ticket_events (ticket_id, at);
create index on public.ticket_events (restaurant_id, at desc);

create or replace function app.events_immutable() returns trigger language plpgsql as $$
begin
  perform app.fail('historial_inmutable');
  return null;
end $$;
create trigger ticket_events_immutable before update or delete on public.ticket_events
  for each row when (pg_trigger_depth() = 0) execute function app.events_immutable();

-- ---------------------------------------------------------------------
-- Incidencias (faltantes, equipo, impresora, calidad)
-- ---------------------------------------------------------------------
create type public.incident_kind as enum ('faltante', 'equipo', 'impresora', 'calidad', 'otro');
create type public.incident_status as enum ('abierta', 'en_atencion', 'resuelta');

create table public.incidents (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  kind           public.incident_kind not null,
  status         public.incident_status not null default 'abierta',
  station_id     uuid references public.stations(id) on delete set null,
  ticket_id      uuid references public.kitchen_tickets(id) on delete set null,
  menu_item_id   uuid references public.menu_items(id) on delete set null,
  ingredient_id  uuid references public.ingredients(id) on delete set null,
  description    text not null check (length(trim(description)) between 1 and 500),
  created_by     uuid references public.staff(id),
  device_id      uuid references public.devices(id) on delete set null,
  created_at     timestamptz not null default now(),
  attended_by    uuid references public.staff(id),
  resolved_by    uuid references public.staff(id),
  resolved_at    timestamptz,
  resolution     text,
  updated_at     timestamptz not null default now()
);
create index on public.incidents (restaurant_id, status, created_at desc);
create trigger incidents_touch before update on public.incidents
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- Lógica
-- =====================================================================

create or replace function app.setting_bool(p_restaurant uuid, p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce((settings->>p_key)::boolean, p_default) from public.restaurants where id = p_restaurant
$$;

-- Jornada abierta. Si no hay y el restaurante permite apertura automática,
-- se abre la del día de negocio actual. Con apertura automática, si la
-- jornada abierta es de un día de negocio anterior (nadie la cerró), se
-- cierra sola con nota y se abre la de hoy (los tickets activos siguen
-- visibles en cocina; solo cambia la jornada de las órdenes nuevas).
create or replace function app.ensure_service_day(p_restaurant uuid, p_ctx jsonb)
returns public.service_days language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_day public.service_days; v_today date := app.business_date(p_restaurant);
  v_auto boolean := app.setting_bool(p_restaurant, 'auto_open_service_day', true);
begin
  select * into v_day from public.service_days where restaurant_id = p_restaurant and status = 'abierta' for update;
  if v_day.id is not null then
    if v_day.business_date >= v_today or not v_auto then return v_day; end if;
    update public.service_days set status = 'cerrada', closed_at = now(),
      close_note = 'Cierre automático por cambio de día de negocio'
    where id = v_day.id;
  end if;
  if not v_auto then
    perform app.fail('jornada_cerrada', null, 'Un gerente debe abrir la jornada.');
  end if;
  insert into public.service_days(restaurant_id, business_date, opened_by)
  values (p_restaurant, v_today, (p_ctx->>'staff_id')::uuid)
  on conflict (restaurant_id, business_date) do nothing
  returning * into v_day;
  if v_day.id is null then
    -- Ya existía la del día pero estaba cerrada.
    perform app.fail('jornada_cerrada', v_today::text,
      'La jornada de hoy ya se cerró. Un gerente puede reabrirla.');
  end if;
  return v_day;
end $$;

create or replace function app.ticket_event(
  p_ticket public.kitchen_tickets, p_action text, p_from public.ticket_status,
  p_ctx jsonb, p_op uuid, p_reason text default null, p_note text default null,
  p_ticket_item uuid default null
) returns uuid language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_id uuid;
begin
  insert into public.ticket_events(restaurant_id, ticket_id, ticket_item_id, action, from_status, to_status,
    reason, note, staff_id, device_id, authorized_by, op_id)
  values (p_ticket.restaurant_id, p_ticket.id, p_ticket_item, p_action, p_from, p_ticket.status,
    p_reason, p_note, (p_ctx->>'staff_id')::uuid, (p_ctx->>'device_id')::uuid,
    coalesce((p_ctx->>'authorized_by')::uuid, (p_ctx->>'staff_id')::uuid), p_op)
  returning id into v_id;
  return v_id;
end $$;

-- Representación JSON completa de un ticket (para respuestas RPC).
create or replace function app.ticket_json(p_ticket uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select to_jsonb(t) || jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(ti) order by ti.sort, ti.id) from public.ticket_items ti where ti.ticket_id = t.id), '[]'::jsonb))
  from public.kitchen_tickets t where t.id = p_ticket
$$;

create or replace function app.order_json(p_order uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select to_jsonb(o) || jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at, i.id) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'station_id', t.station_id, 'status', t.status,
        'blocked', t.blocked, 'priority', t.priority, 'course', t.course, 'ready_at', t.ready_at, 'delivered_at', t.delivered_at)
        order by t.created_at) from public.kitchen_tickets t where t.order_id = o.id), '[]'::jsonb))
  from public.orders o where o.id = p_order
$$;

-- Recalcula el estado del ticket a partir de sus renglones.
create or replace function app.ticket_recompute(p_ticket uuid, p_ctx jsonb, p_op uuid)
returns public.kitchen_tickets language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  t public.kitchen_tickets;
  v_from public.ticket_status;
  v_live int; v_ready int;
begin
  select * into t from public.kitchen_tickets where id = p_ticket for update;
  v_from := t.status;
  select count(*) filter (where status <> 'anulado'), count(*) filter (where status = 'listo')
    into v_live, v_ready from public.ticket_items where ticket_id = p_ticket;
  if v_live = 0 and t.status not in ('anulado', 'entregado') then
    update public.kitchen_tickets set status = 'anulado', voided_at = now(), version = version + 1,
      blocked = false, blocked_seconds = blocked_seconds + case when blocked then extract(epoch from now() - blocked_since)::int else 0 end,
      blocked_since = null
    where id = p_ticket returning * into t;
    perform app.ticket_event(t, 'anular', v_from, p_ctx, p_op, 'todas_las_lineas_anuladas');
  elsif v_live > 0 and v_ready = v_live and t.status in ('nuevo', 'en_preparacion') then
    update public.kitchen_tickets set status = 'listo', ready_at = now(), started_at = coalesce(started_at, now()),
      version = version + 1
    where id = p_ticket returning * into t;
    perform app.ticket_event(t, 'listo', v_from, p_ctx, p_op, 'todos_los_renglones_listos');
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------------
-- RPC: capturar / actualizar orden y opcionalmente enviarla a cocina.
-- p_order: {
--   id, order_type, table_label, guest_count, customer_name, notes, client_created_at,
--   items: [{id, menu_item_id, qty, modifiers:[{modifier_id, qty}], notes, course, seat, replaces_item_id}]
-- }
-- p_send: 'ninguno' | 'todo' | 'tiempo:N' (envía solo hasta el tiempo N; los
--         siguientes quedan en espera para "marchar" después).
-- Reglas: las líneas ya enviadas no se modifican (se anulan y se crea otra).
-- ---------------------------------------------------------------------
create or replace function public.rpc_order_submit(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order jsonb, p_send text default 'todo'
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb;
  v_ctx jsonb;
  v_day public.service_days;
  v_order public.orders;
  v_item jsonb;
  v_mi public.menu_items;
  v_mods jsonb;
  v_mod jsonb;
  v_m public.modifiers;
  v_mod_count int;
  v_g record;
  v_order_id uuid := (p_order->>'id')::uuid;
  v_existing public.order_items;
  v_is_new_order boolean := false;
  v_send_result jsonb := '[]'::jsonb;
  v_staff_name text;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'order_submit');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'orders.create');
  if v_order_id is null then perform app.fail('orden_sin_id'); end if;
  if p_send not in ('ninguno', 'todo') and p_send !~ '^tiempo:[1-5]$' then
    perform app.fail('envio_invalido', p_send);
  end if;

  select * into v_order from public.orders where id = v_order_id for update;
  if v_order.id is null then
    v_day := app.ensure_service_day(p_restaurant_id, v_ctx);
    update public.service_days set next_order_number = next_order_number + 1
      where id = v_day.id returning * into v_day;
    insert into public.orders(id, restaurant_id, service_day_id, number, order_type, table_label, guest_count,
      customer_name, notes, server_staff_id, created_by, created_device_id, client_created_at)
    values (v_order_id, p_restaurant_id, v_day.id, v_day.next_order_number - 1,
      coalesce((p_order->>'order_type')::public.order_type, 'mesa'),
      nullif(trim(p_order->>'table_label'), ''), (p_order->>'guest_count')::int,
      nullif(trim(p_order->>'customer_name'), ''), nullif(trim(p_order->>'notes'), ''),
      (v_ctx->>'staff_id')::uuid, (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid,
      (p_order->>'client_created_at')::timestamptz)
    returning * into v_order;
    v_is_new_order := true;
  else
    if v_order.restaurant_id <> p_restaurant_id then perform app.fail('orden_no_encontrada'); end if;
    if v_order.status <> 'abierta' then perform app.fail('orden_no_abierta', v_order.status::text); end if;
    if v_order.server_staff_id is distinct from (v_ctx->>'staff_id')::uuid
       and not app.staff_has_perm((v_ctx->>'staff_id')::uuid, 'orders.edit_any') then
      perform app.fail('orden_de_otro_mesero', null, 'Pide a un gerente que transfiera la orden.');
    end if;
    update public.orders set
      order_type = coalesce((p_order->>'order_type')::public.order_type, order_type),
      table_label = coalesce(nullif(trim(p_order->>'table_label'), ''), table_label),
      guest_count = coalesce((p_order->>'guest_count')::int, guest_count),
      customer_name = coalesce(nullif(trim(p_order->>'customer_name'), ''), customer_name),
      notes = coalesce(nullif(trim(p_order->>'notes'), ''), notes)
    where id = v_order.id returning * into v_order;
  end if;

  -- Líneas
  for v_item in select * from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) loop
    select * into v_existing from public.order_items where id = (v_item->>'id')::uuid;
    if v_existing.id is not null then
      if v_existing.order_id <> v_order.id then perform app.fail('linea_de_otra_orden'); end if;
      if v_existing.status <> 'pendiente' then continue; end if;  -- ya enviada/anulada: no se toca
    end if;

    select * into v_mi from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid and restaurant_id = p_restaurant_id;
    if v_mi.id is null or not v_mi.active then perform app.fail('producto_no_existe', v_item->>'menu_item_id'); end if;
    if not v_mi.available and v_existing.id is null then
      perform app.fail('producto_agotado', v_mi.name, 'Está marcado como agotado (86).');
    end if;
    if not exists (select 1 from public.menu_item_routes r where r.menu_item_id = v_mi.id) then
      perform app.fail('producto_sin_estacion', v_mi.name, 'Configura a qué estación va este producto.');
    end if;

    -- Validar modificadores contra los grupos del producto.
    v_mods := '[]'::jsonb;
    for v_mod in select * from jsonb_array_elements(coalesce(v_item->'modifiers', '[]'::jsonb)) loop
      select m.* into v_m from public.modifiers m
        join public.menu_item_modifier_groups g on g.group_id = m.group_id and g.menu_item_id = v_mi.id
        where m.id = (v_mod->>'modifier_id')::uuid and m.active;
      if v_m.id is null then perform app.fail('modificador_invalido', v_mi.name); end if;
      if not v_m.available then perform app.fail('modificador_agotado', v_m.name); end if;
      v_mods := v_mods || jsonb_build_object('modifier_id', v_m.id, 'group_id', v_m.group_id, 'name', v_m.name,
        'kitchen_label', coalesce(v_m.kitchen_label, v_m.name), 'price_delta', v_m.price_delta,
        'qty', greatest(1, coalesce((v_mod->>'qty')::int, 1)));
    end loop;
    for v_g in
      select mg.id, mg.name, mg.min_select, mg.max_select from public.modifier_groups mg
      join public.menu_item_modifier_groups x on x.group_id = mg.id and x.menu_item_id = v_mi.id
      where mg.active
    loop
      select coalesce(sum((e->>'qty')::int), 0) into v_mod_count from jsonb_array_elements(v_mods) e
        where (e->>'group_id')::uuid = v_g.id;
      if v_mod_count < v_g.min_select or v_mod_count > v_g.max_select then
        perform app.fail('modificadores_fuera_de_rango', v_mi.name || ' · ' || v_g.name,
          format('Elige entre %s y %s.', v_g.min_select, v_g.max_select));
      end if;
    end loop;

    if v_existing.id is null then
      insert into public.order_items(id, restaurant_id, order_id, menu_item_id, name, kitchen_name, unit_price,
        qty, modifiers, notes, course, seat, replaces_item_id, created_by)
      values ((v_item->>'id')::uuid, p_restaurant_id, v_order.id, v_mi.id, v_mi.name, v_mi.kitchen_name,
        v_mi.price, coalesce((v_item->>'qty')::int, 1), v_mods, nullif(trim(v_item->>'notes'), ''),
        coalesce((v_item->>'course')::int, 1), (v_item->>'seat')::int,
        (v_item->>'replaces_item_id')::uuid, (v_ctx->>'staff_id')::uuid);
    else
      update public.order_items set qty = coalesce((v_item->>'qty')::int, qty), modifiers = v_mods,
        notes = nullif(trim(v_item->>'notes'), ''), course = coalesce((v_item->>'course')::int, course),
        seat = (v_item->>'seat')::int
      where id = v_existing.id;
    end if;
  end loop;

  -- Líneas pendientes que el cliente quitó antes de enviar.
  if p_order ? 'items' then
    delete from public.order_items
    where order_id = v_order.id and status = 'pendiente'
      and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_order->'items') e);
  end if;

  if p_send <> 'ninguno' then
    v_send_result := app.send_order(v_order.id, p_op_id, v_ctx,
      case when p_send = 'todo' then null else split_part(p_send, ':', 2)::int end);
  end if;

  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'new_order', v_is_new_order,
    'order', app.order_json(v_order.id), 'sent_tickets', v_send_result));
end $$;

-- Envía a cocina las líneas pendientes. Agrupa por estación. Las líneas de
-- tiempos posteriores a p_fire_course quedan "en_espera".
create or replace function app.send_order(p_order uuid, p_send_id uuid, p_ctx jsonb, p_fire_course int)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_order public.orders;
  v_server text;
  v_ticket public.kitchen_tickets;
  v_grp record;
  v_tickets jsonb := '[]'::jsonb;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not exists (select 1 from public.order_items where order_id = p_order and status = 'pendiente') then
    return v_tickets;
  end if;
  select display_name into v_server from public.staff where id = v_order.server_staff_id;

  for v_grp in
    select r.station_id, i.course,
           max(mi.prep_minutes) as target, sum(mi.complexity * i.qty) as points
    from public.order_items i
    join public.menu_items mi on mi.id = i.menu_item_id
    join public.menu_item_routes r on r.menu_item_id = i.menu_item_id
    where i.order_id = p_order and i.status = 'pendiente'
    group by r.station_id, i.course
    order by i.course
  loop
    insert into public.kitchen_tickets(restaurant_id, service_day_id, order_id, station_id, send_id, order_number,
      order_type, table_label, server_name, status, course, target_minutes, complexity_points, fired_at)
    values (v_order.restaurant_id, v_order.service_day_id, p_order, v_grp.station_id,
      -- send_id por (envío, tiempo) para que cada tiempo tenga su ticket.
      app.uuid_v5_like(p_send_id, v_grp.course),
      v_order.number, v_order.order_type, v_order.table_label, v_server,
      (case when p_fire_course is not null and v_grp.course > p_fire_course then 'en_espera' else 'nuevo' end)::public.ticket_status,
      v_grp.course, v_grp.target, v_grp.points,
      case when p_fire_course is not null and v_grp.course > p_fire_course then null else now() end)
    returning * into v_ticket;

    insert into public.ticket_items(restaurant_id, ticket_id, order_item_id, component, display_name, qty,
      modifiers, notes, seat, is_change, sort)
    select v_order.restaurant_id, v_ticket.id, i.id, r.component,
           coalesce(i.kitchen_name, i.name) || coalesce(' · ' || r.component, ''),
           i.qty, i.modifiers, i.notes, i.seat, i.replaces_item_id is not null,
           row_number() over (order by i.created_at, i.id)
    from public.order_items i
    join public.menu_item_routes r on r.menu_item_id = i.menu_item_id and r.station_id = v_grp.station_id
    where i.order_id = p_order and i.status = 'pendiente' and i.course = v_grp.course;

    perform app.ticket_event(v_ticket, 'crear', null, p_ctx, p_send_id);
    v_tickets := v_tickets || jsonb_build_object('id', v_ticket.id, 'station_id', v_ticket.station_id,
      'status', v_ticket.status, 'course', v_ticket.course);
  end loop;

  -- Marcar líneas como enviadas y registrar consumo teórico (idempotente).
  for v_item in select id from public.order_items where order_id = p_order and status = 'pendiente' loop
    update public.order_items set status = 'enviado', sent_at = now(), send_id = p_send_id where id = v_item.id;
    perform app.inventory_post_sale(v_item.id, p_ctx);
  end loop;
  return v_tickets;
end $$;

-- UUID determinista a partir de otro UUID y un entero (sin uuid-ossp).
create or replace function app.uuid_v5_like(p_base uuid, p_n int) returns uuid
language sql immutable as $$
  select (substr(md5(p_base::text || ':' || p_n::text), 1, 8) || '-' ||
          substr(md5(p_base::text || ':' || p_n::text), 9, 4) || '-5' ||
          substr(md5(p_base::text || ':' || p_n::text), 14, 3) || '-a' ||
          substr(md5(p_base::text || ':' || p_n::text), 18, 3) || '-' ||
          substr(md5(p_base::text || ':' || p_n::text), 21, 12))::uuid
$$;

-- Consumo teórico por venta (al enviar a cocina). Idempotente por línea.
create or replace function app.inventory_post_sale(p_order_item uuid, p_ctx jsonb)
returns int language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_i public.order_items; v_c record; v_n int := 0;
begin
  select * into v_i from public.order_items where id = p_order_item;
  for v_c in select * from app.expected_consumption(v_i.menu_item_id, v_i.qty, v_i.modifiers) loop
    if app.add_movement(v_i.restaurant_id, v_c.ingredient_id, 'consumo_venta', -v_c.qty_base, p_ctx,
        'order_item', v_i.id, '', null, v_c.recipe_version_id) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- Reverso por anulación. Si ya se había preparado, el consumo se reclasifica
-- como merma (se usó el producto, no se vendió).
create or replace function app.inventory_reverse_sale(p_order_item uuid, p_prepared boolean, p_ctx jsonb)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_m record;
begin
  for v_m in select * from public.inventory_movements
             where source_type = 'order_item' and source_id = p_order_item and kind = 'consumo_venta' loop
    perform app.add_movement(v_m.restaurant_id, v_m.ingredient_id, 'reverso_venta', -v_m.qty_base, p_ctx,
      'order_item', p_order_item, '', null, v_m.recipe_version_id, 'Anulación');
    if p_prepared then
      perform app.add_movement(v_m.restaurant_id, v_m.ingredient_id, 'merma', v_m.qty_base, p_ctx,
        'order_item', p_order_item, '', 'anulacion_preparada', v_m.recipe_version_id, 'Anulado después de preparar');
    end if;
  end loop;
end $$;

-- Reproceso: se vuelve a preparar (consume de nuevo, clasificado aparte).
create or replace function app.inventory_post_remake(p_order_item uuid, p_event uuid, p_ctx jsonb)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_i public.order_items; v_c record;
begin
  select * into v_i from public.order_items where id = p_order_item;
  for v_c in select * from app.expected_consumption(v_i.menu_item_id, v_i.qty, v_i.modifiers) loop
    perform app.add_movement(v_i.restaurant_id, v_c.ingredient_id, 'reproceso', -v_c.qty_base, p_ctx,
      'ticket_event', p_event, v_i.id::text, null, v_c.recipe_version_id, 'Reproceso');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RPC: acciones sobre un ticket desde KDS / pase / mesero.
-- p_action:
--   iniciar | listo | entregar | reabrir | bloquear | desbloquear |
--   prioridad | quitar_prioridad | marchar (sacar de espera)
-- p_args: { reason, note, remake: bool }
-- Si el ticket ya está en el estado destino, responde ok sin cambios
-- (dos cocineros tocando el mismo ticket no generan error ni duplicado).
-- ---------------------------------------------------------------------
create or replace function public.rpc_ticket_action(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_ticket_id uuid, p_action text,
  p_args jsonb default '{}'::jsonb, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
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
    when 'entregar' then 'kds.view'           -- mesero confirma entrega / pase despacha
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

-- Marcar un renglón listo / pendiente (preparación parcial).
create or replace function public.rpc_ticket_item_toggle(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_ticket_item_id uuid, p_ready boolean
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; ti public.ticket_items; t public.kitchen_tickets; v_from public.ticket_status;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'ticket_item_toggle');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'kds.bump');
  select * into ti from public.ticket_items where id = p_ticket_item_id and restaurant_id = p_restaurant_id;
  if ti.id is null then perform app.fail('renglon_no_encontrado'); end if;
  select * into t from public.kitchen_tickets where id = ti.ticket_id for update;
  if t.status not in ('nuevo', 'en_preparacion') then perform app.fail('ticket_no_editable', t.status::text); end if;
  if ti.status = 'anulado' then perform app.fail('renglon_anulado'); end if;
  if (ti.status = 'listo') = p_ready then
    return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', true, 'ticket', app.ticket_json(t.id)));
  end if;
  update public.ticket_items set status = case when p_ready then 'listo' else 'pendiente' end::public.ticket_item_status,
    ready_at = case when p_ready then now() end where id = ti.id;
  v_from := t.status;
  if t.status = 'nuevo' then
    update public.kitchen_tickets set status = 'en_preparacion', started_at = coalesce(started_at, now()),
      version = version + 1 where id = t.id returning * into t;
  else
    update public.kitchen_tickets set version = version + 1 where id = t.id returning * into t;
  end if;
  perform app.ticket_event(t, case when p_ready then 'renglon_listo' else 'renglon_pendiente' end, v_from,
    v_ctx, p_op_id, null, ti.display_name, ti.id);
  t := app.ticket_recompute(t.id, v_ctx, p_op_id);
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', false, 'ticket', app.ticket_json(t.id)));
end $$;

-- Anulación interna de una línea (ya autorizada).
create or replace function app.void_item(
  p_item uuid, p_reason text, p_note text, p_was_prepared boolean, p_ctx jsonb, p_op uuid
) returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare i public.order_items; v_prepared boolean; v_ti record;
begin
  select * into i from public.order_items where id = p_item for update;
  if i.status = 'anulado' then return; end if;
  -- ¿Se preparó? Si el cliente no lo indica, se infiere: algún renglón listo
  -- o su ticket ya en preparación.
  select bool_or(ti.status = 'listo' or t.status in ('en_preparacion', 'listo', 'entregado'))
    into v_prepared
  from public.ticket_items ti join public.kitchen_tickets t on t.id = ti.ticket_id
  where ti.order_item_id = i.id;
  v_prepared := coalesce(p_was_prepared, v_prepared, false);

  update public.order_items set status = 'anulado', voided_at = now(), void_reason = p_reason::public.void_reason,
    void_note = p_note, voided_by = (p_ctx->>'staff_id')::uuid, void_authorized_by = (p_ctx->>'authorized_by')::uuid,
    void_was_prepared = case when i.status = 'enviado' then v_prepared end
  where id = i.id;

  if i.status = 'enviado' then
    for v_ti in select ti.id, ti.ticket_id, ti.display_name from public.ticket_items ti
                where ti.order_item_id = i.id and ti.status <> 'anulado' loop
      update public.ticket_items set status = 'anulado' where id = v_ti.id;
      update public.kitchen_tickets set version = version + 1 where id = v_ti.ticket_id;
      perform app.ticket_event((select k from public.kitchen_tickets k where k.id = v_ti.ticket_id),
        'renglon_anulado', null, p_ctx, p_op, p_reason, coalesce(p_note, v_ti.display_name), v_ti.id);
      perform app.ticket_recompute(v_ti.ticket_id, p_ctx, p_op);
    end loop;
    perform app.inventory_reverse_sale(i.id, v_prepared, p_ctx);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RPC: anular una línea de orden.
--   * Pendiente (no enviada): se anula sin permiso especial (la propia captura).
--   * Enviada: requiere orders.void_sent (o pase de gerente) y motivo.
--     Se indica si ya se había preparado (afecta inventario: merma).
-- ---------------------------------------------------------------------
create or replace function public.rpc_order_item_void(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order_item_id uuid,
  p_reason text, p_note text default null, p_was_prepared boolean default null, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; i public.order_items; o public.orders;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'order_item_void');
  if v_prev is not null then return v_prev; end if;
  select * into i from public.order_items where id = p_order_item_id and restaurant_id = p_restaurant_id for update;
  if i.id is null then perform app.fail('linea_no_encontrada'); end if;
  select * into o from public.orders where id = i.order_id;
  if i.status = 'anulado' then
    return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', true, 'order', app.order_json(o.id)));
  end if;
  if p_reason is null or p_reason not in (select unnest(enum_range(null::public.void_reason))::text) then
    perform app.fail('motivo_requerido', null, 'Indica el motivo de la anulación.');
  end if;

  if i.status = 'pendiente' then
    v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'orders.create', p_override);
  else
    v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'orders.void_sent', p_override);
  end if;

  perform app.void_item(i.id, p_reason, p_note, p_was_prepared, v_ctx, p_op_id);
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', false, 'order', app.order_json(o.id)));
end $$;

-- Marchar (enviar) los tickets en espera de un tiempo específico.
create or replace function public.rpc_order_fire_course(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order_id uuid, p_course int
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; t public.kitchen_tickets;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'order_fire_course');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'orders.create');
  for t in select * from public.kitchen_tickets where order_id = p_order_id and restaurant_id = p_restaurant_id
           and status = 'en_espera' and course <= p_course for update loop
    update public.kitchen_tickets set status = 'nuevo', fired_at = now(), version = version + 1
      where id = t.id returning * into t;
    perform app.ticket_event(t, 'marchar', 'en_espera', v_ctx, p_op_id);
  end loop;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'order', app.order_json(p_order_id)));
end $$;

-- Cerrar orden (sin cobro: el cobro/POS queda fuera del alcance actual).
-- Con p_void=true se anula la orden completa (requiere motivo; las líneas
-- enviadas requieren permiso de anulación).
create or replace function public.rpc_order_close(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order_id uuid,
  p_void boolean default false, p_reason text default null, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
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
      and status in ('en_espera', 'nuevo', 'en_preparacion', 'listo');
    if v_active > 0 and not coalesce(p_reason = 'forzar', false) then
      perform app.fail('orden_con_tickets_activos', v_active::text, 'Hay platillos sin entregar.');
    end if;
    update public.orders set status = 'cerrada', closed_at = now(), closed_by = (v_ctx->>'staff_id')::uuid where id = o.id;
  end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', false, 'order', app.order_json(o.id)));
end $$;

-- Transferir orden a otro mesero (gerente).
create or replace function public.rpc_order_transfer(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_order_id uuid, p_to_staff uuid, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'order_transfer');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'orders.edit_any', p_override);
  if not exists (select 1 from public.staff where id = p_to_staff and restaurant_id = p_restaurant_id and active) then
    perform app.fail('colaborador_no_encontrado');
  end if;
  update public.orders set server_staff_id = p_to_staff where id = p_order_id and restaurant_id = p_restaurant_id and status = 'abierta';
  if not found then perform app.fail('orden_no_abierta'); end if;
  update public.kitchen_tickets set server_name = (select display_name from public.staff where id = p_to_staff),
    version = version + 1 where order_id = p_order_id;
  insert into public.audit_log(restaurant_id, table_name, row_id, action, new_data, staff_id, user_id)
  values (p_restaurant_id, 'orders', p_order_id::text, 'UPDATE',
    jsonb_build_object('transfer_to', p_to_staff, 'authorized_by', v_ctx->>'authorized_by'), (v_ctx->>'staff_id')::uuid, auth.uid());
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'order', app.order_json(p_order_id)));
end $$;

-- ---------------------------------------------------------------------
-- Disponibilidad (86)
-- ---------------------------------------------------------------------
create or replace function public.rpc_set_availability(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_menu_item_id uuid, p_modifier_id uuid,
  p_available boolean, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'set_availability');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'menu.86');
  if (p_menu_item_id is null) = (p_modifier_id is null) then perform app.fail('objetivo_invalido'); end if;
  if p_menu_item_id is not null then
    update public.menu_items set available = p_available,
      unavailable_reason = case when p_available then null else p_reason end,
      unavailable_since = case when p_available then null else now() end
    where id = p_menu_item_id and restaurant_id = p_restaurant_id;
  else
    update public.modifiers set available = p_available where id = p_modifier_id and restaurant_id = p_restaurant_id;
  end if;
  if not found then perform app.fail('no_encontrado'); end if;
  insert into public.availability_events(restaurant_id, menu_item_id, modifier_id, available, reason, staff_id, device_id)
  values (p_restaurant_id, p_menu_item_id, p_modifier_id, p_available, p_reason,
    (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid);
  return app.op_finish(p_op_id, jsonb_build_object('ok', true));
end $$;

-- ---------------------------------------------------------------------
-- Incidencias
-- ---------------------------------------------------------------------
create or replace function public.rpc_incident_create(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_kind text, p_description text,
  p_station_id uuid default null, p_ticket_id uuid default null, p_menu_item_id uuid default null,
  p_ingredient_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; v_id uuid;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'incident_create');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'incidents.create');
  insert into public.incidents(restaurant_id, kind, station_id, ticket_id, menu_item_id, ingredient_id, description,
    created_by, device_id)
  values (p_restaurant_id, p_kind::public.incident_kind, p_station_id, p_ticket_id, p_menu_item_id, p_ingredient_id,
    p_description, (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid)
  returning id into v_id;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'id', v_id));
end $$;

create or replace function public.rpc_incident_update(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_incident_id uuid, p_status text, p_resolution text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'incident_update');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'incidents.manage');
  update public.incidents set status = p_status::public.incident_status,
    attended_by = case when p_status = 'en_atencion' then (v_ctx->>'staff_id')::uuid else attended_by end,
    resolved_by = case when p_status = 'resuelta' then (v_ctx->>'staff_id')::uuid end,
    resolved_at = case when p_status = 'resuelta' then now() end,
    resolution = coalesce(p_resolution, resolution)
  where id = p_incident_id and restaurant_id = p_restaurant_id;
  if not found then perform app.fail('no_encontrado'); end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true));
end $$;

-- ---------------------------------------------------------------------
-- Jornada: abrir / cerrar / reabrir
-- ---------------------------------------------------------------------
create or replace function public.rpc_service_day(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_action text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; d public.service_days; v_active int; v_open_orders int;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'service_day');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'service.open_close');
  if p_action = 'abrir' then
    select * into d from public.service_days where restaurant_id = p_restaurant_id and status = 'abierta';
    if d.id is null then
      insert into public.service_days(restaurant_id, business_date, opened_by)
      values (p_restaurant_id, app.business_date(p_restaurant_id), (v_ctx->>'staff_id')::uuid)
      on conflict (restaurant_id, business_date) do update set status = 'abierta', closed_at = null, closed_by = null
      returning * into d;
    end if;
  elsif p_action = 'cerrar' then
    select * into d from public.service_days where restaurant_id = p_restaurant_id and status = 'abierta' for update;
    if d.id is null then perform app.fail('sin_jornada_abierta'); end if;
    select count(*) into v_active from public.kitchen_tickets where service_day_id = d.id
      and status in ('en_espera', 'nuevo', 'en_preparacion', 'listo');
    select count(*) into v_open_orders from public.orders where service_day_id = d.id and status = 'abierta';
    if (v_active > 0 or v_open_orders > 0) and coalesce(p_note, '') = '' then
      perform app.fail('jornada_con_pendientes', format('%s tickets activos, %s órdenes abiertas', v_active, v_open_orders),
        'Resuelve los pendientes o escribe una nota para cerrar de todos modos.');
    end if;
    update public.service_days set status = 'cerrada', closed_at = now(), closed_by = (v_ctx->>'staff_id')::uuid,
      close_note = p_note where id = d.id returning * into d;
  else
    perform app.fail('accion_invalida', p_action);
  end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'service_day', to_jsonb(d)));
end $$;
