-- =====================================================================
-- PrepIQ · Pruebas de criterios críticos (SQL)
-- Ejecutar sobre una base recién creada con semilla:
--   dev/db-reset.sh --seed && psql -d prepiq_dev -f supabase/tests/criticos.sql
-- Cada bloque falla con excepción si un criterio no se cumple.
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Utilidades de prueba
-- ---------------------------------------------------------------------
create or replace function pg_temp.login(p_email text) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'usuario de prueba no existe: %', p_email; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v, 'role', 'authenticated')::text, false);
  return v;
end $$;

create or replace function pg_temp.logout() returns void language sql as $$
  select set_config('request.jwt.claims', '', false)
$$;

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALLÓ: %', p_msg; end if;
  raise notice 'ok  %', p_msg;
end $$;

-- Ejecuta SQL y verifica que falle con el código de negocio esperado.
create or replace function pg_temp.fails(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code or p_code = '*any*' or (p_code = '*rls*' and (sqlerrm like '%row-level security%' or sqlerrm like '%permission denied%')) then
      raise notice 'ok  % (→ %)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'FALLÓ: % — se esperaba "%" y fue "%"', p_msg, p_code, sqlerrm;
  end;
  raise exception 'FALLÓ: % — se esperaba error "%" y no hubo error', p_msg, p_code;
end $$;

create or replace function pg_temp.rid() returns uuid language sql as $$
  select id from public.restaurants where name = 'Taquería Demo'
$$;
create or replace function pg_temp.mi(p_name text) returns uuid language sql as $$
  select id from public.menu_items where name = p_name and restaurant_id = pg_temp.rid()
$$;
create or replace function pg_temp.mod(p_name text) returns uuid language sql as $$
  select id from public.modifiers where name = p_name and restaurant_id = pg_temp.rid()
$$;
create or replace function pg_temp.ing(p_name text) returns uuid language sql as $$
  select id from public.ingredients where name = p_name and restaurant_id = pg_temp.rid()
$$;
create or replace function pg_temp.station(p_name text) returns uuid language sql as $$
  select id from public.stations where name = p_name and restaurant_id = pg_temp.rid()
$$;
create or replace function pg_temp.stock(p_ing uuid) returns numeric language sql as $$
  select coalesce(sum(qty_base), 0) from public.inventory_movements where ingredient_id = p_ing
$$;

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
create or replace function pg_temp.put(p_k text, p_v text) returns void language sql as $$
  insert into ctx values (p_k, p_v) on conflict (k) do update set v = excluded.v
$$;
create or replace function pg_temp.get(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;

-- =====================================================================
-- 1. Una orden no se pierde ni se duplica (reintentos con el mismo op_id)
-- =====================================================================
do $$
declare v_op uuid := gen_random_uuid(); v_order uuid := gen_random_uuid(); v_item uuid := gen_random_uuid();
  r1 jsonb; r2 jsonb; r3 jsonb; v_payload jsonb; v_n int;
begin
  perform pg_temp.login('elena@demo.prepiq.test');
  v_payload := jsonb_build_object('id', v_order, 'order_type', 'mesa', 'table_label', '7',
    'items', jsonb_build_array(jsonb_build_object('id', v_item, 'menu_item_id', pg_temp.mi('Orden de tacos al pastor (3)'),
      'qty', 1, 'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', pg_temp.mod('Maíz'))))));
  r1 := public.rpc_order_submit(v_op, pg_temp.rid(), null, v_payload, 'todo');
  r2 := public.rpc_order_submit(v_op, pg_temp.rid(), null, v_payload, 'todo');
  perform pg_temp.ok((r2->>'_replayed')::boolean, 'reintento con mismo op_id se reconoce como repetido');
  perform pg_temp.ok(r1->'order'->>'number' = r2->'order'->>'number', 'reintento devuelve la misma orden');
  -- Reintento con op_id distinto (p. ej. el dispositivo perdió el op_id): ids de orden/línea lo protegen.
  r3 := public.rpc_order_submit(gen_random_uuid(), pg_temp.rid(), null, v_payload, 'todo');
  select count(*) into v_n from public.orders where id = v_order;
  perform pg_temp.ok(v_n = 1, 'una sola orden');
  select count(*) into v_n from public.order_items where order_id = v_order;
  perform pg_temp.ok(v_n = 1, 'una sola línea');
  select count(*) into v_n from public.kitchen_tickets where order_id = v_order;
  perform pg_temp.ok(v_n = 1, 'un solo ticket en cocina');
  -- Receta del pastor: tortilla, pastor, cebolla, cilantro → 4 movimientos, una vez.
  select count(*) into v_n from public.inventory_movements where source_id = v_item and kind = 'consumo_venta';
  perform pg_temp.ok(v_n = 4, 'consumo teórico registrado una sola vez por insumo');
  perform pg_temp.ok((select qty_base from public.inventory_movements where source_id = v_item and kind = 'consumo_venta'
    and ingredient_id = pg_temp.ing('Tortilla de maíz')) = -3, 'un pastor (3) descuenta 3 tortillas');
