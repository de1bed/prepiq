import { describe, expect, it } from 'vitest';
import { applyPendingTicketOps, sortTickets, ticketTiming, modifierChips } from './kitchen';
import type { TicketWithItems } from './types';
import type { OutboxOp } from './outbox';

const base = (over: Partial<TicketWithItems> = {}): TicketWithItems => ({
  id: 't1', restaurant_id: 'r', service_day_id: 'd', order_id: 'o', station_id: 's', order_number: 1,
  order_type: 'mesa', table_label: '4', server_name: 'Elena', status: 'nuevo', course: 1, priority: false,
  target_minutes: 10, complexity_points: 1, created_at: '2026-10-22T12:00:00Z', fired_at: '2026-10-22T12:00:00Z',
  started_at: null, ready_at: null, delivered_at: null, voided_at: null, blocked: false, blocked_since: null,
  blocked_reason: null, blocked_seconds: 0, reopen_count: 0, version: 1, updated_at: '2026-10-22T12:00:00Z',
  items: [
    { id: 'i1', restaurant_id: 'r', ticket_id: 't1', order_item_id: 'oi1', component: null, display_name: 'Pastor', qty: 1,
      modifiers: [], notes: null, seat: null, is_change: false, status: 'pendiente', ready_at: null, sort: 1 },
    { id: 'i2', restaurant_id: 'r', ticket_id: 't1', order_item_id: 'oi2', component: null, display_name: 'Quesadilla', qty: 1,
      modifiers: [], notes: null, seat: null, is_change: false, status: 'pendiente', ready_at: null, sort: 2 },
  ],
  ...over,
});

const at = (iso: string) => new Date(iso).getTime();
const op = (rpc: string, args: Record<string, unknown>, status: 'pending' | 'failed' = 'pending'): OutboxOp => ({
  id: Math.random().toString(), restaurantId: 'r', rpc, args, label: '', createdAt: at('2026-10-22T12:05:00Z'),
  attempts: 0, nextAttemptAt: 0, status,
});

describe('ticketTiming', () => {
  it('descuenta el tiempo bloqueado y calcula urgencia', () => {
    const t = base({ blocked_seconds: 120 });
    const r = ticketTiming(t, at('2026-10-22T12:10:00Z'));
    expect(r.activeSec).toBe(480);
    expect(r.urgency).toBe('warn'); // 8 de 10 min = 80 %
    expect(ticketTiming(base(), at('2026-10-22T12:11:00Z')).urgency).toBe('late');
    expect(ticketTiming(base(), at('2026-10-22T12:02:00Z')).urgency).toBe('ok');
  });
  it('cuenta un bloqueo en curso como bloqueado', () => {
    const t = base({ blocked: true, blocked_since: '2026-10-22T12:04:00Z' });
    const r = ticketTiming(t, at('2026-10-22T12:06:00Z'));
    expect(r.blockedSec).toBe(120);
    expect(r.activeSec).toBe(240);
  });
  it('se detiene al estar listo', () => {
    const t = base({ ready_at: '2026-10-22T12:03:00Z', status: 'listo' });
    expect(ticketTiming(t, at('2026-10-22T13:00:00Z')).activeSec).toBe(180);
  });
});

describe('sortTickets', () => {
  it('prioridad primero y luego antigüedad', () => {
    const a = base({ id: 'a', fired_at: '2026-10-22T12:00:00Z' });
    const b = base({ id: 'b', fired_at: '2026-10-22T11:00:00Z' });
    const c = base({ id: 'c', fired_at: '2026-10-22T12:30:00Z', priority: true });
    expect(sortTickets([a, b, c]).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('applyPendingTicketOps', () => {
  it('aplica "listo" de forma optimista', () => {
    const [t] = applyPendingTicketOps([base()], [op('rpc_ticket_action', { p_ticket_id: 't1', p_action: 'listo' })]);
    expect(t.status).toBe('listo');
    expect(t.items.every((i) => i.status === 'listo')).toBe(true);
    expect(t._pending?.pending).toBe(true);
  });
  it('no aplica una operación fallida pero la marca', () => {
    const [t] = applyPendingTicketOps([base()], [op('rpc_ticket_action', { p_ticket_id: 't1', p_action: 'listo' }, 'failed')]);
    expect(t.status).toBe('nuevo');
    expect(t._pending?.failed).toBe(true);
  });
  it('renglones: al completar todos el ticket queda listo', () => {
    const [t] = applyPendingTicketOps([base()], [
      op('rpc_ticket_item_toggle', { p_ticket_item_id: 'i1', p_ready: true }),
      op('rpc_ticket_item_toggle', { p_ticket_item_id: 'i2', p_ready: true }),
    ]);
    expect(t.status).toBe('listo');
  });
  it('no muta los datos del servidor', () => {
    const server = [base()];
    applyPendingTicketOps(server, [op('rpc_ticket_action', { p_ticket_id: 't1', p_action: 'listo' })]);
    expect(server[0].status).toBe('nuevo');
    expect(server[0].items[0].status).toBe('pendiente');
  });
});

describe('modifierChips', () => {
  it('resalta los "SIN"', () => {
    expect(modifierChips([{ name: 'Sin cebolla', kitchen_label: 'SIN CEBOLLA' }, { name: 'Queso', qty: 2 }])).toEqual([
      { text: 'SIN CEBOLLA', negative: true }, { text: 'Queso ×2', negative: false },
    ]);
  });
});
