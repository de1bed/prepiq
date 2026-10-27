// Consultas de datos (TanStack Query) + suscripción de tiempo real con
// respaldo por sondeo. Toda pantalla en vivo se refresca al reconectar.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { read, rpc } from '@/lib/rpc';
import { useApp } from '@/state/session';
import { useSync } from '@/state/sync';
import type {
  Incident, MenuCategory, MenuItem, MenuItemModifierGroup, MenuItemRoute, Modifier, ModifierGroup, Order, OrderItem,
  ServiceDay, Staff, Station, TicketWithItems, Ingredient, IngredientUnit, Unit, StockRow,
} from '@/lib/types';

// "Listo" es terminado para cocina: ya no cuenta como activo (se ve en Recientes).
export const ACTIVE_TICKET_STATUSES = ['en_espera', 'nuevo', 'en_preparacion'] as const;

function useRid(): string {
  const { restaurant } = useApp();
  return restaurant?.id ?? '';
}

/** Escucha cambios de tablas del restaurante e invalida consultas. Si el
 * canal no conecta (o se cae), la pantalla cambia a sondeo periódico. */
export function useLiveTables(key: string, tables: string[], queryKeys: string[][]) {
  const rid = useRid();
  const qc = useQueryClient();
  const { setRealtime } = useSync();
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  useEffect(() => {
    if (!rid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        keysRef.current.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      }, 150);
    };
    setRealtime(key, 'connecting');
    let channel = supabase.channel(`live:${key}:${rid}`);
    for (const table of tables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `restaurant_id=eq.${rid}` }, invalidate);
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setRealtime(key, 'live');
        invalidate(); // al (re)conectar, recuperar lo que se pudo perder
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRealtime(key, 'polling');
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      setRealtime(key, null);
      void supabase.removeChannel(channel);
    };
  }, [rid, key, tables.join(','), qc, setRealtime]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Intervalo de respaldo: corto si no hay tiempo real, largo si sí. */
export function usePollInterval(): number {
  const { realtime } = useSync();
  return realtime === 'live' ? 30_000 : 8_000;
}

export interface MenuData {
  categories: MenuCategory[];
  items: MenuItem[];
  routes: MenuItemRoute[];
  groups: ModifierGroup[];
  modifiers: Modifier[];
  itemGroups: MenuItemModifierGroup[];
}

export function useMenu() {
  const rid = useRid();
  return useQuery({
    queryKey: ['menu', rid],
    enabled: !!rid,
    staleTime: 60_000,
    queryFn: async (): Promise<MenuData> => {
      const [categories, items, routes, groups, modifiers, itemGroups] = await Promise.all([
        read<MenuCategory[]>(supabase.from('menu_categories').select('*').eq('restaurant_id', rid).order('sort')),
        read<MenuItem[]>(supabase.from('menu_items').select('*').eq('restaurant_id', rid).order('sort').order('name')),
        read<MenuItemRoute[]>(supabase.from('menu_item_routes').select('*').eq('restaurant_id', rid).order('sort')),
        read<ModifierGroup[]>(supabase.from('modifier_groups').select('*').eq('restaurant_id', rid).order('sort')),
        read<Modifier[]>(supabase.from('modifiers').select('*').eq('restaurant_id', rid).order('sort')),
        read<MenuItemModifierGroup[]>(supabase.from('menu_item_modifier_groups').select('*').eq('restaurant_id', rid).order('sort')),
      ]);
      return { categories, items, routes, groups, modifiers, itemGroups };
    },
  });
}

export function useStations() {
  const rid = useRid();
  return useQuery({
    queryKey: ['stations', rid],
    enabled: !!rid,
    staleTime: 5 * 60_000,
    queryFn: () => read<Station[]>(supabase.from('stations').select('*').eq('restaurant_id', rid).order('sort')),
  });
}

