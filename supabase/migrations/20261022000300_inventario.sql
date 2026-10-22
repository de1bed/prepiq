-- =====================================================================
-- PrepIQ · 0003 · Inventario por receta (TEÓRICO) y conteos físicos
--
-- Principios:
--   * El inventario es un LIBRO DE MOVIMIENTOS inmutable. La existencia
--     teórica = suma de movimientos. Nunca se edita un saldo.
--   * Teórico ≠ contado. El conteo físico genera ajustes explícitos
--     (ajuste_conteo) y deja visible la diferencia.
--   * Cada movimiento derivado de una venta/anulación/reproceso tiene una
--     llave de origen única: imposible descontar dos veces lo mismo.
--   * Unidades: cada insumo tiene unidad base (g, ml o pza). Las recetas
--     pueden usar unidades estándar de la misma dimensión o unidades propias
--     del insumo (caja, bolsa, tortilla...) con su factor.
-- =====================================================================

create type public.unit_dimension as enum ('masa', 'volumen', 'pieza');
create type public.ingredient_kind as enum ('compra', 'preparado');
create type public.recipe_kind as enum ('menu', 'prep');
create type public.recipe_status as enum ('borrador', 'activa', 'retirada');
create type public.inventory_kind as enum (
  'inicial', 'recepcion', 'consumo_venta', 'reverso_venta', 'merma', 'reproceso',
  'consumo_interno', 'produccion_entrada', 'produccion_consumo', 'ajuste_conteo', 'ajuste_manual'
);
create type public.waste_reason as enum (
  'desperdicio', 'quemado', 'caida', 'caducado', 'anulacion_preparada', 'devolucion', 'otro'
);
create type public.count_status as enum ('abierto', 'enviado', 'aprobado', 'cancelado');

-- ---------------------------------------------------------------------
-- Unidades estándar (globales)
-- ---------------------------------------------------------------------
create table public.units (
  code       text primary key,
  name       text not null,
  dimension  public.unit_dimension not null,
  to_base    numeric not null check (to_base > 0)  -- factor hacia g, ml o pza
);
insert into public.units(code, name, dimension, to_base) values
  ('g', 'gramo', 'masa', 1), ('kg', 'kilogramo', 'masa', 1000), ('mg', 'miligramo', 'masa', 0.001),
  ('lb', 'libra', 'masa', 453.59237), ('oz', 'onza (peso)', 'masa', 28.349523125),
  ('ml', 'mililitro', 'volumen', 1), ('l', 'litro', 'volumen', 1000),
  ('floz', 'onza líquida (EE. UU.)', 'volumen', 29.5735295625), ('gal', 'galón (EE. UU.)', 'volumen', 3785.411784),
  ('taza', 'taza (EE. UU., 236.6 ml)', 'volumen', 236.5882365), ('cda', 'cucharada (14.8 ml)', 'volumen', 14.78676478125),
  ('cdita', 'cucharadita (4.9 ml)', 'volumen', 4.92892159375),
  ('pza', 'pieza', 'pieza', 1), ('docena', 'docena', 'pieza', 12);

create or replace function app.base_unit_dimension(p_base text) returns public.unit_dimension
language sql immutable as $$
  select case p_base when 'g' then 'masa'::public.unit_dimension
                     when 'ml' then 'volumen'::public.unit_dimension
                     when 'pza' then 'pieza'::public.unit_dimension end
$$;

-- ---------------------------------------------------------------------
-- Insumos
-- ---------------------------------------------------------------------
create table public.ingredients (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 80),
  category         text,
  base_unit        text not null check (base_unit in ('g', 'ml', 'pza')),
  kind             public.ingredient_kind not null default 'compra',
  -- Nivel de referencia para alertas "revisar" (en unidad base). Orientativo.
  par_level        numeric check (par_level is null or par_level >= 0),
  storage          text,
  allergens        text[] not null default '{}',
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (restaurant_id, name)
);
create trigger ingredients_touch before update on public.ingredients
  for each row execute function app.touch_updated_at();
create trigger ingredients_audit after insert or update or delete on public.ingredients
  for each row execute function app.audit();

-- La unidad base no puede cambiar si ya hay movimientos (rompería el historial).
create or replace function app.ingredient_lock_base_unit() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.base_unit <> old.base_unit and exists (
    select 1 from public.inventory_movements where ingredient_id = old.id) then
    perform app.fail('unidad_base_bloqueada', old.name,
      'Este insumo ya tiene movimientos. Crea un insumo nuevo si necesitas otra unidad base.');
  end if;
  return new;
