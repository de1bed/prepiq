-- =====================================================================
-- PrepIQ · 0002 · Estaciones y menú
-- Estaciones de cocina, categorías, productos de menú, ruteo a estaciones,
-- modificadores y disponibilidad ("86") con historial.
-- =====================================================================

create type public.station_kind as enum ('cocina', 'barra', 'pase', 'prep');

create table public.stations (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 40),
  kind           public.station_kind not null default 'cocina',
  color          text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort           int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, name)
);
create trigger stations_touch before update on public.stations
  for each row execute function app.touch_updated_at();
create trigger stations_audit after insert or update or delete on public.stations
  for each row execute function app.audit();

alter table public.devices
  add constraint devices_station_fk foreign key (station_id) references public.stations(id) on delete set null;

create table public.menu_categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 60),
  sort           int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, name)
);
create trigger menu_categories_touch before update on public.menu_categories
  for each row execute function app.touch_updated_at();
create trigger menu_categories_audit after insert or update or delete on public.menu_categories
  for each row execute function app.audit();

create table public.menu_items (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  category_id        uuid references public.menu_categories(id) on delete set null,
  name               text not null check (length(trim(name)) between 1 and 80),
  -- Nombre corto para la pantalla de cocina (opcional).
  kitchen_name       text check (kitchen_name is null or length(trim(kitchen_name)) between 1 and 40),
  description        text,
  price              numeric(10, 2) not null default 0 check (price >= 0),
  -- Tiempo objetivo de preparación (minutos) y complejidad relativa (1–5).
  -- Se usan para avisos del KDS y para indicadores de equipo que no premian
  -- solo la velocidad.
  prep_minutes       int not null default 10 check (prep_minutes between 1 and 240),
  complexity         smallint not null default 1 check (complexity between 1 and 5),
  allergens          text[] not null default '{}',
  sort               int not null default 0,
  active             boolean not null default true,
  -- Disponibilidad del día ("86"). false = agotado.
  available          boolean not null default true,
  unavailable_reason text,
  unavailable_since  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index on public.menu_items (restaurant_id, category_id);
create trigger menu_items_touch before update on public.menu_items
  for each row execute function app.touch_updated_at();
create trigger menu_items_audit after insert or update or delete on public.menu_items
  for each row execute function app.audit();

-- A qué estación(es) va cada producto. Un producto puede tener componentes
-- en varias estaciones (p. ej. hamburguesa → parrilla; papas → freidora).
create table public.menu_item_routes (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id   uuid not null references public.menu_items(id) on delete cascade,
  station_id     uuid not null references public.stations(id) on delete restrict,
  -- Etiqueta del componente en esa estación; null = el producto completo.
  component      text,
  sort           int not null default 0,
  unique (menu_item_id, station_id, component)
);
create index on public.menu_item_routes (station_id);
create trigger menu_item_routes_audit after insert or update or delete on public.menu_item_routes
  for each row execute function app.audit();

create table public.modifier_groups (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 60),
  min_select     int not null default 0 check (min_select >= 0),
  max_select     int not null default 1 check (max_select >= 1),
  sort           int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (max_select >= min_select),
  unique (restaurant_id, name)
);
create trigger modifier_groups_touch before update on public.modifier_groups
  for each row execute function app.touch_updated_at();
create trigger modifier_groups_audit after insert or update or delete on public.modifier_groups
  for each row execute function app.audit();

create table public.modifiers (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  group_id       uuid not null references public.modifier_groups(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 60),
  -- Texto que ve cocina (p. ej. "SIN CEBOLLA"). null = usa name.
  kitchen_label  text,
  price_delta    numeric(10, 2) not null default 0,
  sort           int not null default 0,
  active         boolean not null default true,
  available      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (group_id, name)
);
create trigger modifiers_touch before update on public.modifiers
  for each row execute function app.touch_updated_at();
create trigger modifiers_audit after insert or update or delete on public.modifiers
  for each row execute function app.audit();

create table public.menu_item_modifier_groups (
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id   uuid not null references public.menu_items(id) on delete cascade,
  group_id       uuid not null references public.modifier_groups(id) on delete cascade,
  sort           int not null default 0,
  primary key (menu_item_id, group_id)
);
create trigger mimg_audit after insert or update or delete on public.menu_item_modifier_groups
  for each row execute function app.audit();

-- Historial de disponibilidad (86 / regreso al menú).
create table public.availability_events (
  id             bigserial primary key,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id   uuid references public.menu_items(id) on delete cascade,
  modifier_id    uuid references public.modifiers(id) on delete cascade,
  available      boolean not null,
  reason         text,
  staff_id       uuid references public.staff(id),
  device_id      uuid references public.devices(id) on delete set null,
  at             timestamptz not null default now(),
  check ((menu_item_id is null) <> (modifier_id is null))
);
create index on public.availability_events (restaurant_id, at desc);

-- Consistencia entre restaurante del hijo y del padre (evita mezclar datos).
create or replace function app.check_same_restaurant() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_parent_table text := tg_argv[0];
  v_fk_col text := tg_argv[1];
  v_parent_id uuid;
  v_parent_rest uuid;
begin
  v_parent_id := (to_jsonb(new) ->> v_fk_col)::uuid;
  if v_parent_id is null then return new; end if;
  execute format('select restaurant_id from public.%I where id = $1', v_parent_table)
    into v_parent_rest using v_parent_id;
  if v_parent_rest is distinct from new.restaurant_id then
    perform app.fail('restaurante_inconsistente', v_parent_table || '.' || v_fk_col);
  end if;
  return new;
end $$;

create trigger menu_items_same_rest before insert or update on public.menu_items
  for each row execute function app.check_same_restaurant('menu_categories', 'category_id');
create trigger routes_same_rest_item before insert or update on public.menu_item_routes
  for each row execute function app.check_same_restaurant('menu_items', 'menu_item_id');
create trigger routes_same_rest_station before insert or update on public.menu_item_routes
  for each row execute function app.check_same_restaurant('stations', 'station_id');
create trigger modifiers_same_rest before insert or update on public.modifiers
  for each row execute function app.check_same_restaurant('modifier_groups', 'group_id');
create trigger mimg_same_rest_item before insert or update on public.menu_item_modifier_groups
  for each row execute function app.check_same_restaurant('menu_items', 'menu_item_id');
create trigger mimg_same_rest_group before insert or update on public.menu_item_modifier_groups
  for each row execute function app.check_same_restaurant('modifier_groups', 'group_id');
create trigger devices_same_rest_station before insert or update on public.devices
  for each row execute function app.check_same_restaurant('stations', 'station_id');