end $$;

-- =====================================================================
-- 2. Modificadores: validación de grupos obligatorios y agotados
-- =====================================================================
do $$
begin
  perform pg_temp.login('elena@demo.prepiq.test');
  perform pg_temp.fails(format($q$select public.rpc_order_submit(gen_random_uuid(), %L, null,
    jsonb_build_object('id', gen_random_uuid(), 'order_type', 'mesa', 'table_label', '8',
      'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', %L, 'qty', 1))), 'todo')$q$,
    pg_temp.rid(), pg_temp.mi('Orden de tacos al pastor (3)')), 'modificadores_fuera_de_rango', 'tortilla obligatoria');
  perform pg_temp.fails(format($q$select public.rpc_order_submit(gen_random_uuid(), %L, null,
    jsonb_build_object('id', gen_random_uuid(), 'order_type', 'mesa',
      'items', '[]'::jsonb), 'ninguno')$q$, pg_temp.rid()), '*any*', 'orden de mesa sin número de mesa');
end $$;

-- =====================================================================
-- 3. KDS: dos cocineros marcan listo el mismo ticket → una sola transición
-- =====================================================================
do $$
declare t uuid; a jsonb; b jsonb; v_n int;
begin
  perform pg_temp.login('carla@demo.prepiq.test');
  select k.id into t from public.kitchen_tickets k where k.station_id = pg_temp.station('Comal') and k.status = 'nuevo'
    order by k.created_at limit 1;
  perform pg_temp.put('ticket_comal', t::text);
  perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'iniciar');
  a := public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'listo');
  b := public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'listo');
  perform pg_temp.ok(not (a->>'noop')::boolean and (b->>'noop')::boolean, 'el segundo "listo" es no-op');
  select count(*) into v_n from public.ticket_events where ticket_id = t and action = 'listo';
  perform pg_temp.ok(v_n = 1, 'un solo evento "listo"');
end $$;

