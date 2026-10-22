-- =====================================================================
-- PrepIQ · 0006 · Etiquetas imprimibles y trazabilidad
--
-- * Las vidas útiles NO las define el sistema: el restaurante las configura
--   y registra quién las validó y cuándo. Sin regla validada, la etiqueta
--   exige fecha de caducidad manual u omitirla explícitamente.
-- * La impresión es por el navegador (cualquier impresora instalada en el
--   equipo). Como el navegador no confirma si salió bien, el usuario
--   confirma "impresa" o "falló". Reimpresión y corrección quedan registradas.
-- =====================================================================

create type public.label_status as enum ('pendiente', 'impresa', 'fallida', 'anulada');

create table public.label_templates (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null,
  width_mm       numeric not null default 50 check (width_mm between 20 and 150),
  height_mm      numeric not null default 30 check (height_mm between 15 and 150),
  -- Campos en orden: producto, lote, preparado, caduca, responsable,
  -- cantidad, almacenamiento, alergenos, notas, reimpresion, codigo
  fields         text[] not null default array['producto','preparado','caduca','responsable','lote'],
  font_scale     numeric not null default 1 check (font_scale between 0.5 and 2),
  is_default     boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, name)
);
create unique index label_templates_one_default on public.label_templates (restaurant_id) where is_default;
create trigger label_templates_touch before update on public.label_templates
  for each row execute function app.touch_updated_at();
create trigger label_templates_audit after insert or update or delete on public.label_templates
  for each row execute function app.audit();

-- Reglas de vida útil configuradas y validadas por el restaurante.
create table public.shelf_life_rules (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id   uuid references public.ingredients(id) on delete cascade,
  product_name    text,           -- para productos sin insumo asociado
  storage         text not null default 'refrigerado' check (storage in ('refrigerado', 'congelado', 'ambiente', 'caliente')),
  duration_hours  numeric not null check (duration_hours > 0 and duration_hours <= 24 * 365),
  validated_by    text not null check (length(trim(validated_by)) > 0),
  validated_on    date not null,
  source_note     text,           -- política interna, manual, etc.
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((ingredient_id is not null) or (product_name is not null))
);
create unique index shelf_life_one_active on public.shelf_life_rules
  (restaurant_id, coalesce(ingredient_id::text, lower(product_name)), storage) where active;
create trigger shelf_life_touch before update on public.shelf_life_rules
  for each row execute function app.touch_updated_at();
create trigger shelf_life_audit after insert or update or delete on public.shelf_life_rules
  for each row execute function app.audit();
create trigger shelf_life_same_rest before insert or update on public.shelf_life_rules
  for each row execute function app.check_same_restaurant('ingredients', 'ingredient_id');

create table app.label_counters (
  restaurant_id  uuid not null,
  business_date  date not null,
  last           int not null default 0,
  primary key (restaurant_id, business_date)
);

create table public.label_prints (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  template_id      uuid references public.label_templates(id) on delete set null,
  ingredient_id    uuid references public.ingredients(id) on delete set null,
  production_batch_id uuid references public.production_batches(id) on delete set null,
  shelf_life_rule_id uuid references public.shelf_life_rules(id) on delete set null,
  product_name     text not null,
  batch_code       text not null,
  prepared_at      timestamptz not null,
  expires_at       timestamptz,
  expiry_source    text not null check (expiry_source in ('regla', 'manual', 'sin_caducidad')),
  storage          text,
  quantity_text    text,
  allergens        text[] not null default '{}',
  notes            text,
  responsible_staff uuid references public.staff(id),
  responsible_name text not null,
  copies           int not null default 1 check (copies between 1 and 50),
  status           public.label_status not null default 'pendiente',
  printed_by       uuid references public.staff(id),
  device_id        uuid references public.devices(id) on delete set null,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  -- Reimpresión: misma información y mismo lote, enlazada al original.
  reprint_of       uuid references public.label_prints(id),
  reprint_reason   text,
  -- Corrección: la etiqueta original se anula y esta la sustituye.
  corrects_id      uuid references public.label_prints(id),
  void_reason      text,
  voided_by        uuid references public.staff(id),
  voided_at        timestamptz,
  check (expires_at is null or expires_at > prepared_at),
  check ((expiry_source = 'sin_caducidad') = (expires_at is null))
);
create index on public.label_prints (restaurant_id, created_at desc);
create index on public.label_prints (restaurant_id, batch_code);

