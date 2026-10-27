// Reglas de presentación del KDS (puras y probadas).
import type { RestaurantSettings, TicketStatus, TicketWithItems } from './types';
import type { OutboxOp } from './outbox';

export type Urgency = 'ok' | 'warn' | 'late';

export interface TicketTiming {
  /** Segundos activos desde que llegó a cocina, sin contar faltante ni pausa. */
  activeSec: number;
  /** Segundos bloqueados (acumulado + bloqueo en curso). */
  blockedSec: number;
  /** % del tiempo objetivo consumido. */
  pct: number;
  urgency: Urgency;
}

export function ticketTiming(t: Pick<TicketWithItems, 'fired_at' | 'created_at' | 'ready_at' | 'blocked' | 'blocked_since' | 'blocked_seconds' | 'target_minutes' | 'paused_seconds'>, now: number, settings?: RestaurantSettings): TicketTiming {
  const start = new Date(t.fired_at ?? t.created_at).getTime();
  const end = t.ready_at ? new Date(t.ready_at).getTime() : now;
  const blockedNow = t.blocked && t.blocked_since ? Math.max(0, (now - new Date(t.blocked_since).getTime()) / 1000) : 0;
  const blockedSec = (t.blocked_seconds ?? 0) + blockedNow;
  // Desde que llegó a cocina; sin contar faltantes ni el tiempo que estuvo terminado antes de reabrirse.
  const activeSec = Math.max(0, (end - start) / 1000 - blockedSec - (t.paused_seconds ?? 0));
  const pct = t.target_minutes > 0 ? (activeSec / 60 / t.target_minutes) * 100 : 0;
  const warn = settings?.kds_warn_pct ?? 75;
  const late = settings?.kds_late_pct ?? 100;
  const urgency: Urgency = pct >= late ? 'late' : pct >= warn ? 'warn' : 'ok';
  return { activeSec, blockedSec, pct, urgency };
}

const DEFAULT_LABELS: Record<TicketStatus, string> = {
  en_espera: 'En espera',
  nuevo: 'Nuevo',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  anulado: 'Anulado',
};

export function statusLabel(s: TicketStatus, settings?: RestaurantSettings): string {
  const custom = settings?.labels?.[s as keyof NonNullable<RestaurantSettings['labels']>];
  return custom || DEFAULT_LABELS[s];
}

export function actionLabel(key: 'bump' | 'deliver', settings?: RestaurantSettings): string {
  return settings?.labels?.[key] || (key === 'bump' ? 'Listo' : 'Entregar');
}

/**
 * Prioridad primero; luego el más antiguo (por momento en que llegó).
 * Los platillos de un mismo envío llegan a la misma hora: el desempate es
 * fijo (línea, unidad, id) para que la lista nunca se reacomode sola.
 */
export function sortTickets<T extends Pick<TicketWithItems, 'id' | 'priority' | 'fired_at' | 'created_at' | 'order_number' | 'order_item_id' | 'unit_no'>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    const ta = new Date(a.fired_at ?? a.created_at).getTime();
    const tb = new Date(b.fired_at ?? b.created_at).getTime();
    return ta - tb || a.order_number - b.order_number
      || (a.order_item_id ?? '').localeCompare(b.order_item_id ?? '')
      || (a.unit_no ?? 0) - (b.unit_no ?? 0)
      || a.id.localeCompare(b.id);
  });
}

const ACTION_TO_STATUS: Partial<Record<string, TicketStatus>> = {
  iniciar: 'en_preparacion',
  listo: 'listo',
  entregar: 'entregado',
  reabrir: 'en_preparacion',
  marchar: 'nuevo',
};

export interface PendingInfo { pending: boolean; failed: boolean }

/**
 * Aplica sobre los tickets del servidor las acciones que siguen en la cola
 * (optimista): la cocina ve el resultado de inmediato aunque no haya red.
 */
export function applyPendingTicketOps(tickets: TicketWithItems[], ops: OutboxOp[]): (TicketWithItems & { _pending?: PendingInfo })[] {
  const byId = new Map(tickets.map((t) => [t.id, { ...t, items: t.items.map((i) => ({ ...i })) } as TicketWithItems & { _pending?: PendingInfo }]));
  for (const op of ops) {
    if (op.rpc === 'rpc_ticket_action') {
      const t = byId.get(String(op.args.p_ticket_id));
      if (!t) continue;
      const action = String(op.args.p_action);
      t._pending = { pending: true, failed: op.status === 'failed' };
      if (op.status === 'failed') continue;
      const to = ACTION_TO_STATUS[action];
      if (to) {
        t.status = to;
        if (to === 'listo') {
          t.ready_at = t.ready_at ?? new Date(op.createdAt).toISOString();
          t.items.forEach((i) => { if (i.status === 'pendiente') i.status = 'listo'; });
        }
        if (action === 'reabrir') {
          if (t.ready_at) t.paused_seconds = (t.paused_seconds ?? 0) + Math.max(0, (op.createdAt - new Date(t.ready_at).getTime()) / 1000);
          t.ready_at = null;
          t.items.forEach((i) => { if (i.status === 'listo') i.status = 'pendiente'; });
        }
        if (action === 'iniciar') t.started_at = t.started_at ?? new Date(op.createdAt).toISOString();
      }
      if (action === 'bloquear') { t.blocked = true; t.blocked_since = new Date(op.createdAt).toISOString(); t.blocked_reason = String((op.args.p_args as { reason?: string })?.reason ?? ''); }
      if (action === 'desbloquear') {
        if (t.blocked && t.blocked_since) t.blocked_seconds += (op.createdAt - new Date(t.blocked_since).getTime()) / 1000;
        t.blocked = false; t.blocked_since = null;
      }
      if (action === 'prioridad') t.priority = true;
      if (action === 'quitar_prioridad') t.priority = false;
    } else if (op.rpc === 'rpc_ticket_item_toggle') {
      for (const t of byId.values()) {
        const it = t.items.find((i) => i.id === op.args.p_ticket_item_id);
        if (!it) continue;
        t._pending = { pending: true, failed: op.status === 'failed' };
        if (op.status === 'failed') break;
        it.status = op.args.p_ready ? 'listo' : 'pendiente';
        if (t.status === 'nuevo') t.status = 'en_preparacion';
        const live = t.items.filter((i) => i.status !== 'anulado');
        if (live.length > 0 && live.every((i) => i.status === 'listo')) {
          t.status = 'listo';
          t.ready_at = new Date(op.createdAt).toISOString();
        }
        break;
      }
    }
  }
  return [...byId.values()];
}

/** Agrupa modificadores para mostrarlos en cocina, resaltando los "SIN". */
export function modifierChips(mods: { kitchen_label?: string; name: string; qty?: number }[]): { text: string; negative: boolean }[] {
  return mods.map((m) => {
    const text = (m.kitchen_label || m.name) + ((m.qty ?? 1) > 1 ? ` ×${m.qty}` : '');
    return { text, negative: /^sin\b/i.test(text) || /^no\b/i.test(text) };
  });
}
