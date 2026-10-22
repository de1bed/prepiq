-- =====================================================================
-- PrepIQ · 0005 · Operaciones de inventario (RPC)
-- Recepción, merma / consumo interno / ajuste manual, producción de
-- preparados, conteo físico y activación de versiones de receta.
-- =====================================================================

-- Recepción de mercancía.
-- p_lines: [{ingredient_id, qty, unit, unit_cost?}]
create or replace function public.rpc_inventory_receive(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_supplier text, p_reference text,
  p_lines jsonb, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; v_rec uuid; v_l jsonb; v_n int := 0; v_base numeric;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'inventory_receive');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'inventory.receive');
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then perform app.fail('sin_lineas'); end if;
  insert into public.receptions(restaurant_id, supplier, reference, staff_id, note)
  values (p_restaurant_id, nullif(trim(p_supplier), ''), nullif(trim(p_reference), ''), (v_ctx->>'staff_id')::uuid, p_note)
  returning id into v_rec;
  for v_l in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if not exists (select 1 from public.ingredients where id = (v_l->>'ingredient_id')::uuid and restaurant_id = p_restaurant_id) then
      perform app.fail('insumo_no_existe');
    end if;
    if coalesce((v_l->>'qty')::numeric, 0) <= 0 then perform app.fail('cantidad_invalida', v_n::text, 'Debe ser mayor a cero.'); end if;
    v_base := app.to_base_qty((v_l->>'ingredient_id')::uuid, (v_l->>'qty')::numeric, v_l->>'unit');
    -- Si se informa costo por unidad capturada, se actualiza el costo por unidad base.
    if (v_l->>'unit_cost') is not null and app.staff_has_perm((v_ctx->>'staff_id')::uuid, 'inventory.view_cost') then
      insert into public.ingredient_costs(ingredient_id, restaurant_id, unit_cost)
      values ((v_l->>'ingredient_id')::uuid, p_restaurant_id,
              (v_l->>'unit_cost')::numeric * (v_l->>'qty')::numeric / v_base)
      on conflict (ingredient_id) do update set unit_cost = excluded.unit_cost;
    end if;
    perform app.add_movement(p_restaurant_id, (v_l->>'ingredient_id')::uuid, 'recepcion', v_base, v_ctx,
      'recepcion', v_rec, v_n::text, null, null, nullif(trim(coalesce(p_supplier, '')), ''));
  end loop;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'reception_id', v_rec, 'lines', v_n));
end $$;

-- Registro de salida no vendida: merma (con motivo), consumo interno o
-- ajuste manual (±, requiere permiso y nota). Puede expresarse por insumo o
-- por producto de menú (se expande su receta activa: "se cayó un plato").
create or replace function public.rpc_inventory_record(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_kind text,
  p_ingredient_id uuid, p_menu_item_id uuid, p_qty numeric, p_unit text,
  p_reason text default null, p_note text default null, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; v_base numeric; v_c record; v_src uuid := gen_random_uuid(); v_n int := 0;
  v_kind public.inventory_kind;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'inventory_record');
  if v_prev is not null then return v_prev; end if;
  if p_kind not in ('merma', 'consumo_interno', 'ajuste_manual') then perform app.fail('tipo_invalido', p_kind); end if;
  v_kind := p_kind::public.inventory_kind;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token,
    case when p_kind = 'ajuste_manual' then 'inventory.adjust' else 'inventory.waste' end, p_override);
  if p_kind = 'merma' and (p_reason is null or p_reason not in (select unnest(enum_range(null::public.waste_reason))::text)) then
    perform app.fail('motivo_requerido', null, 'Indica el motivo de la merma.');
  end if;
  if p_kind = 'ajuste_manual' and coalesce(trim(p_note), '') = '' then
    perform app.fail('nota_requerida', null, 'Explica el ajuste manual.');
  end if;
  if p_qty is null or p_qty = 0 or (p_kind <> 'ajuste_manual' and p_qty < 0) then
    perform app.fail('cantidad_invalida');
  end if;
  if (p_ingredient_id is null) = (p_menu_item_id is null) then perform app.fail('objetivo_invalido'); end if;

  if p_ingredient_id is not null then
    if not exists (select 1 from public.ingredients where id = p_ingredient_id and restaurant_id = p_restaurant_id) then
      perform app.fail('insumo_no_existe');
    end if;
    v_base := app.to_base_qty(p_ingredient_id, abs(p_qty), p_unit) * sign(p_qty);
    perform app.add_movement(p_restaurant_id, p_ingredient_id, v_kind,
      case when p_kind = 'ajuste_manual' then v_base else -v_base end, v_ctx, 'manual', v_src, '',
      case when p_kind = 'merma' then p_reason::public.waste_reason end, null, p_note);
    v_n := 1;
  else
    if p_qty <> trunc(p_qty) or p_qty < 0 then perform app.fail('cantidad_invalida', null, 'Platillos en unidades enteras.'); end if;
    if p_kind = 'ajuste_manual' then perform app.fail('tipo_invalido', null, 'El ajuste manual es por insumo.'); end if;
    for v_c in select * from app.expected_consumption(p_menu_item_id, p_qty, '[]'::jsonb) loop
      perform app.add_movement(p_restaurant_id, v_c.ingredient_id, v_kind, -v_c.qty_base, v_ctx, 'manual', v_src,
        p_menu_item_id::text, case when p_kind = 'merma' then p_reason::public.waste_reason end,
        v_c.recipe_version_id, p_note);
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then perform app.fail('producto_sin_receta', null, 'Este producto no tiene receta activa.'); end if;
  end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'movements', v_n, 'source_id', v_src));
