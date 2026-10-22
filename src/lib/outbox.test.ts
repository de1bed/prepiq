import { describe, expect, it } from 'vitest';
import { Outbox, memoryStorage } from './outbox';
import { RpcError } from './rpc';

const netErr = () => new RpcError({ kind: 'network', code: 'red', message: 'Sin conexión' });
const bizErr = (code: string) => new RpcError({ kind: 'business', code, message: code });

function setup(executor: (rpc: string, args: Record<string, unknown>) => Promise<unknown>) {
  let t = 1_000;
  const storage = memoryStorage();
  const box = new Outbox(storage, executor, { now: () => t, autoSchedule: false });
  return { box, storage, advance: (ms: number) => { t += ms; } };
}

describe('Outbox', () => {
  it('envía y elimina la operación al tener éxito, con el op_id incluido', async () => {
    const calls: Record<string, unknown>[] = [];
    const { box } = setup(async (_rpc, args) => { calls.push(args); return { ok: true }; });
    await box.enqueue({ id: 'op-1', restaurantId: 'r', rpc: 'rpc_x', args: { a: 1 }, label: 'x' });
    await box.process();
    expect(calls).toEqual([{ a: 1, p_op_id: 'op-1' }]);
    expect(box.snapshot()).toHaveLength(0);
  });

  it('ante error de red conserva la operación, respeta FIFO y reintenta con el mismo op_id', async () => {
    let fail = true;
    const calls: string[] = [];
    const { box, advance } = setup(async (_rpc, args) => {
      calls.push(String(args.p_op_id));
      if (fail) throw netErr();
      return { ok: true };
    });
    await box.enqueue({ id: 'op-1', restaurantId: 'r', rpc: 'a', args: {}, label: '1' });
    await box.enqueue({ id: 'op-2', restaurantId: 'r', rpc: 'b', args: {}, label: '2' });
    await box.process();
    expect(box.snapshot().map((o) => o.id)).toEqual(['op-1', 'op-2']);
    expect(calls.every((c) => c === 'op-1')).toBe(true); // nunca saltó a op-2
    fail = false;
    advance(60_000);
    await box.process();
    expect(box.snapshot()).toHaveLength(0);
    expect(calls.slice(-2)).toEqual(['op-1', 'op-2']);
  });

  it('error de negocio marca como fallida y continúa con la siguiente', async () => {
    const { box } = setup(async (rpc) => {
      if (rpc === 'mala') throw bizErr('permiso_denegado');
      return { ok: true };
    });
    await box.enqueue({ id: 'op-1', restaurantId: 'r', rpc: 'mala', args: {}, label: '1' });
    await box.enqueue({ id: 'op-2', restaurantId: 'r', rpc: 'buena', args: {}, label: '2' });
    await box.process();
    const snap = box.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].status).toBe('failed');
    expect(snap[0].error?.code).toBe('permiso_denegado');
  });

  it('no duplica al encolar dos veces el mismo op_id', async () => {
    const { box } = setup(async () => { throw netErr(); });
    await box.enqueue({ id: 'op-1', restaurantId: 'r', rpc: 'a', args: {}, label: '1' });
    await box.enqueue({ id: 'op-1', restaurantId: 'r', rpc: 'a', args: {}, label: '1' });
    expect(box.snapshot()).toHaveLength(1);
  });

  it('sobrevive a un reinicio (persistencia)', async () => {
    const storage = memoryStorage();
    const a = new Outbox(storage, async () => { throw netErr(); }, { autoSchedule: false });
    await a.enqueue({ id: 'op-1', restaurantId: 'r', rpc: 'a', args: { x: 1 }, label: '1' });
    await a.process();
    const sent: unknown[] = [];
    const b = new Outbox(storage, async (_r, args) => { sent.push(args); return {}; }, { autoSchedule: false });
    await b.whenReady();
    expect(b.snapshot()).toHaveLength(1);
    await b.process();
    expect(sent).toEqual([{ x: 1, p_op_id: 'op-1' }]);
  });

  it('reintentar una fallida permite actualizar el token de operador', async () => {
    let token = '';
    const { box } = setup(async (_r, args) => {
      if (args.p_actor_token !== 'nuevo') throw bizErr('sesion_operador_expirada');
      token = String(args.p_actor_token);
      return {};
    });
    await box.enqueue({ id: 'op-1', restaurantId: 'r', rpc: 'a', args: { p_actor_token: 'viejo' }, label: '1' });
    await box.process();
    expect(box.snapshot()[0].status).toBe('failed');
    await box.retry('op-1', { p_actor_token: 'nuevo' });
    await box.process();
    expect(token).toBe('nuevo');
    expect(box.snapshot()).toHaveLength(0);
  });
});
