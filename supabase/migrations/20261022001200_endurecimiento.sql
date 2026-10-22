-- =====================================================================
-- PrepIQ · 0012 · Endurecimiento multi‑restaurante
-- Defensa en profundidad: aunque una RPC reciba el id de un registro de otro
-- restaurante, la base de datos rechaza la relación.
-- =====================================================================

create trigger inventory_movements_same_rest before insert on public.inventory_movements
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');
create trigger count_lines_same_rest_ing before insert or update on public.inventory_count_lines
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');
create trigger count_lines_same_rest_count before insert or update on public.inventory_count_lines
  for each row execute function app.check_same_restaurant('inventory_counts', 'count_id');
create trigger production_same_rest before insert on public.production_batches
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');
create trigger label_prints_same_rest_tpl before insert or update on public.label_prints
  for each row execute function app.check_same_restaurant('label_templates', 'template_id');
create trigger label_prints_same_rest_ing before insert or update on public.label_prints
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');
create trigger label_prints_same_rest_batch before insert or update on public.label_prints
  for each row execute function app.check_same_restaurant('production_batches', 'production_batch_id');
create trigger incidents_same_rest_station before insert or update on public.incidents
  for each row execute function app.check_same_restaurant('stations', 'station_id');
create trigger incidents_same_rest_ticket before insert or update on public.incidents
  for each row execute function app.check_same_restaurant('kitchen_tickets', 'ticket_id');
create trigger incidents_same_rest_item before insert or update on public.incidents
  for each row execute function app.check_same_restaurant('menu_items', 'menu_item_id');
create trigger incidents_same_rest_ing before insert or update on public.incidents
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');
create trigger order_items_same_rest_order before insert on public.order_items
  for each row execute function app.check_same_restaurant('orders', 'order_id');
create trigger order_items_same_rest_item before insert on public.order_items
  for each row execute function app.check_same_restaurant('menu_items', 'menu_item_id');
create trigger tickets_same_rest_station before insert on public.kitchen_tickets
  for each row execute function app.check_same_restaurant('stations', 'station_id');
create trigger availability_events_same_rest before insert on public.availability_events
  for each row execute function app.check_same_restaurant('menu_items', 'menu_item_id');
create trigger time_off_same_rest before insert on public.time_off_requests
  for each row execute function app.check_same_restaurant('staff', 'staff_id');
create trigger swaps_same_rest before insert on public.shift_swap_requests
  for each row execute function app.check_same_restaurant('shifts', 'shift_id');
create trigger swaps_same_rest_to before insert or update on public.shift_swap_requests
  for each row execute function app.check_same_restaurant('staff', 'to_staff');
create trigger punches_same_rest before insert on public.time_punches
  for each row execute function app.check_same_restaurant('staff', 'staff_id');
create trigger corrections_same_rest before insert on public.punch_corrections
  for each row execute function app.check_same_restaurant('staff', 'staff_id');
create trigger orders_same_rest_server before insert or update on public.orders
  for each row execute function app.check_same_restaurant('staff', 'server_staff_id');

-- Merma "por platillo": el platillo debe ser del restaurante.
create or replace function app.assert_menu_item(p_restaurant uuid, p_menu_item uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if p_menu_item is not null and not exists (select 1 from public.menu_items where id = p_menu_item and restaurant_id = p_restaurant) then
    perform app.fail('producto_no_existe');
  end if;
end $$;

create or replace function app.inventory_record_guard() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  -- source_key guarda el id del platillo en mermas por platillo.
  if new.source_type = 'manual' and new.source_key ~ '^[0-9a-f-]{36}$' then
    perform app.assert_menu_item(new.restaurant_id, new.source_key::uuid);
  end if;
  return new;
end $$;
create trigger inventory_movements_manual_guard before insert on public.inventory_movements
  for each row execute function app.inventory_record_guard();

revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_member(uuid), app.has_perm(uuid, text), app.my_staff_id(uuid),
  app.is_org_admin(uuid), app.staff_has_perm(uuid, text), app.m(uuid), app.p(uuid, text) to authenticated;