end $$;

-- Producción de un preparado (p. ej. una tanda de pico de gallo):
-- entra el preparado y salen sus componentes según la receta activa.
create or replace function public.rpc_inventory_produce(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_ingredient_id uuid,
  p_qty numeric, p_unit text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; v_ing public.ingredients; v_rv public.recipe_versions; v_out numeric;
  v_yield numeric; v_scale numeric; v_batch uuid; v_l record;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'inventory_produce');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'inventory.produce');
  select * into v_ing from public.ingredients where id = p_ingredient_id and restaurant_id = p_restaurant_id;
  if v_ing.id is null or v_ing.kind <> 'preparado' then perform app.fail('no_es_preparado'); end if;
  if coalesce(p_qty, 0) <= 0 then perform app.fail('cantidad_invalida'); end if;
  select rv.* into v_rv from public.recipes r join public.recipe_versions rv on rv.recipe_id = r.id and rv.status = 'activa'
    where r.output_ingredient_id = p_ingredient_id;
  v_out := app.to_base_qty(p_ingredient_id, p_qty, p_unit);
  insert into public.production_batches(restaurant_id, ingredient_id, recipe_version_id, qty_base, staff_id, device_id, note)
  values (p_restaurant_id, p_ingredient_id, v_rv.id, v_out, (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid, p_note)
  returning id into v_batch;
  perform app.add_movement(p_restaurant_id, p_ingredient_id, 'produccion_entrada', v_out, v_ctx,
    'produccion', v_batch, '', null, v_rv.id, p_note);
  if v_rv.id is not null then
    v_yield := app.to_base_qty(p_ingredient_id, v_rv.yield_qty, v_rv.yield_unit);
    if v_yield is null or v_yield <= 0 then perform app.fail('receta_sin_rendimiento', v_ing.name); end if;
    v_scale := v_out / v_yield;
    for v_l in select ingredient_id, sum(base_qty) as q from public.recipe_lines where version_id = v_rv.id group by ingredient_id loop
      perform app.add_movement(p_restaurant_id, v_l.ingredient_id, 'produccion_consumo', -(v_l.q * v_scale), v_ctx,
        'produccion', v_batch, '', null, v_rv.id, v_ing.name);
    end loop;
  end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'batch_id', v_batch, 'qty_base', v_out,
    'without_recipe', v_rv.id is null));
end $$;