end $$;

-- Costo unitario por unidad base (separado para restringir su lectura).
create table public.ingredient_costs (
  ingredient_id  uuid primary key references public.ingredients(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  unit_cost      numeric(14, 6) not null check (unit_cost >= 0),
  updated_at     timestamptz not null default now()
);
create trigger ingredient_costs_touch before update on public.ingredient_costs
  for each row execute function app.touch_updated_at();
create trigger ingredient_costs_audit after insert or update or delete on public.ingredient_costs
  for each row execute function app.audit();
create trigger ingredient_costs_same_rest before insert or update on public.ingredient_costs
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');

-- Unidades propias de un insumo: "caja" = 50 pza, "tortilla" = 30 g, etc.
create table public.ingredient_units (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete cascade,
  name           text not null check (name ~ '^[a-záéíóúñü0-9 _-]{1,24}$'),
  to_base        numeric not null check (to_base > 0),
  unique (ingredient_id, name)
);
create trigger ingredient_units_audit after insert or update or delete on public.ingredient_units
  for each row execute function app.audit();
create trigger ingredient_units_same_rest before insert or update on public.ingredient_units
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');

create or replace function app.ingredient_units_no_shadow() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.units where code = new.name) then
    perform app.fail('unidad_reservada', new.name, 'Ese nombre ya es una unidad estándar.');
  end if;
  return new;
end $$;
create trigger ingredient_units_no_shadow before insert or update on public.ingredient_units
  for each row execute function app.ingredient_units_no_shadow();

-- Convierte una cantidad a la unidad base del insumo. Falla si la unidad no
-- es compatible (p. ej. "ml" para un insumo en gramos sin unidad propia).
create or replace function app.to_base_qty(p_ingredient uuid, p_qty numeric, p_unit text)
returns numeric language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  v_ing public.ingredients;
  v_u public.units;
  v_factor numeric;
begin
  if p_qty is null then perform app.fail('cantidad_requerida'); end if;
  select * into v_ing from public.ingredients where id = p_ingredient;
  if v_ing.id is null then perform app.fail('insumo_no_existe', p_ingredient::text); end if;
  if p_unit is null or p_unit = v_ing.base_unit then return p_qty; end if;
  select * into v_u from public.units where code = p_unit;
  if v_u.code is not null then
    if v_u.dimension <> app.base_unit_dimension(v_ing.base_unit) then
      perform app.fail('unidad_incompatible', v_ing.name || ': ' || p_unit || ' → ' || v_ing.base_unit,
        'Define una unidad propia del insumo con su equivalencia.');
    end if;
    return p_qty * v_u.to_base;
  end if;
  select to_base into v_factor from public.ingredient_units where ingredient_id = p_ingredient and name = p_unit;
  if v_factor is null then perform app.fail('unidad_desconocida', v_ing.name || ': ' || p_unit); end if;
  return p_qty * v_factor;
end $$;

-- ---------------------------------------------------------------------
-- Recetas versionadas
-- ---------------------------------------------------------------------
create table public.recipes (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null references public.restaurants(id) on delete cascade,
  kind                  public.recipe_kind not null,
  name                  text not null check (length(trim(name)) between 1 and 80),
  menu_item_id          uuid unique references public.menu_items(id) on delete cascade,
  output_ingredient_id  uuid unique references public.ingredients(id) on delete cascade,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((kind = 'menu' and menu_item_id is not null and output_ingredient_id is null)
      or (kind = 'prep' and output_ingredient_id is not null and menu_item_id is null))
);
create trigger recipes_touch before update on public.recipes
  for each row execute function app.touch_updated_at();
create trigger recipes_audit after insert or update or delete on public.recipes
  for each row execute function app.audit();
create trigger recipes_same_rest_item before insert or update on public.recipes
  for each row execute function app.check_same_restaurant('menu_items', 'menu_item_id');
create trigger recipes_same_rest_ing before insert or update on public.recipes
  for each row execute function app.check_same_restaurant('ingredients', 'output_ingredient_id');

create table public.recipe_versions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  recipe_id      uuid not null references public.recipes(id) on delete cascade,
  version        int not null check (version >= 1),
  status         public.recipe_status not null default 'borrador',
  -- Rendimiento (solo recetas de preparación): cuánto produce una tanda.
  yield_qty      numeric check (yield_qty is null or yield_qty > 0),
  yield_unit     text,
  instructions   text,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.staff(id),
  activated_at   timestamptz,
  activated_by   uuid references public.staff(id),
  unique (recipe_id, version)
);
create unique index recipe_versions_one_active on public.recipe_versions (recipe_id) where status = 'activa';
create trigger recipe_versions_audit after insert or update or delete on public.recipe_versions
  for each row execute function app.audit();
