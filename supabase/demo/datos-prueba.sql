-- =====================================================================
-- PrepIQ · DATOS DE PRUEBA para un restaurante existente
-- ---------------------------------------------------------------------
-- * TODO es ficticio: personas, PIN, proveedores, costos, ventas, mermas.
--   Las reglas de vida útil son EJEMPLOS sin validación sanitaria.
-- * Agrega (no borra) a lo que ya tenga el restaurante. Cada sección
--   detecta si ya se cargó y no duplica.
-- * Para usarlo en otro restaurante, reemplaza 'David Prueba' (aparece en
--   pg_temp.rest) por el nombre exacto del restaurante.
-- * En el SQL Editor de Supabase se puede correr el archivo completo (tarda
--   alrededor de un minuto). Por partes: cada sección empieza con "-- @@";
--   las secciones 4 y 5 usan las funciones definidas al inicio de la 3, así
--   que deben ir en la misma ejecución que esas definiciones.
--
-- PIN de prueba: Ana 1111 (gerente) · Beto 2222 · Carla 3333 · Diego 4444 ·
-- Iván 9999 (cocina) · Hugo 8888 (barra/mesero) · Elena 5555 · Fer 6666 ·
-- Gaby 7777 (meseros).
-- =====================================================================

-- @@ 1. Catálogo: estaciones, personal con PIN, insumos, menú, modificadores, recetas, etiquetas
create or replace function pg_temp.rest() returns uuid language sql stable as $$
  select id from public.restaurants where name = 'David Prueba'
$$;
create or replace function pg_temp.ing(p text) returns uuid language plpgsql stable as $$
declare v uuid;
begin
  select id into v from public.ingredients where restaurant_id = pg_temp.rest() and name = p;
  if v is null then raise exception 'insumo no encontrado: %', p; end if;
  return v;
end $$;
create or replace function pg_temp.recipe(p_kind text, p_name text, p_menu uuid, p_out uuid, p_yield numeric, p_yunit text,
  p_instr text, p_lines jsonb, p_by uuid) returns void language plpgsql as $$
declare r uuid := pg_temp.rest(); v_rec uuid; v_ver uuid; l jsonb; i int := 0;
begin
  insert into public.recipes(restaurant_id, kind, name, menu_item_id, output_ingredient_id)
  values (r, p_kind::public.recipe_kind, p_name, p_menu, p_out) returning id into v_rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, yield_qty, yield_unit, instructions, created_by, created_at)
  values (r, v_rec, 1, p_yield, p_yunit, p_instr, p_by, now() - interval '20 days') returning id into v_ver;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort)
    values (r, v_ver, pg_temp.ing(l->>0), (l->>1)::numeric, l->>2, i);
  end loop;
  update public.recipe_versions set status = 'activa', activated_at = now() - interval '20 days', activated_by = p_by where id = v_ver;
end $$;

do $$
declare
  r uuid := pg_temp.rest(); x jsonb; v_id uuid; v_ana uuid; v_cat uuid; v_station uuid; i int; g text; v_group uuid;