-- =====================================================================
-- 4. Reabrir conserva el historial y exige motivo; reproceso consume de nuevo
-- =====================================================================
do $$
declare t uuid := pg_temp.get('ticket_comal')::uuid; v_n int; v_before numeric; v_after numeric; v_op uuid := gen_random_uuid();
begin
  perform pg_temp.login('carla@demo.prepiq.test');
  perform pg_temp.fails(format('select public.rpc_ticket_action(gen_random_uuid(), %L, null, %L, ''reabrir'')', pg_temp.rid(), t),
    'motivo_requerido', 'reabrir sin motivo');
  v_before := pg_temp.stock(pg_temp.ing('Carne al pastor'));
  perform public.rpc_ticket_action(v_op, pg_temp.rid(), null, t, 'reabrir',
    jsonb_build_object('reason', 'error_preparacion', 'note', 'Se quemó', 'remake', true));
  perform public.rpc_ticket_action(v_op, pg_temp.rid(), null, t, 'reabrir',
    jsonb_build_object('reason', 'error_preparacion', 'note', 'Se quemó', 'remake', true));  -- reintento
  v_after := pg_temp.stock(pg_temp.ing('Carne al pastor'));
  perform pg_temp.ok(v_after < v_before, 'el reproceso descuenta pastor');
  perform pg_temp.ok((select count(*) from public.inventory_movements where kind = 'reproceso' and ingredient_id = pg_temp.ing('Carne al pastor')) = 1,
    'el reproceso se registra una sola vez aunque se reintente');
  perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'listo');
  select count(*) into v_n from public.ticket_events where ticket_id = t;
  perform pg_temp.ok(v_n >= 5, 'historial completo: crear, iniciar, listo, reabrir, listo');
  perform pg_temp.ok((select reopen_count from public.kitchen_tickets where id = t) = 1, 'contador de reaperturas');
  perform pg_temp.ok(exists (select 1 from public.ticket_events where ticket_id = t and action = 'reabrir'
    and reason = 'error_preparacion' and staff_id is not null), 'reapertura guarda actor y motivo');
  perform pg_temp.fails(format('delete from public.ticket_events where ticket_id = %L', t), 'historial_inmutable', 'no se puede borrar historial');
end $$;

-- =====================================================================
-- 5. Bloqueo por faltante: el tiempo bloqueado no cuenta como ciclo
-- =====================================================================
do $$
declare t uuid; k public.kitchen_tickets;
begin
  perform pg_temp.login('carla@demo.prepiq.test');
  select id into t from public.kitchen_tickets where station_id = pg_temp.station('Parrilla') and status = 'nuevo' limit 1;
  perform pg_temp.put('ticket_parrilla', t::text);
  perform pg_temp.fails(format('select public.rpc_ticket_action(gen_random_uuid(), %L, null, %L, ''bloquear'')', pg_temp.rid(), t),
    'motivo_requerido', 'bloquear exige qué falta');
  perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'bloquear', '{"reason":"Sin pan de hamburguesa"}');
  perform pg_temp.ok(exists (select 1 from public.incidents where ticket_id = t and kind = 'faltante'), 'bloqueo crea incidencia de faltante');
  -- Simular 3 minutos bloqueado.
  update public.kitchen_tickets set blocked_since = now() - interval '3 minutes' where id = t;
  perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'desbloquear');
  select * into k from public.kitchen_tickets where id = t;
  perform pg_temp.ok(k.blocked_seconds between 175 and 200 and not k.blocked, 'tiempo bloqueado acumulado (~180 s)');
end $$;

-- =====================================================================
-- 6. Roles: el mesero no modifica configuración ni opera el KDS
-- =====================================================================
set role authenticated;
do $$
declare v_n int;
begin
  perform pg_temp.login('elena@demo.prepiq.test');
  perform pg_temp.fails(format('insert into public.menu_items(restaurant_id, name, price) values (%L, ''Hack'', 1)', pg_temp.rid()),
    '*rls*', 'mesero no crea productos');
  update public.stations set name = 'X' where restaurant_id = pg_temp.rid();
  get diagnostics v_n = row_count;
  perform pg_temp.ok(v_n = 0, 'mesero no edita estaciones (0 filas)');
  perform pg_temp.fails(format('insert into public.kitchen_tickets(restaurant_id) values (%L)', pg_temp.rid()), '*rls*',
    'mesero no inserta tickets directamente');
  perform pg_temp.fails(format('select public.rpc_ticket_action(gen_random_uuid(), %L, null, %L, ''listo'')', pg_temp.rid(),
    pg_temp.get('ticket_parrilla')), 'permiso_denegado', 'mesero no marca listo');
  perform pg_temp.ok((select count(*) from public.ingredient_costs) = 0, 'mesero no ve costos');
  perform pg_temp.ok((select count(*) from public.inventory_movements) = 0, 'mesero no ve movimientos');
  perform pg_temp.ok((select count(*) from public.staff_private) = 0, 'mesero no ve contactos');
  update public.staff set roles = '{admin}' where user_id = auth.uid();
  get diagnostics v_n = row_count;
  perform pg_temp.ok(v_n = 0, 'mesero no se sube de rol (0 filas)');
