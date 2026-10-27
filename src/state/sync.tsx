// Sincronización: cola persistente de operaciones, estado de conexión y de
// tiempo real. Las pantallas encolan acciones con `useEnqueue()`; la cola
// inyecta restaurante, token de operador y op_id.
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Outbox, idbStorage, type OutboxOp } from '@/lib/outbox';
import { rpc } from '@/lib/rpc';
import { uuid } from '@/lib/ids';
import { errorText } from '@/lib/errors';
import { useApp } from './session';
import { useToast } from '@/components/ui';

export type RealtimeState = 'connecting' | 'live' | 'polling';
export type RealtimeSummary = RealtimeState | 'none';

interface SyncState {
  online: boolean;
  ops: OutboxOp[];
  pendingCount: number;
  failedCount: number;
  realtime: RealtimeSummary;
  setRealtime: (key: string, s: RealtimeState | null) => void;
  lastSyncAt: number | null;
  outbox: Outbox;
}

const Ctx = createContext<SyncState | null>(null);

let singleton: Outbox | null = null;
function getOutbox(): Outbox {
  if (!singleton) singleton = new Outbox(idbStorage(), (name, args) => rpc(name, args));
  return singleton;
}

/** Claves de consulta a refrescar cuando termina una operación. */
const INVALIDATE: Record<string, string[]> = {
  rpc_order_submit: ['orders', 'tickets', 'stock'],
  rpc_order_submit_v2: ['orders', 'tickets', 'stock'],
  rpc_station_crew_set: ['station-crew'],
  rpc_order_priority: ['orders', 'tickets'],
  rpc_order_item_void: ['orders', 'tickets', 'stock'],
  rpc_order_fire_course: ['orders', 'tickets'],
  rpc_order_close: ['orders', 'tickets'],
  rpc_order_transfer: ['orders', 'tickets'],
  rpc_ticket_action: ['tickets', 'orders', 'incidents', 'team-stats', 'stock'],
  rpc_ticket_item_toggle: ['tickets', 'orders', 'team-stats'],
  rpc_set_availability: ['menu'],
  rpc_incident_create: ['incidents'],
  rpc_incident_update: ['incidents'],
  rpc_punch: ['punches'],
  rpc_label_create: ['labels'],
  rpc_label_action: ['labels', 'incidents'],
  rpc_inventory_record: ['stock', 'movements'],
  rpc_inventory_receive: ['stock', 'movements'],
  rpc_inventory_produce: ['stock', 'movements'],
  rpc_count_set_line: ['counts'],
  rpc_count_transition: ['counts', 'stock'],
  rpc_count_create: ['counts'],
  rpc_service_day: ['service-day', 'orders', 'tickets'],
};

export function SyncProvider({ children }: { children: ReactNode }) {
  const outbox = getOutbox();
  const qc = useQueryClient();
  const toast = useToast();
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [rt, setRt] = useState<Record<string, RealtimeState>>({});
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  useEffect(() => outbox.subscribe(setOps), [outbox]);
  useEffect(() => outbox.onResult((op, result) => {
    setLastSyncAt(Date.now());
    (INVALIDATE[op.rpc] ?? []).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    if (op.status === 'failed' && op.error) {
      toast('error', `${op.label}: ${errorText(op.error)}`);
    } else if (result && typeof result === 'object' && (result as { _replayed?: boolean })._replayed) {
      // Reintento que el servidor ya había aplicado: sin efecto doble.
    }
  }), [outbox, qc, toast]);

  useEffect(() => {
    const up = () => { setOnline(true); outbox.kick(); qc.invalidateQueries(); };
    const down = () => setOnline(false);
    const vis = () => { if (document.visibilityState === 'visible') { outbox.kick(); qc.invalidateQueries(); } };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    document.addEventListener('visibilitychange', vis);
    void outbox.process();
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [outbox, qc]);

  // Si hay operaciones esperando por red, tratamos la conexión como degradada.
  const networkWaiting = ops.some((o) => o.status === 'pending' && o.error?.kind === 'network');

  const setRealtime = useCallback((key: string, s: RealtimeState | null) => {
    setRt((prev) => {
      const next = { ...prev };
      if (s === null) delete next[key]; else next[key] = s;
      return next;
    });
  }, []);
  const states = Object.values(rt);
  const realtime: RealtimeSummary = states.length === 0 ? 'none' : states.includes('polling') ? 'polling' : states.includes('connecting') ? 'connecting' : 'live';

  const value = useMemo<SyncState>(() => ({
    online: online && !networkWaiting,
    ops,
    pendingCount: ops.filter((o) => o.status === 'pending').length,
    failedCount: ops.filter((o) => o.status === 'failed').length,
    realtime, setRealtime, lastSyncAt, outbox,
  }), [online, networkWaiting, ops, realtime, setRealtime, lastSyncAt, outbox]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync fuera de SyncProvider');
  return v;
}

export interface EnqueueOptions {
  label: string;
  meta?: Record<string, unknown>;
  /** id explícito (p. ej. para reutilizar al reintentar desde la interfaz). */
  opId?: string;
}

/** Encola una operación idempotente del servicio (funciona sin conexión). */
export function useEnqueue() {
  const { restaurant, actor } = useApp();
  const { outbox } = useSync();
  const ref = useRef({ restaurant, actor });
  ref.current = { restaurant, actor };
  return useCallback(async (name: string, args: Record<string, unknown>, opts: EnqueueOptions) => {
    const { restaurant: r, actor: a } = ref.current;
    if (!r) throw new Error('Sin restaurante activo');
    const id = opts.opId ?? uuid();
    return outbox.enqueue({
      id, restaurantId: r.id, rpc: name, label: opts.label, meta: opts.meta,
      args: { p_restaurant_id: r.id, p_actor_token: a?.token ?? null, ...args },
    });
  }, [outbox]);
}

/** Llamada directa (requiere conexión) con restaurante y token inyectados. */
export function useDirectRpc() {
  const { restaurant, actor } = useApp();
  /** op=false para RPC administrativas que no llevan op_id ni token de operador. */
  return useCallback(async <T = unknown>(name: string, args: Record<string, unknown>, opts: { op?: boolean } = {}) => {
    if (!restaurant) throw new Error('Sin restaurante activo');
    const full: Record<string, unknown> = { p_restaurant_id: restaurant.id, ...args };
    if (opts.op !== false) {
      full.p_op_id = uuid();
      full.p_actor_token = actor?.token ?? null;
    }
    return rpc<T>(name, full);
  }, [restaurant, actor]);
}
