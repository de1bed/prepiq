-- =====================================================================
-- PrepIQ · 0010 · Seguridad a nivel de fila (RLS), privilegios y realtime
--
-- Regla general:
--   * Lectura: miembros del restaurante, acotada por permiso donde hay datos
--     sensibles (costos, contacto, asistencia ajena, auditoría).
--   * Escritura directa: SOLO tablas de configuración y con permiso.
--   * Operación (órdenes, tickets, inventario, etiquetas, asistencia):
--     únicamente por RPC; el rol `authenticated` no tiene INSERT/UPDATE/DELETE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Privilegios base
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Tablas de configuración que el cliente edita directamente (con RLS).
grant insert, update, delete on
  public.restaurants, public.staff, public.staff_private, public.devices,
  public.stations, public.menu_categories, public.menu_items, public.menu_item_routes,
  public.modifier_groups, public.modifiers, public.menu_item_modifier_groups,
  public.ingredients, public.ingredient_costs, public.ingredient_units,
  public.recipes, public.recipe_versions, public.recipe_lines, public.modifier_inventory_lines,
  public.label_templates, public.shelf_life_rules, public.shifts, public.staff_availability
to authenticated;
revoke insert, delete on public.restaurants from authenticated;  -- se crean por RPC

-- Funciones: nada para anon; RPC públicas para authenticated.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_member(uuid), app.has_perm(uuid, text), app.my_staff_id(uuid),
  app.is_org_admin(uuid), app.staff_has_perm(uuid, text) to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Habilitar RLS en todas las tablas de public
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Atajos
-- m(r)  = es miembro;  p(r,x) = tiene permiso x
create or replace function app.m(r uuid) returns boolean language sql stable as $$ select app.is_member(r) $$;
create or replace function app.p(r uuid, x text) returns boolean language sql stable as $$ select app.has_perm(r, x) $$;
grant execute on function app.m(uuid), app.p(uuid, text) to authenticated;

-- Organización
create policy org_select on public.organizations for select to authenticated
  using (exists (select 1 from public.org_members m where m.organization_id = id and m.user_id = auth.uid()));
create policy org_members_select on public.org_members for select to authenticated
  using (user_id = auth.uid());

-- Restaurante
create policy restaurants_select on public.restaurants for select to authenticated using (app.m(id));
create policy restaurants_update on public.restaurants for update to authenticated
  using (app.p(id, 'config.manage')) with check (app.p(id, 'config.manage'));

-- Personas
create policy staff_select on public.staff for select to authenticated using (app.m(restaurant_id));
create policy staff_insert on public.staff for insert to authenticated with check (app.p(restaurant_id, 'staff.manage'));
create policy staff_update on public.staff for update to authenticated
  using (app.p(restaurant_id, 'staff.manage')) with check (app.p(restaurant_id, 'staff.manage'));
create policy staff_delete on public.staff for delete to authenticated using (app.p(restaurant_id, 'staff.manage'));

create policy staff_private_select on public.staff_private for select to authenticated
  using (app.p(restaurant_id, 'staff.manage')
         or exists (select 1 from public.staff s where s.id = staff_id and s.user_id = auth.uid()));
create policy staff_private_write on public.staff_private for all to authenticated
  using (app.p(restaurant_id, 'staff.manage')
         or exists (select 1 from public.staff s where s.id = staff_id and s.user_id = auth.uid()))
  with check (app.p(restaurant_id, 'staff.manage')
         or exists (select 1 from public.staff s where s.id = staff_id and s.user_id = auth.uid()));

-- Evitar escalamiento: un usuario no puede cambiar sus propios roles salvo org-admin.
create or replace function app.staff_guard() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;  -- service role
  if current_setting('app.internal_staff_write', true) = 'on' then return new; end if;  -- RPC internas
  if tg_op = 'UPDATE' and old.user_id = auth.uid() and new.roles is distinct from old.roles
     and not app.is_org_admin(old.restaurant_id) then
    perform app.fail('no_puedes_cambiar_tus_roles');
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and not app.is_org_admin(old.restaurant_id)
     and new.user_id is not null then
    perform app.fail('vinculacion_por_solicitud', null, 'Las cuentas se vinculan aprobando una solicitud de unión.');
  end if;
  if tg_op = 'INSERT' and new.user_id is not null and not app.is_org_admin(new.restaurant_id) then
    perform app.fail('vinculacion_por_solicitud');
  end if;
  return new;
end $$;
create trigger staff_guard before insert or update on public.staff
  for each row execute function app.staff_guard();