-- ---------------------------------------------------------------------
-- Conteo físico
-- ---------------------------------------------------------------------
create or replace function public.rpc_count_create(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_name text, p_as_of timestamptz default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; v_id uuid;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'count_create');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'inventory.count');
  if p_as_of is not null and p_as_of > now() + interval '5 minutes' then perform app.fail('fecha_futura'); end if;
  insert into public.inventory_counts(restaurant_id, name, as_of, category, created_by)
  values (p_restaurant_id, coalesce(nullif(trim(p_name), ''), 'Conteo ' || to_char(now(), 'YYYY-MM-DD HH24:MI')),
    coalesce(p_as_of, now()), nullif(trim(p_category), ''), (v_ctx->>'staff_id')::uuid)
  returning id into v_id;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'count_id', v_id));
end $$;

-- Captura/actualiza una línea del conteo (último valor gana mientras está abierto).
create or replace function public.rpc_count_set_line(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_count_id uuid, p_ingredient_id uuid,
  p_counted_qty numeric, p_unit text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; c public.inventory_counts; v_base numeric;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'count_set_line');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'inventory.count');
  select * into c from public.inventory_counts where id = p_count_id and restaurant_id = p_restaurant_id for update;
  if c.id is null then perform app.fail('conteo_no_encontrado'); end if;
  if c.status <> 'abierto' then perform app.fail('conteo_cerrado', c.status::text); end if;
  if p_counted_qty is null then
    delete from public.inventory_count_lines where count_id = c.id and ingredient_id = p_ingredient_id;
    return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'removed', true));
  end if;
  if p_counted_qty < 0 then perform app.fail('cantidad_invalida', null, 'Un conteo no puede ser negativo.'); end if;
  v_base := app.to_base_qty(p_ingredient_id, p_counted_qty, p_unit);
  insert into public.inventory_count_lines(restaurant_id, count_id, ingredient_id, counted_qty, unit, counted_base, counted_by, note)
  values (p_restaurant_id, c.id, p_ingredient_id, p_counted_qty, coalesce(p_unit, (select base_unit from public.ingredients where id = p_ingredient_id)),
    v_base, (v_ctx->>'staff_id')::uuid, p_note)
  on conflict (count_id, ingredient_id) do update set counted_qty = excluded.counted_qty, unit = excluded.unit,
    counted_base = excluded.counted_base, counted_by = excluded.counted_by, counted_at = now(), note = excluded.note;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'counted_base', v_base));
end $$;

-- enviar | aprobar | cancelar | reabrir (enviado → abierto)
-- Aprobar: fija teórico al momento del conteo, calcula diferencias y genera
-- ajustes. Es idempotente: aprobar dos veces no duplica ajustes.
create or replace function public.rpc_count_transition(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_count_id uuid, p_action text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_prev jsonb; v_ctx jsonb; c public.inventory_counts; l record; v_theo numeric; v_adj int := 0;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'count_transition');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token,
    case when p_action in ('aprobar', 'reabrir') then 'inventory.approve_count' else 'inventory.count' end);
  select * into c from public.inventory_counts where id = p_count_id and restaurant_id = p_restaurant_id for update;
  if c.id is null then perform app.fail('conteo_no_encontrado'); end if;

  if p_action = 'enviar' then
    if c.status <> 'abierto' then perform app.fail('transicion_invalida', c.status::text); end if;
    if not exists (select 1 from public.inventory_count_lines where count_id = c.id) then perform app.fail('conteo_vacio'); end if;
    update public.inventory_counts set status = 'enviado', submitted_by = (v_ctx->>'staff_id')::uuid, submitted_at = now(),
      note = coalesce(p_note, note) where id = c.id;
  elsif p_action = 'reabrir' then
    if c.status <> 'enviado' then perform app.fail('transicion_invalida', c.status::text); end if;
    update public.inventory_counts set status = 'abierto', submitted_at = null, submitted_by = null where id = c.id;
  elsif p_action = 'cancelar' then
    if c.status in ('aprobado', 'cancelado') then perform app.fail('transicion_invalida', c.status::text); end if;
    update public.inventory_counts set status = 'cancelado', note = coalesce(p_note, note) where id = c.id;
  elsif p_action = 'aprobar' then
    if c.status <> 'enviado' then perform app.fail('transicion_invalida', c.status::text, 'Primero envía el conteo.'); end if;
    for l in select * from public.inventory_count_lines where count_id = c.id for update loop
      v_theo := app.theoretical_at(l.ingredient_id, c.as_of);
      update public.inventory_count_lines set theoretical_base = v_theo, variance_base = l.counted_base - v_theo
        where id = l.id;
      if l.counted_base - v_theo <> 0 then
        if app.add_movement(p_restaurant_id, l.ingredient_id, 'ajuste_conteo', l.counted_base - v_theo, v_ctx,
             'conteo', c.id, '', null, null, c.name, c.as_of) then v_adj := v_adj + 1; end if;
      end if;
    end loop;
    update public.inventory_counts set status = 'aprobado', approved_by = (v_ctx->>'staff_id')::uuid, approved_at = now()
      where id = c.id;
  else
    perform app.fail('accion_invalida', p_action);
  end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'adjustments', v_adj));