end $$;
reset role;

-- =====================================================================
-- 7. Anular línea enviada: requiere autorización; inventario sin doble efecto
-- =====================================================================
do $$
declare v_item uuid; v_ov jsonb; v_n int; v_before numeric; v_after numeric; v_op uuid := gen_random_uuid();
begin
  perform pg_temp.login('elena@demo.prepiq.test');
  select i.id into v_item from public.order_items i join public.orders o on o.id = i.order_id
    where o.table_label = '7' and i.status = 'enviado' limit 1;
  perform pg_temp.fails(format('select public.rpc_order_item_void(gen_random_uuid(), %L, null, %L, ''cliente_cancelo'')',
    pg_temp.rid(), v_item), 'permiso_denegado', 'mesero no anula lo enviado sin gerente');
  v_ov := public.rpc_request_override(pg_temp.rid(), '9999', 'orders.void_sent');
  perform pg_temp.ok(not (v_ov->>'ok')::boolean, 'PIN incorrecto no autoriza');
  v_ov := public.rpc_request_override(pg_temp.rid(), '3333', 'orders.void_sent');
  perform pg_temp.ok(v_ov->>'error' = 'sin_permiso', 'PIN de cocinera no autoriza anulación');
  v_ov := public.rpc_request_override(pg_temp.rid(), '2222', 'orders.void_sent');
  perform pg_temp.ok((v_ov->>'ok')::boolean, 'PIN de gerente emite autorización');
  v_before := pg_temp.stock(pg_temp.ing('Tortilla de maíz'));
  perform public.rpc_order_item_void(v_op, pg_temp.rid(), null, v_item, 'cliente_cancelo', 'Se fue', false, (v_ov->>'override')::uuid);
  perform public.rpc_order_item_void(v_op, pg_temp.rid(), null, v_item, 'cliente_cancelo', 'Se fue', false, (v_ov->>'override')::uuid);
  v_after := pg_temp.stock(pg_temp.ing('Tortilla de maíz'));
  perform pg_temp.ok(v_after = v_before + 3, 'anulación sin preparar regresa 3 tortillas una sola vez');
  perform pg_temp.ok((select void_authorized_by from public.order_items where id = v_item)
    = (select id from public.staff where display_name = 'Beto'), 'se registra quién autorizó');
  perform pg_temp.fails(format('select public.rpc_order_item_void(gen_random_uuid(), %L, null, %L, ''cliente_cancelo'', null, null, %L)',
    pg_temp.rid(), (select id from public.order_items where status = 'enviado' limit 1), v_ov->>'override'),
    'autorizacion_invalida', 'la autorización es de un solo uso');
end $$;

do $$
declare v_item uuid; v_before numeric; v_after numeric; v_merma numeric;
begin
  -- Anular algo YA preparado: el consumo se reclasifica como merma (neto igual).
  perform pg_temp.login('beto@demo.prepiq.test');
  select ti.order_item_id into v_item from public.ticket_items ti
    where ti.ticket_id = pg_temp.get('ticket_comal')::uuid limit 1;
  v_before := pg_temp.stock(pg_temp.ing('Carne al pastor'));
  perform public.rpc_order_item_void(gen_random_uuid(), pg_temp.rid(), null, v_item, 'cliente_cancelo', null, null);
  v_after := pg_temp.stock(pg_temp.ing('Carne al pastor'));
  perform pg_temp.ok(v_after = v_before, 'anulado ya preparado: existencia no regresa');
  select sum(qty_base) into v_merma from public.inventory_movements where source_id = v_item and kind = 'merma';
  perform pg_temp.ok(v_merma < 0, 'queda como merma por anulación preparada');