-- Dispositivos
create policy devices_select on public.devices for select to authenticated using (app.m(restaurant_id));
create policy devices_update on public.devices for update to authenticated
  using (app.p(restaurant_id, 'devices.manage')) with check (app.p(restaurant_id, 'devices.manage'));
create policy devices_delete on public.devices for delete to authenticated using (app.p(restaurant_id, 'devices.manage'));

create policy join_requests_select on public.join_requests for select to authenticated
  using (user_id = auth.uid() or app.p(restaurant_id, 'staff.manage') or app.p(restaurant_id, 'devices.manage'));

create policy audit_select on public.audit_log for select to authenticated using (app.p(restaurant_id, 'audit.view'));

-- Estaciones y menú: lectura para miembros; escritura con permiso.
create policy stations_select on public.stations for select to authenticated using (app.m(restaurant_id));
create policy stations_write on public.stations for all to authenticated
  using (app.p(restaurant_id, 'config.manage')) with check (app.p(restaurant_id, 'config.manage'));

do $$
declare t text;
begin
  foreach t in array array['menu_categories', 'menu_items', 'menu_item_routes', 'modifier_groups', 'modifiers',
                           'menu_item_modifier_groups'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (app.m(restaurant_id))', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated
      using (app.p(restaurant_id, ''menu.manage'')) with check (app.p(restaurant_id, ''menu.manage''))', t);
  end loop;
end $$;

create policy availability_events_select on public.availability_events for select to authenticated using (app.m(restaurant_id));

-- Inventario
create policy units_select on public.units for select to authenticated using (true);

create policy ingredients_select on public.ingredients for select to authenticated
  using (app.p(restaurant_id, 'inventory.view') or app.p(restaurant_id, 'labels.print') or app.p(restaurant_id, 'menu.manage'));
create policy ingredients_write on public.ingredients for all to authenticated
  using (app.p(restaurant_id, 'inventory.manage')) with check (app.p(restaurant_id, 'inventory.manage'));
create policy ingredient_units_select on public.ingredient_units for select to authenticated
  using (app.p(restaurant_id, 'inventory.view'));
create policy ingredient_units_write on public.ingredient_units for all to authenticated
  using (app.p(restaurant_id, 'inventory.manage')) with check (app.p(restaurant_id, 'inventory.manage'));
create policy ingredient_costs_select on public.ingredient_costs for select to authenticated
  using (app.p(restaurant_id, 'inventory.view_cost'));
create policy ingredient_costs_write on public.ingredient_costs for all to authenticated
  using (app.p(restaurant_id, 'inventory.manage') and app.p(restaurant_id, 'inventory.view_cost'))
  with check (app.p(restaurant_id, 'inventory.manage') and app.p(restaurant_id, 'inventory.view_cost'));

-- Recetas: cocina puede consultarlas (visor de recetas).
do $$
declare t text;
begin
  foreach t in array array['recipes', 'recipe_versions', 'recipe_lines', 'modifier_inventory_lines'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
      using (app.p(restaurant_id, ''inventory.view'') or app.p(restaurant_id, ''kds.view''))', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated
      using (app.p(restaurant_id, ''inventory.manage'')) with check (app.p(restaurant_id, ''inventory.manage''))', t);
  end loop;
end $$;

-- Movimientos (incluyen costo): solo con permiso de costos. Cocina usa
-- inventory_stock_list / inventory_movements_list (sin costos).
create policy inventory_movements_select on public.inventory_movements for select to authenticated
  using (app.p(restaurant_id, 'inventory.view_cost'));
create policy receptions_select on public.receptions for select to authenticated using (app.p(restaurant_id, 'inventory.view'));
create policy production_batches_select on public.production_batches for select to authenticated using (app.p(restaurant_id, 'inventory.view'));
create policy inventory_counts_select on public.inventory_counts for select to authenticated using (app.p(restaurant_id, 'inventory.view'));
create policy inventory_count_lines_select on public.inventory_count_lines for select to authenticated using (app.p(restaurant_id, 'inventory.view'));

-- Servicio
create policy service_days_select on public.service_days for select to authenticated using (app.m(restaurant_id));
create policy orders_select on public.orders for select to authenticated
  using (app.p(restaurant_id, 'orders.view_all') or server_staff_id = app.my_staff_id(restaurant_id));
create policy order_items_select on public.order_items for select to authenticated
  using (app.p(restaurant_id, 'orders.view_all')
         or exists (select 1 from public.orders o where o.id = order_id and o.server_staff_id = app.my_staff_id(o.restaurant_id)));
create policy kitchen_tickets_select on public.kitchen_tickets for select to authenticated using (app.p(restaurant_id, 'kds.view'));
create policy ticket_items_select on public.ticket_items for select to authenticated using (app.p(restaurant_id, 'kds.view'));
create policy ticket_events_select on public.ticket_events for select to authenticated using (app.p(restaurant_id, 'kds.view'));
create policy incidents_select on public.incidents for select to authenticated using (app.m(restaurant_id));

-- Etiquetas
create policy label_templates_select on public.label_templates for select to authenticated
  using (app.p(restaurant_id, 'labels.print') or app.p(restaurant_id, 'labels.manage'));
create policy label_templates_write on public.label_templates for all to authenticated
  using (app.p(restaurant_id, 'labels.manage')) with check (app.p(restaurant_id, 'labels.manage'));
create policy shelf_life_select on public.shelf_life_rules for select to authenticated
  using (app.p(restaurant_id, 'labels.print') or app.p(restaurant_id, 'labels.manage'));
create policy shelf_life_write on public.shelf_life_rules for all to authenticated
  using (app.p(restaurant_id, 'labels.manage')) with check (app.p(restaurant_id, 'labels.manage'));
create policy label_prints_select on public.label_prints for select to authenticated
  using (app.p(restaurant_id, 'labels.print') or app.p(restaurant_id, 'labels.reprint'));

-- Horarios: el equipo ve turnos publicados propios y abiertos; gerencia ve todo.
create policy shifts_select on public.shifts for select to authenticated
  using (app.p(restaurant_id, 'schedule.manage')
         or (status = 'publicado' and (app.p(restaurant_id, 'schedule.view_team')
             or staff_id = app.my_staff_id(restaurant_id) or staff_id is null)));
create policy shifts_write on public.shifts for all to authenticated
  using (app.p(restaurant_id, 'schedule.manage')) with check (app.p(restaurant_id, 'schedule.manage'));

create policy availability_select on public.staff_availability for select to authenticated
  using (app.p(restaurant_id, 'schedule.manage') or staff_id = app.my_staff_id(restaurant_id));
create policy availability_write on public.staff_availability for all to authenticated
  using (app.p(restaurant_id, 'schedule.manage') or staff_id = app.my_staff_id(restaurant_id))
  with check (app.p(restaurant_id, 'schedule.manage') or staff_id = app.my_staff_id(restaurant_id));

create policy time_off_select on public.time_off_requests for select to authenticated
  using (app.p(restaurant_id, 'schedule.manage') or staff_id = app.my_staff_id(restaurant_id));
create policy swaps_select on public.shift_swap_requests for select to authenticated
  using (app.p(restaurant_id, 'schedule.manage') or from_staff = app.my_staff_id(restaurant_id)
         or to_staff = app.my_staff_id(restaurant_id) or (to_staff is null and status = 'pendiente' and app.m(restaurant_id)));

-- Asistencia
create policy punches_select on public.time_punches for select to authenticated
  using (app.p(restaurant_id, 'attendance.manage') or staff_id = app.my_staff_id(restaurant_id));
create policy corrections_select on public.punch_corrections for select to authenticated
  using (app.p(restaurant_id, 'attendance.manage') or staff_id = app.my_staff_id(restaurant_id));

-- ---------------------------------------------------------------------
-- Realtime: cambios que las pantallas escuchan (respetan RLS).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['kitchen_tickets', 'ticket_items', 'orders', 'order_items', 'incidents',
                             'menu_items', 'modifiers', 'service_days', 'label_prints'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Mantenimiento: limpiar registros técnicos viejos (llamar con pg_cron o
-- manualmente). No toca datos de negocio.
-- ---------------------------------------------------------------------
create or replace function app.housekeeping() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare a int; b int; c int; d int;
begin
  delete from app.processed_ops where created_at < now() - interval '30 days'; get diagnostics a = row_count;
  delete from app.pin_attempts where at < now() - interval '30 days'; get diagnostics b = row_count;
  delete from app.device_sessions where coalesce(ended_at, expires_at) < now() - interval '30 days'; get diagnostics c = row_count;
  delete from app.override_grants where expires_at < now() - interval '30 days'; get diagnostics d = row_count;
  return jsonb_build_object('processed_ops', a, 'pin_attempts', b, 'device_sessions', c, 'override_grants', d);
end $$;
