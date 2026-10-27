// Tipos de dominio (espejo de las tablas de Supabase que usa la interfaz).

export type AppRole = 'admin' | 'gerente' | 'cocinero' | 'mesero';
export type DeviceMode = 'kds' | 'expo' | 'pos' | 'kiosko';
export type Permission = string;

export type TicketStatus = 'en_espera' | 'nuevo' | 'en_preparacion' | 'listo' | 'entregado' | 'anulado';
export type TicketItemStatus = 'pendiente' | 'listo' | 'anulado';
export type OrderStatus = 'abierta' | 'cerrada' | 'anulada';
export type OrderItemStatus = 'pendiente' | 'enviado' | 'anulado';
export type OrderType = 'mesa' | 'llevar' | 'barra' | 'domicilio';

export interface RestaurantSettings {
  auto_open_service_day?: boolean;
  allow_personal_punch?: boolean;
  team_on_time_goal_pct?: number;
  kds_warn_pct?: number;
  kds_late_pct?: number;
  labels?: Partial<Record<'nuevo' | 'en_preparacion' | 'listo' | 'entregado' | 'bump' | 'deliver', string>>;
}

export interface StaffContext {
  staff_id: string;
  restaurant_id: string;
  restaurant_name: string;
  display_name: string;
  roles: AppRole[];
  timezone: string;
  currency: string;
  settings: RestaurantSettings;
  is_demo: boolean;
  permissions: Permission[];
}

export interface DeviceContext {
  device_id: string;
  restaurant_id: string;
  restaurant_name: string;
  name: string;
  mode: DeviceMode;
  station_id: string | null;
  timezone: string;
  currency: string;
  settings: RestaurantSettings;
  is_demo: boolean;
}

export interface MyContexts {
  user_id: string;
  staff: StaffContext[];
  device: DeviceContext | null;
  pending_requests: { id: string; restaurant_name: string; kind: string; status: string; created_at: string }[];
  organizations: { organization_id: string; name: string; role: string }[];
}

export interface Station {
  id: string;
  restaurant_id: string;
  name: string;
  kind: 'cocina' | 'barra' | 'pase' | 'prep';
  color: string;
  sort: number;
  active: boolean;
}

export interface MenuCategory { id: string; restaurant_id: string; name: string; sort: number; active: boolean }

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  kitchen_name: string | null;
  description: string | null;
  price: number;
  prep_minutes: number;
  complexity: number;
  allergens: string[];
  sort: number;
  active: boolean;
  available: boolean;
  unavailable_reason: string | null;
}

export interface MenuItemRoute { id: string; restaurant_id: string; menu_item_id: string; station_id: string; component: string | null; sort: number }

export interface ModifierGroup { id: string; restaurant_id: string; name: string; min_select: number; max_select: number; sort: number; active: boolean }
export interface Modifier {
  id: string; restaurant_id: string; group_id: string; name: string; kitchen_label: string | null;
  price_delta: number; sort: number; active: boolean; available: boolean;
}
export interface MenuItemModifierGroup { restaurant_id: string; menu_item_id: string; group_id: string; sort: number }

export interface OrderModifierSnapshot {
  modifier_id: string; group_id?: string; name: string; kitchen_label: string; price_delta: number; qty: number;
}

