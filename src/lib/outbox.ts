// Cola persistente de operaciones ("bandeja de salida").
//
// Garantías:
//  * Cada operación tiene un op_id (UUID) generado al encolar. El servidor es
//    idempotente por op_id: reintentar nunca duplica efectos.
//  * Se persiste en IndexedDB: si se cierra la pestaña o se va la luz, al
//    volver se reanuda el envío.
//  * Orden FIFO estricto: una orden se crea antes de que se marche su segundo
//    tiempo, etc.
//  * Error de red → reintento con espera exponencial (hasta 30 s) y reanudación
//    inmediata al recuperar conexión.
//  * Error de negocio → la operación queda "fallida" y visible para que la
//    persona decida (reintentar con su sesión actual o descartar). Nunca se
//    descarta en silencio.

import { get, set } from 'idb-keyval';
import { asAppError } from './rpc';
import type { AppError } from './errors';

export type OutboxStatus = 'pending' | 'failed';

export interface OutboxOp {
  id: string;               // op_id
  restaurantId: string;
  rpc: string;
  args: Record<string, unknown>;
  label: string;            // descripción legible ("Mesa 4: enviar a cocina")
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: OutboxStatus;
  error?: AppError;
  meta?: Record<string, unknown>;
}

export interface OutboxStorage {
  load(): Promise<OutboxOp[]>;
  save(ops: OutboxOp[]): Promise<void>;
}

export type Executor = (rpc: string, args: Record<string, unknown>) => Promise<unknown>;

export const idbStorage = (key = 'prepiq-outbox-v1'): OutboxStorage => ({
  async load() {
    try {
      return ((await get(key)) as OutboxOp[] | undefined) ?? [];
    } catch {
      return [];
    }
  },
  async save(ops) {
    try {
      await set(key, ops);
    } catch {
      // Sin IndexedDB (modo privado extremo): la cola sigue en memoria.
    }
  },
});

export const memoryStorage = (): OutboxStorage => {
  let data: OutboxOp[] = [];
  return {
    async load() { return data.map((o) => ({ ...o })); },
    async save(ops) { data = ops.map((o) => ({ ...o })); },
  };
};

type Listener = (ops: OutboxOp[]) => void;
type ResultListener = (op: OutboxOp, result: unknown) => void;

export class Outbox {
  private ops: OutboxOp[] = [];
  private listeners = new Set<Listener>();
  private resultListeners = new Set<ResultListener>();
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready: Promise<void>;
  lastSyncAt: number | null = null;

  constructor(
    private storage: OutboxStorage,
    private executor: Executor,
    private opts: { now?: () => number; maxBackoffMs?: number; autoSchedule?: boolean } = {},
  ) {
    this.ready = this.storage.load().then((ops) => {
      // Lo que quedó "en vuelo" al cerrar se reintenta (es idempotente).
      this.ops = ops.map((o) => ({ ...o, nextAttemptAt: 0 }));
      this.emit();
    });
  }

  private now() { return this.opts.now ? this.opts.now() : Date.now(); }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  onResult(fn: ResultListener): () => void {
    this.resultListeners.add(fn);
    return () => this.resultListeners.delete(fn);
  }

  snapshot(): OutboxOp[] {
    return this.ops.map((o) => ({ ...o }));
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  private async persist() {
    await this.storage.save(this.ops);
    this.emit();
  }

  async whenReady() { await this.ready; }

  async enqueue(op: Omit<OutboxOp, 'createdAt' | 'attempts' | 'nextAttemptAt' | 'status'>): Promise<OutboxOp> {
    await this.ready;
    if (this.ops.some((o) => o.id === op.id)) return this.ops.find((o) => o.id === op.id)!;
    const full: OutboxOp = { ...op, createdAt: this.now(), attempts: 0, nextAttemptAt: 0, status: 'pending' };
    this.ops.push(full);
    await this.persist();
    void this.process();
    return full;
  }

  /** Reintenta una operación fallida, opcionalmente actualizando argumentos (p. ej. token de operador). */
  async retry(id: string, patchArgs?: Record<string, unknown>) {
    await this.ready;
    const op = this.ops.find((o) => o.id === id);
    if (!op) return;
    op.status = 'pending';
    op.error = undefined;
    op.nextAttemptAt = 0;
    if (patchArgs) op.args = { ...op.args, ...patchArgs };
    await this.persist();
    void this.process();
  }

  async discard(id: string) {
    await this.ready;
    this.ops = this.ops.filter((o) => o.id !== id);
    await this.persist();
  }

  /** Despierta la cola (al recuperar conexión o volver a la pestaña). */
  kick() {
    for (const o of this.ops) if (o.status === 'pending') o.nextAttemptAt = 0;
    void this.process();
  }

  async process(): Promise<void> {
    await this.ready;
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const op = this.ops.find((o) => o.status === 'pending');
        if (!op) break;
        const wait = op.nextAttemptAt - this.now();
        if (wait > 0) {
          this.schedule(wait);
          break;
        }
        try {
          const result = await this.executor(op.rpc, { ...op.args, p_op_id: op.id });
          this.ops = this.ops.filter((o) => o.id !== op.id);
          this.lastSyncAt = this.now();
          await this.persist();
          this.resultListeners.forEach((l) => l(op, result));
        } catch (err) {
          const e = asAppError(err);
          op.attempts += 1;
          op.error = e;
          if (e.kind === 'network' || e.kind === 'auth') {
            const backoff = Math.min(this.opts.maxBackoffMs ?? 30000, 1000 * 2 ** Math.min(op.attempts - 1, 5));
            op.nextAttemptAt = this.now() + backoff;
            await this.persist();
            this.schedule(backoff);
            break; // FIFO: no saltar a la siguiente mientras esta no pase
          }
          op.status = 'failed';
          await this.persist();
          this.resultListeners.forEach((l) => l(op, undefined));
        }
      }
    } finally {
      this.running = false;
    }
  }

  private schedule(ms: number) {
    if (this.opts.autoSchedule === false) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.process();
    }, ms);
  }
}