end $$;

-- ---------------------------------------------------------------------
-- Recetas: crear nueva versión (copia de la activa) y activar.
-- ---------------------------------------------------------------------
create or replace function public.rpc_recipe_new_version(p_restaurant_id uuid, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; v_src public.recipe_versions; v_new uuid; v_ver int;
begin
  v_ctx := app.authorize(p_restaurant_id, null, 'inventory.manage');
  if not exists (select 1 from public.recipes where id = p_recipe_id and restaurant_id = p_restaurant_id) then
    perform app.fail('receta_no_encontrada');
  end if;
  if exists (select 1 from public.recipe_versions where recipe_id = p_recipe_id and status = 'borrador') then
    select id into v_new from public.recipe_versions where recipe_id = p_recipe_id and status = 'borrador';
    return jsonb_build_object('ok', true, 'version_id', v_new, 'existing_draft', true);
  end if;
  select * into v_src from public.recipe_versions where recipe_id = p_recipe_id and status = 'activa';
  select coalesce(max(version), 0) + 1 into v_ver from public.recipe_versions where recipe_id = p_recipe_id;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, yield_qty, yield_unit, instructions, notes, created_by)
  values (p_restaurant_id, p_recipe_id, v_ver, v_src.yield_qty, v_src.yield_unit, v_src.instructions, v_src.notes,
    (v_ctx->>'staff_id')::uuid)
  returning id into v_new;
  if v_src.id is not null then
    insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, notes, sort)
    select restaurant_id, v_new, ingredient_id, qty, unit, notes, sort from public.recipe_lines where version_id = v_src.id;
  end if;
  return jsonb_build_object('ok', true, 'version_id', v_new, 'existing_draft', false);
end $$;

create or replace function public.rpc_recipe_activate(p_restaurant_id uuid, p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_ctx jsonb; v public.recipe_versions; r public.recipes;
begin
  v_ctx := app.authorize(p_restaurant_id, null, 'inventory.manage');
  select * into v from public.recipe_versions where id = p_version_id and restaurant_id = p_restaurant_id for update;
  if v.id is null then perform app.fail('version_no_encontrada'); end if;
  if v.status <> 'borrador' then perform app.fail('version_no_editable'); end if;
  select * into r from public.recipes where id = v.recipe_id;
  if not exists (select 1 from public.recipe_lines where version_id = v.id) then
    perform app.fail('receta_vacia', null, 'Agrega al menos un insumo.');
  end if;
  if r.kind = 'prep' and (v.yield_qty is null) then
    perform app.fail('receta_sin_rendimiento', null, 'Indica cuánto rinde la tanda.');
  end if;
  if r.kind = 'prep' then perform app.to_base_qty(r.output_ingredient_id, v.yield_qty, v.yield_unit); end if;
  update public.recipe_versions set status = 'retirada' where recipe_id = v.recipe_id and status = 'activa';
  update public.recipe_versions set status = 'activa', activated_at = now(), activated_by = (v_ctx->>'staff_id')::uuid
    where id = v.id;
  return jsonb_build_object('ok', true);
end $$;
