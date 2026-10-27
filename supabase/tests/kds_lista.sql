-- =====================================================================
-- PrepIQ · Pruebas: KDS en lista (ticket por unidad, estación extra,
-- equipo por estación sin PIN, listo = terminado, recetas para cocina)
-- Ejecutar después de criticos.sql (misma base con semilla).
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
set client_min_messages = notice;

create or replace function pg_temp.login(p_email text) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'usuario de prueba no existe: %', p_email; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.sub', v::text, false);
  return v;
end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALLÓ: %', p_msg; end if;
  raise notice 'ok  %', p_msg;
end $$;
create or replace function pg_temp.fails(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code then raise notice 'ok  % (→ %)', p_msg, sqlerrm; return; end if;
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
create or replace function pg_temp.station(p_name text) returns uuid language sql as $$
  select id from public.stations where name = p_name and restaurant_id = pg_temp.rid()
$$;
create or replace function pg_temp.staff(p_name text) returns uuid language sql as $$
  select id from public.staff where display_name = p_name and restaurant_id = pg_temp.rid()
$$;
create temp table kctx (k text primary key, v text);
create or replace function pg_temp.put(p_k text, p_v text) returns void language sql as $$
  insert into kctx values (p_k, p_v) on conflict (k) do update set v = excluded.v
$$;
create or replace function pg_temp.get(p_k text) returns text language sql as $$ select v from kctx where k = p_k $$;

-- =====================================================================
-- K1. Un ticket por unidad: 3 arracheras = 3 tickets; hamburguesa con
--     componente en otra estación genera un ticket por unidad en cada una
-- =====================================================================
do $$
declare r jsonb; v_order uuid := gen_random_uuid(); v_arr uuid := gen_random_uuid(); v_bur uuid := gen_random_uuid();
begin
  perform pg_temp.login('elena@demo.prepiq.test');
  r := public.rpc_order_submit_v2(gen_random_uuid(), pg_temp.rid(), null, jsonb_build_object(
    'id', v_order, 'order_type', 'mesa', 'table_label', '21',
    'items', jsonb_build_array(
      jsonb_build_object('id', v_arr, 'menu_item_id', pg_temp.mi('Orden de tacos de arrachera (3)'), 'qty', 3,
        'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', pg_temp.mod('Maíz')))),
      jsonb_build_object('id', v_bur, 'menu_item_id', pg_temp.mi('Hamburguesa de la casa'), 'qty', 2,
        'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', pg_temp.mod('Término medio')))))), 'todo');
  perform pg_temp.put('order_k1', v_order::text);
  perform pg_temp.ok((select count(*) from public.kitchen_tickets where order_item_id = v_arr) = 3,
    '3 arracheras → 3 tickets');
  perform pg_temp.ok((select bool_and(ti.qty = 1) and count(*) = 3 from public.ticket_items ti
    join public.kitchen_tickets k on k.id = ti.ticket_id where k.order_item_id = v_arr), 'cada ticket lleva 1 unidad');
  perform pg_temp.ok((select array_agg(unit_no order by unit_no) = '{1,2,3}' and bool_and(unit_count = 3)
    from public.kitchen_tickets where order_item_id = v_arr), 'tickets numerados 1/3, 2/3, 3/3');
  perform pg_temp.ok((select count(*) from public.kitchen_tickets where order_item_id = v_bur and station_id = pg_temp.station('Parrilla')) = 2
    and (select count(*) from public.kitchen_tickets where order_item_id = v_bur and station_id = pg_temp.station('Freidora')) = 2,
    '2 hamburguesas → 2 en Parrilla y 2 (papas) en Freidora');
  perform pg_temp.ok((select count(*) from public.inventory_movements where source_id = v_arr and kind = 'consumo_venta') > 0
    and (select count(distinct source_id) from public.inventory_movements where source_id in (v_arr, v_bur) and kind = 'consumo_venta') = 2,
    'el consumo teórico se registra por línea (no se multiplica por ticket)');
end $$;