export interface Order {
  id: string;
  restaurant_id: string;
  service_day_id: string;
  number: number;
  order_type: OrderType;
  table_label: string | null;
  guest_count: number | null;
  customer_name: string | null;
  notes: string | null;
  status: OrderStatus;
  server_staff_id: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface OrderItem {
  id: string;
  restaurant_id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  kitchen_name: string | null;
  unit_price: number;
  qty: number;
  modifiers: OrderModifierSnapshot[];
  notes: string | null;
  course: number;
  seat: number | null;
  status: OrderItemStatus;
  replaces_item_id: string | null;
  sent_at: string | null;
  void_reason: string | null;
  created_at: string;
  /** Estaciones extra a las que también se envió (además de su ruta). */
  extra_station_ids?: string[];
}

export interface KitchenTicket {
  id: string;
  restaurant_id: string;
  service_day_id: string;
  order_id: string;
  station_id: string;
  order_number: number;
  order_type: OrderType;
  table_label: string | null;
  server_name: string | null;
  status: TicketStatus;
  course: number;
  priority: boolean;
  target_minutes: number;
  complexity_points: number;
  created_at: string;
  fired_at: string | null;
  started_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  voided_at: string | null;
  blocked: boolean;
  blocked_since: string | null;
  blocked_reason: string | null;
  blocked_seconds: number;
  reopen_count: number;
  version: number;
  updated_at: string;
  /** Ticket por unidad: línea de la orden y número de unidad (1/3, 2/3…). Null en tickets anteriores. */
  order_item_id?: string | null;
  unit_no?: number | null;
  unit_count?: number | null;
  /** Segundos que estuvo terminado antes de reabrirse (no cuentan en el cronómetro). */
  paused_seconds?: number;
  /** Enviado a esta estación como extra (fuera de la ruta normal). */
  extra_station?: boolean;
}

export interface TicketItem {
  id: string;
  restaurant_id: string;
  ticket_id: string;
  order_item_id: string;
  component: string | null;
  display_name: string;
  qty: number;
  modifiers: OrderModifierSnapshot[];
  notes: string | null;
  seat: number | null;
  is_change: boolean;
  status: TicketItemStatus;
  ready_at: string | null;
  sort: number;
  menu_item_id?: string | null;
}

export interface TicketWithItems extends KitchenTicket { items: TicketItem[] }

export interface Staff {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  display_name: string;
  roles: AppRole[];
  employee_code: string | null;
  pin_set_at: string | null;
  color: string | null;
  active: boolean;
}

export interface Incident {
  id: string;
  restaurant_id: string;
  kind: 'faltante' | 'equipo' | 'impresora' | 'calidad' | 'otro';
  status: 'abierta' | 'en_atencion' | 'resuelta';
  station_id: string | null;
  ticket_id: string | null;
  menu_item_id: string | null;
  ingredient_id: string | null;
  description: string;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

export interface ServiceDay {
  id: string; restaurant_id: string; business_date: string; status: 'abierta' | 'cerrada';
  opened_at: string; closed_at: string | null; close_note: string | null;
}

export interface Ingredient {
  id: string; restaurant_id: string; name: string; category: string | null; base_unit: 'g' | 'ml' | 'pza';
  kind: 'compra' | 'preparado'; par_level: number | null; storage: string | null; allergens: string[]; active: boolean;
}
export interface IngredientUnit { id: string; restaurant_id: string; ingredient_id: string; name: string; to_base: number }
export interface Unit { code: string; name: string; dimension: 'masa' | 'volumen' | 'pieza'; to_base: number }

export interface StockRow {
  ingredient_id: string; name: string; category: string | null; base_unit: 'g' | 'ml' | 'pza';
  kind: 'compra' | 'preparado'; par_level: number | null; active: boolean; theoretical_qty: number;
  last_count_at: string | null; last_movement_at: string | null; below_par: boolean;
}

export interface Recipe {
  id: string; restaurant_id: string; kind: 'menu' | 'prep'; name: string;
  menu_item_id: string | null; output_ingredient_id: string | null;
}
export interface RecipeVersion {
  id: string; restaurant_id: string; recipe_id: string; version: number; status: 'borrador' | 'activa' | 'retirada';
  yield_qty: number | null; yield_unit: string | null; instructions: string | null; notes: string | null;
  created_at: string; activated_at: string | null;
}
export interface RecipeLine {
  id: string; restaurant_id: string; version_id: string; ingredient_id: string; qty: number; unit: string;
  base_qty: number; notes: string | null; sort: number;
}

export interface LabelTemplate {
  id: string; restaurant_id: string; name: string; width_mm: number; height_mm: number; fields: string[];
  font_scale: number; is_default: boolean; active: boolean;
}
export interface ShelfLifeRule {
  id: string; restaurant_id: string; ingredient_id: string | null; product_name: string | null; storage: string;
  duration_hours: number; validated_by: string; validated_on: string; source_note: string | null; active: boolean;
}
export interface LabelPrint {
  id: string; restaurant_id: string; template_id: string | null; ingredient_id: string | null; product_name: string;
  batch_code: string; prepared_at: string; expires_at: string | null; expiry_source: 'regla' | 'manual' | 'sin_caducidad';
  storage: string | null; quantity_text: string | null; allergens: string[]; notes: string | null;
  responsible_name: string; copies: number; status: 'pendiente' | 'impresa' | 'fallida' | 'anulada';
  created_at: string; reprint_of: string | null; reprint_reason: string | null; corrects_id: string | null;
  void_reason: string | null;
}

export interface Shift {
  id: string; restaurant_id: string; staff_id: string | null; role: AppRole | null; station_id: string | null;
  starts_at: string; ends_at: string; break_minutes: number; notes: string | null;
  status: 'borrador' | 'publicado' | 'cancelado'; published_at: string | null;
}

export interface TimePunch {
  id: string; restaurant_id: string; staff_id: string; kind: 'entrada' | 'inicio_descanso' | 'fin_descanso' | 'salida';
  at: string; source: 'kiosko' | 'personal' | 'correccion'; offline: boolean; voided: boolean; note: string | null;
}

export interface InventoryCount {
  id: string; restaurant_id: string; name: string; status: 'abierto' | 'enviado' | 'aprobado' | 'cancelado';
  as_of: string; category: string | null; note: string | null; created_at: string; approved_at: string | null;
}
export interface InventoryCountLine {
  id: string; count_id: string; ingredient_id: string; counted_qty: number; unit: string; counted_base: number;
  theoretical_base: number | null; variance_base: number | null; counted_at: string; note: string | null;
}