end $$;

-- =====================================================================
-- 8. Unidades y recetas coherentes
-- =====================================================================
do $$
begin
  perform pg_temp.ok(app.to_base_qty(pg_temp.ing('Arrachera'), 1.5, 'kg') = 1500, 'kg → g');
  perform pg_temp.ok(app.to_base_qty(pg_temp.ing('Tortilla de maíz'), 2, 'paquete') = 200, 'unidad propia (paquete = 100 pza)');
  perform pg_temp.ok(round(app.to_base_qty(pg_temp.ing('Aceite vegetal'), 1, 'taza'), 1) = 236.6, 'taza → ml');
  perform pg_temp.fails(format('select app.to_base_qty(%L, 1, ''ml'')', pg_temp.ing('Arrachera')), 'unidad_incompatible',
    'ml para insumo en gramos');
  perform pg_temp.fails(format('select app.to_base_qty(%L, 1, ''costal'')', pg_temp.ing('Arrachera')), 'unidad_desconocida',
    'unidad inexistente');
  perform pg_temp.login('ana@demo.prepiq.test');
  perform pg_temp.fails(format('insert into public.recipe_lines(restaurant_id, version_id, ingredient_id, qty, unit)
    select restaurant_id, id, %L, 1, ''g'' from public.recipe_versions where status = ''activa'' limit 1', pg_temp.ing('Cilantro')),
    'version_no_editable', 'no se edita una receta activa');
end $$;

-- =====================================================================
-- 9. Conteo físico reconcilia el teórico; aprobar dos veces no duplica
-- =====================================================================
do $$
declare v_c uuid; v_ing uuid := pg_temp.ing('Tortilla de maíz'); v_theo numeric; v_after numeric; r jsonb; v_adj int;
begin
  perform pg_temp.login('carla@demo.prepiq.test');
  v_theo := pg_temp.stock(v_ing);
  r := public.rpc_count_create(gen_random_uuid(), pg_temp.rid(), null, 'Conteo prueba');
  v_c := (r->>'count_id')::uuid;
  perform public.rpc_count_set_line(gen_random_uuid(), pg_temp.rid(), null, v_c, v_ing, 4, 'paquete');
  perform public.rpc_count_set_line(gen_random_uuid(), pg_temp.rid(), null, v_c, v_ing, 4.5, 'paquete');  -- corrige
  perform pg_temp.fails(format('select public.rpc_count_set_line(gen_random_uuid(), %L, null, %L, %L, -1, ''pza'')',
    pg_temp.rid(), v_c, v_ing), 'cantidad_invalida', 'conteo negativo');
  perform public.rpc_count_transition(gen_random_uuid(), pg_temp.rid(), null, v_c, 'enviar');
  perform pg_temp.fails(format('select public.rpc_count_transition(gen_random_uuid(), %L, null, %L, ''aprobar'')',
    pg_temp.rid(), v_c), 'permiso_denegado', 'cocinera no aprueba conteos');
  perform pg_temp.login('beto@demo.prepiq.test');
  perform public.rpc_count_transition(gen_random_uuid(), pg_temp.rid(), null, v_c, 'aprobar');
  v_after := pg_temp.stock(v_ing);
  perform pg_temp.ok(v_after = 450, format('teórico queda igual al conteo (450 pza; antes %s)', v_theo));
  perform pg_temp.fails(format('select public.rpc_count_transition(gen_random_uuid(), %L, null, %L, ''aprobar'')',
    pg_temp.rid(), v_c), 'transicion_invalida', 'no se aprueba dos veces');
  select count(*) into v_adj from public.inventory_movements where source_id = v_c;
  perform pg_temp.ok(v_adj = 1, 'un solo ajuste por insumo');
  perform pg_temp.ok((select variance_base from public.inventory_count_lines where count_id = v_c) = 450 - v_theo,
    'la diferencia queda registrada');
end $$;

-- =====================================================================
-- 10. Aislamiento entre restaurantes
-- =====================================================================
do $$
declare u uuid := gen_random_uuid(); r2 jsonb;
begin
  insert into auth.users(id, email) values (u, 'otro@demo.prepiq.test');
  perform pg_temp.login('otro@demo.prepiq.test');
  r2 := public.rpc_create_restaurant('Otra org', 'Otro restaurante', 'Zoe');
  perform pg_temp.put('r2', r2->>'restaurant_id');
  perform pg_temp.fails(format('select public.rpc_order_submit(gen_random_uuid(), %L, null, ''{"id":"%s","order_type":"llevar"}''::jsonb, ''ninguno'')',
    pg_temp.rid(), gen_random_uuid()), 'sin_acceso_restaurante', 'no opera en restaurante ajeno');
end $$;
set role authenticated;
do $$
begin
  perform pg_temp.login('otro@demo.prepiq.test');
  perform pg_temp.ok((select count(*) from public.kitchen_tickets) = 0, 'no ve tickets ajenos');
  perform pg_temp.ok((select count(*) from public.menu_items) = 0, 'no ve menú ajeno');
  perform pg_temp.ok((select count(*) from public.staff) = 1, 'solo se ve a sí mismo');
  perform pg_temp.login('elena@demo.prepiq.test');
  perform pg_temp.ok((select count(*) from public.restaurants) = 1, 'Elena solo ve su restaurante');
end $$;
reset role;

-- =====================================================================
-- 11. Dispositivo compartido: PIN, token de operador y límite de intentos
-- =====================================================================
do $$
declare r jsonb; v_tok uuid; i int;
begin
  perform pg_temp.login('kds-parrilla@demo.prepiq.test');
  perform pg_temp.fails(format('select public.rpc_ticket_action(gen_random_uuid(), %L, null, %L, ''iniciar'')',
    pg_temp.rid(), pg_temp.get('ticket_parrilla')), 'operador_requerido', 'dispositivo exige operador');
  r := public.rpc_device_login('4444');
  perform pg_temp.ok((r->>'ok')::boolean and r->>'display_name' = 'Diego', 'PIN de Diego abre sesión');
  v_tok := (r->>'token')::uuid;
  r := public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), v_tok, pg_temp.get('ticket_parrilla')::uuid, 'iniciar');
  perform pg_temp.ok(exists (select 1 from public.ticket_events where ticket_id = pg_temp.get('ticket_parrilla')::uuid
    and action = 'iniciar' and staff_id = (select id from public.staff where display_name = 'Diego')
    and device_id is not null), 'acción registra a Diego y al dispositivo');
  for i in 1..5 loop r := public.rpc_device_login('0000'); end loop;
  r := public.rpc_device_login('4444');
  perform pg_temp.ok(r->>'error' = 'pin_bloqueado', 'tras 5 fallos se bloquea aunque el PIN sea correcto');
  perform public.rpc_device_logout(v_tok);
  perform pg_temp.fails(format('select public.rpc_ticket_action(gen_random_uuid(), %L, %L, %L, ''listo'')',
    pg_temp.rid(), v_tok, pg_temp.get('ticket_parrilla')), 'sesion_operador_expirada', 'token cerrado no sirve');