begin
  if r is null then raise exception 'No existe el restaurante de prueba'; end if;
  if exists (select 1 from public.stations where restaurant_id = r and name = 'Comal') then
    raise notice 'El catálogo de prueba ya estaba cargado.'; return;
  end if;
  perform set_config('app.internal_staff_write', 'on', true);
  update public.restaurants set settings = settings || '{"auto_open_service_day": true, "team_on_time_goal_pct": 85}'::jsonb where id = r;

  -- Estaciones
  insert into public.stations(restaurant_id, name, kind, color, sort) values
    (r, 'Parrilla', 'cocina', '#dc2626', 1), (r, 'Comal', 'cocina', '#ea580c', 2), (r, 'Freidora', 'cocina', '#ca8a04', 3),
    (r, 'Fríos', 'cocina', '#0891b2', 4), (r, 'Barra', 'barra', '#2563eb', 5), (r, 'Pase', 'pase', '#16a34a', 6)
  on conflict (restaurant_id, name) do nothing;

  -- Personal (sin cuenta: operan con PIN en los equipos)
  for x in select * from jsonb_array_elements($j$[
    {"n": "Ana Ruiz", "r": ["gerente"], "c": "201", "col": "#7c3aed", "pin": "1111"},
    {"n": "Beto Salas", "r": ["cocinero"], "c": "202", "col": "#dc2626", "pin": "2222"},
    {"n": "Carla Méndez", "r": ["cocinero"], "c": "203", "col": "#db2777", "pin": "3333"},
    {"n": "Diego Torres", "r": ["cocinero"], "c": "204", "col": "#0891b2", "pin": "4444"},
    {"n": "Iván Cruz", "r": ["cocinero"], "c": "209", "col": "#16a34a", "pin": "9999"},
    {"n": "Hugo Ramos", "r": ["cocinero", "mesero"], "c": "208", "col": "#ca8a04", "pin": "8888"},
    {"n": "Elena Gómez", "r": ["mesero"], "c": "205", "col": "#059669", "pin": "5555"},
    {"n": "Fer Ortiz", "r": ["mesero"], "c": "206", "col": "#4f46e5", "pin": "6666"},
    {"n": "Gaby Luna", "r": ["mesero"], "c": "207", "col": "#ea580c", "pin": "7777"}
  ]$j$::jsonb) loop
    v_id := null;
    insert into public.staff(restaurant_id, display_name, roles, employee_code, color, created_at)
    values (r, x->>'n', array(select jsonb_array_elements_text(x->'r'))::public.app_role[], x->>'c', x->>'col', now() - interval '30 days')
    on conflict do nothing returning id into v_id;
    if v_id is not null then
      begin
        insert into app.staff_pins(staff_id, restaurant_id, pin_lookup) values (v_id, r, app.pin_lookup(r, x->>'pin'));
        update public.staff set pin_set_at = now() where id = v_id;
      exception when unique_violation then
        raise notice 'El PIN % ya lo usa otra persona: % queda sin PIN', x->>'pin', x->>'n';
      end;
    end if;
  end loop;
  select id into v_ana from public.staff where restaurant_id = r and display_name = 'Ana Ruiz';
  insert into public.staff_private(staff_id, restaurant_id, phone, emergency_contact, notes)
  select id, r, '664 000 00' || employee_code, 'Contacto ficticio', 'Dato de prueba' from public.staff
  where restaurant_id = r and employee_code between '201' and '209' on conflict do nothing;

  -- Insumos: [nombre, categoría, unidad base, tipo, nivel de referencia, costo por unidad base, alérgenos]
  for x in select * from jsonb_array_elements($j$[
    ["Tortilla de maíz", "Tortillería", "pza", "compra", 400, 0.6, []],
    ["Tortilla de harina", "Tortillería", "pza", "compra", 150, 2.0, ["gluten"]],
    ["Carne al pastor", "Carnes", "g", "compra", 6000, 0.16, []],
    ["Bistec de res", "Carnes", "g", "compra", 5000, 0.24, []],
    ["Arrachera", "Carnes", "g", "compra", 4000, 0.38, []],
    ["Suadero", "Carnes", "g", "compra", 3000, 0.2, []],
    ["Pechuga de pollo", "Carnes", "g", "compra", 3000, 0.12, []],
    ["Carne molida", "Carnes", "g", "compra", 3000, 0.14, []],
    ["Tocino", "Carnes", "g", "compra", 1000, 0.3, []],
    ["Queso Oaxaca", "Lácteos", "g", "compra", 2500, 0.15, ["lácteos"]],
    ["Queso manchego", "Lácteos", "g", "compra", 1500, 0.18, ["lácteos"]],
    ["Crema", "Lácteos", "ml", "compra", 2000, 0.06, ["lácteos"]],
    ["Leche", "Lácteos", "ml", "compra", 3000, 0.025, ["lácteos"]],
    ["Huevo", "Abarrotes", "pza", "compra", 60, 3.0, ["huevo"]],
    ["Cebolla blanca", "Verduras", "g", "compra", 3000, 0.03, []],
    ["Cilantro", "Verduras", "g", "compra", 400, 0.08, []],
    ["Jitomate", "Verduras", "g", "compra", 4000, 0.035, []],
    ["Chile serrano", "Verduras", "g", "compra", 500, 0.06, []],
    ["Tomate verde", "Verduras", "g", "compra", 2000, 0.03, []],
    ["Limón", "Verduras", "pza", "compra", 80, 2.5, []],
    ["Aguacate", "Verduras", "g", "compra", 3000, 0.09, []],
    ["Lechuga", "Verduras", "g", "compra", 1000, 0.04, []],
    ["Papa", "Verduras", "g", "compra", 8000, 0.03, []],
    ["Pimiento morrón", "Verduras", "g", "compra", 1000, 0.07, []],
    ["Aceite vegetal", "Abarrotes", "ml", "compra", 5000, 0.045, []],
    ["Pan de hamburguesa", "Panadería", "pza", "compra", 30, 6.0, ["gluten"]],
    ["Frijol bayo", "Abarrotes", "g", "compra", 3000, 0.035, []],
    ["Totopos", "Abarrotes", "g", "compra", 2000, 0.05, []],
    ["Arroz", "Abarrotes", "g", "compra", 2000, 0.03, []],
    ["Azúcar", "Abarrotes", "g", "compra", 3000, 0.028, []],
    ["Canela", "Abarrotes", "g", "compra", 100, 0.5, []],
    ["Flor de jamaica", "Abarrotes", "g", "compra", 500, 0.2, []],
    ["Harina de trigo", "Abarrotes", "g", "compra", 2000, 0.02, ["gluten"]],
    ["Refresco 355 ml", "Bebidas", "pza", "compra", 48, 12, []],
    ["Cerveza 355 ml", "Bebidas", "pza", "compra", 48, 18, ["gluten"]],
    ["Pico de gallo", "Preparados", "g", "preparado", 1500, null, []],
    ["Salsa verde", "Preparados", "ml", "preparado", 2000, null, []],
    ["Frijoles charros", "Preparados", "g", "preparado", 3000, null, []],
    ["Agua de horchata (preparada)", "Preparados", "ml", "preparado", 8000, null, ["lácteos"]],
    ["Agua de jamaica (preparada)", "Preparados", "ml", "preparado", 8000, null, []],
    ["Flan (porción)", "Preparados", "pza", "preparado", 8, null, ["lácteos", "huevo"]]
  ]$j$::jsonb) loop
    v_id := null;
    insert into public.ingredients(restaurant_id, name, category, base_unit, kind, par_level, allergens, storage)
    values (r, x->>0, x->>1, x->>2, (x->>3)::public.ingredient_kind, (x->>4)::numeric,
      array(select jsonb_array_elements_text(x->6)), case when x->>3 = 'preparado' then 'refrigerado' end)
    on conflict (restaurant_id, name) do nothing returning id into v_id;
    if v_id is not null and x->>5 is not null then
      insert into public.ingredient_costs(ingredient_id, restaurant_id, unit_cost) values (v_id, r, (x->>5)::numeric);
    end if;
  end loop;
  insert into public.ingredient_units(restaurant_id, ingredient_id, name, to_base) values
    (r, pg_temp.ing('Tortilla de maíz'), 'paquete', 100), (r, pg_temp.ing('Tortilla de harina'), 'paquete', 20),
    (r, pg_temp.ing('Limón'), 'bolsa', 40), (r, pg_temp.ing('Aguacate'), 'pieza', 170), (r, pg_temp.ing('Jitomate'), 'pieza', 120),
    (r, pg_temp.ing('Pan de hamburguesa'), 'bolsa', 8), (r, pg_temp.ing('Refresco 355 ml'), 'caja', 24),
    (r, pg_temp.ing('Cerveza 355 ml'), 'caja', 24), (r, pg_temp.ing('Huevo'), 'cartera', 30)
  on conflict do nothing;

  -- Recetas de preparados (rinden una tanda)
  perform pg_temp.recipe('prep', 'Pico de gallo', null, pg_temp.ing('Pico de gallo'), 1, 'kg',
    E'1. Picar jitomate, cebolla y chile en cubos.\n2. Picar cilantro.\n3. Mezclar con jugo de limón y sal.',
    '[["Jitomate", 600, "g"], ["Cebolla blanca", 250, "g"], ["Cilantro", 60, "g"], ["Chile serrano", 40, "g"], ["Limón", 4, "pza"]]', v_ana);
  perform pg_temp.recipe('prep', 'Salsa verde', null, pg_temp.ing('Salsa verde'), 2, 'l',
    E'1. Hervir tomate y chile.\n2. Licuar con cebolla y cilantro.\n3. Sazonar.',
    '[["Tomate verde", 1500, "g"], ["Chile serrano", 80, "g"], ["Cebolla blanca", 150, "g"], ["Cilantro", 40, "g"]]', v_ana);
  perform pg_temp.recipe('prep', 'Frijoles charros', null, pg_temp.ing('Frijoles charros'), 3, 'kg',
    E'1. Cocer el frijol.\n2. Freír tocino, cebolla, jitomate y chile.\n3. Integrar y hervir 20 min.',
    '[["Frijol bayo", 1200, "g"], ["Tocino", 300, "g"], ["Jitomate", 400, "g"], ["Cebolla blanca", 200, "g"], ["Chile serrano", 50, "g"]]', v_ana);
  perform pg_temp.recipe('prep', 'Agua de horchata', null, pg_temp.ing('Agua de horchata (preparada)'), 4, 'l',
    E'1. Remojar arroz con canela 4 h.\n2. Licuar con agua y leche.\n3. Colar y endulzar.',
    '[["Arroz", 250, "g"], ["Azúcar", 300, "g"], ["Canela", 10, "g"], ["Leche", 500, "ml"]]', v_ana);
  perform pg_temp.recipe('prep', 'Agua de jamaica', null, pg_temp.ing('Agua de jamaica (preparada)'), 4, 'l',
    E'1. Hervir la flor 10 min.\n2. Colar, endulzar y completar con agua fría.',
    '[["Flor de jamaica", 120, "g"], ["Azúcar", 320, "g"]]', v_ana);
  perform pg_temp.recipe('prep', 'Flan napolitano', null, pg_temp.ing('Flan (porción)'), 8, 'pza',
    E'1. Caramelizar azúcar.\n2. Licuar leche, huevo y azúcar.\n3. Hornear a baño María 50 min.',
    '[["Leche", 1000, "ml"], ["Huevo", 6, "pza"], ["Azúcar", 250, "g"]]', v_ana);

  -- Menú
  insert into public.menu_categories(restaurant_id, name, sort) values
    (r, 'Tacos', 1), (r, 'Especialidades', 2), (r, 'Entradas', 3), (r, 'Acompañantes', 4), (r, 'Bebidas', 5), (r, 'Postres', 6)
  on conflict do nothing;

  -- Grupos de modificadores: [nombre, mín, máx, [[opción, etiqueta cocina, precio, [[insumo, cantidad, unidad]]]]]
  for x in select * from jsonb_array_elements($j$[
    ["Tortilla", 1, 1, [["Maíz", "MAÍZ", 0, []], ["Harina", "HARINA", 5, [["Tortilla de harina", 3, "pza"], ["Tortilla de maíz", -3, "pza"]]]]],
    ["Extras", 0, 3, [["Queso extra", "+QUESO", 15, [["Queso Oaxaca", 30, "g"]]], ["Aguacate", "+AGUACATE", 20, [["Aguacate", 40, "g"]]], ["Carne extra", "+CARNE", 25, []]]],
    ["Sin", 0, 3, [["Sin cebolla", "SIN CEBOLLA", 0, [["Cebolla blanca", -15, "g"]]], ["Sin cilantro", "SIN CILANTRO", 0, [["Cilantro", -6, "g"]]], ["Sin picante", "SIN PICANTE", 0, []]]],
    ["Salsa", 0, 2, [["Salsa aparte", "SALSA APARTE", 0, []], ["Extra salsa", "+SALSA", 0, [["Salsa verde", 30, "ml"]]]]],
    ["Término", 1, 1, [["Término medio", "MEDIO", 0, []], ["Tres cuartos", "3/4", 0, []], ["Bien cocida", "BIEN COCIDA", 0, []]]],
    ["Tamaño", 1, 1, [["Chico", "CHICO", 0, []], ["Grande", "GRANDE", 12, []]]]
  ]$j$::jsonb) loop
    insert into public.modifier_groups(restaurant_id, name, min_select, max_select, sort)
    values (r, x->>0, (x->>1)::int, (x->>2)::int, (select count(*) + 1 from public.modifier_groups where restaurant_id = r))
    on conflict (restaurant_id, name) do update set min_select = excluded.min_select returning id into v_group;
    i := 0;
    for g in select jsonb_array_elements(x->3)::text loop
      i := i + 1;
      insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, price_delta, sort)
      values (r, v_group, g::jsonb->>0, g::jsonb->>1, (g::jsonb->>2)::numeric, i)
      on conflict (group_id, name) do nothing returning id into v_id;
      if v_id is not null then
        insert into public.modifier_inventory_lines(restaurant_id, modifier_id, ingredient_id, qty, unit)
        select r, v_id, pg_temp.ing(l->>0), (l->>1)::numeric, l->>2 from jsonb_array_elements(g::jsonb->3) l;
      end if;
    end loop;
  end loop;

  -- Platillos: [categoría, nombre, nombre cocina, precio, min, complejidad, alérgenos, [[estación, componente]], [grupos], receta|null]
  for x in select * from jsonb_array_elements($j$[
    ["Tacos", "Tacos al pastor (3)", "Pastor x3", 75, 6, 1, [], [["Comal", null]], ["Tortilla", "Extras", "Sin", "Salsa"],
      [["Tortilla de maíz", 3, "pza"], ["Carne al pastor", 120, "g"], ["Cebolla blanca", 15, "g"], ["Cilantro", 6, "g"], ["Salsa verde", 30, "ml"]]],
    ["Tacos", "Tacos de asada (3)", "Asada x3", 85, 7, 1, [], [["Parrilla", null]], ["Tortilla", "Extras", "Sin", "Salsa"],
      [["Tortilla de maíz", 3, "pza"], ["Bistec de res", 120, "g"], ["Cebolla blanca", 15, "g"], ["Cilantro", 6, "g"], ["Salsa verde", 30, "ml"]]],
    ["Tacos", "Tacos de arrachera (3)", "Arrachera x3", 105, 9, 2, [], [["Parrilla", null]], ["Tortilla", "Extras", "Sin", "Salsa"],
      [["Tortilla de maíz", 3, "pza"], ["Arrachera", 150, "g"], ["Pico de gallo", 60, "g"]]],
    ["Tacos", "Tacos de suadero (3)", "Suadero x3", 80, 6, 1, [], [["Comal", null]], ["Tortilla", "Extras", "Sin", "Salsa"],
      [["Tortilla de maíz", 3, "pza"], ["Suadero", 120, "g"], ["Cebolla blanca", 15, "g"], ["Cilantro", 6, "g"]]],
    ["Tacos", "Tacos de pollo (3)", "Pollo x3", 75, 8, 1, [], [["Parrilla", null]], ["Tortilla", "Extras", "Sin", "Salsa"],
      [["Tortilla de maíz", 3, "pza"], ["Pechuga de pollo", 130, "g"], ["Pico de gallo", 40, "g"]]],
    ["Tacos", "Gringa de pastor", "Gringa", 70, 7, 2, ["lácteos", "gluten"], [["Comal", null]], ["Extras", "Sin", "Salsa"],
      [["Tortilla de harina", 2, "pza"], ["Carne al pastor", 100, "g"], ["Queso Oaxaca", 60, "g"]]],
    ["Tacos", "Quesadilla", "Quesadilla", 55, 5, 1, ["lácteos"], [["Comal", null]], ["Tortilla", "Extras"],
      [["Tortilla de maíz", 1, "pza"], ["Queso Oaxaca", 70, "g"]]],
    ["Tacos", "Volcán de asada", "Volcán", 45, 6, 1, ["lácteos"], [["Comal", null]], ["Extras", "Sin"], null],
    ["Especialidades", "Hamburguesa de la casa", "Hamburguesa", 155, 12, 3, ["gluten", "lácteos"], [["Parrilla", null], ["Freidora", "papas"]], ["Término", "Extras", "Sin"],
      [["Pan de hamburguesa", 1, "pza"], ["Carne molida", 180, "g"], ["Queso manchego", 30, "g"], ["Tocino", 30, "g"], ["Lechuga", 20, "g"], ["Jitomate", 30, "g"], ["Papa", 200, "g"], ["Aceite vegetal", 30, "ml"]]],
    ["Especialidades", "Arrachera a la parrilla", "Arrachera plato", 235, 15, 3, [], [["Parrilla", null], ["Fríos", "guarnición"]], ["Término"],
      [["Arrachera", 300, "g"], ["Frijoles charros", 150, "g"], ["Aguacate", 60, "g"], ["Tortilla de maíz", 4, "pza"], ["Lechuga", 30, "g"]]],
    ["Especialidades", "Alambre de res", "Alambre", 165, 11, 2, ["lácteos"], [["Parrilla", null]], ["Tortilla", "Extras"],
      [["Bistec de res", 200, "g"], ["Tocino", 40, "g"], ["Pimiento morrón", 60, "g"], ["Cebolla blanca", 50, "g"], ["Queso Oaxaca", 60, "g"], ["Tortilla de maíz", 5, "pza"]]],
    ["Especialidades", "Burrito de asada", "Burrito", 120, 8, 2, ["gluten", "lácteos"], [["Parrilla", null]], ["Extras", "Sin", "Salsa"],
      [["Tortilla de harina", 1, "pza"], ["Bistec de res", 150, "g"], ["Frijoles charros", 80, "g"], ["Queso Oaxaca", 40, "g"], ["Pico de gallo", 40, "g"]]],
    ["Especialidades", "Enchiladas verdes", "Enchiladas", 130, 10, 2, ["lácteos"], [["Comal", null]], ["Extras"],
      [["Tortilla de maíz", 4, "pza"], ["Pechuga de pollo", 120, "g"], ["Salsa verde", 200, "ml"], ["Crema", 40, "ml"], ["Queso Oaxaca", 40, "g"]]],
    ["Entradas", "Guacamole con totopos", "Guacamole", 95, 5, 1, [], [["Fríos", null]], ["Sin"],
      [["Aguacate", 200, "g"], ["Pico de gallo", 60, "g"], ["Totopos", 120, "g"], ["Limón", 1, "pza"]]],
    ["Entradas", "Queso fundido", "Queso fundido", 110, 8, 2, ["lácteos", "gluten"], [["Comal", null]], ["Extras"],
      [["Queso Oaxaca", 150, "g"], ["Queso manchego", 80, "g"], ["Tortilla de harina", 4, "pza"]]],
    ["Entradas", "Sopa de tortilla", "Sopa tortilla", 75, 6, 1, ["lácteos"], [["Comal", null]], [], null],
    ["Acompañantes", "Papas fritas", "Papas", 50, 6, 1, [], [["Freidora", null]], [], [["Papa", 250, "g"], ["Aceite vegetal", 40, "ml"]]],
    ["Acompañantes", "Frijoles charros (taza)", "Charros", 45, 3, 1, [], [["Comal", null]], [], [["Frijoles charros", 250, "g"]]],
    ["Acompañantes", "Cebollitas asadas", "Cebollitas", 35, 5, 1, [], [["Parrilla", null]], [], [["Cebolla blanca", 150, "g"], ["Limón", 1, "pza"]]],
    ["Bebidas", "Agua de horchata", "Horchata", 38, 2, 1, ["lácteos"], [["Barra", null]], ["Tamaño"], [["Agua de horchata (preparada)", 500, "ml"]]],
    ["Bebidas", "Agua de jamaica", "Jamaica", 35, 2, 1, [], [["Barra", null]], ["Tamaño"], [["Agua de jamaica (preparada)", 500, "ml"]]],
    ["Bebidas", "Refresco", "Refresco", 32, 1, 1, [], [["Barra", null]], [], [["Refresco 355 ml", 1, "pza"]]],
    ["Bebidas", "Cerveza", "Cerveza", 55, 1, 1, ["gluten"], [["Barra", null]], [], [["Cerveza 355 ml", 1, "pza"]]],
    ["Bebidas", "Limonada", "Limonada", 40, 3, 1, [], [["Barra", null]], ["Tamaño"], [["Limón", 3, "pza"], ["Azúcar", 40, "g"]]],
    ["Postres", "Flan napolitano", "Flan", 55, 2, 1, ["lácteos", "huevo"], [["Fríos", null]], [], [["Flan (porción)", 1, "pza"]]],
    ["Postres", "Churros con cajeta", "Churros", 60, 7, 1, ["gluten", "lácteos"], [["Freidora", null]], [],
      [["Harina de trigo", 120, "g"], ["Aceite vegetal", 60, "ml"], ["Azúcar", 20, "g"]]]
  ]$j$::jsonb) loop
    select id into v_cat from public.menu_categories where restaurant_id = r and name = x->>0;
    insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, allergens, sort)
    values (r, v_cat, x->>1, x->>2, (x->>3)::numeric, (x->>4)::int, (x->>5)::int, array(select jsonb_array_elements_text(x->6)),
      (select count(*) + 1 from public.menu_items where restaurant_id = r and category_id = v_cat))
    returning id into v_id;
    insert into public.menu_item_routes(restaurant_id, menu_item_id, station_id, component, sort)
    select r, v_id, s.id, rt->>1, row_number() over () from jsonb_array_elements(x->7) rt
    join public.stations s on s.restaurant_id = r and s.name = rt->>0;
    insert into public.menu_item_modifier_groups(restaurant_id, menu_item_id, group_id, sort)
    select r, v_id, mg.id, row_number() over () from jsonb_array_elements_text(x->8) gn
    join public.modifier_groups mg on mg.restaurant_id = r and mg.name = gn;
    if jsonb_typeof(x->9) = 'array' then
      perform pg_temp.recipe('menu', x->>1, v_id, null, null, null, null, x->9, v_ana);
    end if;
  end loop;

  -- Etiquetas: formato extra y reglas de vida útil de EJEMPLO (sin validar)
  insert into public.label_templates(restaurant_id, name, width_mm, height_mm, fields)
  values (r, 'Chica 40×25 mm', 40, 25, array['producto', 'preparado', 'caduca', 'lote']) on conflict do nothing;
  insert into public.shelf_life_rules(restaurant_id, ingredient_id, storage, duration_hours, validated_by, validated_on, source_note)
  select r, pg_temp.ing(n), 'refrigerado', h, 'EJEMPLO DE PRUEBA — sin validar', current_date,
    'Valor ficticio para probar el sistema. Configura y valida la regla real de tu restaurante.'
  from (values ('Pico de gallo', 24), ('Salsa verde', 48), ('Frijoles charros', 48), ('Agua de horchata (preparada)', 24),
               ('Agua de jamaica (preparada)', 48), ('Flan (porción)', 72)) v(n, h);

  -- Disponibilidad de personal (preferencias)
  insert into public.staff_availability(restaurant_id, staff_id, weekday, start_time, end_time, kind, note)
  select r, s.id, d, t1, t2, k, nt from public.staff s
  join (values ('Carla Méndez', 3, '00:00'::time, '23:59'::time, 'no_disponible', 'Estudia los miércoles'),
               ('Fer Ortiz', 0, '16:00'::time, '00:00'::time, 'disponible', 'Prefiere noches'),
               ('Gaby Luna', 6, '12:00'::time, '22:00'::time, 'disponible', null)) v(n, d, t1, t2, k, nt) on v.n = s.display_name
  where s.restaurant_id = r;
  raise notice 'Catálogo de prueba cargado.';
