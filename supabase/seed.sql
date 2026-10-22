-- =====================================================================
-- PrepIQ · SEMILLA DE DEMOSTRACIÓN — DATOS 100% FICTICIOS
-- ---------------------------------------------------------------------
-- * Solo para entorno local / staging (`supabase db reset`). Supabase NO
--   ejecuta este archivo con `supabase db push` en producción.
-- * Las contraseñas y PIN de aquí son públicos: NUNCA usarlos en producción.
-- * Las reglas de vida útil de esta semilla son EJEMPLOS sin validación
--   sanitaria. Cada restaurante debe configurar y validar las suyas.
-- Cuentas (contraseña para todas: demo-prepiq-2026):
--   ana@demo.prepiq.test     administradora (PIN 1111)
--   beto@demo.prepiq.test    gerente        (PIN 2222)
--   carla@demo.prepiq.test   cocinera       (PIN 3333)
--   elena@demo.prepiq.test   mesera         (PIN 5555)
--   Diego (cocinero, PIN 4444) y Fer (mesero, PIN 6666) no tienen cuenta:
--   operan solo con PIN en dispositivos compartidos.
--   Dispositivos: kds-parrilla@, kds-comal@, pase@, meseros@, reloj@ (mismo dominio).
-- =====================================================================

create or replace function pg_temp.demo_user(p_id uuid, p_email text, p_name text) returns uuid
language plpgsql as $$
begin
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
    created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('demo-prepiq-2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', p_name), '', '', '', '', now(), now())
  on conflict (id) do nothing;
  insert into auth.identities(id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id, p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now())
  on conflict do nothing;
  return p_id;
end $$;

do $$
declare
  -- Usuarios
  u_ana   uuid := pg_temp.demo_user('10000000-0000-4000-8000-000000000001', 'ana@demo.prepiq.test', 'Ana');
  u_beto  uuid := pg_temp.demo_user('10000000-0000-4000-8000-000000000002', 'beto@demo.prepiq.test', 'Beto');
  u_carla uuid := pg_temp.demo_user('10000000-0000-4000-8000-000000000003', 'carla@demo.prepiq.test', 'Carla');
  u_elena uuid := pg_temp.demo_user('10000000-0000-4000-8000-000000000005', 'elena@demo.prepiq.test', 'Elena');
  u_kds1  uuid := pg_temp.demo_user('20000000-0000-4000-8000-000000000001', 'kds-parrilla@demo.prepiq.test', 'KDS Parrilla');
  u_kds2  uuid := pg_temp.demo_user('20000000-0000-4000-8000-000000000002', 'kds-comal@demo.prepiq.test', 'KDS Comal');
  u_pase  uuid := pg_temp.demo_user('20000000-0000-4000-8000-000000000003', 'pase@demo.prepiq.test', 'Pase');
  u_pos   uuid := pg_temp.demo_user('20000000-0000-4000-8000-000000000004', 'meseros@demo.prepiq.test', 'Terminal meseros');
  u_reloj uuid := pg_temp.demo_user('20000000-0000-4000-8000-000000000005', 'reloj@demo.prepiq.test', 'Reloj');
  r uuid; org uuid; v jsonb;
  s_parrilla uuid; s_comal uuid; s_freidora uuid; s_barra uuid; s_pase uuid;
  st_ana uuid; st_beto uuid; st_carla uuid; st_diego uuid; st_elena uuid; st_fer uuid;
  c_tacos uuid; c_platos uuid; c_bebidas uuid; c_extras uuid;
  mi_pastor uuid; mi_asada uuid; mi_quesa uuid; mi_burger uuid; mi_papas uuid; mi_horchata uuid; mi_refresco uuid;
  g_tortilla uuid; g_extras uuid; g_sin uuid; g_termino uuid;
  m_maiz uuid; m_harina uuid; m_queso uuid; m_aguacate uuid; m_sincebolla uuid; m_sincilantro uuid;
  i_tmaiz uuid; i_tharina uuid; i_pastor uuid; i_arrachera uuid; i_queso uuid; i_cebolla uuid; i_cilantro uuid;
  i_jitomate uuid; i_serrano uuid; i_limon uuid; i_pico uuid; i_aguacate uuid; i_papa uuid; i_aceite uuid;
  i_pan uuid; i_carne uuid; i_horchata uuid; i_arroz uuid; i_azucar uuid; i_canela uuid; i_refresco uuid;
  rec uuid; ver uuid; wk timestamptz; d int;
