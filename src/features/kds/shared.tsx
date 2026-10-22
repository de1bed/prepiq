import { AlertTriangle, Ban, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { rpc } from '@/lib/rpc';
import { useApp } from '@/state/session';
import { useEnqueue } from '@/state/sync';
import { useOverride } from '@/components/Pin';
import { Button, Input, Modal, Spinner, cx, useToast } from '@/components/ui';
import { useMenu } from '@/data/hooks';
import { formatTime } from '@/lib/time';
import { REOPEN_REASONS } from '@/lib/format';
import { ReasonDialog } from '@/components/ReasonDialog';
import type { TicketWithItems } from '@/lib/types';

const ACTION_TEXT: Record<string, string> = {
  crear: 'Llegó a cocina', marchar: 'Se marchó', iniciar: 'Inició preparación', listo: 'Marcado listo', entregar: 'Entregado',
  reabrir: 'Reabierto', bloquear: 'Faltante reportado', desbloquear: 'Faltante resuelto', prioridad: 'Prioridad autorizada',
  quitar_prioridad: 'Prioridad retirada', renglon_listo: 'Renglón listo', renglon_pendiente: 'Renglón regresado', renglon_anulado: 'Renglón anulado',
  anular: 'Ticket anulado',
};

/** Acciones de ticket encoladas (sin conexión también) con autorización si hace falta. */
export function useTicketActions() {
  const enqueue = useEnqueue();
  const { can } = useApp();
  const requestOverride = useOverride();
  const toast = useToast();

  const act = useCallback(async (t: TicketWithItems, action: string, args: Record<string, unknown> = {}, perm?: string, why?: string) => {
    let override: string | null = null;
    if (perm && !can(perm)) {
      override = await requestOverride(perm, why ?? 'Esta acción requiere autorización.');
      if (!override) return;
    }
    await enqueue('rpc_ticket_action', { p_ticket_id: t.id, p_action: action, p_args: args, p_override: override },
      { label: `#${t.order_number}: ${ACTION_TEXT[action] ?? action}`, meta: { ticketId: t.id } });
  }, [enqueue, can, requestOverride]);

  const toggleItem = useCallback(async (t: TicketWithItems, itemId: string, ready: boolean) => {
    await enqueue('rpc_ticket_item_toggle', { p_ticket_item_id: itemId, p_ready: ready },
      { label: `#${t.order_number}: renglón ${ready ? 'listo' : 'pendiente'}`, meta: { ticketId: t.id } });
  }, [enqueue]);

  return { act, toggleItem, toast };
}

export function TicketHistory({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const { restaurant } = useApp();
  const { data, isLoading } = useQuery({
    queryKey: ['timeline', ticketId],
    enabled: !!ticketId,
    queryFn: () => rpc<{ cycle_minutes: number | null; station_name: string; ticket: TicketWithItems; events: { at: string; action: string; reason: string | null; note: string | null; staff: string | null; authorized_by: string | null; device: string | null }[] }>(
      'report_ticket_timeline', { p_restaurant_id: restaurant!.id, p_ticket_id: ticketId }),
  });
  return (
    <Modal open={!!ticketId} onClose={onClose} title={data ? `Historial · #${data.ticket.order_number} · ${data.station_name}` : 'Historial'} dark size="lg">
      {isLoading || !data ? <Spinner /> : (
        <>
          <p className="mb-3 text-sm text-slate-400">
            Objetivo {data.ticket.target_minutes} min · ciclo {data.cycle_minutes != null ? `${data.cycle_minutes} min` : 'en curso'}
            {data.ticket.blocked_seconds > 0 && ` · ${Math.round(data.ticket.blocked_seconds / 60)} min bloqueado por faltante`}
          </p>
          <ol className="relative border-l border-slate-700 pl-5">
            {data.events.map((e, i) => (
              <li key={i} className="mb-3">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-brand-500" />
                <div className="text-sm font-semibold">{ACTION_TEXT[e.action] ?? e.action} <span className="font-normal text-slate-400">· {formatTime(e.at, restaurant!.timezone)}</span></div>
                <div className="text-xs text-slate-400">
                  {[e.staff, e.device && `en ${e.device}`, e.authorized_by && `autorizó ${e.authorized_by}`].filter(Boolean).join(' · ')}
                </div>
                {(e.reason || e.note) && <div className="text-sm text-amber-300">{[REOPEN_REASONS.find((r) => r.value === e.reason)?.label ?? e.reason, e.note].filter(Boolean).join(' — ')}</div>}
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}

/** Menú de acciones secundarias del ticket. */
export function TicketMenu({ ticket, onClose }: { ticket: TicketWithItems | null; onClose: () => void }) {
  const { act } = useTicketActions();
  const [block, setBlock] = useState(false);
  if (!ticket) return null;
  const t = ticket;
  const run = async (fn: () => Promise<void>) => { onClose(); await fn(); };
  return (
    <>
      <Modal open={!block} onClose={onClose} title={`Ticket #${t.order_number}`} dark size="sm">
        <div className="grid gap-2">
          {t.blocked ? (
            <Button size="xl" variant="success" onClick={() => run(() => act(t, 'desbloquear'))} icon={<CheckCircle2 className="h-5 w-5" />}>Ya llegó lo que faltaba</Button>
          ) : (
            <Button size="xl" variant="danger" onClick={() => setBlock(true)} icon={<AlertTriangle className="h-5 w-5" />} data-testid="report-shortage">Reportar faltante</Button>
          )}
          {t.priority ? (
            <Button size="lg" variant="dark" onClick={() => run(() => act(t, 'quitar_prioridad', {}, 'orders.priority', 'Quitar prioridad'))}>Quitar prioridad</Button>
          ) : (
            <Button size="lg" variant="dark" onClick={() => run(() => act(t, 'prioridad', {}, 'orders.priority', 'Dar prioridad a este ticket'))}>Dar prioridad (requiere gerente)</Button>
          )}
          {t.status === 'en_espera' && <Button size="lg" variant="dark" onClick={() => run(() => act(t, 'marchar'))}>Marchar ahora</Button>}
        </div>
      </Modal>
      <ReasonDialog open={block} dark onClose={() => { setBlock(false); onClose(); }} title="¿Qué falta?" freeText
        reasons={[{ value: 'ingrediente', label: 'Falta un ingrediente' }, { value: 'equipo', label: 'Equipo descompuesto' }, { value: 'prep', label: 'Falta prep' }]}
        confirmLabel="Marcar faltante" onSubmit={(reason) => { setBlock(false); onClose(); void act(t, 'bloquear', { reason }); }} />
    </>
  );
}

export function ReopenDialog({ ticket, onClose }: { ticket: TicketWithItems | null; onClose: () => void }) {
  const { act } = useTicketActions();
  const [remake, setRemake] = useState(true);
  return (
    <ReasonDialog open={!!ticket} dark onClose={onClose} title={`Reabrir #${ticket?.order_number ?? ''}`} reasons={REOPEN_REASONS} tone="warning"
      confirmLabel="Reabrir" extra={
        <label className="mb-3 flex items-start gap-2 rounded-lg bg-slate-800 p-3 text-sm">
          <input type="checkbox" checked={remake} onChange={(e) => setRemake(e.target.checked)} className="mt-0.5" />
          <span><b>Se vuelve a preparar</b> (reproceso): descuenta inventario otra vez. Desmárcalo si solo se marcó listo por error.</span>
        </label>
      }
      onSubmit={(reason, note) => { const t = ticket!; onClose(); void act(t, 'reabrir', { reason, note, remake }); }} />
  );
}

/** Tablero de disponibilidad (86) para cocina y gerencia. */
export function AvailabilityModal({ open, onClose, dark }: { open: boolean; onClose: () => void; dark?: boolean }) {
  const { data: menu } = useMenu();
  const enqueue = useEnqueue();
  const [q, setQ] = useState('');
  if (!menu) return null;
  const items = menu.items.filter((i) => i.active && i.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string, name: string, available: boolean, kind: 'item' | 'mod') => enqueue('rpc_set_availability', {
    p_menu_item_id: kind === 'item' ? id : null, p_modifier_id: kind === 'mod' ? id : null, p_available: available,
    p_reason: available ? null : 'Agotado en servicio',
  }, { label: `${available ? 'Disponible' : '86'}: ${name}` });
  return (
    <Modal open={open} onClose={onClose} title="Disponibilidad (86)" dark={dark} size="lg">
      <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className={cx('mb-3', dark && 'border-slate-600 bg-slate-800 text-white')} />
      <ul className="divide-y divide-slate-700/40">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between py-2">
            <span className={cx('font-medium', !i.available && 'text-red-400 line-through')}>{i.name}</span>
            <Button size="sm" variant={i.available ? 'danger' : 'success'} icon={<Ban className="h-4 w-4" />}
              onClick={() => void toggle(i.id, i.name, !i.available, 'item')}>
              {i.available ? 'Marcar 86' : 'Regresar al menú'}
            </Button>
          </li>
        ))}
      </ul>
      <h3 className="mb-1 mt-4 text-sm font-semibold uppercase text-slate-400">Modificadores</h3>
      <ul className="divide-y divide-slate-700/40">
        {menu.modifiers.filter((m) => m.active && m.name.toLowerCase().includes(q.toLowerCase())).map((m) => (
          <li key={m.id} className="flex items-center justify-between py-2">
            <span className={cx('text-sm', !m.available && 'text-red-400 line-through')}>{m.name}</span>
            <Button size="sm" variant={m.available ? 'dark' : 'success'} onClick={() => void toggle(m.id, m.name, !m.available, 'mod')}>
              {m.available ? '86' : 'Disponible'}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function IncidentModal({ open, onClose, stationId, dark }: { open: boolean; onClose: () => void; stationId?: string | null; dark?: boolean }) {
  const enqueue = useEnqueue();
  const [kind, setKind] = useState('equipo');
  const [text, setText] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Reportar incidencia" dark={dark} size="sm"
      footer={<><Button variant={dark ? 'dark' : 'secondary'} onClick={onClose}>Cancelar</Button>
        <Button disabled={!text.trim()} onClick={() => {
          void enqueue('rpc_incident_create', { p_kind: kind, p_description: text.trim(), p_station_id: stationId ?? null }, { label: `Incidencia: ${text.trim().slice(0, 30)}` });
          setText(''); onClose();
        }}>Reportar</Button></>}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {[['faltante', 'Faltante'], ['equipo', 'Equipo'], ['impresora', 'Impresora'], ['calidad', 'Calidad'], ['otro', 'Otro']].map(([v, l]) => (
          <button key={v} onClick={() => setKind(v)} className={cx('rounded-lg border-2 p-2 text-sm font-semibold', kind === v ? 'border-brand-500' : 'border-slate-600')}>{l}</button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="¿Qué pasa?"
        className={cx('w-full rounded-lg border p-2', dark ? 'border-slate-600 bg-slate-800 text-white' : 'border-slate-300')} rows={3} />
    </Modal>
  );
}