end $$;

-- @@ 3. Historia: días -14 a -1 (órdenes, tickets, eventos, consumo teórico)
create or replace function pg_temp.rest() returns uuid language sql stable as $$
  select id from public.restaurants where name = 'David Prueba'
$$;
create or replace function pg_temp.pick(a uuid[]) returns uuid language sql volatile as $$
  select a[1 + floor(random() * cardinality(a))::int]
$$;
create or replace function pg_temp.pickt(a text[]) returns text language sql volatile as $$
  select a[1 + floor(random() * cardinality(a))::int]
$$;
-- Genera p_orders órdenes del día de negocio p_date (+ p_live órdenes en los últimos 25 min).
-- Los estados dependen de la hora: lo que ya pasó queda entregado; lo reciente queda en cocina.
create or replace function pg_temp.demo_day(p_date date, p_orders int, p_live int default 0) returns int language plpgsql as $$
declare
  r uuid := pg_temp.rest(); tz text; today date; v_day public.service_days; waiters uuid[]; v_ana uuid; menu uuid[];
  k int; m int; t timestamptz; v_order uuid; v_type public.order_type; v_server uuid; v_server_name text; v_send uuid;
  n_items int; j int; mi public.menu_items; v_item uuid; v_qty int; v_mods jsonb; g record; md record; v_cnt int;
  grp record; v_ticket uuid; rush numeric; t_start timestamptz; t_ready timestamptz; t_deliv timestamptz;
  t_reopen timestamptz; t_ready2 timestamptz; t_deliv2 timestamptz; v_status public.ticket_status; v_cook uuid;
  v_block int; v_reopen boolean; v_ev uuid; c record; v_ctx jsonb; v_number int; v_last timestamptz; v_tries int;
  v_voids uuid[]; v_vi uuid; t_void timestamptz; v_prep boolean; v_reason text; ti record; v_made int := 0;
  cooks jsonb; v_pick uuid;
