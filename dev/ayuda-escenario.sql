-- Escenario para las capturas del tutorial del KDS (dev/ayuda-kds.mjs).
-- Se corre sobre la base local con semilla (Taquería Demo).
\set ON_ERROR_STOP 1
do $$
declare
  r uuid := (select id from public.restaurants where name = 'Taquería Demo');
  u uuid := (select id from auth.users where email = 'elena@demo.prepiq.test');
  mi_arr uuid; mi_bur uuid; mi_quesa uuid; mi_pastor uuid; mi_papas uuid; mi_hor uuid;
  m_maiz uuid; m_harina uuid; m_medio uuid; m_sincebolla uuid; m_queso uuid;
  v_res jsonb;
  function_order int := 0;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
  select id into mi_arr from public.menu_items where restaurant_id = r and name = 'Orden de tacos de arrachera (3)';
  select id into mi_bur from public.menu_items where restaurant_id = r and name = 'Hamburguesa de la casa';
  select id into mi_quesa from public.menu_items where restaurant_id = r and name = 'Quesadilla';
  select id into mi_pastor from public.menu_items where restaurant_id = r and name = 'Orden de tacos al pastor (3)';
  select id into mi_papas from public.menu_items where restaurant_id = r and name = 'Papas fritas';
  select id into mi_hor from public.menu_items where restaurant_id = r and name = 'Agua de horchata';
  select id into m_maiz from public.modifiers where restaurant_id = r and name = 'Maíz';
  select id into m_harina from public.modifiers where restaurant_id = r and name = 'Harina';
  select id into m_medio from public.modifiers where restaurant_id = r and name = 'Término medio';
  select id into m_sincebolla from public.modifiers where restaurant_id = r and name = 'Sin cebolla';
  select id into m_queso from public.modifiers where restaurant_id = r and name = 'Queso extra';

  v_res := public.rpc_order_submit_v2(gen_random_uuid(), r, null, jsonb_build_object('id', gen_random_uuid(), 'order_type', 'mesa', 'table_label', '4',
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_arr, 'qty', 3, 'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', m_maiz), jsonb_build_object('modifier_id', m_sincebolla))),
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_hor, 'qty', 2))), 'todo');
  v_res := public.rpc_order_submit_v2(gen_random_uuid(), r, null, jsonb_build_object('id', gen_random_uuid(), 'order_type', 'mesa', 'table_label', '7',
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_bur, 'qty', 2, 'notes', 'Sin pepinillos', 'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', m_medio))),
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_pastor, 'qty', 1, 'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', m_maiz))))), 'todo');
  v_res := public.rpc_order_submit_v2(gen_random_uuid(), r, null, jsonb_build_object('id', gen_random_uuid(), 'order_type', 'llevar', 'customer_name', 'Laura',
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_arr, 'qty', 1, 'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', m_harina), jsonb_build_object('modifier_id', m_queso))),
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_quesa, 'qty', 2, 'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', m_maiz))),
      jsonb_build_object('id', gen_random_uuid(), 'menu_item_id', mi_papas, 'qty', 1))), 'todo');
  -- Tiempos variados: unos a tiempo, uno en atención, uno tarde.
  update public.kitchen_tickets k set fired_at = now() - make_interval(secs => x.secs), created_at = now() - make_interval(secs => x.secs)
  from (select id, (row_number() over (order by created_at, unit_no) * 40 + 20) as secs from public.kitchen_tickets
        where restaurant_id = r and status = 'nuevo') x where x.id = k.id;
  update public.kitchen_tickets set fired_at = now() - interval '13 minutes'
  where id = (select id from public.kitchen_tickets where restaurant_id = r and status = 'nuevo'
              and station_id = (select id from public.stations where restaurant_id = r and name = 'Parrilla') order by fired_at limit 1);
end $$;

-- Equipo en Parrilla (para que se vea el botón de equipo con nombres).
insert into public.station_assignments(restaurant_id, business_date, station_id, staff_id, present)
select r.id, app.business_date(r.id), s.id, p.id, true
from public.restaurants r join public.stations s on s.restaurant_id = r.id and s.name = 'Parrilla'
join public.staff p on p.restaurant_id = r.id and p.display_name in ('Carla', 'Fer')
where r.name = 'Taquería Demo'
on conflict (business_date, station_id, staff_id) do update set present = true;