end $$;

-- =====================================================================
-- 12. Etiquetas: regla validada, caducidad requerida, reimpresión trazable
-- =====================================================================
do $$
declare r jsonb; l jsonb; v_id uuid;
begin
  perform pg_temp.login('carla@demo.prepiq.test');
  r := public.rpc_label_create(gen_random_uuid(), pg_temp.rid(), null, jsonb_build_object(
    'ingredient_id', pg_temp.ing('Pico de gallo'), 'prepared_at', now() - interval '1 hour', 'storage', 'refrigerado',
    'quantity_text', '2 kg'));
  l := r->'label';
  perform pg_temp.ok(l->>'expiry_source' = 'regla' and (l->>'expires_at')::timestamptz = (l->>'prepared_at')::timestamptz + interval '24 hours',
    'caducidad según regla configurada');
  perform pg_temp.fails(format('select public.rpc_label_create(gen_random_uuid(), %L, null, ''{"product_name":"Salsa verde"}''::jsonb)',
    pg_temp.rid()), 'caducidad_requerida', 'sin regla validada se exige caducidad');
  v_id := (l->>'id')::uuid;
  perform public.rpc_label_action(gen_random_uuid(), pg_temp.rid(), null, v_id, 'fallida', '{"reason":"Se atascó"}');
  perform pg_temp.ok(exists (select 1 from public.incidents where kind = 'impresora'), 'falla de impresora crea incidencia');
  r := public.rpc_label_action(gen_random_uuid(), pg_temp.rid(), null, v_id, 'reimprimir', '{"reason":"Reintento"}');
  perform pg_temp.ok(r->'label'->>'batch_code' = l->>'batch_code' and (r->'label'->>'reprint_of')::uuid = v_id,
    'reimpresión conserva lote y enlaza al original');
  perform public.rpc_label_action(gen_random_uuid(), pg_temp.rid(), null, (r->'label'->>'id')::uuid, 'confirmar');
  perform pg_temp.fails(format('select public.rpc_label_action(gen_random_uuid(), %L, null, %L, ''reimprimir'', ''{"reason":"otra"}'')',
    pg_temp.rid(), r->'label'->>'id'), 'permiso_denegado', 'duplicar una etiqueta ya impresa requiere permiso');