begin
  select timezone into tz from public.restaurants where id = r;
  today := app.business_date(r);
  waiters := array(select id from public.staff where restaurant_id = r and active and roles = '{mesero}');
  select id into v_ana from public.staff where restaurant_id = r and display_name = 'Ana Ruiz';
  select jsonb_object_agg(s.name, to_jsonb(array(select st.id from public.staff st where st.restaurant_id = r
           and st.display_name = any (case s.name when 'Parrilla' then array['Beto Salas', 'Iván Cruz']
             when 'Comal' then array['Carla Méndez', 'Diego Torres'] when 'Freidora' then array['Iván Cruz', 'Hugo Ramos']
             when 'Fríos' then array['Diego Torres', 'Carla Méndez'] else array['Hugo Ramos'] end))))
    into cooks from public.stations s where s.restaurant_id = r;
  select array_agg(mi2.id) into menu from public.menu_items mi2
  join (values ('Tacos al pastor (3)', 12), ('Tacos de asada (3)', 9), ('Tacos de arrachera (3)', 5), ('Tacos de suadero (3)', 6),
               ('Tacos de pollo (3)', 4), ('Gringa de pastor', 5), ('Quesadilla', 6), ('Volcán de asada', 3),
               ('Hamburguesa de la casa', 5), ('Arrachera a la parrilla', 3), ('Alambre de res', 3), ('Burrito de asada', 4),
               ('Enchiladas verdes', 3), ('Guacamole con totopos', 4), ('Queso fundido', 3), ('Sopa de tortilla', 2),
               ('Papas fritas', 4), ('Frijoles charros (taza)', 3), ('Cebollitas asadas', 2), ('Agua de horchata', 7),
               ('Agua de jamaica', 6), ('Refresco', 8), ('Cerveza', 6), ('Limonada', 3), ('Flan napolitano', 3),
               ('Churros con cajeta', 2)) w(n, wt) on w.n = mi2.name
  cross join generate_series(1, w.wt)
  where mi2.restaurant_id = r;

  insert into public.service_days(restaurant_id, business_date, status, opened_at, opened_by)
  values (r, p_date, case when p_date = today then 'abierta' else 'cerrada' end::public.service_day_status,
    (p_date + time '11:30') at time zone tz, v_ana)
  on conflict (restaurant_id, business_date) do nothing;
  select * into v_day from public.service_days where restaurant_id = r and business_date = p_date;
  v_number := v_day.next_order_number;
  v_last := (p_date + time '22:30') at time zone tz;

  for k in 1..(p_orders + p_live) loop
    if k <= p_orders then
      m := case when random() < 0.58 then 13 * 60 + floor(random() * 210)::int else 19 * 60 + floor(random() * 210)::int end;
      t := (p_date + make_interval(mins => m)) at time zone tz;
      if t > now() - interval '25 minutes' then continue; end if;  -- lo reciente lo generan las órdenes "en vivo"
    else
      t := now() - make_interval(secs => 20 + random() * 1500);
    end if;
    m := extract(hour from t at time zone tz)::int * 60 + extract(minute from t at time zone tz)::int;
    rush := case when m between 14 * 60 and 15 * 60 + 30 or m between 20 * 60 and 21 * 60 + 30 then 1.3 else 1.0 end
          + case when extract(isodow from p_date) in (5, 6) then 0.1 else 0 end;
    v_type := case when random() < 0.65 then 'mesa' when random() < 0.7 then 'llevar' else 'barra' end;
    v_server := pg_temp.pick(waiters);
    select display_name into v_server_name from public.staff where id = v_server;
    v_order := gen_random_uuid(); v_send := gen_random_uuid(); v_ctx := jsonb_build_object('staff_id', v_server);
    insert into public.orders(id, restaurant_id, service_day_id, number, order_type, table_label, guest_count, customer_name,
      status, server_staff_id, created_at, created_by, client_created_at, updated_at)
    values (v_order, r, v_day.id, v_number, v_type,
      case v_type when 'mesa' then (1 + floor(random() * 14)::int)::text when 'barra' then 'B' || (1 + floor(random() * 6)::int) end,
      case when v_type = 'mesa' then 1 + floor(random() * 6)::int end,
      case when v_type = 'llevar' then pg_temp.pickt(array['Sra. López', 'Juan P.', 'Mariana', 'Sr. Ochoa', 'Lupita', 'Carlos R.', 'Daniela', 'Uber 4821', 'Didi 1180']) end,
      'abierta', v_server, t, v_server, t, t);
    v_number := v_number + 1;

    n_items := case when random() < 0.3 then 1 when random() < 0.5 then 2 when random() < 0.65 then 3 else 4 end;
    v_voids := '{}';
    for j in 1..n_items loop
      v_tries := 0;
      loop
        v_pick := pg_temp.pick(menu);
        select * into mi from public.menu_items where id = v_pick;
        v_tries := v_tries + 1;
        exit when mi.available or p_date < today or v_tries > 5;
      end loop;
      v_qty := case when random() < 0.85 then 1 when random() < 0.8 then 2 else 3 end;
      v_mods := '[]';
      for g in select mg.* from public.modifier_groups mg join public.menu_item_modifier_groups x on x.group_id = mg.id
               where x.menu_item_id = mi.id order by x.sort loop
        if g.min_select >= 1 then
          select * into md from public.modifiers where group_id = g.id and active
            order by case when random() < 0.7 then sort else random() * 10 end limit 1;
          v_mods := v_mods || jsonb_build_object('modifier_id', md.id, 'group_id', g.id, 'name', md.name,
            'kitchen_label', coalesce(md.kitchen_label, md.name), 'price_delta', md.price_delta, 'qty', 1);
        else
          v_cnt := 0;
          for md in select * from public.modifiers where group_id = g.id and active order by sort loop
            if v_cnt < g.max_select and random() < 0.1 then
              v_mods := v_mods || jsonb_build_object('modifier_id', md.id, 'group_id', g.id, 'name', md.name,
                'kitchen_label', coalesce(md.kitchen_label, md.name), 'price_delta', md.price_delta, 'qty', 1);
              v_cnt := v_cnt + 1;
            end if;
          end loop;
        end if;
      end loop;
      v_item := gen_random_uuid();
      insert into public.order_items(id, restaurant_id, order_id, menu_item_id, name, kitchen_name, unit_price, qty, modifiers,
        notes, course, status, sent_at, send_id, created_at, created_by)
      values (v_item, r, v_order, mi.id, mi.name, mi.kitchen_name, mi.price, v_qty, v_mods,
        case when random() < 0.06 then pg_temp.pickt(array['Bien dorado', 'Sin sal', 'Tortillas calientes', 'Alergia a la nuez', 'Para compartir', 'Cubiertos extra']) end,
        1, 'enviado', t, v_send, t, v_server);
      for c in select * from app.expected_consumption(mi.id, v_qty, v_mods) loop
        perform app.add_movement(r, c.ingredient_id, 'consumo_venta', -c.qty_base, v_ctx, 'order_item', v_item, '', null,
          c.recipe_version_id, null, t);
      end loop;
      if n_items >= 2 and random() < 0.03 then v_voids := v_voids || v_item; end if;
    end loop;

    -- Tickets por estación
    for grp in select rt.station_id, s.name as station_name, max(mi2.prep_minutes) as target, sum(mi2.complexity * oi.qty)::int as points
               from public.order_items oi join public.menu_items mi2 on mi2.id = oi.menu_item_id
               join public.menu_item_routes rt on rt.menu_item_id = oi.menu_item_id
               join public.stations s on s.id = rt.station_id
               where oi.order_id = v_order group by rt.station_id, s.name loop
      v_cook := pg_temp.pick(array(select jsonb_array_elements_text(cooks->grp.station_name))::uuid[]);
      -- Ritmo: casi siempre dentro del objetivo; más lento en hora pico y algunos tickets muy tardados.
      t_start := t + make_interval(secs => grp.target * 60 * (0.05 + random() * 0.15) * rush);
      v_block := case when random() < 0.03 then 120 + floor(random() * 300)::int else 0 end;
      t_ready := t_start + make_interval(secs => grp.target * 60 * rush
        * case when random() < 0.05 then 1.2 + random() * 0.6 else 0.35 + random() * 0.45 end + v_block);
      t_deliv := t_ready + make_interval(secs => 30 + random() * 180);
      v_reopen := random() < 0.04;
      t_reopen := t_deliv + make_interval(secs => 60 + random() * 120);
      t_ready2 := t_reopen + make_interval(secs => 180 + random() * 180);
      t_deliv2 := t_ready2 + make_interval(secs => 30 + random() * 90);
      if v_reopen and t_deliv2 > now() then v_reopen := false; end if;
      if v_block > 0 and t_ready > now() then v_block := 0; end if;
      v_status := case when (case when v_reopen then t_deliv2 else t_deliv end) <= now() then 'entregado'
                       when t_ready <= now() then 'listo' when t_start <= now() then 'en_preparacion' else 'nuevo' end;
      insert into public.kitchen_tickets(restaurant_id, service_day_id, order_id, station_id, send_id, order_number, order_type,
        table_label, server_name, status, course, target_minutes, complexity_points, created_at, fired_at, started_at, ready_at,
        delivered_at, blocked_seconds, reopen_count, version, updated_at)
      select r, v_day.id, v_order, grp.station_id, v_send, o.number, o.order_type, o.table_label, v_server_name, v_status, 1,
        grp.target, grp.points, t, t,
        case when v_status <> 'nuevo' then t_start end,
        case when v_status in ('listo', 'entregado') then case when v_reopen then t_ready2 else t_ready end end,
        case when v_status = 'entregado' then case when v_reopen then t_deliv2 else t_deliv end end,
        v_block, case when v_reopen then 1 else 0 end, 1, greatest(t, least(now(), case when v_reopen then t_deliv2 else t_deliv end))
      from public.orders o where o.id = v_order
      returning id into v_ticket;
      insert into public.ticket_items(restaurant_id, ticket_id, order_item_id, component, display_name, qty, modifiers, notes, status, ready_at, sort)
      select r, v_ticket, oi.id, rt.component, coalesce(oi.kitchen_name, oi.name) || coalesce(' · ' || rt.component, ''), oi.qty,
        oi.modifiers, oi.notes,
        case when v_status in ('listo', 'entregado') then 'listo' else 'pendiente' end::public.ticket_item_status,
        case when v_status in ('listo', 'entregado') then case when v_reopen then t_ready2 else t_ready end end,
        row_number() over (order by oi.created_at, oi.id)
      from public.order_items oi join public.menu_item_routes rt on rt.menu_item_id = oi.menu_item_id and rt.station_id = grp.station_id
      where oi.order_id = v_order;
      insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, staff_id, authorized_by, op_id, at)
      values (r, v_ticket, 'crear', null, 'nuevo', v_server, v_server, v_send, t);
      if v_status <> 'nuevo' then
        insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, staff_id, authorized_by, at)
        values (r, v_ticket, 'iniciar', 'nuevo', 'en_preparacion', v_cook, v_cook, t_start);
      end if;
      if v_block > 0 then
        v_reason := pg_temp.pickt(array['Se acabó el aguacate', 'Falta tortilla de harina', 'Esperando carne descongelada', 'Sin queso Oaxaca']);
        insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, reason, staff_id, authorized_by, at)
        values (r, v_ticket, 'bloquear', 'en_preparacion', 'en_preparacion', v_reason, v_cook, v_cook, t_start + interval '1 minute'),
               (r, v_ticket, 'desbloquear', 'en_preparacion', 'en_preparacion', null, v_cook, v_cook, t_start + interval '1 minute' + make_interval(secs => v_block));
        insert into public.incidents(restaurant_id, kind, status, station_id, ticket_id, description, created_by, created_at,
          resolved_by, resolved_at, resolution, updated_at)
        values (r, 'faltante', 'resuelta', grp.station_id, v_ticket, 'Ticket #' || (v_number - 1) || ': ' || v_reason, v_cook,
          t_start + interval '1 minute', v_ana, t_start + interval '1 minute' + make_interval(secs => v_block), 'Se surtió de bodega',
          t_start + interval '1 minute' + make_interval(secs => v_block));
      end if;
      if v_status in ('listo', 'entregado') then
        insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, staff_id, authorized_by, at)
        values (r, v_ticket, 'listo', 'en_preparacion', 'listo', v_cook, v_cook, t_ready);
      end if;
      if v_status = 'entregado' or v_reopen then
        insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, staff_id, authorized_by, at)
        values (r, v_ticket, 'entregar', 'listo', 'entregado', v_server, v_server, t_deliv);
      end if;
      if v_reopen then
        v_reason := pg_temp.pickt(array['error_preparacion', 'cliente_devolvio', 'falto_producto', 'cambio_cliente']);
        insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, reason, note, staff_id, authorized_by, at)
        values (r, v_ticket, 'reabrir', 'entregado', 'en_preparacion', v_reason,
          pg_temp.pickt(array['Término equivocado', 'Le faltó la salsa', 'Llegó frío', 'Pidió sin cebolla']), v_cook, v_cook, t_reopen)
        returning id into v_ev;
        insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, staff_id, authorized_by, at)
        values (r, v_ticket, 'listo', 'en_preparacion', 'listo', v_cook, v_cook, t_ready2),
               (r, v_ticket, 'entregar', 'listo', 'entregado', v_server, v_server, t_deliv2);
        if v_reason = 'error_preparacion' then  -- se volvió a preparar: reproceso
          for ti in select distinct oi.id, oi.menu_item_id, oi.qty, oi.modifiers from public.ticket_items x
                    join public.order_items oi on oi.id = x.order_item_id where x.ticket_id = v_ticket loop
            for c in select * from app.expected_consumption(ti.menu_item_id, ti.qty, ti.modifiers) loop
              perform app.add_movement(r, c.ingredient_id, 'reproceso', -c.qty_base, jsonb_build_object('staff_id', v_cook),
                'ticket_event', v_ev, ti.id::text, null, c.recipe_version_id, 'Reproceso', t_reopen);
            end loop;
          end loop;
        end if;
      end if;
      v_last := greatest(v_last, case when v_reopen then t_deliv2 else t_deliv end);
    end loop;

    -- Anulaciones después de enviar (solo si el ticket conserva otros renglones)
    foreach v_vi in array v_voids loop
      if exists (select 1 from public.ticket_items x where x.order_item_id = v_vi and not exists (
            select 1 from public.ticket_items y where y.ticket_id = x.ticket_id and y.order_item_id <> v_vi)) then
        continue;
      end if;
      t_void := t + make_interval(secs => 90 + random() * 300);
      if t_void > now() then continue; end if;
      v_prep := random() < 0.4;
      v_reason := pg_temp.pickt(array['error_captura', 'cliente_cancelo', 'demora', 'cambio_cliente']);
      update public.order_items set status = 'anulado', voided_at = t_void, void_reason = v_reason::public.void_reason,
        void_note = case v_reason when 'demora' then 'Se tardó mucho' when 'cambio_cliente' then 'Cambió de platillo' end,
        voided_by = v_server, void_authorized_by = v_ana, void_was_prepared = v_prep where id = v_vi;
      update public.ticket_items set status = 'anulado', ready_at = null where order_item_id = v_vi;
      insert into public.ticket_events(restaurant_id, ticket_id, ticket_item_id, action, reason, note, staff_id, authorized_by, at)
      select r, x.ticket_id, x.id, 'renglon_anulado', v_reason, x.display_name, v_server, v_ana, t_void
      from public.ticket_items x where x.order_item_id = v_vi;
      for c in select * from public.inventory_movements where source_type = 'order_item' and source_id = v_vi and kind = 'consumo_venta' loop
        perform app.add_movement(r, c.ingredient_id, 'reverso_venta', -c.qty_base, jsonb_build_object('staff_id', v_server, 'authorized_by', v_ana),
          'order_item', v_vi, '', null, c.recipe_version_id, 'Anulación', t_void);
        if v_prep then
          perform app.add_movement(r, c.ingredient_id, 'merma', c.qty_base, jsonb_build_object('staff_id', v_server, 'authorized_by', v_ana),
            'order_item', v_vi, '', 'anulacion_preparada', c.recipe_version_id, 'Anulado después de preparar', t_void);
        end if;
      end loop;
    end loop;

    -- Cerrar la orden si ya se entregó todo
    if not exists (select 1 from public.kitchen_tickets where order_id = v_order and status not in ('entregado', 'anulado'))
       and (select max(delivered_at) from public.kitchen_tickets where order_id = v_order) + interval '20 minutes' < now() then
      update public.orders set status = 'cerrada', closed_by = v_server,
        closed_at = (select max(delivered_at) from public.kitchen_tickets where order_id = v_order) + make_interval(secs => 300 + random() * 1200)
      where id = v_order;
    end if;
    v_made := v_made + 1;
  end loop;

  update public.service_days set next_order_number = v_number,
    status = case when p_date = today then 'abierta' else 'cerrada' end::public.service_day_status,
    closed_at = case when p_date = today then null else v_last + interval '40 minutes' end,
    closed_by = case when p_date = today then null else v_ana end,
    close_note = case when p_date < today and status = 'abierta' then 'Cierre de jornada (datos de prueba)' else close_note end
  where id = v_day.id;
  return v_made;