-- =====================================================================
-- K2. Enviar también a otra estación
-- =====================================================================
do $$
declare r jsonb; v_order uuid := gen_random_uuid(); v_q uuid := gen_random_uuid();
begin
  perform pg_temp.login('elena@demo.prepiq.test');
  r := public.rpc_order_submit_v2(gen_random_uuid(), pg_temp.rid(), null, jsonb_build_object(
    'id', v_order, 'order_type', 'llevar', 'customer_name', 'Extra',
    'items', jsonb_build_array(jsonb_build_object('id', v_q, 'menu_item_id', pg_temp.mi('Quesadilla'), 'qty', 1,
      'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', pg_temp.mod('Harina'))),
      'extra_station_ids', jsonb_build_array(pg_temp.station('Parrilla'), pg_temp.station('Comal'))))), 'todo');
  perform pg_temp.ok((select extra_station_ids = array[pg_temp.station('Parrilla')] or extra_station_ids @> array[pg_temp.station('Parrilla')]
    from public.order_items where id = v_q), 'la línea guarda sus estaciones extra');
  perform pg_temp.ok((select count(*) from public.kitchen_tickets where order_item_id = v_q and station_id = pg_temp.station('Comal')) = 1,
    'ruta normal: 1 ticket en Comal (no se duplica si también se eligió)');
  perform pg_temp.ok((select count(*) from public.kitchen_tickets where order_item_id = v_q and station_id = pg_temp.station('Parrilla') and extra_station) = 1,
    'estación extra: 1 ticket en Parrilla marcado como extra');
  perform pg_temp.fails(format('select public.rpc_order_submit_v2(gen_random_uuid(), %L, null, %L::jsonb, ''todo'')', pg_temp.rid(),
    jsonb_build_object('id', gen_random_uuid(), 'order_type', 'llevar', 'items', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'menu_item_id', pg_temp.mi('Refresco'), 'qty', 1, 'extra_station_ids', jsonb_build_array(gen_random_uuid()))))),
    'estacion_invalida', 'no acepta estaciones de otro restaurante o inexistentes');
end $$;

-- =====================================================================
-- K3. Listo = terminado: la orden se cierra sin "entregar"; reabrir no
--     cuenta el tiempo que estuvo terminado
-- =====================================================================
do $$
declare r jsonb; t uuid; k public.kitchen_tickets; v_order uuid := (pg_temp.get('order_k1'))::uuid;
begin
  perform pg_temp.login('kds-comal@demo.prepiq.test');
  for t in select id from public.kitchen_tickets where order_id = v_order loop
    perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'listo');
  end loop;
  perform pg_temp.login('elena@demo.prepiq.test');
  -- Reabrir uno que estuvo 5 min terminado.
  select id into t from public.kitchen_tickets where order_id = v_order limit 1;
  update public.kitchen_tickets set fired_at = now() - interval '12 minutes', ready_at = now() - interval '5 minutes' where id = t;
  perform pg_temp.login('kds-comal@demo.prepiq.test');
  r := public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'reabrir', '{"reason":"marcado_por_error"}');
  perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, t, 'listo');
  select * into k from public.kitchen_tickets where id = t;
  perform pg_temp.ok(k.paused_seconds between 295 and 310, 'el tiempo terminado (5 min) queda en pausa');
  perform pg_temp.ok(app.ticket_cycle_minutes(k) between 6.9 and 7.2, 'ciclo = 12 − 5 = 7 min');
  perform pg_temp.ok(not exists (select 1 from public.inventory_movements where kind = 'reproceso' and source_type = 'ticket_event'
    and source_id in (select id from public.ticket_events where ticket_id = t)), 'reabrir por error no descuenta inventario');
  perform pg_temp.login('elena@demo.prepiq.test');
  r := public.rpc_order_close(gen_random_uuid(), pg_temp.rid(), null, v_order);
  perform pg_temp.ok(r->'order'->>'status' = 'cerrada', 'orden con todo listo se cierra sin entregar');
end $$;

