import { AlertTriangle, Ban, CalendarCheck, CheckCircle2, ChefHat, Clock, ExternalLink, PackageX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useIncidents, useLiveTables, useServiceDay, useStations, useStock, useTickets } from '@/data/hooks';
import { applyPendingTicketOps, ticketTiming } from '@/lib/kitchen';
import { useApp } from '@/state/session';
import { useDirectRpc, useEnqueue, useSync } from '@/state/sync';
import { asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { formatDateTime } from '@/lib/time';
import { formatQty } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Textarea, useToast } from '@/components/ui';
import { AvailabilityModal } from '../kds/shared';
import { useNow } from '../kds/useNow';
import { useQueryClient } from '@tanstack/react-query';

export function ShiftLeadPage() {
  const { restaurant, can } = useApp();
  const { ops } = useSync();
  const now = useNow(5000);
  useLiveTables('turno', ['kitchen_tickets', 'incidents', 'service_days'], [['tickets'], ['incidents'], ['service-day']]);
  const { data: tickets } = useTickets();
  const { data: stations } = useStations();
  const { data: incidents } = useIncidents(true);
  const { data: day } = useServiceDay();
  const [show86, setShow86] = useState(false);
  const [closing, setClosing] = useState(false);

  const all = useMemo(() => applyPendingTicketOps(tickets ?? [], ops), [tickets, ops]);
  const byStation = (stations ?? []).filter((s) => s.active).map((s) => {
    const ts = all.filter((t) => t.station_id === s.id);
    const active = ts.filter((t) => t.status === 'nuevo' || t.status === 'en_preparacion');
    return {
      station: s,
      nuevo: ts.filter((t) => t.status === 'nuevo').length,
      prep: ts.filter((t) => t.status === 'en_preparacion').length,
      listo: ts.filter((t) => t.status === 'listo').length,
      espera: ts.filter((t) => t.status === 'en_espera').length,
      late: active.filter((t) => ticketTiming(t, now, restaurant?.settings).urgency === 'late').length,
      blocked: ts.filter((t) => t.blocked).length,
      points: active.reduce((s2, t) => s2 + t.complexity_points, 0),
    };
  });

  return (
    <div>
      <PageHeader title="Turno" subtitle="Supervisión de cocina, incidencias y jornada"
        actions={<>
          <Button variant="secondary" icon={<Ban className="h-4 w-4" />} onClick={() => setShow86(true)}>Disponibilidad (86)</Button>
          <Link to="/pase"><Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />}>Abrir pase</Button></Link>
        </>} />

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold"><CalendarCheck className="h-5 w-5 text-brand-600" />Jornada</div>
          {day ? (
            <div className="text-sm">
              <div><b>{day.business_date}</b> · <Badge tone={day.status === 'abierta' ? 'green' : 'slate'}>{day.status}</Badge></div>
              <div className="text-slate-500">Abierta {formatDateTime(day.opened_at, restaurant!.timezone)}{day.closed_at && ` · cerrada ${formatDateTime(day.closed_at, restaurant!.timezone)}`}</div>
              {day.close_note && <div className="mt-1 text-xs italic text-slate-500">“{day.close_note}”</div>}
            </div>
          ) : <p className="text-sm text-slate-500">Aún no hay jornada. Se abre sola con la primera orden (configurable).</p>}
          <div className="mt-3 flex gap-2">
            {day?.status === 'abierta' ? (
              <Button variant="secondary" onClick={() => setClosing(true)}>Cerrar jornada</Button>
            ) : (
              <OpenDayButton />
            )}
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-amber-600" />Incidencias abiertas</div>
          <IncidentList incidents={incidents ?? []} canManage={can('incidents.manage')} />
        </Card>
      </div>

      <h2 className="mb-2 text-lg font-bold">Colas por estación</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {byStation.map((r) => (
          <Link key={r.station.id} to={`/cocina/${r.station.id}`}>
            <Card className="p-4 hover:border-brand-400">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <span className="h-3 w-3 rounded" style={{ background: r.station.color }} />{r.station.name}
                {r.late > 0 && <Badge tone="red">{r.late} tarde</Badge>}
                {r.blocked > 0 && <Badge tone="red">{r.blocked} con faltante</Badge>}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <Stat label="En cola" value={r.nuevo} />
                <Stat label="Preparando" value={r.prep} />
                <Stat label="Listos" value={r.listo} />
                <Stat label="En espera" value={r.espera} />
              </div>
              <div className="mt-2 text-xs text-slate-500">Carga activa: {r.points} puntos de complejidad</div>
            </Card>
          </Link>
        ))}
      </div>

      {can('inventory.view') && <LowStock />}

      <AvailabilityModal open={show86} onClose={() => setShow86(false)} />
      <CloseDayModal open={closing} onClose={() => setClosing(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-slate-50 p-2"><div className="text-xl font-bold">{value}</div><div className="text-[11px] text-slate-500">{label}</div></div>;
}

function OpenDayButton() {
  const call = useDirectRpc();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button loading={busy} onClick={async () => {
      setBusy(true);
      try { await call('rpc_service_day', { p_action: 'abrir' }); qc.invalidateQueries({ queryKey: ['service-day'] }); toast('success', 'Jornada abierta'); }
      catch (e) { toast('error', errorText(asAppError(e))); } finally { setBusy(false); }
    }}>Abrir jornada</Button>
  );
}

function CloseDayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const call = useDirectRpc();
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Cerrar jornada" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          await call('rpc_service_day', { p_action: 'cerrar', p_note: note || null });
          qc.invalidateQueries(); toast('success', 'Jornada cerrada'); onClose();
        } catch (e) { setErr(errorText(asAppError(e))); } finally { setBusy(false); }
      }}>Cerrar jornada</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Al cerrar, la siguiente orden abrirá la jornada del nuevo día de negocio. Si quedan tickets u órdenes abiertas, escribe una nota explicando por qué.</p>
      <Field label="Nota de cierre"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="mt-2 text-sm font-medium text-red-600">{err}</p>}
    </Modal>
  );
}