end $$;

do $$
declare r uuid := pg_temp.rest(); today date := app.business_date(r); d date; n int; v_total int := 0;
begin
  perform setseed(0.314);
  if exists (select 1 from public.service_days where restaurant_id = r and business_date = today - 14) then
    raise notice 'La historia de los días -14 a -8 ya estaba cargada.'; return;
  end if;
  for d in select generate_series(today - 14, today - 8, interval '1 day')::date loop
    n := 34 + floor(random() * 14)::int + case extract(isodow from d) when 5 then 18 when 6 then 24 when 7 then 12 else 0 end;
    v_total := v_total + pg_temp.demo_day(d, n);
  end loop;
  raise notice 'Órdenes generadas (días -14 a -8): %', v_total;
end $$;

-- @@ 4. Historia: días -7 a -1  (requiere las utilidades de la sección 3 en la misma llamada)
do $$
declare r uuid := pg_temp.rest(); today date := app.business_date(r); d date; n int; v_total int := 0;
begin
  perform setseed(0.271);
  if exists (select 1 from public.service_days s where s.restaurant_id = r and s.business_date = today - 7
             and exists (select 1 from public.orders o where o.service_day_id = s.id)) then
    raise notice 'La historia de los días -7 a -1 ya estaba cargada.'; return;
  end if;
  for d in select generate_series(today - 7, today - 1, interval '1 day')::date loop
    n := 34 + floor(random() * 14)::int + case extract(isodow from d) when 5 then 18 when 6 then 24 when 7 then 12 else 0 end;
    v_total := v_total + pg_temp.demo_day(d, n);
  end loop;
  raise notice 'Órdenes generadas (días -7 a -1): %', v_total;
end $$;

-- @@ 5. Hoy: servicio en curso con tickets vivos en cocina (requiere las utilidades de la sección 3)
do $$
declare r uuid := pg_temp.rest(); today date := app.business_date(r); n int; v_t uuid; v_ana uuid; v_order uuid; v_day uuid;
  v_send uuid := gen_random_uuid(); mi1 public.menu_items; mi2 public.menu_items; v_server uuid; s1 uuid; s2 uuid;