create trigger recipe_versions_same_rest before insert or update on public.recipe_versions
  for each row execute function app.check_same_restaurant('recipes', 'recipe_id');

create table public.recipe_lines (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  version_id     uuid not null references public.recipe_versions(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete restrict,
  qty            numeric not null check (qty > 0),
  unit           text not null,
  base_qty       numeric not null default 0,
  notes          text,
  sort           int not null default 0
);
create index on public.recipe_lines (version_id);
create trigger recipe_lines_audit after insert or update or delete on public.recipe_lines
  for each row execute function app.audit();
create trigger recipe_lines_same_rest_v before insert or update on public.recipe_lines
  for each row execute function app.check_same_restaurant('recipe_versions', 'version_id');
create trigger recipe_lines_same_rest_i before insert or update on public.recipe_lines
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');

-- Solo se editan versiones en borrador; calcula base_qty; evita autorreferencia.
create or replace function app.recipe_lines_guard() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_status public.recipe_status; v_out uuid;
begin
  select rv.status, r.output_ingredient_id into v_status, v_out
  from public.recipe_versions rv join public.recipes r on r.id = rv.recipe_id
  where rv.id = coalesce(new.version_id, old.version_id);
  if v_status is distinct from 'borrador' then
    perform app.fail('version_no_editable', null, 'Crea una nueva versión de la receta para cambiarla.');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.ingredient_id = v_out then
    perform app.fail('receta_circular', null, 'Un preparado no puede ser insumo de sí mismo.');
  end if;
  new.base_qty := app.to_base_qty(new.ingredient_id, new.qty, new.unit);
  return new;
end $$;
create trigger recipe_lines_guard before insert or update or delete on public.recipe_lines
  for each row execute function app.recipe_lines_guard();

create or replace function app.recipe_versions_guard() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'borrador' then
    -- Solo se permite retirar una versión activa.
    if not (old.status = 'activa' and new.status = 'retirada'
            and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status')) then
      perform app.fail('version_no_editable');
    end if;
  end if;
  if tg_op = 'DELETE' and old.status <> 'borrador' then
    perform app.fail('version_no_editable', null, 'Las versiones usadas se conservan para el historial.');
  end if;
  return coalesce(new, old);
end $$;
create trigger recipe_versions_guard before update or delete on public.recipe_versions
  for each row execute function app.recipe_versions_guard();

-- Efecto de un modificador en inventario por unidad de producto
-- ("extra queso" +30 g queso; "sin cebolla" −20 g cebolla).
create table public.modifier_inventory_lines (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  modifier_id    uuid not null references public.modifiers(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete restrict,
  qty            numeric not null check (qty <> 0),
  unit           text not null,
  base_qty       numeric not null default 0,
  unique (modifier_id, ingredient_id)
);
create trigger mil_audit after insert or update or delete on public.modifier_inventory_lines
  for each row execute function app.audit();
create trigger mil_same_rest_m before insert or update on public.modifier_inventory_lines
  for each row execute function app.check_same_restaurant('modifiers', 'modifier_id');
create trigger mil_same_rest_i before insert or update on public.modifier_inventory_lines
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');

create or replace function app.mil_compute() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  new.base_qty := app.to_base_qty(new.ingredient_id, new.qty, new.unit);
  return new;
end $$;
create trigger mil_compute before insert or update on public.modifier_inventory_lines
  for each row execute function app.mil_compute();

-- ---------------------------------------------------------------------
-- Libro de movimientos
-- ---------------------------------------------------------------------
create table public.inventory_movements (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id      uuid not null references public.ingredients(id) on delete restrict,
  kind               public.inventory_kind not null,
  qty_base           numeric not null check (qty_base <> 0),
  waste_reason       public.waste_reason,
  -- Momento al que aplica el movimiento (un ajuste de conteo aplica al
  -- momento del conteo, aunque se apruebe después).
  effective_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  staff_id           uuid references public.staff(id),
  device_id          uuid references public.devices(id) on delete set null,
  authorized_by      uuid references public.staff(id),
  -- Origen: order_item, ticket_event, recepcion, conteo, produccion, manual.
  source_type        text not null,
  source_id          uuid,
  source_key         text not null default '',
  recipe_version_id  uuid references public.recipe_versions(id),
  unit_cost          numeric(14, 6),
  note               text,
  check (
    (kind in ('inicial', 'recepcion', 'reverso_venta', 'produccion_entrada') and qty_base > 0) or
    (kind in ('consumo_venta', 'merma', 'reproceso', 'consumo_interno', 'produccion_consumo') and qty_base < 0) or
    (kind in ('ajuste_conteo', 'ajuste_manual'))
  ),
  check ((kind = 'merma') = (waste_reason is not null))
);
create index on public.inventory_movements (restaurant_id, ingredient_id, effective_at);
create index on public.inventory_movements (restaurant_id, created_at desc);
create index on public.inventory_movements (source_type, source_id);
-- Llave de idempotencia: un mismo origen no puede generar dos veces el mismo movimiento.
create unique index inventory_movements_once on public.inventory_movements
  (restaurant_id, kind, source_type, source_id, ingredient_id, source_key)
  where source_id is not null;

create trigger ingredients_lock_unit before update of base_unit on public.ingredients
  for each row execute function app.ingredient_lock_base_unit();

create or replace function app.movements_immutable() returns trigger language plpgsql as $$
begin
  perform app.fail('movimiento_inmutable', null, 'Registra un movimiento de ajuste en lugar de editar.');
  return null;
end $$;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
  for each row execute function app.movements_immutable();

-- Existencia teórica por insumo. Función (no vista) para no exponer costos
-- de movimientos a quien solo puede ver cantidades.
create or replace function public.inventory_stock_list(p_restaurant_id uuid)
returns table (ingredient_id uuid, name text, category text, base_unit text, kind public.ingredient_kind,
  par_level numeric, active boolean, theoretical_qty numeric, last_count_at timestamptz, last_movement_at timestamptz,
  below_par boolean)
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.has_perm(p_restaurant_id, 'inventory.view') then perform app.fail('permiso_denegado', 'inventory.view'); end if;
  return query
  select i.id, i.name, i.category, i.base_unit, i.kind, i.par_level, i.active,
    coalesce(sum(m.qty_base), 0)::numeric,
    max(m.effective_at) filter (where m.kind = 'ajuste_conteo'),
    max(m.effective_at),
    (i.par_level is not null and coalesce(sum(m.qty_base), 0) < i.par_level)
  from public.ingredients i
  left join public.inventory_movements m on m.ingredient_id = i.id
  where i.restaurant_id = p_restaurant_id
  group by i.id
  order by i.category nulls last, i.name;
end $$;

-- Historial de movimientos sin costos (para cocina) o con costos (gerencia).
create or replace function public.inventory_movements_list(
  p_restaurant_id uuid, p_ingredient_id uuid default null, p_from timestamptz default now() - interval '7 days',
  p_limit int default 200
) returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare v_cost boolean := app.has_perm(p_restaurant_id, 'inventory.view_cost');
begin
  if not app.has_perm(p_restaurant_id, 'inventory.view') then perform app.fail('permiso_denegado', 'inventory.view'); end if;
  return coalesce((select jsonb_agg(x) from (
    select m.id, m.ingredient_id, i.name as ingredient_name, i.base_unit, m.kind, m.qty_base, m.waste_reason,
      m.effective_at, m.created_at, m.source_type, m.source_id, m.note, s.display_name as staff_name,
      a.display_name as authorized_by_name,
      case when v_cost then m.unit_cost end as unit_cost
    from public.inventory_movements m join public.ingredients i on i.id = m.ingredient_id
    left join public.staff s on s.id = m.staff_id
    left join public.staff a on a.id = m.authorized_by and m.authorized_by <> m.staff_id
    where m.restaurant_id = p_restaurant_id and (p_ingredient_id is null or m.ingredient_id = p_ingredient_id)
      and m.effective_at >= p_from
    order by m.effective_at desc limit least(p_limit, 1000)) x), '[]'::jsonb);
end $$;

create or replace function app.theoretical_at(p_ingredient uuid, p_at timestamptz)
returns numeric language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(sum(qty_base), 0) from public.inventory_movements
  where ingredient_id = p_ingredient and effective_at <= p_at
$$;

create or replace function app.unit_cost_of(p_ingredient uuid) returns numeric
language sql stable security definer set search_path = public, app, pg_temp as $$
  select unit_cost from public.ingredient_costs where ingredient_id = p_ingredient
$$;

-- Inserta un movimiento (uso interno de las RPC). Devuelve true si se insertó,
-- false si ya existía (idempotente).
create or replace function app.add_movement(
  p_restaurant uuid, p_ingredient uuid, p_kind public.inventory_kind, p_qty numeric,
  p_ctx jsonb, p_source_type text, p_source_id uuid, p_source_key text default '',
  p_reason public.waste_reason default null, p_recipe_version uuid default null,
  p_note text default null, p_effective_at timestamptz default now()
) returns boolean language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_n int;
begin
  if p_qty = 0 then return false; end if;
  insert into public.inventory_movements(
    restaurant_id, ingredient_id, kind, qty_base, waste_reason, effective_at, staff_id, device_id,
    authorized_by, source_type, source_id, source_key, recipe_version_id, unit_cost, note)
  values (p_restaurant, p_ingredient, p_kind, p_qty, p_reason, p_effective_at,
    (p_ctx->>'staff_id')::uuid, (p_ctx->>'device_id')::uuid, (p_ctx->>'authorized_by')::uuid,
    p_source_type, p_source_id, coalesce(p_source_key, ''), p_recipe_version,
    app.unit_cost_of(p_ingredient), p_note)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

-- Consumo esperado de N unidades de un producto (receta activa + modificadores).
-- p_modifiers: [{"modifier_id": uuid, "qty": int}]
create or replace function app.expected_consumption(p_menu_item uuid, p_qty numeric, p_modifiers jsonb)
returns table (ingredient_id uuid, qty_base numeric, recipe_version_id uuid)
language sql stable security definer set search_path = public, app, pg_temp as $$
  with v as (
    select rv.id from public.recipes r
    join public.recipe_versions rv on rv.recipe_id = r.id and rv.status = 'activa'
    where r.menu_item_id = p_menu_item
  ), base as (
    select rl.ingredient_id, rl.base_qty * p_qty as q from public.recipe_lines rl where rl.version_id = (select id from v)
  ), mods as (
    select mil.ingredient_id, mil.base_qty * p_qty * coalesce((m->>'qty')::numeric, 1) as q
    from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) m
    join public.modifier_inventory_lines mil on mil.modifier_id = (m->>'modifier_id')::uuid
  )
  select ingredient_id, greatest(sum(q), 0), (select id from v)
  from (select * from base union all select * from mods) t
  group by ingredient_id
  having greatest(sum(q), 0) > 0
$$;

-- ---------------------------------------------------------------------
-- Recepciones (entradas de mercancía)
-- ---------------------------------------------------------------------
create table public.receptions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  supplier       text,
  reference      text,
  received_at    timestamptz not null default now(),
  staff_id       uuid references public.staff(id),
  note           text,
  created_at     timestamptz not null default now()
);
create index on public.receptions (restaurant_id, received_at desc);

-- ---------------------------------------------------------------------
-- Producción de preparados (lotes de prep)
-- ---------------------------------------------------------------------
create table public.production_batches (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id      uuid not null references public.ingredients(id),
  recipe_version_id  uuid references public.recipe_versions(id),
  qty_base           numeric not null check (qty_base > 0),
  produced_at        timestamptz not null default now(),
  staff_id           uuid references public.staff(id),
  device_id          uuid references public.devices(id) on delete set null,
  note               text
);
create index on public.production_batches (restaurant_id, produced_at desc);

-- ---------------------------------------------------------------------
-- Conteos físicos
-- ---------------------------------------------------------------------
create table public.inventory_counts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null,
  status         public.count_status not null default 'abierto',
  -- Momento físico del conteo. Los ajustes se comparan contra el teórico a
  -- este momento (las ventas posteriores no contaminan la diferencia).
  as_of          timestamptz not null default now(),
  category       text,
  note           text,
  created_by     uuid references public.staff(id),
  created_at     timestamptz not null default now(),
  submitted_by   uuid references public.staff(id),
  submitted_at   timestamptz,
  approved_by    uuid references public.staff(id),
  approved_at    timestamptz
);
create index on public.inventory_counts (restaurant_id, created_at desc);

create table public.inventory_count_lines (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  count_id          uuid not null references public.inventory_counts(id) on delete cascade,
  ingredient_id     uuid not null references public.ingredients(id),
  counted_qty       numeric not null check (counted_qty >= 0),
  unit              text not null,
  counted_base      numeric not null,
  theoretical_base  numeric,   -- se fija al aprobar
  variance_base     numeric,   -- contado − teórico, se fija al aprobar
  counted_by        uuid references public.staff(id),
  counted_at        timestamptz not null default now(),
  note              text,
  unique (count_id, ingredient_id)
);