-- Lote: AAMMDD-NNN por restaurante y día de negocio.
create or replace function app.next_batch_code(p_restaurant uuid) returns text
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_date date := app.business_date(p_restaurant); v_n int;
begin
  insert into app.label_counters(restaurant_id, business_date, last) values (p_restaurant, v_date, 1)
  on conflict (restaurant_id, business_date) do update set last = app.label_counters.last + 1
  returning last into v_n;
  return to_char(v_date, 'YYMMDD') || '-' || lpad(v_n::text, 3, '0');
end $$;

-- Crear etiqueta(s). p_label: {template_id, ingredient_id|product_name, production_batch_id,
--   prepared_at, storage, expires_at (manual), no_expiry (bool), quantity_text, notes,
--   responsible_staff, copies}
create or replace function public.rpc_label_create(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_label jsonb
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; v_ing public.ingredients; v_rule public.shelf_life_rules; v_name text;
  v_prepared timestamptz := coalesce((p_label->>'prepared_at')::timestamptz, now());
  v_storage text := coalesce(nullif(p_label->>'storage', ''), 'refrigerado');
  v_expires timestamptz; v_source text; v_resp uuid; v_resp_name text; v_row public.label_prints;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'label_create');
  if v_prev is not null then return v_prev; end if;
  v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'labels.print');
  if v_prepared > now() + interval '10 minutes' then perform app.fail('fecha_futura', null, 'La preparación no puede ser futura.'); end if;

  if (p_label->>'ingredient_id') is not null then
    select * into v_ing from public.ingredients where id = (p_label->>'ingredient_id')::uuid and restaurant_id = p_restaurant_id;
    if v_ing.id is null then perform app.fail('insumo_no_existe'); end if;
    v_name := v_ing.name;
    select * into v_rule from public.shelf_life_rules
      where restaurant_id = p_restaurant_id and ingredient_id = v_ing.id and storage = v_storage and active;
  else
    v_name := nullif(trim(p_label->>'product_name'), '');
    if v_name is null then perform app.fail('producto_requerido'); end if;
    select * into v_rule from public.shelf_life_rules
      where restaurant_id = p_restaurant_id and ingredient_id is null and lower(product_name) = lower(v_name)
        and storage = v_storage and active;
  end if;

  if coalesce((p_label->>'no_expiry')::boolean, false) then
    v_expires := null; v_source := 'sin_caducidad';
  elsif (p_label->>'expires_at') is not null then
    v_expires := (p_label->>'expires_at')::timestamptz; v_source := 'manual';
  elsif v_rule.id is not null then
    v_expires := v_prepared + make_interval(secs => v_rule.duration_hours * 3600); v_source := 'regla';
  else
    perform app.fail('caducidad_requerida', v_name,
      'No hay una regla de vida útil validada para este producto. Captura la fecha o indica "sin caducidad".');
  end if;

  v_resp := coalesce((p_label->>'responsible_staff')::uuid, (v_ctx->>'staff_id')::uuid);
  select display_name into v_resp_name from public.staff where id = v_resp and restaurant_id = p_restaurant_id;
  if v_resp_name is null then perform app.fail('responsable_invalido'); end if;

  insert into public.label_prints(restaurant_id, template_id, ingredient_id, production_batch_id, shelf_life_rule_id,
    product_name, batch_code, prepared_at, expires_at, expiry_source, storage, quantity_text, allergens, notes,
    responsible_staff, responsible_name, copies, printed_by, device_id)
  values (p_restaurant_id, (p_label->>'template_id')::uuid, v_ing.id, (p_label->>'production_batch_id')::uuid,
    case when v_source = 'regla' then v_rule.id end, v_name, app.next_batch_code(p_restaurant_id), v_prepared, v_expires,
    v_source, v_storage, nullif(trim(p_label->>'quantity_text'), ''), coalesce(v_ing.allergens, '{}'),
    nullif(trim(p_label->>'notes'), ''), v_resp, v_resp_name, coalesce((p_label->>'copies')::int, 1),
    (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid)
  returning * into v_row;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'label', to_jsonb(v_row)));
end $$;