begin
  perform setseed(0.577);
  if exists (select 1 from public.service_days s where s.restaurant_id = r and s.business_date = today
             and exists (select 1 from public.orders o where o.service_day_id = s.id and o.customer_name = 'Mesa larga (2 tiempos)')) then
    raise notice 'El servicio de hoy ya estaba cargado.'; return;
  end if;
  -- Si quedó abierta una jornada vieja, se cierra (igual que el cierre automático).
  update public.service_days set status = 'cerrada', closed_at = now(), close_note = 'Cierre automático por cambio de día de negocio'
  where restaurant_id = r and status = 'abierta' and business_date < today;
  n := 40 + floor(random() * 12)::int;
  perform pg_temp.demo_day(today, n, 14);
  select id into v_ana from public.staff where restaurant_id = r and display_name = 'Ana Ruiz';
  select id into v_day from public.service_days where restaurant_id = r and business_date = today;

  -- Un ticket con faltante (bloqueado ahora mismo) y uno con prioridad
  select id into v_t from public.kitchen_tickets where service_day_id = v_day and status = 'en_preparacion' order by fired_at limit 1;
  if v_t is not null then
    update public.kitchen_tickets set blocked = true, blocked_since = now() - interval '3 minutes', blocked_reason = 'Se acabó el aguacate',
      version = version + 1 where id = v_t;
    insert into public.ticket_events(restaurant_id, ticket_id, action, from_status, to_status, reason, staff_id, authorized_by, at)
    select r, v_t, 'bloquear', 'en_preparacion', 'en_preparacion', 'Se acabó el aguacate', s.id, s.id, now() - interval '3 minutes'
    from public.staff s where s.restaurant_id = r and s.display_name = 'Diego Torres';
    insert into public.incidents(restaurant_id, kind, station_id, ticket_id, description, created_by, created_at)
    select r, 'faltante', k.station_id, k.id, 'Ticket #' || k.order_number || ': Se acabó el aguacate — ¿quién va a la bodega?',
      (select id from public.staff where restaurant_id = r and display_name = 'Diego Torres'), now() - interval '3 minutes'
    from public.kitchen_tickets k where k.id = v_t;
  end if;
  select id into v_t from public.kitchen_tickets where service_day_id = v_day and status = 'nuevo' order by fired_at limit 1;
  if v_t is not null then
    update public.kitchen_tickets set priority = true, priority_by = v_ana, version = version + 1 where id = v_t;
    insert into public.ticket_events(restaurant_id, ticket_id, action, staff_id, authorized_by, at)
    values (r, v_t, 'prioridad', v_ana, v_ana, now() - interval '1 minute');
  end if;

  -- Mesa con dos tiempos: entradas ya en cocina, plato fuerte en espera de "marchar"
  select * into mi1 from public.menu_items where restaurant_id = r and name = 'Guacamole con totopos';
  select * into mi2 from public.menu_items where restaurant_id = r and name = 'Arrachera a la parrilla';
  select id into v_server from public.staff where restaurant_id = r and display_name = 'Elena Gómez';
  v_order := gen_random_uuid();
  insert into public.orders(id, restaurant_id, service_day_id, number, order_type, table_label, guest_count, customer_name, status,
    server_staff_id, created_at, created_by)
  select v_order, r, v_day, next_order_number, 'mesa', '12', 6, 'Mesa larga (2 tiempos)', 'abierta', v_server, now() - interval '6 minutes', v_server
  from public.service_days where id = v_day;
  update public.service_days set next_order_number = next_order_number + 1 where id = v_day;
  insert into public.order_items(id, restaurant_id, order_id, menu_item_id, name, kitchen_name, unit_price, qty, modifiers, course, status,
    sent_at, send_id, created_at, created_by, seat)
  values (gen_random_uuid(), r, v_order, mi1.id, mi1.name, mi1.kitchen_name, mi1.price, 2, '[]', 1, 'enviado', now() - interval '6 minutes', v_send, now() - interval '6 minutes', v_server, null);
  insert into public.order_items(id, restaurant_id, order_id, menu_item_id, name, kitchen_name, unit_price, qty, modifiers, course, status,
    sent_at, send_id, created_at, created_by)
  select gen_random_uuid(), r, v_order, mi2.id, mi2.name, mi2.kitchen_name, mi2.price, 3,
    jsonb_build_array(jsonb_build_object('modifier_id', m.id, 'group_id', m.group_id, 'name', m.name, 'kitchen_label', m.kitchen_label, 'price_delta', 0, 'qty', 1)),
    2, 'enviado', now() - interval '6 minutes', v_send, now() - interval '6 minutes', v_server
  from public.modifiers m join public.modifier_groups g on g.id = m.group_id
  where g.restaurant_id = r and g.name = 'Término' and m.name = 'Término medio';
  select id into s1 from public.stations where restaurant_id = r and name = 'Fríos';
  select id into s2 from public.stations where restaurant_id = r and name = 'Parrilla';
  insert into public.kitchen_tickets(restaurant_id, service_day_id, order_id, station_id, send_id, order_number, order_type, table_label,
    server_name, status, course, target_minutes, complexity_points, created_at, fired_at)
  select r, v_day, v_order, s1, app.uuid_v5_like(v_send, 1), o.number, 'mesa', '12', 'Elena Gómez', 'nuevo', 1, 5, 2, now() - interval '6 minutes', now() - interval '6 minutes'
  from public.orders o where o.id = v_order;
  insert into public.kitchen_tickets(restaurant_id, service_day_id, order_id, station_id, send_id, order_number, order_type, table_label,
    server_name, status, course, target_minutes, complexity_points, created_at, fired_at)
  select r, v_day, v_order, s, app.uuid_v5_like(v_send, 2), o.number, 'mesa', '12', 'Elena Gómez', 'en_espera', 2, 15, 9, now() - interval '6 minutes', null
  from public.orders o, unnest(array[s2, s1]) s where o.id = v_order;
  insert into public.ticket_items(restaurant_id, ticket_id, order_item_id, component, display_name, qty, modifiers, sort)
  select r, k.id, oi.id, rt.component, coalesce(oi.kitchen_name, oi.name) || coalesce(' · ' || rt.component, ''), oi.qty, oi.modifiers, 1
  from public.kitchen_tickets k join public.order_items oi on oi.order_id = k.order_id and oi.course = k.course
  join public.menu_item_routes rt on rt.menu_item_id = oi.menu_item_id and rt.station_id = k.station_id
  where k.order_id = v_order;
  insert into public.ticket_events(restaurant_id, ticket_id, action, to_status, staff_id, authorized_by, at)
  select r, k.id, 'crear', k.status, v_server, v_server, now() - interval '6 minutes' from public.kitchen_tickets k where k.order_id = v_order;

  -- 86: churros agotados hoy
  update public.menu_items set available = false, unavailable_reason = 'Se acabó la masa', unavailable_since = now() - interval '2 hours'
  where restaurant_id = r and name = 'Churros con cajeta';
  insert into public.availability_events(restaurant_id, menu_item_id, available, reason, staff_id, at)
  select r, id, false, 'Se acabó la masa', (select id from public.staff where restaurant_id = r and display_name = 'Iván Cruz'), now() - interval '2 hours'
  from public.menu_items where restaurant_id = r and name = 'Churros con cajeta';
  raise notice 'Servicio de hoy cargado.';
end $$;

-- @@ 6. Inventario: mermas, comida de personal, producción, recepciones, conteos y etiquetas
create or replace function pg_temp.rest() returns uuid language sql stable as $$
  select id from public.restaurants where name = 'David Prueba'
$$;
create or replace function pg_temp.ing(p text) returns uuid language sql stable as $$
  select id from public.ingredients where restaurant_id = pg_temp.rest() and name = p
$$;
create or replace function pg_temp.pickt(a text[]) returns text language sql volatile as $$
  select a[1 + floor(random() * cardinality(a))::int]
$$;
do $$
declare
  r uuid := pg_temp.rest(); tz text; today date; d date; i record; l record; v_batch uuid; v_rv public.recipe_versions;
  v_qty numeric; v_yield numeric; v_cook uuid; v_ana uuid; v_beto uuid; v_carla uuid; v_rec uuid; w date; v_need numeric;
  v_step numeric; v_n int; v_count uuid; v_theo numeric; v_counted numeric; v_rule public.shelf_life_rules; v_code text;
  t timestamptz; v_label uuid; v_tpl uuid; mi record; c record; v_src uuid; sup text; v_ref int := 1000; v_start timestamptz;
