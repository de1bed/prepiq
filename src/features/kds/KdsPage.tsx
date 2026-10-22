import { AlertTriangle, ArrowLeft, Ban, ChefHat, History, Trophy, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveTables, useStations, useTeamStats, useTickets } from '@/data/hooks';
import { applyPendingTicketOps, sortTickets, ticketTiming } from '@/lib/kitchen';
import { useApp } from '@/state/session';
import { useSync } from '@/state/sync';
import { OperatorBadge } from '@/components/Pin';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Button, EmptyState, Modal, Spinner, cx } from '@/components/ui';
import type { TicketWithItems } from '@/lib/types';
import { TicketCard } from './TicketCard';
import { AvailabilityModal, IncidentModal, ReopenDialog, TicketHistory, TicketMenu, useTicketActions } from './shared';
import { beep, useNow } from './useNow';

const SATURATION_TICKETS = 12;

export function KdsStationPicker() {
  const { data: stations, isLoading } = useStations();
  if (isLoading) return <Spinner />;
  const list = (stations ?? []).filter((s) => s.active);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">Cocina</h1>
      <p className="mb-4 text-sm text-slate-500">Elige la estación de esta pantalla.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((s) => (
          <Link key={s.id} to={`/cocina/${s.id}`} className="flex items-center gap-3 rounded-xl border bg-white p-4 font-semibold hover:border-brand-500" data-testid={`station-${s.name}`}>
            <span className="h-8 w-8 rounded-lg" style={{ background: s.color }} /> {s.name}
            <span className="ml-auto text-xs font-normal text-slate-500">{s.kind}</span>
          </Link>
        ))}
        <Link to="/pase" className="flex items-center gap-3 rounded-xl border border-dashed bg-white p-4 font-semibold hover:border-brand-500">
          <ChefHat className="h-6 w-6" /> Pase / todas las estaciones
        </Link>
      </div>
    </div>
  );
}