-- confirmar (impresa) | fallida | reimprimir (con motivo) | anular (con motivo)
-- | corregir (anula y crea una nueva con los datos corregidos en p_args.label)
create or replace function public.rpc_label_action(
  p_op_id uuid, p_restaurant_id uuid, p_actor_token uuid, p_label_id uuid, p_action text,
  p_args jsonb default '{}'::jsonb, p_override uuid default null
) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_prev jsonb; v_ctx jsonb; l public.label_prints; v_new public.label_prints; v_reason text := nullif(trim(p_args->>'reason'), '');
  v_res jsonb;
begin
  v_prev := app.op_begin(p_op_id, p_restaurant_id, 'label_action');
  if v_prev is not null then return v_prev; end if;
  select * into l from public.label_prints where id = p_label_id and restaurant_id = p_restaurant_id for update;
  if l.id is null then perform app.fail('etiqueta_no_encontrada'); end if;

  if p_action in ('confirmar', 'fallida') then
    v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'labels.print');
    if l.status not in ('pendiente', 'fallida') then
      return app.op_finish(p_op_id, jsonb_build_object('ok', true, 'noop', true, 'label', to_jsonb(l)));
    end if;
    update public.label_prints set status = case when p_action = 'confirmar' then 'impresa' else 'fallida' end::public.label_status,
      confirmed_at = now() where id = l.id returning * into l;
    if p_action = 'fallida' then
      insert into public.incidents(restaurant_id, kind, description, created_by, device_id)
      values (p_restaurant_id, 'impresora', 'Falló la impresión de la etiqueta ' || l.batch_code || ' (' || l.product_name || ')'
        || coalesce(': ' || v_reason, ''), (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid);
    end if;
    v_res := jsonb_build_object('label', to_jsonb(l));
  elsif p_action = 'reimprimir' then
    -- Reintento de una impresión fallida no requiere permiso extra; un
    -- duplicado de una etiqueta ya impresa sí (labels.reprint).
    v_ctx := app.authorize(p_restaurant_id, p_actor_token,
      case when l.status = 'fallida' then 'labels.print' else 'labels.reprint' end, p_override);
    if l.status = 'anulada' then perform app.fail('etiqueta_anulada'); end if;
    if v_reason is null then perform app.fail('motivo_requerido', null, '¿Por qué se reimprime?'); end if;
    insert into public.label_prints(restaurant_id, template_id, ingredient_id, production_batch_id, shelf_life_rule_id,
      product_name, batch_code, prepared_at, expires_at, expiry_source, storage, quantity_text, allergens, notes,
      responsible_staff, responsible_name, copies, printed_by, device_id, reprint_of, reprint_reason)
    select restaurant_id, template_id, ingredient_id, production_batch_id, shelf_life_rule_id, product_name, batch_code,
      prepared_at, expires_at, expiry_source, storage, quantity_text, allergens, notes, responsible_staff, responsible_name,
      coalesce((p_args->>'copies')::int, copies), (v_ctx->>'staff_id')::uuid, (v_ctx->>'device_id')::uuid,
      coalesce(l.reprint_of, l.id), v_reason
    from public.label_prints where id = l.id
    returning * into v_new;
    v_res := jsonb_build_object('label', to_jsonb(v_new));
  elsif p_action in ('anular', 'corregir') then
    v_ctx := app.authorize(p_restaurant_id, p_actor_token, 'labels.reprint', p_override);
    if v_reason is null then perform app.fail('motivo_requerido'); end if;
    if l.status = 'anulada' then perform app.fail('etiqueta_anulada'); end if;
    update public.label_prints set status = 'anulada', void_reason = v_reason, voided_by = (v_ctx->>'staff_id')::uuid,
      voided_at = now() where id = l.id returning * into l;
    v_res := jsonb_build_object('label', to_jsonb(l));
    if p_action = 'corregir' then
      v_res := public.rpc_label_create(gen_random_uuid(), p_restaurant_id, p_actor_token, p_args->'label');
      update public.label_prints set corrects_id = l.id where id = (v_res->'label'->>'id')::uuid
        returning * into v_new;
      v_res := jsonb_build_object('label', to_jsonb(v_new), 'voided', to_jsonb(l));
    end if;
  else
    perform app.fail('accion_invalida', p_action);
  end if;
  return app.op_finish(p_op_id, jsonb_build_object('ok', true) || v_res);
end $$;