begin
  -- Contexto de "Ana" para que las RPC registren actor.
  -- Ambas variables: auth.uid() de Supabase lee claim.sub (antiguo) o claims (actual).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_ana, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_ana::text, true);
  v := public.rpc_create_restaurant('Grupo Demo (ficticio)', 'Taquería Demo', 'Ana', 'America/Mexico_City', 'MXN');
  r := (v->>'restaurant_id')::uuid; org := (v->>'organization_id')::uuid; st_ana := (v->>'staff_id')::uuid;
  update public.restaurants set is_demo = true, settings = jsonb_build_object(
    'auto_open_service_day', true,
    'allow_personal_punch', false,
    'team_on_time_goal_pct', 85,
    'kds_warn_pct', 75,             -- aviso al 75 % del tiempo objetivo
    'kds_late_pct', 100,            -- tarde al 100 %
    'labels', jsonb_build_object('nuevo', 'Nuevo', 'en_preparacion', 'En preparación', 'listo', 'Listo / en pase',
                                 'entregado', 'Entregado', 'bump', 'Listo', 'deliver', 'Entregar')
  ) where id = r;
  perform set_config('app.internal_staff_write', 'on', true);

  -- Estaciones
  insert into public.stations(restaurant_id, name, kind, color, sort) values (r, 'Parrilla', 'cocina', '#dc2626', 1) returning id into s_parrilla;
  insert into public.stations(restaurant_id, name, kind, color, sort) values (r, 'Comal', 'cocina', '#ea580c', 2) returning id into s_comal;
  insert into public.stations(restaurant_id, name, kind, color, sort) values (r, 'Freidora', 'cocina', '#ca8a04', 3) returning id into s_freidora;
  insert into public.stations(restaurant_id, name, kind, color, sort) values (r, 'Barra', 'barra', '#2563eb', 4) returning id into s_barra;
  insert into public.stations(restaurant_id, name, kind, color, sort) values (r, 'Pase', 'pase', '#16a34a', 5) returning id into s_pase;

  -- Personas
  insert into public.staff(restaurant_id, user_id, display_name, roles, employee_code, color)
    values (r, u_beto, 'Beto', '{gerente}', '102', '#7c3aed') returning id into st_beto;
  insert into public.staff(restaurant_id, user_id, display_name, roles, employee_code, color)
    values (r, u_carla, 'Carla', '{cocinero}', '103', '#db2777') returning id into st_carla;
  insert into public.staff(restaurant_id, display_name, roles, employee_code, color)
    values (r, 'Diego', '{cocinero}', '104', '#0891b2') returning id into st_diego;
  insert into public.staff(restaurant_id, user_id, display_name, roles, employee_code, color)
    values (r, u_elena, 'Elena', '{mesero}', '105', '#059669') returning id into st_elena;
  insert into public.staff(restaurant_id, display_name, roles, employee_code, color)
    values (r, 'Fer', '{mesero,cocinero}', '106', '#4f46e5') returning id into st_fer;
  update public.staff set employee_code = '101', color = '#0f172a' where id = st_ana;
  perform public.rpc_staff_set_pin(r, st_ana, '1111');
  perform public.rpc_staff_set_pin(r, st_beto, '2222');
  perform public.rpc_staff_set_pin(r, st_carla, '3333');
  perform public.rpc_staff_set_pin(r, st_diego, '4444');
  perform public.rpc_staff_set_pin(r, st_elena, '5555');
  perform public.rpc_staff_set_pin(r, st_fer, '6666');

  -- Dispositivos
  insert into public.devices(restaurant_id, user_id, name, mode, station_id) values
    (r, u_kds1, 'Tableta Parrilla', 'kds', s_parrilla),
    (r, u_kds2, 'Tableta Comal', 'kds', s_comal),
    (r, u_pase, 'Pantalla Pase', 'expo', null),
    (r, u_pos, 'Terminal Meseros', 'pos', null),
    (r, u_reloj, 'Reloj Checador', 'kiosko', null);

  -- Menú
  insert into public.menu_categories(restaurant_id, name, sort) values (r, 'Tacos', 1) returning id into c_tacos;
  insert into public.menu_categories(restaurant_id, name, sort) values (r, 'Platos', 2) returning id into c_platos;
  insert into public.menu_categories(restaurant_id, name, sort) values (r, 'Bebidas', 3) returning id into c_bebidas;
  insert into public.menu_categories(restaurant_id, name, sort) values (r, 'Acompañantes', 4) returning id into c_extras;

  insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, sort)
    values (r, c_tacos, 'Orden de tacos al pastor (3)', 'Pastor (3)', 75, 6, 1, 1) returning id into mi_pastor;
  insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, sort)
    values (r, c_tacos, 'Orden de tacos de arrachera (3)', 'Arrachera (3)', 95, 9, 2, 2) returning id into mi_asada;
  insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, sort, allergens)
    values (r, c_tacos, 'Quesadilla', 'Quesadilla', 55, 5, 1, 3, '{lácteos,gluten}') returning id into mi_quesa;
  insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, sort, allergens)
    values (r, c_platos, 'Hamburguesa de la casa', 'Hamburguesa', 145, 12, 3, 1, '{gluten,lácteos}') returning id into mi_burger;
  insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, sort)
    values (r, c_extras, 'Papas fritas', 'Papas', 45, 6, 1, 1) returning id into mi_papas;
  insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, sort)
    values (r, c_bebidas, 'Agua de horchata', 'Horchata', 35, 2, 1, 1) returning id into mi_horchata;
  insert into public.menu_items(restaurant_id, category_id, name, kitchen_name, price, prep_minutes, complexity, sort)
    values (r, c_bebidas, 'Refresco', 'Refresco', 30, 1, 1, 2) returning id into mi_refresco;

  insert into public.menu_item_routes(restaurant_id, menu_item_id, station_id, component) values
    (r, mi_pastor, s_comal, null), (r, mi_asada, s_parrilla, null), (r, mi_quesa, s_comal, null),
    (r, mi_burger, s_parrilla, null), (r, mi_burger, s_freidora, 'papas'),
    (r, mi_papas, s_freidora, null), (r, mi_horchata, s_barra, null), (r, mi_refresco, s_barra, null);

  insert into public.modifier_groups(restaurant_id, name, min_select, max_select, sort) values (r, 'Tortilla', 1, 1, 1) returning id into g_tortilla;
  insert into public.modifier_groups(restaurant_id, name, min_select, max_select, sort) values (r, 'Extras', 0, 3, 2) returning id into g_extras;
  insert into public.modifier_groups(restaurant_id, name, min_select, max_select, sort) values (r, 'Sin', 0, 3, 3) returning id into g_sin;
  insert into public.modifier_groups(restaurant_id, name, min_select, max_select, sort) values (r, 'Término', 1, 1, 4) returning id into g_termino;
  insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, price_delta, sort) values (r, g_tortilla, 'Maíz', 'MAÍZ', 0, 1) returning id into m_maiz;
  insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, price_delta, sort) values (r, g_tortilla, 'Harina', 'HARINA', 5, 2) returning id into m_harina;
  insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, price_delta, sort) values (r, g_extras, 'Queso extra', '+QUESO', 15, 1) returning id into m_queso;
  insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, price_delta, sort) values (r, g_extras, 'Aguacate', '+AGUACATE', 20, 2) returning id into m_aguacate;
  insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, price_delta, sort) values (r, g_sin, 'Sin cebolla', 'SIN CEBOLLA', 0, 1) returning id into m_sincebolla;
  insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, price_delta, sort) values (r, g_sin, 'Sin cilantro', 'SIN CILANTRO', 0, 2) returning id into m_sincilantro;
  insert into public.modifiers(restaurant_id, group_id, name, kitchen_label, sort) values
    (r, g_termino, 'Término medio', 'TÉRMINO MEDIO', 1), (r, g_termino, 'Tres cuartos', '3/4', 2), (r, g_termino, 'Bien cocida', 'BIEN COCIDA', 3);
  insert into public.menu_item_modifier_groups(restaurant_id, menu_item_id, group_id, sort) values
    (r, mi_pastor, g_tortilla, 1), (r, mi_pastor, g_extras, 2), (r, mi_pastor, g_sin, 3),
    (r, mi_asada, g_tortilla, 1), (r, mi_asada, g_extras, 2), (r, mi_asada, g_sin, 3),
    (r, mi_quesa, g_tortilla, 1), (r, mi_quesa, g_extras, 2),
    (r, mi_burger, g_termino, 1), (r, mi_burger, g_extras, 2), (r, mi_burger, g_sin, 3);

  -- Insumos (costos ficticios por unidad base)
  insert into public.ingredients(restaurant_id, name, category, base_unit, par_level) values (r, 'Tortilla de maíz', 'Tortillería', 'pza', 300) returning id into i_tmaiz;
  insert into public.ingredients(restaurant_id, name, category, base_unit, par_level, allergens) values (r, 'Tortilla de harina', 'Tortillería', 'pza', 100, '{gluten}') returning id into i_tharina;
  insert into public.ingredients(restaurant_id, name, category, base_unit, par_level) values (r, 'Carne al pastor', 'Carnes', 'g', 5000) returning id into i_pastor;
  insert into public.ingredients(restaurant_id, name, category, base_unit, par_level) values (r, 'Arrachera', 'Carnes', 'g', 4000) returning id into i_arrachera;
  insert into public.ingredients(restaurant_id, name, category, base_unit, par_level) values (r, 'Carne molida', 'Carnes', 'g', 3000) returning id into i_carne;
  insert into public.ingredients(restaurant_id, name, category, base_unit, par_level, allergens) values (r, 'Queso Oaxaca', 'Lácteos', 'g', 2000, '{lácteos}') returning id into i_queso;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Cebolla blanca', 'Verduras', 'g') returning id into i_cebolla;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Cilantro', 'Verduras', 'g') returning id into i_cilantro;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Jitomate', 'Verduras', 'g') returning id into i_jitomate;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Chile serrano', 'Verduras', 'g') returning id into i_serrano;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Limón', 'Verduras', 'pza') returning id into i_limon;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Aguacate', 'Verduras', 'g') returning id into i_aguacate;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Papa', 'Verduras', 'g') returning id into i_papa;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Aceite vegetal', 'Abarrotes', 'ml') returning id into i_aceite;
  insert into public.ingredients(restaurant_id, name, category, base_unit, allergens) values (r, 'Pan de hamburguesa', 'Panadería', 'pza', '{gluten}') returning id into i_pan;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Arroz', 'Abarrotes', 'g') returning id into i_arroz;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Azúcar', 'Abarrotes', 'g') returning id into i_azucar;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Canela', 'Abarrotes', 'g') returning id into i_canela;
  insert into public.ingredients(restaurant_id, name, category, base_unit) values (r, 'Refresco 355 ml', 'Bebidas', 'pza') returning id into i_refresco;
  insert into public.ingredients(restaurant_id, name, category, base_unit, kind, par_level, storage) values (r, 'Pico de gallo', 'Preparados', 'g', 'preparado', 1500, 'refrigerado') returning id into i_pico;
  insert into public.ingredients(restaurant_id, name, category, base_unit, kind, par_level, storage) values (r, 'Agua de horchata (preparada)', 'Preparados', 'ml', 'preparado', 8000, 'refrigerado') returning id into i_horchata;

  insert into public.ingredient_units(restaurant_id, ingredient_id, name, to_base) values
    (r, i_tmaiz, 'paquete', 100), (r, i_tharina, 'paquete', 20), (r, i_limon, 'bolsa', 40),
    (r, i_aguacate, 'pieza', 170), (r, i_jitomate, 'pieza', 120), (r, i_pan, 'bolsa', 8), (r, i_refresco, 'caja', 24);

  insert into public.ingredient_costs(ingredient_id, restaurant_id, unit_cost)
  select id, r, c from (values (i_tmaiz, 0.6), (i_tharina, 2.0), (i_pastor, 0.16), (i_arrachera, 0.38), (i_carne, 0.14),
    (i_queso, 0.15), (i_cebolla, 0.03), (i_cilantro, 0.08), (i_jitomate, 0.035), (i_serrano, 0.06), (i_limon, 2.5),
    (i_aguacate, 0.09), (i_papa, 0.03), (i_aceite, 0.045), (i_pan, 6.0), (i_arroz, 0.03), (i_azucar, 0.028),
    (i_canela, 0.5), (i_refresco, 12)) x(id, c);

  -- Recetas de preparados
  insert into public.recipes(restaurant_id, kind, name, output_ingredient_id) values (r, 'prep', 'Pico de gallo', i_pico) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, yield_qty, yield_unit, instructions, created_by)
    values (r, rec, 1, 1, 'kg', E'1. Picar jitomate, cebolla y chile en cubos pequeños.\n2. Picar cilantro.\n3. Mezclar con jugo de limón y sal.', st_ana)
    returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort) values
    (r, ver, i_jitomate, 600, 'g', 1), (r, ver, i_cebolla, 250, 'g', 2), (r, ver, i_cilantro, 60, 'g', 3),
    (r, ver, i_serrano, 40, 'g', 4), (r, ver, i_limon, 4, 'pza', 5);
  perform public.rpc_recipe_activate(r, ver);

  insert into public.recipes(restaurant_id, kind, name, output_ingredient_id) values (r, 'prep', 'Agua de horchata', i_horchata) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, yield_qty, yield_unit, instructions, created_by)
    values (r, rec, 1, 4, 'l', E'1. Remojar el arroz con canela 4 h.\n2. Licuar con agua.\n3. Colar y endulzar.', st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort) values
    (r, ver, i_arroz, 250, 'g', 1), (r, ver, i_azucar, 300, 'g', 2), (r, ver, i_canela, 10, 'g', 3);
  perform public.rpc_recipe_activate(r, ver);

  -- Recetas de menú
  insert into public.recipes(restaurant_id, kind, name, menu_item_id) values (r, 'menu', 'Tacos al pastor (3)', mi_pastor) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, instructions, created_by)
    values (r, rec, 1, E'3 tortillas en comal, 40 g de pastor por taco.\nCebolla y cilantro encima.', st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort) values
    (r, ver, i_tmaiz, 3, 'pza', 1), (r, ver, i_pastor, 120, 'g', 2), (r, ver, i_cebolla, 15, 'g', 3), (r, ver, i_cilantro, 6, 'g', 4);
  perform public.rpc_recipe_activate(r, ver);

  insert into public.recipes(restaurant_id, kind, name, menu_item_id) values (r, 'menu', 'Tacos de arrachera (3)', mi_asada) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, created_by) values (r, rec, 1, st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort) values
    (r, ver, i_tmaiz, 3, 'pza', 1), (r, ver, i_arrachera, 150, 'g', 2), (r, ver, i_pico, 60, 'g', 3);
  perform public.rpc_recipe_activate(r, ver);

  insert into public.recipes(restaurant_id, kind, name, menu_item_id) values (r, 'menu', 'Quesadilla', mi_quesa) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, created_by) values (r, rec, 1, st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort) values
    (r, ver, i_tmaiz, 1, 'pza', 1), (r, ver, i_queso, 60, 'g', 2);
  perform public.rpc_recipe_activate(r, ver);

  insert into public.recipes(restaurant_id, kind, name, menu_item_id) values (r, 'menu', 'Hamburguesa', mi_burger) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, created_by) values (r, rec, 1, st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort) values
    (r, ver, i_pan, 1, 'pza', 1), (r, ver, i_carne, 180, 'g', 2), (r, ver, i_queso, 30, 'g', 3),
    (r, ver, i_papa, 200, 'g', 4), (r, ver, i_aceite, 30, 'ml', 5);
  perform public.rpc_recipe_activate(r, ver);

  insert into public.recipes(restaurant_id, kind, name, menu_item_id) values (r, 'menu', 'Papas fritas', mi_papas) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, created_by) values (r, rec, 1, st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit, sort) values
    (r, ver, i_papa, 250, 'g', 1), (r, ver, i_aceite, 40, 'ml', 2);
  perform public.rpc_recipe_activate(r, ver);

  insert into public.recipes(restaurant_id, kind, name, menu_item_id) values (r, 'menu', 'Agua de horchata', mi_horchata) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, created_by) values (r, rec, 1, st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit) values (r, ver, i_horchata, 500, 'ml');
  perform public.rpc_recipe_activate(r, ver);

  insert into public.recipes(restaurant_id, kind, name, menu_item_id) values (r, 'menu', 'Refresco', mi_refresco) returning id into rec;
  insert into public.recipe_versions(restaurant_id, recipe_id, version, created_by) values (r, rec, 1, st_ana) returning id into ver;
  insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit) values (r, ver, i_refresco, 1, 'pza');
  perform public.rpc_recipe_activate(r, ver);

  -- Efecto de modificadores en inventario
  insert into public.modifier_inventory_lines(restaurant_id, modifier_id, ingredient_id, qty, unit) values
    (r, m_harina, i_tharina, 3, 'pza'), (r, m_harina, i_tmaiz, -3, 'pza'),
    (r, m_queso, i_queso, 30, 'g'), (r, m_aguacate, i_aguacate, 40, 'g'),
    (r, m_sincebolla, i_cebolla, -15, 'g'), (r, m_sincilantro, i_cilantro, -6, 'g');

  -- Existencia inicial (recepción ficticia)
  perform public.rpc_inventory_receive(gen_random_uuid(), r, null, 'Proveedor ficticio', 'DEMO-001', jsonb_build_array(
    jsonb_build_object('ingredient_id', i_tmaiz, 'qty', 5, 'unit', 'paquete'),
    jsonb_build_object('ingredient_id', i_tharina, 'qty', 5, 'unit', 'paquete'),
    jsonb_build_object('ingredient_id', i_pastor, 'qty', 8, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_arrachera, 'qty', 5, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_carne, 'qty', 4, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_queso, 'qty', 3, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_cebolla, 'qty', 3, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_cilantro, 'qty', 500, 'unit', 'g'),
    jsonb_build_object('ingredient_id', i_jitomate, 'qty', 4, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_serrano, 'qty', 300, 'unit', 'g'),
    jsonb_build_object('ingredient_id', i_limon, 'qty', 2, 'unit', 'bolsa'),
    jsonb_build_object('ingredient_id', i_aguacate, 'qty', 10, 'unit', 'pieza'),
    jsonb_build_object('ingredient_id', i_papa, 'qty', 10, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_aceite, 'qty', 5, 'unit', 'l'),
    jsonb_build_object('ingredient_id', i_pan, 'qty', 4, 'unit', 'bolsa'),
    jsonb_build_object('ingredient_id', i_arroz, 'qty', 2, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_azucar, 'qty', 2, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', i_canela, 'qty', 100, 'unit', 'g'),
    jsonb_build_object('ingredient_id', i_refresco, 'qty', 2, 'unit', 'caja')
  ), 'Existencia inicial de demostración');
  perform public.rpc_inventory_produce(gen_random_uuid(), r, null, i_pico, 2, 'kg', 'Tanda demo');
  perform public.rpc_inventory_produce(gen_random_uuid(), r, null, i_horchata, 8, 'l', 'Tanda demo');

  -- Regla de vida útil de EJEMPLO (no validada sanitariamente).
  insert into public.shelf_life_rules(restaurant_id, ingredient_id, storage, duration_hours, validated_by, validated_on, source_note)
  values (r, i_pico, 'refrigerado', 24, 'EJEMPLO DEMO — sin validar', current_date,
          'Valor ficticio para la demostración. Configura la regla real de tu restaurante.');

  -- Turnos de esta semana (lunes a domingo, hora local del restaurante)
  wk := (date_trunc('week', now() at time zone 'America/Mexico_City')) at time zone 'America/Mexico_City';
  for d in 0..6 loop
    insert into public.shifts(restaurant_id, staff_id, role, station_id, starts_at, ends_at, break_minutes, status, published_at, created_by) values
      (r, st_carla, 'cocinero', s_parrilla, wk + make_interval(days => d, hours => 12), wk + make_interval(days => d, hours => 20), 30, 'publicado', now(), st_ana),
      (r, st_diego, 'cocinero', s_comal, wk + make_interval(days => d, hours => 17), wk + make_interval(days => d, hours => 25), 30, 'publicado', now(), st_ana),
      (r, st_elena, 'mesero', null, wk + make_interval(days => d, hours => 13), wk + make_interval(days => d, hours => 21), 30, 'publicado', now(), st_ana),
      (r, st_beto, 'gerente', null, wk + make_interval(days => d, hours => 15), wk + make_interval(days => d, hours => 23, mins => 30), 30, 'publicado', now(), st_ana);
  end loop;

  -- Dos órdenes de ejemplo para que el KDS no arranque vacío.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_elena, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_elena::text, true);
  perform public.rpc_order_submit(gen_random_uuid(), r, null, jsonb_build_object(
    'id', gen_random_uuid(), 'order_type', 'mesa', 'table_label', '4', 'guest_count', 2,
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_pastor, 'qty', 2,
        'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', m_maiz), jsonb_build_object('modifier_id', m_sincebolla))),
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_horchata, 'qty', 2, 'modifiers', '[]'::jsonb)
    )), 'todo');
  perform public.rpc_order_submit(gen_random_uuid(), r, null, jsonb_build_object(
    'id', gen_random_uuid(), 'order_type', 'llevar', 'customer_name', 'Sr. Prueba',
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_burger, 'qty', 1, 'notes', 'Pan tostado',
        'modifiers', jsonb_build_array(jsonb_build_object('modifier_id',
          (select id from public.modifiers where group_id = g_termino and name = 'Tres cuartos')))),
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_asada, 'qty', 1,
        'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', m_harina), jsonb_build_object('modifier_id', m_aguacate)))
    )), 'todo');

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'Restaurante demo creado: %', r;
end $$;