-- =====================================================================
-- K4. Equipo por estación: horario + cambios en vivo con autorización
-- =====================================================================
do $$
declare r jsonb; v_ov jsonb; v_fer uuid := pg_temp.staff('Fer');
begin
  perform pg_temp.login('ana@demo.prepiq.test');
  insert into public.shifts(restaurant_id, staff_id, role, station_id, starts_at, ends_at, status, published_at)
  values (pg_temp.rid(), v_fer, 'cocinero', pg_temp.station('Freidora'), now() - interval '1 hour', now() + interval '3 hours', 'publicado', now());
  perform pg_temp.ok(v_fer = any (app.station_crew(pg_temp.station('Freidora'))), 'el horario pone a Fer en Freidora');

  perform pg_temp.login('kds-comal@demo.prepiq.test');
  r := public.rpc_station_crew(pg_temp.rid());
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r->'stations') s, jsonb_array_elements(s->'staff') p
    where (s->>'station_id')::uuid = pg_temp.station('Freidora') and p->>'name' = 'Fer'), 'la cocina ve quién está en cada estación');
  perform pg_temp.fails(format('select public.rpc_station_crew_set(gen_random_uuid(), %L, null, %L, %L, false)',
    pg_temp.rid(), pg_temp.station('Freidora'), v_fer), 'permiso_denegado', 'cambiar el equipo requiere responsable de turno');
  v_ov := public.rpc_request_override(pg_temp.rid(), '2222', 'service.open_close');
  r := public.rpc_station_crew_set(gen_random_uuid(), pg_temp.rid(), null, pg_temp.station('Freidora'), v_fer, false, (v_ov->>'override')::uuid);
  perform pg_temp.ok(not (v_fer = any (app.station_crew(pg_temp.station('Freidora')))), 'no llegó: se quita de Freidora');
  perform pg_temp.ok((select authorized_by = pg_temp.staff('Beto') from public.station_assignments
    where staff_id = v_fer and station_id = pg_temp.station('Freidora')), 'queda quién autorizó el cambio');

  perform pg_temp.login('ana@demo.prepiq.test');
  r := public.rpc_station_crew_set(gen_random_uuid(), pg_temp.rid(), null, pg_temp.station('Comal'), v_fer, true);
  perform pg_temp.ok(v_fer = any (app.station_crew(pg_temp.station('Comal'))), 'cubre en Comal');
  r := public.rpc_station_crew_set(gen_random_uuid(), pg_temp.rid(), null, pg_temp.station('Freidora'), v_fer, true);
  perform pg_temp.ok(v_fer = any (app.station_crew(pg_temp.station('Freidora')))
    and not (v_fer = any (app.station_crew(pg_temp.station('Comal')))), 'una persona está en una sola estación');

  -- El evento guarda al equipo presente.
  perform pg_temp.login('elena@demo.prepiq.test');
  r := public.rpc_order_submit_v2(gen_random_uuid(), pg_temp.rid(), null, jsonb_build_object(
    'id', gen_random_uuid(), 'order_type', 'barra', 'items', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'menu_item_id', pg_temp.mi('Papas fritas'), 'qty', 1))), 'todo');
  perform pg_temp.login('kds-comal@demo.prepiq.test');
  perform public.rpc_ticket_action(gen_random_uuid(), pg_temp.rid(), null, (r->'sent_tickets'->0->>'id')::uuid, 'listo');
  perform pg_temp.ok(exists (select 1 from public.ticket_events where ticket_id = (r->'sent_tickets'->0->>'id')::uuid
    and action = 'listo' and v_fer = any (crew)), 'el evento de listo atribuye al equipo de la estación');
  perform pg_temp.ok((public.report_ticket_timeline(pg_temp.rid(), (r->'sent_tickets'->0->>'id')::uuid)->'events'->-1->'crew') ? 'Fer',
    'el historial muestra al equipo');
end $$;

-- =====================================================================
-- K5. Recetas para cocina, sin costos
-- =====================================================================
do $$
declare r jsonb;
begin
  perform pg_temp.login('kds-comal@demo.prepiq.test');
  r := public.kds_recipe_book(pg_temp.rid());
  perform pg_temp.ok(jsonb_array_length(r) >= 1 and exists (select 1 from jsonb_array_elements(r) e where e->>'name' = 'Pico de gallo'
    and jsonb_array_length(e->'lines') > 0), 'la cocina consulta recetas activas con ingredientes');
  perform pg_temp.ok(r::text not like '%cost%', 'el libro de recetas no incluye costos');
end $$;

\echo '✔ Pruebas de KDS en lista pasaron.'