/** Tickets activos (+ recientes terminados) con sus renglones. */
export function useTickets(opts: { stationId?: string | null; recentMinutes?: number } = {}) {
  const rid = useRid();
  const interval = usePollInterval();
  return useQuery({
    queryKey: ['tickets', rid, opts.stationId ?? 'all', opts.recentMinutes ?? 0],
    enabled: !!rid,
    refetchInterval: interval,
    queryFn: async (): Promise<TicketWithItems[]> => {
      let q = supabase.from('kitchen_tickets').select('*, items:ticket_items(*)').eq('restaurant_id', rid);
      if (opts.stationId) q = q.eq('station_id', opts.stationId);
      if (opts.recentMinutes) {
        const since = new Date(Date.now() - opts.recentMinutes * 60_000).toISOString();
        q = q.or(`status.in.(${ACTIVE_TICKET_STATUSES.join(',')}),updated_at.gte.${since}`);
      } else {
        q = q.in('status', [...ACTIVE_TICKET_STATUSES]);
      }
      const rows = await read<TicketWithItems[]>(q.order('created_at', { ascending: true }).order('id').limit(600));
      return rows.map((t) => ({ ...t, items: [...(t.items ?? [])].sort((a, b) => a.sort - b.sort) }));
    },
  });
}

export type TicketLoadRow = Pick<TicketWithItems, 'id' | 'station_id' | 'status' | 'priority' | 'fired_at' | 'created_at' | 'ready_at'
  | 'blocked' | 'blocked_since' | 'blocked_seconds' | 'paused_seconds' | 'target_minutes'>;

/** Carga de todas las estaciones (sin renglones): para el resumen del encabezado del KDS. */
export function useStationLoad() {
  const rid = useRid();
  const interval = usePollInterval();
  return useQuery({
    queryKey: ['tickets', rid, 'load'],
    enabled: !!rid,
    refetchInterval: interval,
    queryFn: () => read<TicketLoadRow[]>(supabase.from('kitchen_tickets')
      .select('id, station_id, status, priority, fired_at, created_at, ready_at, blocked, blocked_since, blocked_seconds, paused_seconds, target_minutes')
      .eq('restaurant_id', rid).in('status', ['nuevo', 'en_preparacion']).limit(1000)),
  });
}

export interface StationCrew {
  business_date: string;
  stations: { station_id: string; staff: { id: string; name: string; manual: boolean }[] }[];
  people: { id: string; name: string }[];
}

/** Quién está en cada estación (horario publicado + cambios en vivo). */
export function useStationCrew() {
  const rid = useRid();
  return useQuery({
    queryKey: ['station-crew', rid],
    enabled: !!rid,
    refetchInterval: 60_000,
    queryFn: () => rpc<StationCrew>('rpc_station_crew', { p_restaurant_id: rid }),
  });
}

export interface RecipeBookEntry {
  id: string;
  kind: 'menu' | 'prep';
  name: string;
  menu_item_id: string | null;
  category: string | null;
  stations: string[];
  version: number;
  yield_qty: number | null;
  yield_unit: string | null;
  instructions: string | null;
  notes: string | null;
  lines: { name: string; qty: number; unit: string; notes: string | null }[];
}

/** Recetas activas para cocina (sin costos). */
export function useRecipeBook(enabled = true) {
  const rid = useRid();
  return useQuery({
    queryKey: ['recipe-book', rid],
    enabled: !!rid && enabled,
    staleTime: 5 * 60_000,
    queryFn: () => rpc<RecipeBookEntry[]>('kds_recipe_book', { p_restaurant_id: rid }),
  });
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
  tickets: { id: string; station_id: string; status: string; blocked: boolean; priority?: boolean; course: number; ready_at: string | null }[];
}