begin
  perform setseed(0.161);
  select timezone into tz from public.restaurants where id = r;
  today := app.business_date(r);
  if exists (select 1 from public.inventory_movements where restaurant_id = r and kind = 'inicial') then
    raise notice 'El inventario de prueba ya estaba cargado.'; return;
  end if;
  select id into v_ana from public.staff where restaurant_id = r and display_name = 'Ana Ruiz';
  select id into v_beto from public.staff where restaurant_id = r and display_name = 'Beto Salas';
  select id into v_carla from public.staff where restaurant_id = r and display_name = 'Carla Méndez';
  select id into v_tpl from public.label_templates where restaurant_id = r and is_default;
  v_start := ((today - 15) + time '08:00') at time zone tz;

  -- Mermas y comida de personal (diarias)
  for d in select generate_series(today - 14, today, interval '1 day')::date loop
    for i in select * from (values ('Jitomate', 'caducado', 400), ('Aguacate', 'caducado', 340), ('Cilantro', 'desperdicio', 80),
                                   ('Tortilla de maíz', 'quemado', 12), ('Papa', 'desperdicio', 500), ('Lechuga', 'caducado', 200),
                                   ('Pico de gallo', 'caducado', 300), ('Salsa verde', 'desperdicio', 250)) v(n, why, q)
             order by random() limit 2 loop
      t := (d + time '17:00' + make_interval(mins => floor(random() * 300)::int)) at time zone tz;
      if t > now() then continue; end if;
      perform app.add_movement(r, pg_temp.ing(i.n), 'merma', -round(i.q * (0.5 + random()))::numeric, jsonb_build_object('staff_id', v_carla),
        'manual', gen_random_uuid(), '', i.why::public.waste_reason, null,
        case i.why when 'caducado' then 'Revisión de cámara' when 'quemado' then 'Se quemaron en el comal' else null end, t);
    end loop;
    if random() < 0.5 then  -- "se cayó un plato"
      select * into mi from public.menu_items where restaurant_id = r and name in ('Tacos al pastor (3)', 'Hamburguesa de la casa', 'Enchiladas verdes') order by random() limit 1;
      t := (d + time '14:20' + make_interval(mins => floor(random() * 400)::int)) at time zone tz;
      if t < now() then
        v_src := gen_random_uuid();
        for c in select * from app.expected_consumption(mi.id, 1, '[]') loop
          perform app.add_movement(r, c.ingredient_id, 'merma', -c.qty_base, jsonb_build_object('staff_id', v_beto), 'manual', v_src,
            mi.id::text, 'caida', c.recipe_version_id, 'Se cayó un plato', t);
        end loop;
      end if;
    end if;
    t := (d + time '16:30') at time zone tz;
    if t < now() then
      v_src := gen_random_uuid();
      for i in select * from (values ('Tortilla de maíz', 30), ('Frijoles charros', 600), ('Arroz', 300), ('Pechuga de pollo', 500)) v(n, q) loop
        perform app.add_movement(r, pg_temp.ing(i.n), 'consumo_interno', -i.q, jsonb_build_object('staff_id', v_ana), 'manual', v_src, '', null, null,
          'Comida del personal', t);
      end loop;
    end if;
  end loop;

  -- Existencia inicial de preparados y producción diaria (repone lo que se usará ese día hasta el nivel de referencia)
  for i in select * from public.ingredients where restaurant_id = r and kind = 'preparado' and name in
           ('Pico de gallo', 'Salsa verde', 'Frijoles charros', 'Agua de horchata (preparada)', 'Agua de jamaica (preparada)', 'Flan (porción)') loop
    perform app.add_movement(r, i.id, 'inicial', i.par_level, jsonb_build_object('staff_id', v_ana), 'inicial', i.id, '', null, null,
      'Existencia inicial (prueba)', v_start);
    select rv.* into v_rv from public.recipes rc join public.recipe_versions rv on rv.recipe_id = rc.id and rv.status = 'activa'
      where rc.output_ingredient_id = i.id;
    v_yield := app.to_base_qty(i.id, v_rv.yield_qty, v_rv.yield_unit);
    v_step := case i.base_unit when 'pza' then 8 when 'ml' then 1000 else 500 end;
    for d in select generate_series(today - 14, today, interval '1 day')::date loop
      t := (d + time '10:30') at time zone tz;
      exit when t > now();
      select coalesce(-sum(qty_base), 0) into v_need from public.inventory_movements
      where ingredient_id = i.id and qty_base < 0 and effective_at >= ((d + time '05:00') at time zone tz)
        and effective_at < ((d + 1 + time '05:00') at time zone tz);
      v_qty := ceil((v_need + i.par_level * 0.8 - app.theoretical_at(i.id, t)) / v_step) * v_step;
      continue when v_qty <= 0;
      v_cook := case when random() < 0.5 then v_carla else (select id from public.staff where restaurant_id = r and display_name = 'Diego Torres') end;
      insert into public.production_batches(restaurant_id, ingredient_id, recipe_version_id, qty_base, produced_at, staff_id, note)
      values (r, i.id, v_rv.id, v_qty, t, v_cook, 'Tanda del día') returning id into v_batch;
      perform app.add_movement(r, i.id, 'produccion_entrada', v_qty, jsonb_build_object('staff_id', v_cook), 'produccion', v_batch, '', null, v_rv.id, 'Tanda del día', t);
      for l in select ingredient_id, sum(base_qty) as q from public.recipe_lines where version_id = v_rv.id group by ingredient_id loop
        perform app.add_movement(r, l.ingredient_id, 'produccion_consumo', -(l.q * v_qty / v_yield), jsonb_build_object('staff_id', v_cook),
          'produccion', v_batch, '', null, v_rv.id, i.name, t);
      end loop;
      -- Etiqueta de la tanda
      select * into v_rule from public.shelf_life_rules where restaurant_id = r and ingredient_id = i.id and active;
      insert into app.label_counters(restaurant_id, business_date, last) values (r, d, 1)
      on conflict (restaurant_id, business_date) do update set last = app.label_counters.last + 1 returning last into v_n;
      v_code := to_char(d, 'YYMMDD') || '-' || lpad(v_n::text, 3, '0');
      insert into public.label_prints(restaurant_id, template_id, ingredient_id, production_batch_id, shelf_life_rule_id, product_name,
        batch_code, prepared_at, expires_at, expiry_source, storage, quantity_text, allergens, responsible_staff, responsible_name, copies,
        status, printed_by, created_at, confirmed_at)
      select r, v_tpl, i.id, v_batch, v_rule.id, i.name, v_code, t, t + make_interval(hours => coalesce(v_rule.duration_hours, 24)::int),
        case when v_rule.id is null then 'manual' else 'regla' end, 'refrigerado',
        round(v_qty / case i.base_unit when 'pza' then 1 else 1000 end, 1)::text || case i.base_unit when 'g' then ' kg' when 'ml' then ' l' else ' pza' end,
        i.allergens, v_cook, s.display_name, 1, 'impresa', v_cook, t, t + interval '1 minute'
      from public.staff s where s.id = v_cook returning id into v_label;
    end loop;
  end loop;
  -- Una impresión fallida con su reimpresión, y una anulada por error de datos
  select id into v_label from public.label_prints where restaurant_id = r order by created_at desc offset 3 limit 1;
  update public.label_prints set status = 'fallida' where id = v_label;
  insert into public.incidents(restaurant_id, kind, status, description, created_by, created_at, resolved_by, resolved_at, resolution, updated_at)
  select r, 'impresora', 'resuelta', 'Falló la impresión de la etiqueta ' || batch_code || ' (' || product_name || '): sin papel',
    printed_by, created_at, v_ana, created_at + interval '10 minutes', 'Se cambió el rollo', created_at + interval '10 minutes'
  from public.label_prints where id = v_label;
  insert into public.label_prints(restaurant_id, template_id, ingredient_id, production_batch_id, shelf_life_rule_id, product_name, batch_code,
    prepared_at, expires_at, expiry_source, storage, quantity_text, allergens, responsible_staff, responsible_name, copies, status, printed_by,
    created_at, confirmed_at, reprint_of, reprint_reason)
  select restaurant_id, template_id, ingredient_id, production_batch_id, shelf_life_rule_id, product_name, batch_code, prepared_at, expires_at,
    expiry_source, storage, quantity_text, allergens, responsible_staff, responsible_name, copies, 'impresa', printed_by,
    created_at + interval '12 minutes', created_at + interval '13 minutes', id, 'Falló la impresora (sin papel)'
  from public.label_prints where id = v_label;
  update public.label_prints set status = 'anulada', void_reason = 'Fecha de preparación equivocada', voided_by = v_ana, voided_at = created_at + interval '30 minutes'
  where id = (select id from public.label_prints where restaurant_id = r and status = 'impresa' order by created_at desc offset 8 limit 1);

  -- Existencia inicial y recepciones de compras cada 3 días: se pide lo que se usará en los
  -- próximos 3 días hasta quedar en el nivel de referencia (aguacate y manchego, cortos a propósito).
  for i in select * from public.ingredients where restaurant_id = r and kind = 'compra' and name not like 'QA %' loop
    perform app.add_movement(r, i.id, 'inicial', coalesce(i.par_level, 1000), jsonb_build_object('staff_id', v_ana), 'inicial', i.id, '', null, null,
      'Existencia inicial (prueba)', v_start);
  end loop;
  for w in select generate_series(today - 14, today, interval '3 days')::date loop
    t := (w + time '09:30') at time zone tz;
    exit when t > now();
    for sup in select distinct category from public.ingredients where restaurant_id = r and kind = 'compra' and name not like 'QA %' loop
      v_ref := v_ref + 1;
      insert into public.receptions(restaurant_id, supplier, reference, received_at, staff_id, note, created_at)
      values (r, case sup when 'Carnes' then 'Carnicería El Corral (prueba)' when 'Verduras' then 'Frutas y Verduras La Huerta (prueba)'
                         when 'Tortillería' then 'Tortillería La Esperanza (prueba)' when 'Lácteos' then 'Lácteos San Juan (prueba)'
                         when 'Bebidas' then 'Distribuidora de Bebidas (prueba)' else 'Abarrotes Central (prueba)' end,
              'F-' || v_ref, t, v_beto, null, t)
      returning id into v_rec;
      v_n := 0;
      for i in select * from public.ingredients where restaurant_id = r and kind = 'compra' and category = sup and name not like 'QA %' loop
        select coalesce(-sum(qty_base), 0) into v_need from public.inventory_movements
        where ingredient_id = i.id and qty_base < 0 and effective_at >= t and effective_at < t + interval '3 days';
        v_step := case i.base_unit when 'pza' then case when i.name like 'Tortilla%' then 100 when i.name like '%355%' then 24 else 10 end
                                   when 'ml' then 1000 else case when i.par_level <= 500 then 100 else 500 end end;
        v_qty := ceil((v_need * (case when i.name in ('Aguacate', 'Queso manchego') and w > today - 3 then 0.5 else 1.0 + random() * 0.1 end)
                       + coalesce(i.par_level, 0) - app.theoretical_at(i.id, t)) / v_step) * v_step;
        continue when v_qty <= 0;
        v_n := v_n + 1;
        perform app.add_movement(r, i.id, 'recepcion', v_qty, jsonb_build_object('staff_id', v_beto), 'recepcion', v_rec, v_n::text, null, null,
          (select supplier from public.receptions where id = v_rec), t);
      end loop;
    end loop;
  end loop;

  -- Conteos físicos: dos aprobados (con diferencias) y uno en curso
  for i in select * from (values ('Conteo semanal de carnes', 'Carnes', today - 7, v_beto, v_ana),
                                 ('Conteo de verduras y preparados', 'Verduras', today - 2, v_carla, v_ana)) v(nm, cat, d, by_, appr) loop
    t := (i.d + time '23:30') at time zone tz;
    insert into public.inventory_counts(restaurant_id, name, status, as_of, category, created_by, created_at, submitted_by, submitted_at,
      approved_by, approved_at)
    values (r, i.nm, 'aprobado', t, i.cat, i.by_, t, i.by_, t + interval '40 minutes', i.appr, t + interval '10 hours') returning id into v_count;
    for l in select * from public.ingredients where restaurant_id = r and name not like 'QA %'
             and (category = i.cat or (i.cat = 'Verduras' and category = 'Preparados')) loop
      v_theo := app.theoretical_at(l.id, t);
      v_counted := greatest(0, round(v_theo * (0.93 + random() * 0.09)));
      insert into public.inventory_count_lines(restaurant_id, count_id, ingredient_id, counted_qty, unit, counted_base, theoretical_base,
        variance_base, counted_by, counted_at)
      values (r, v_count, l.id, v_counted, l.base_unit, v_counted, v_theo, v_counted - v_theo, i.by_, t + interval '20 minutes');
      if v_counted - v_theo <> 0 then
        perform app.add_movement(r, l.id, 'ajuste_conteo', v_counted - v_theo, jsonb_build_object('staff_id', i.appr, 'authorized_by', i.appr),
          'conteo', v_count, '', null, null, i.nm, t);
      end if;
    end loop;
  end loop;
  insert into public.inventory_counts(restaurant_id, name, status, as_of, category, created_by, created_at)
  values (r, 'Conteo de lácteos (en curso)', 'abierto', now() - interval '30 minutes', 'Lácteos', v_carla, now() - interval '30 minutes')
  returning id into v_count;
  insert into public.inventory_count_lines(restaurant_id, count_id, ingredient_id, counted_qty, unit, counted_base, counted_by, counted_at)
  select r, v_count, id, round(greatest(0, app.theoretical_at(id, now())) * 0.97 / 1000, 1), case base_unit when 'g' then 'kg' else 'l' end,
    round(greatest(0, app.theoretical_at(id, now())) * 0.97 / 1000, 1) * 1000, v_carla, now() - interval '20 minutes'
  from public.ingredients where restaurant_id = r and name in ('Queso Oaxaca', 'Crema');
  raise notice 'Inventario de prueba cargado.';
