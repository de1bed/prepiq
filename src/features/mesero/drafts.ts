// Borradores de órdenes guardados en el dispositivo: si se recarga la página
// o se cae la red mientras se captura, no se pierde lo capturado.
import { useCallback, useEffect, useState } from 'react';
import type { OrderType } from '@/lib/types';

export interface DraftLine {
  id: string;                 // id definitivo de la línea (lo usa el servidor)
  menu_item_id: string;
  name: string;
  unit_price: number;
  qty: number;
  modifiers: { modifier_id: string; name: string; kitchen_label: string; price_delta: number; qty: number }[];
  notes: string;
  course: number;
  seat: number | null;
  replaces_item_id?: string | null;
  /** Estaciones adicionales a su ruta normal ("Enviar también a"). */
  extra_station_ids?: string[];
}

export interface OrderDraft {
  id: string;                 // id definitivo de la orden
  isNew: boolean;
  order_type: OrderType;
  table_label: string;
  guest_count: number | null;
  customer_name: string;
  notes: string;
  lines: DraftLine[];
  updatedAt: number;
  restaurantId: string;
}

const KEY = 'prepiq-order-drafts-v1';

function loadAll(): Record<string, OrderDraft> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function saveAll(all: Record<string, OrderDraft>) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('prepiq-drafts'));
}

export function getDraft(id: string): OrderDraft | null { return loadAll()[id] ?? null; }
export function putDraft(d: OrderDraft) { const all = loadAll(); all[d.id] = { ...d, updatedAt: Date.now() }; saveAll(all); }
export function removeDraft(id: string) { const all = loadAll(); delete all[id]; saveAll(all); }

export function useDrafts(restaurantId: string): OrderDraft[] {
  const [list, setList] = useState<OrderDraft[]>(() => Object.values(loadAll()).filter((d) => d.restaurantId === restaurantId));
  const refresh = useCallback(() => setList(Object.values(loadAll()).filter((d) => d.restaurantId === restaurantId)), [restaurantId]);
  useEffect(() => {
    window.addEventListener('prepiq-drafts', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('prepiq-drafts', refresh); window.removeEventListener('storage', refresh); };
  }, [refresh]);
  return list;
}

export function lineTotal(l: Pick<DraftLine, 'unit_price' | 'qty' | 'modifiers'>): number {
  return (l.unit_price + l.modifiers.reduce((s, m) => s + m.price_delta * m.qty, 0)) * l.qty;
}