export function KdsPage() {
  const { stationId } = useParams();
  const nav = useNavigate();
  const { restaurant, device } = useApp();
  const { ops, online } = useSync();
  const now = useNow(1000);
  const { data: stations } = useStations();
  const station = stations?.find((s) => s.id === stationId);
  useLiveTables(`kds-${stationId}`, ['kitchen_tickets', 'ticket_items'], [['tickets'], ['team-stats']]);
  const { data: serverTickets, isLoading, dataUpdatedAt, isError } = useTickets({ stationId, recentMinutes: 45 });
  const { data: stats } = useTeamStats(stationId);
  const { act, toggleItem } = useTicketActions();

  const [selected, setSelected] = useState(0);
  const [menuFor, setMenuFor] = useState<TicketWithItems | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [reopenFor, setReopenFor] = useState<TicketWithItems | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [show86, setShow86] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [sound, setSound] = useState(() => localStorage.getItem('prepiq-kds-sound') !== 'off');

  const all = useMemo(() => applyPendingTicketOps(serverTickets ?? [], ops), [serverTickets, ops]);
  const queue = useMemo(() => sortTickets(all.filter((t) => t.status === 'nuevo' || t.status === 'en_preparacion')), [all]);
  const held = useMemo(() => sortTickets(all.filter((t) => t.status === 'en_espera')), [all]);
  const recent = useMemo(() => all.filter((t) => t.status === 'listo' || t.status === 'entregado')
    .sort((a, b) => (b.ready_at ?? '').localeCompare(a.ready_at ?? '')), [all]);

  // Aviso de ticket nuevo (visual siempre, sonoro opcional).
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!serverTickets) return;
    const ids = new Set(serverTickets.filter((t) => t.status === 'nuevo').map((t) => t.id));
    if (seen.current) {
      const nuevos = [...ids].filter((id) => !seen.current!.has(id));
      if (nuevos.length) {
        setFresh(new Set(nuevos));
        if (sound) beep();
        setTimeout(() => setFresh(new Set()), 5000);
      }
    }
    seen.current = new Set([...(seen.current ?? []), ...ids]);
  }, [serverTickets, sound]);

  // Soporte para bump-bar / teclado: 1–9 selecciona, Enter = listo, I = iniciar, R = recientes.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]')) return;
      if (/^[1-9]$/.test(e.key)) setSelected(Number(e.key) - 1);
      else if (e.key === 'ArrowRight') setSelected((s) => Math.min(queue.length - 1, s + 1));
      else if (e.key === 'ArrowLeft') setSelected((s) => Math.max(0, s - 1));
      else if (e.key === 'Enter' && queue[selected]) void act(queue[selected], 'listo');
      else if (e.key.toLowerCase() === 'i' && queue[selected]) void act(queue[selected], 'iniciar');
      else if (e.key.toLowerCase() === 'r') setShowRecent((v) => !v);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [queue, selected, act]);

  const late = queue.filter((t) => ticketTiming(t, now, restaurant?.settings).urgency === 'late').length;
  const saturated = queue.length >= SATURATION_TICKETS || late >= 5;
  const staleSec = Math.round((now - dataUpdatedAt) / 1000);

  return (
    <div className="kds flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-kds-line bg-black/40 px-3 py-2">
        {!device || device.mode === 'expo' ? (
          <button onClick={() => nav(device ? '/pase' : '/cocina')} className="rounded-lg p-2 hover:bg-white/10" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
        ) : null}
        <span className="h-4 w-4 rounded" style={{ background: station?.color ?? '#64748b' }} />
        <h1 className="text-xl font-black" data-testid="kds-station">{station?.name ?? 'Cocina'}</h1>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-sm"><b data-testid="kds-queue-count">{queue.length}</b> en cola</span>
        {late > 0 && <span className="rounded bg-red-600 px-2 py-0.5 text-sm font-bold">{late} tarde</span>}
        {held.length > 0 && <span className="rounded bg-violet-800 px-2 py-0.5 text-sm">{held.length} en espera</span>}

        {stats && (
          <span className="ml-2 hidden items-center gap-2 rounded bg-slate-800 px-2 py-0.5 text-sm md:flex" title="Meta del equipo: porcentaje de tickets a tiempo en la jornada">
            <Trophy className="h-4 w-4 text-amber-400" />
            Equipo: <b>{stats.on_time_pct ?? '—'}%</b> a tiempo · meta {stats.goal_pct}% · {stats.completed} listos
            {stats.reopens > 0 && <> · {stats.reopens} reprocesos</>}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="dark" icon={<History className="h-4 w-4" />} onClick={() => setShowRecent(true)} data-testid="kds-recent">Recientes</Button>
          <Button size="sm" variant="dark" icon={<Ban className="h-4 w-4" />} onClick={() => setShow86(true)}>86</Button>
          <Button size="sm" variant="dark" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setShowIncident(true)}>Incidencia</Button>
          <button onClick={() => { const v = !sound; setSound(v); localStorage.setItem('prepiq-kds-sound', v ? 'on' : 'off'); if (v) beep(660, 80); }}
            className="rounded-lg p-2 hover:bg-white/10" aria-label={sound ? 'Silenciar' : 'Activar sonido'}>
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <SyncIndicator dark />
          <OperatorBadge dark />
        </div>
      </header>

      {(!online || isError) && (
        <div className="flex items-center gap-2 bg-red-700 px-4 py-2 text-sm font-semibold" role="alert">
          <WifiOff className="h-4 w-4" />
          Sin conexión. Mostrando datos de hace {staleSec >= 60 ? `${Math.floor(staleSec / 60)} min` : `${staleSec} s`}. Tus acciones se guardan y se enviarán al reconectar.
        </div>
      )}
      {saturated && online && (
        <div className="bg-amber-500 px-4 py-2 text-sm font-bold text-black" role="status">
          Saturación: {queue.length} tickets en cola{late ? `, ${late} tarde` : ''}. Avisen al responsable de turno si necesitan apoyo.
        </div>
      )}

      <main className="flex-1 p-3">
        {isLoading ? <Spinner className="text-slate-400" /> : queue.length === 0 && held.length === 0 ? (
          <EmptyState className="mt-16 border-slate-700" icon={<ChefHat className="h-12 w-12" />} title="Sin tickets en cola">
            <span className="text-slate-400">Los nuevos pedidos aparecerán aquí al instante.{recent.length > 0 && ` ${recent.length} terminados recientemente.`}</span>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {queue.map((t, i) => (
              <TicketCard key={t.id} ticket={t} index={i} now={now} tz={restaurant!.timezone} settings={restaurant!.settings} mode="cook"
                selected={i === selected} isNew={fresh.has(t.id)}
                onStart={() => void act(t, 'iniciar')}
                onBump={() => void act(t, 'listo')}
                onToggleItem={(id, ready) => void toggleItem(t, id, ready)}
                onMenu={() => setMenuFor(t)}
                onHistory={() => setHistoryFor(t.id)} />
            ))}
            {held.map((t, i) => (
              <TicketCard key={t.id} ticket={t} index={queue.length + i} now={now} tz={restaurant!.timezone} settings={restaurant!.settings} mode="cook"
                onMenu={() => setMenuFor(t)} onHistory={() => setHistoryFor(t.id)} />
            ))}
          </div>
        )}
      </main>

      <Modal open={showRecent} onClose={() => setShowRecent(false)} title="Terminados recientes (45 min)" dark size="xl">
        {recent.length === 0 ? <p className="text-slate-400">Nada reciente.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((t, i) => (
              <TicketCard key={t.id} ticket={t} index={i} now={now} tz={restaurant!.timezone} settings={restaurant!.settings} mode="recent"
                onReopen={() => { setShowRecent(false); setReopenFor(t); }}
                onDeliver={() => void act(t, 'entregar')}
                onHistory={() => setHistoryFor(t.id)} />
            ))}
          </div>
        )}
      </Modal>

      <TicketMenu ticket={menuFor} onClose={() => setMenuFor(null)} />
      <TicketHistory ticketId={historyFor} onClose={() => setHistoryFor(null)} />
      <ReopenDialog ticket={reopenFor} onClose={() => setReopenFor(null)} />
      <AvailabilityModal open={show86} onClose={() => setShow86(false)} dark />
      <IncidentModal open={showIncident} onClose={() => setShowIncident(false)} stationId={stationId} dark />
      <div className="sr-only" aria-live="polite">{cx(queue.length ? `${queue.length} tickets en cola` : 'Sin tickets')}</div>
    </div>
  );
}