end $$;

-- =====================================================================
-- 13. Asistencia: secuencia válida, corrección con aprobación de otra persona
-- =====================================================================
do $$
declare r jsonb; v_tok uuid; c jsonb;
begin
  perform pg_temp.login('reloj@demo.prepiq.test');
  r := public.rpc_device_login('5555'); v_tok := (r->>'token')::uuid;
  perform public.rpc_punch(gen_random_uuid(), pg_temp.rid(), v_tok, 'entrada');
  perform pg_temp.fails(format('select public.rpc_punch(gen_random_uuid(), %L, %L, ''entrada'')', pg_temp.rid(), v_tok),
    'ya_hay_entrada', 'no se registra doble entrada');
  perform pg_temp.fails(format('select public.rpc_punch(gen_random_uuid(), %L, %L, ''fin_descanso'')', pg_temp.rid(), v_tok),
    'secuencia_invalida', 'no termina un descanso no iniciado');
  perform public.rpc_punch(gen_random_uuid(), pg_temp.rid(), v_tok, 'inicio_descanso');
  perform public.rpc_punch(gen_random_uuid(), pg_temp.rid(), v_tok, 'salida');
  perform pg_temp.ok((select count(*) from public.time_punches where staff_id = (select id from public.staff where display_name = 'Elena')) = 4,
    'salida cierra el descanso automáticamente (4 marcas)');
  -- Marca capturada sin conexión que llega después de cerrar la sesión del reloj.
  r := public.rpc_device_login('6666'); v_tok := (r->>'token')::uuid;
  perform public.rpc_device_logout(v_tok);
  r := public.rpc_punch(gen_random_uuid(), pg_temp.rid(), v_tok, 'entrada', clock_timestamp() - interval '1 second');
  perform pg_temp.ok((r->>'ok')::boolean, 'marca offline dentro de la sesión se acepta aunque la sesión ya cerró');
  perform pg_temp.fails(format('select public.rpc_punch(gen_random_uuid(), %L, %L, ''salida'', now() + interval ''3 minutes'')', pg_temp.rid(), v_tok),
    'hora_fuera_de_sesion', 'una marca fuera del horario de la sesión se rechaza');
  perform pg_temp.fails(format('select public.rpc_punch(gen_random_uuid(), %L, %L, ''salida'')', pg_temp.rid(), v_tok),
    'sesion_operador_expirada', 'sin hora del dispositivo, una sesión cerrada no sirve');
  -- Elena desde su cuenta personal no puede marcar (ajuste del restaurante).
  perform pg_temp.login('elena@demo.prepiq.test');
  perform pg_temp.fails(format('select public.rpc_punch(gen_random_uuid(), %L, null, ''entrada'')', pg_temp.rid()),
    'marcar_solo_en_kiosko', 'marcar solo en el reloj');
  c := public.rpc_punch_correction(pg_temp.rid(), 'solicitar', null, null, 'agregar', null, 'entrada',
    now() - interval '30 hours', 'Olvidé marcar el martes');
  perform pg_temp.ok(c->>'status' = 'pendiente', 'corrección propia queda pendiente');
  perform pg_temp.fails(format('select public.rpc_punch_correction(%L, ''aprobar'', %L)', pg_temp.rid(), c->>'id'),
    'permiso_denegado', 'no se aprueba a sí misma');
  perform pg_temp.login('beto@demo.prepiq.test');
  c := public.rpc_punch_correction(pg_temp.rid(), 'aprobar', (c->>'id')::uuid);
  perform pg_temp.ok(c->>'status' = 'aprobada' and exists (select 1 from public.time_punches where source = 'correccion'),
    'gerente aprueba y se agrega marca de corrección');
  perform pg_temp.fails('delete from public.time_punches', 'historial_inmutable', 'marcas no se borran');