end $$;

-- @@ 7. Horarios, asistencia, solicitudes e incidencias
create or replace function pg_temp.rest() returns uuid language sql stable as $$
  select id from public.restaurants where name = 'David Prueba'
$$;
do $$
declare
  r uuid := pg_temp.rest(); tz text; today date; wk date; d date; s record; st record; v_shift uuid; t_in timestamptz; t_out timestamptz;
  v_ana uuid; v_open uuid; v_punch uuid; x record; v_status public.shift_status;
begin
  perform setseed(0.618);
  select timezone into tz from public.restaurants where id = r;
  today := app.business_date(r);
  if exists (select 1 from public.shifts sh join public.staff p on p.id = sh.staff_id where sh.restaurant_id = r and p.display_name = 'Ana Ruiz') then
    raise notice 'Los horarios de prueba ya estaban cargados.'; return;
  end if;
  select id into v_ana from public.staff where restaurant_id = r and display_name = 'Ana Ruiz';
  wk := date_trunc('week', today)::date;  -- lunes de esta semana

  -- Plantilla semanal: [persona, rol, estación, inicio, horas, días de descanso (ISO: 1=lunes)]
  for s in select * from (values
      ('Ana Ruiz', 'gerente', null, '12:00'::time, 9, array[1, 2]),
      ('Beto Salas', 'cocinero', 'Parrilla', '12:00'::time, 8, array[1, 2]),
      ('Carla Méndez', 'cocinero', 'Comal', '12:00'::time, 8, array[3, 4]),
      ('Diego Torres', 'cocinero', 'Comal', '16:00'::time, 8, array[7, 1]),
      ('Iván Cruz', 'cocinero', 'Parrilla', '16:00'::time, 8, array[4, 5]),
      ('Hugo Ramos', 'cocinero', 'Barra', '13:00'::time, 8, array[2]),
      ('Elena Gómez', 'mesero', null, '12:00'::time, 8, array[1]),
      ('Fer Ortiz', 'mesero', null, '16:00'::time, 8, array[3]),
      ('Gaby Luna', 'mesero', null, '13:00'::time, 9, array[7])) v(n, rl, stn, h, hrs, off) loop
    select * into st from public.staff where restaurant_id = r and display_name = s.n;
    for d in select generate_series(wk - 14, wk + 13, interval '1 day')::date loop
      continue when extract(isodow from d)::int = any (s.off);
      v_status := case when d < wk + 7 then 'publicado' else 'borrador' end;
      insert into public.shifts(restaurant_id, staff_id, role, station_id, starts_at, ends_at, break_minutes, status, published_at, created_by, created_at)
      values (r, st.id, s.rl::public.app_role, (select id from public.stations where restaurant_id = r and name = s.stn),
        (d + s.h) at time zone tz, (d + s.h + make_interval(hours => s.hrs)) at time zone tz, 30, v_status,
        case when v_status = 'publicado' then ((wk - 21) + time '18:00') at time zone tz end, v_ana, ((wk - 21) + time '18:00') at time zone tz)
      returning id into v_shift;
      -- Marcas de asistencia de lo que ya pasó
      t_in := (d + s.h) at time zone tz + make_interval(mins => floor(random() * 20)::int - 8);
      t_out := (d + s.h + make_interval(hours => s.hrs)) at time zone tz + make_interval(mins => floor(random() * 25)::int - 5);
      continue when t_in > now() or d < today - 14;
      insert into public.time_punches(restaurant_id, staff_id, kind, at, recorded_at, source, shift_id, offline)
      values (r, st.id, 'entrada', t_in, t_in, 'kiosko', v_shift, random() < 0.03);
      if t_in + interval '4 hours' < now() and random() < 0.75 then
        insert into public.time_punches(restaurant_id, staff_id, kind, at, recorded_at, source, shift_id)
        values (r, st.id, 'inicio_descanso', t_in + interval '4 hours', t_in + interval '4 hours', 'kiosko', v_shift),
               (r, st.id, 'fin_descanso', t_in + interval '4 hours' + make_interval(mins => 25 + floor(random() * 15)::int),
                t_in + interval '4 hours 30 minutes', 'kiosko', v_shift);
      end if;
      if t_out < now() and not (s.n = 'Diego Torres' and d = today - 3) then  -- Diego olvidó checar salida hace 3 días
        insert into public.time_punches(restaurant_id, staff_id, kind, at, recorded_at, source, shift_id)
        values (r, st.id, 'salida', t_out, t_out, 'kiosko', v_shift);
      end if;
    end loop;
  end loop;
  -- Turno abierto (sin asignar) para cubrir el sábado de la próxima semana
  insert into public.shifts(restaurant_id, staff_id, role, station_id, starts_at, ends_at, break_minutes, status, notes, created_by)
  values (r, null, 'cocinero', (select id from public.stations where restaurant_id = r and name = 'Freidora'),
    ((wk + 12) + time '18:00') at time zone tz, ((wk + 12) + time '23:59') at time zone tz, 0, 'borrador', 'Refuerzo para evento', v_ana);

  -- Corrección pendiente: Diego pide registrar su salida olvidada
  insert into public.punch_corrections(restaurant_id, staff_id, action, kind, requested_at, reason, requested_by)
  select r, id, 'agregar', 'salida', ((today - 3) + time '23:58') at time zone tz, 'Olvidé checar salida, salí a las 11:58 pm', id
  from public.staff where restaurant_id = r and display_name = 'Diego Torres';

  -- Ausencias y cambios de turno
  insert into public.time_off_requests(restaurant_id, staff_id, starts_at, ends_at, reason, status, decided_by, decided_at, decision_note, created_at)
  select r, p.id, (v.d + time '00:00') at time zone tz, (v.d + v.days + time '00:00') at time zone tz, v.why, v.stt::public.request_status,
    case when v.stt <> 'pendiente' then v_ana end, case when v.stt <> 'pendiente' then now() - interval '3 days' end, v.note, now() - interval '5 days'
  from (values ('Carla Méndez', wk + 11, 1, 'Cita médica', 'pendiente', null),
               ('Fer Ortiz', wk - 6, 2, 'Viaje familiar', 'aprobada', 'Cubre Gaby'),
               ('Gaby Luna', wk + 5, 1, 'Boda de mi prima', 'rechazada', 'Ese día hay evento; cambiémoslo')) v(n, d, days, why, stt, note)
  join public.staff p on p.restaurant_id = r and p.display_name = v.n;
  insert into public.shift_swap_requests(restaurant_id, shift_id, from_staff, to_staff, status, note, created_at, accepted_at)
  select r, sh.id, sh.staff_id, case when v.acc then (select id from public.staff where restaurant_id = r and display_name = v.to_) end,
    case when v.acc then 'aceptada' else 'pendiente' end::public.swap_status, v.note, now() - interval '1 day',
    case when v.acc then now() - interval '12 hours' end
  from (values ('Elena Gómez', null, false, '¿Alguien me cubre? Tengo examen'), ('Hugo Ramos', 'Iván Cruz', true, 'Cambio por el jueves')) v(n, to_, acc, note)
  join public.staff p on p.restaurant_id = r and p.display_name = v.n
  join lateral (select * from public.shifts where staff_id = p.id and status = 'publicado' and starts_at > now() order by starts_at limit 1) sh on true;

  -- Incidencias varias
  insert into public.incidents(restaurant_id, kind, status, station_id, description, created_by, created_at, attended_by, resolved_by, resolved_at, resolution, updated_at)
  select r, v.k::public.incident_kind, v.stt::public.incident_status, (select id from public.stations where restaurant_id = r and name = v.stn), v.descr,
    (select id from public.staff where restaurant_id = r and display_name = v.who), now() - v.ago,
    case when v.stt <> 'abierta' then v_ana end, case when v.stt = 'resuelta' then v_ana end,
    case when v.stt = 'resuelta' then now() - v.ago + interval '2 hours' end, case when v.stt = 'resuelta' then v.res end, now() - v.ago
  from (values ('equipo', 'resuelta', 'Freidora', 'La freidora tarda mucho en calentar', 'Iván Cruz', interval '9 days', 'Se cambió el termostato'),
               ('calidad', 'resuelta', 'Comal', 'Tortillas de harina llegaron rotas', 'Carla Méndez', interval '5 days', 'Proveedor repuso el paquete'),
               ('equipo', 'en_atencion', 'Parrilla', 'Una perilla de la parrilla está floja', 'Beto Salas', interval '1 day', null),
               ('otro', 'abierta', 'Barra', 'Falta hielo para la noche', 'Hugo Ramos', interval '40 minutes', null)) v(k, stt, stn, descr, who, ago, res);
  raise notice 'Horarios y asistencia de prueba cargados.';
end $$;