function IncidentList({ incidents, canManage }: { incidents: import('@/lib/types').Incident[]; canManage: boolean }) {
  const enqueue = useEnqueue();
  const { restaurant } = useApp();
  if (incidents.length === 0) return <EmptyState className="p-4" icon={<CheckCircle2 className="h-6 w-6" />} title="Sin incidencias abiertas" />;
  return (
    <ul className="divide-y">
      {incidents.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
          <Badge tone={i.kind === 'faltante' ? 'red' : i.kind === 'impresora' ? 'violet' : 'amber'}>{i.kind}</Badge>
          <span className="min-w-0 flex-1">{i.description}</span>
          <span className="text-xs text-slate-400"><Clock className="mr-1 inline h-3 w-3" />{formatDateTime(i.created_at, restaurant!.timezone)}</span>
          {i.status === 'en_atencion' && <Badge tone="blue">En atención</Badge>}
          {canManage && (
            <span className="flex gap-1">
              {i.status === 'abierta' && <Button size="sm" variant="secondary" onClick={() => void enqueue('rpc_incident_update', { p_incident_id: i.id, p_status: 'en_atencion' }, { label: 'Atender incidencia' })}>Atender</Button>}
              <Button size="sm" variant="success" onClick={() => {
                const resolution = window.prompt('¿Cómo se resolvió?') ?? '';
                void enqueue('rpc_incident_update', { p_incident_id: i.id, p_status: 'resuelta', p_resolution: resolution || null }, { label: 'Resolver incidencia' });
              }}>Resolver</Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function LowStock() {
  const { data } = useStock();
  const low = (data ?? []).filter((r) => r.below_par && r.active);
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2 font-semibold"><PackageX className="h-5 w-5 text-red-600" />Por revisar (teórico bajo el nivel de referencia)</div>
      <p className="mb-2 text-xs text-slate-500">Es una estimación por recetas, no un conteo físico. Verifica antes de pedir.</p>
      {low.length === 0 ? <p className="text-sm text-slate-500">Nada bajo el nivel de referencia.</p> : (
        <div className="flex flex-wrap gap-2">
          {low.map((r) => <Badge key={r.ingredient_id} tone="red"><ChefHat className="h-3 w-3" />{r.name}: {formatQty(Number(r.theoretical_qty), r.base_unit)}</Badge>)}
        </div>
      )}
    </Card>
  );
}