end $$;

-- =====================================================================
-- 14. Horarios: no se empalman turnos de la misma persona; cruce de medianoche
-- =====================================================================
do $$
declare v_staff uuid := (select id from public.staff where display_name = 'Diego');
begin
  perform pg_temp.ok(exists (select 1 from public.shifts where staff_id = v_staff
    and (starts_at at time zone 'America/Mexico_City')::date <> (ends_at at time zone 'America/Mexico_City')::date),
    'turno de Diego cruza medianoche (17:00–01:00)');
  begin
    insert into public.shifts(restaurant_id, staff_id, starts_at, ends_at)
    select restaurant_id, staff_id, starts_at + interval '1 hour', ends_at + interval '1 hour' from public.shifts
    where staff_id = v_staff limit 1;
    raise exception 'FALLÓ: se permitió empalmar turnos';
  exception when exclusion_violation then
    raise notice 'ok  turnos empalmados rechazados';
  end;
end $$;

-- =====================================================================
-- 15. Jornada: cerrar con pendientes exige nota; reportes calculan
-- =====================================================================
do $$
declare r jsonb;
begin
  perform pg_temp.login('beto@demo.prepiq.test');
  r := public.report_kitchen(pg_temp.rid(), now() - interval '1 day', now() + interval '1 hour');
  perform pg_temp.ok(jsonb_array_length(r->'stations') = 5, 'reporte de cocina por estación');
  perform pg_temp.ok((r->'reopen_reasons'->>'error_preparacion')::int = 1, 'motivos de reapertura en reporte');
  perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null,
    (select id from public.kitchen_tickets where station_id = pg_temp.station('Barra') and status = 'nuevo' limit 1), 'listo');
  r := public.kds_team_stats(pg_temp.rid());
  perform pg_temp.ok((r->>'completed')::int >= 1, 'indicadores de equipo del KDS');
  perform pg_temp.fails(format('select public.rpc_service_day(gen_random_uuid(), %L, null, ''cerrar'')', pg_temp.rid()),
    'jornada_con_pendientes', 'cerrar con pendientes exige nota');
  perform pg_temp.login('elena@demo.prepiq.test');
  perform pg_temp.fails(format('select public.report_kitchen(%L, now() - interval ''1 day'', now())', pg_temp.rid()),
    'permiso_denegado', 'mesero no ve reportes');
end $$;

select pg_temp.logout();
\echo '✔ Todas las pruebas críticas pasaron.'