export function useOrders(opts: { status?: 'abierta' | 'todas'; mine?: string | null; sinceHours?: number } = {}) {
  const rid = useRid();
  const interval = usePollInterval();
  return useQuery({
    queryKey: ['orders', rid, opts.status ?? 'abierta', opts.mine ?? 'all', opts.sinceHours ?? 0],
    enabled: !!rid,
    refetchInterval: interval,
    queryFn: async (): Promise<OrderWithItems[]> => {
      let q = supabase.from('orders')
        .select('*, items:order_items(*), tickets:kitchen_tickets(id, station_id, status, blocked, course, ready_at)')
        .eq('restaurant_id', rid);
      if ((opts.status ?? 'abierta') === 'abierta') q = q.eq('status', 'abierta');
      if (opts.mine) q = q.eq('server_staff_id', opts.mine);
      if (opts.sinceHours) q = q.gte('created_at', new Date(Date.now() - opts.sinceHours * 3600_000).toISOString());
      const rows = await read<OrderWithItems[]>(q.order('created_at', { ascending: false }).limit(200));
      return rows.map((o) => ({ ...o, items: [...(o.items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
    },
  });
}

export function useOrder(orderId: string | undefined) {
  const rid = useRid();
  const interval = usePollInterval();
  return useQuery({
    queryKey: ['orders', rid, 'one', orderId],
    enabled: !!rid && !!orderId,
    refetchInterval: interval,
    queryFn: async (): Promise<OrderWithItems | null> => {
      const rows = await read<OrderWithItems[]>(supabase.from('orders')
        .select('*, items:order_items(*), tickets:kitchen_tickets(id, station_id, status, blocked, course, ready_at)')
        .eq('restaurant_id', rid).eq('id', orderId!));
      const o = rows[0];
      return o ? { ...o, items: [...(o.items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) } : null;
    },
  });
}

export function useServiceDay() {
  const rid = useRid();
  return useQuery({
    queryKey: ['service-day', rid],
    enabled: !!rid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const rows = await read<ServiceDay[]>(supabase.from('service_days').select('*').eq('restaurant_id', rid)
        .order('business_date', { ascending: false }).limit(1));
      return rows[0] ?? null;
    },
  });
}

export function useIncidents(onlyOpen = true) {
  const rid = useRid();
  const interval = usePollInterval();
  return useQuery({
    queryKey: ['incidents', rid, onlyOpen],
    enabled: !!rid,
    refetchInterval: interval,
    queryFn: async () => {
      let q = supabase.from('incidents').select('*').eq('restaurant_id', rid);
      if (onlyOpen) q = q.neq('status', 'resuelta');
      return read<Incident[]>(q.order('created_at', { ascending: false }).limit(100));
    },
  });
}

export function useStaff() {
  const rid = useRid();
  return useQuery({
    queryKey: ['staff', rid],
    enabled: !!rid,
    staleTime: 60_000,
    queryFn: () => read<Staff[]>(supabase.from('staff').select('id, restaurant_id, user_id, display_name, roles, employee_code, pin_set_at, color, active')
      .eq('restaurant_id', rid).order('display_name')),
  });
}

export function useTeamStats(stationId?: string | null) {
  const rid = useRid();
  return useQuery({
    queryKey: ['team-stats', rid, stationId ?? 'all'],
    enabled: !!rid,
    refetchInterval: 30_000,
    queryFn: () => rpc<{
      goal_pct: number; completed: number; on_time: number; on_time_pct: number | null; reopens: number;
      queue: number; queue_points: number; blocked: number; points_done: number;
    }>('kds_team_stats', { p_restaurant_id: rid, p_station_id: stationId ?? null }),
  });
}

export function useIngredients() {
  const rid = useRid();
  return useQuery({
    queryKey: ['ingredients', rid],
    enabled: !!rid,
    staleTime: 60_000,
    queryFn: async () => {
      const [ingredients, units, ingredientUnits] = await Promise.all([
        read<Ingredient[]>(supabase.from('ingredients').select('*').eq('restaurant_id', rid).order('category').order('name')),
        read<Unit[]>(supabase.from('units').select('*').order('dimension').order('to_base')),
        read<IngredientUnit[]>(supabase.from('ingredient_units').select('*').eq('restaurant_id', rid).order('name')),
      ]);
      return { ingredients, units, ingredientUnits };
    },
  });
}

export function useStock() {
  const rid = useRid();
  return useQuery({
    queryKey: ['stock', rid],
    enabled: !!rid,
    refetchInterval: 60_000,
    queryFn: () => rpc<StockRow[]>('inventory_stock_list', { p_restaurant_id: rid }),
  });
}

/** Unidades válidas para un insumo: estándar de su dimensión + propias. */
export function unitOptionsFor(ing: Ingredient | undefined, units: Unit[], own: IngredientUnit[]): { value: string; label: string }[] {
  if (!ing) return [];
  const dim = ing.base_unit === 'g' ? 'masa' : ing.base_unit === 'ml' ? 'volumen' : 'pieza';
  return [
    ...units.filter((u) => u.dimension === dim).map((u) => ({ value: u.code, label: u.code === ing.base_unit ? `${u.code} (base)` : u.code })),
    ...own.filter((u) => u.ingredient_id === ing.id).map((u) => ({ value: u.name, label: `${u.name} (= ${u.to_base} ${ing.base_unit})` })),
  ];
}
