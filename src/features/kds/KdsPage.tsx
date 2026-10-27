import { AlertTriangle, ArrowLeft, Ban, BookOpen, ChefHat, ChevronDown, ChevronUp, CircleHelp, History, Layers, PlayCircle, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveTables, useStationLoad, useStations, useTickets } from '@/data/hooks';
import { applyPendingTicketOps, sortTickets, ticketTiming } from '@/lib/kitchen';
import { useApp } from '@/state/session';
import { useSync } from '@/state/sync';
import { SyncIndicator } from '@/components/SyncIndicator';
import { EmptyState, Spinner, cx } from '@/components/ui';
import type { TicketWithItems } from '@/lib/types';
import { TicketRow } from './TicketRow';
import { HistoryModal, SummaryView } from './KdsPanels';
import { RecipeBook, RecipeModal } from './RecipeBook';
import { KdsHelp } from './KdsHelp';
import { StationCrewChip } from './StationCrew';
import { AvailabilityModal, IncidentModal, ReopenDialog, TicketHistory, TicketMenu, useTicketActions } from './shared';
import { beep, useNow, useWakeLock } from './useNow';

const SATURATION_TICKETS = 15;
const HISTORY_MINUTES = 180;

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

type Tab = 'estacion' | 'recetas' | 'ayuda';

/**
 * Pantalla de cocina por estación (sin PIN). Lista de tickets (uno por
 * platillo), cerrados hasta que se abren. Costado izquierdo: Abrir y
 * Resumen. Derecho: subir/bajar e Historial. Solo la lista se desplaza.
 */
export function KdsPage() {
  useWakeLock();
  const { stationId } = useParams();
  const nav = useNavigate();
  const { restaurant, device } = useApp();
  const { ops, online } = useSync();
  const now = useNow(1000);
  const { data: stations } = useStations();
  const station = stations?.find((s) => s.id === stationId);
  useLiveTables(`kds-${stationId}`, ['kitchen_tickets', 'ticket_items', 'station_assignments'], [['tickets'], ['station-crew']]);
  const { data: serverTickets, isLoading, dataUpdatedAt, isError } = useTickets({ stationId, recentMinutes: HISTORY_MINUTES });
  const { data: load } = useStationLoad();
  const { act, toggleItem } = useTicketActions();

  const [tab, setTab] = useState<Tab>('estacion');
  const [summary, setSummary] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<TicketWithItems | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [reopenFor, setReopenFor] = useState<TicketWithItems | null>(null);
  const [recipeFor, setRecipeFor] = useState<{ menuItemId: string | null; name: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [show86, setShow86] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [sound, setSound] = useState(() => localStorage.getItem('prepiq-kds-sound') !== 'off');
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => applyPendingTicketOps(serverTickets ?? [], ops), [serverTickets, ops]);
  // Los de "tiempos" siguientes (en espera) no se muestran: entran solos cuando el mesero los marcha.
  const queue = useMemo(() => sortTickets(all.filter((t) => t.status === 'nuevo' || t.status === 'en_preparacion')), [all]);
  const done = useMemo(() => all.filter((t) => t.status === 'listo' || t.status === 'entregado' || t.status === 'anulado')
    .sort((a, b) => (b.ready_at ?? b.updated_at).localeCompare(a.ready_at ?? a.updated_at)), [all]);
  // Sin selección, queda seleccionado el primer ticket sin abrir: se puede tocar "Abrir" seguido.
  const selected = queue.find((t) => t.id === selectedId) ?? queue.find((t) => t.status === 'nuevo') ?? queue[0] ?? null;
  // "Orden 675 · platillo 2 de 3": cada platillo es su propio ticket, así que una orden se repite.
  const orderPos = useMemo(() => {
    const byOrder = new Map<string, TicketWithItems[]>();
    for (const t of all) if (t.status !== 'anulado') byOrder.set(t.order_id, [...(byOrder.get(t.order_id) ?? []), t]);
    const pos = new Map<string, { n: number; total: number }>();
    for (const ts of byOrder.values()) {
      ts.sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.unit_no ?? 0) - (b.unit_no ?? 0) || a.id.localeCompare(b.id));
      ts.forEach((t, i) => pos.set(t.id, { n: i + 1, total: ts.length }));
    }
    return pos;
  }, [all]);

  // Otras estaciones: tickets en cola (izq.) y urgentes (der.).
  const others = useMemo(() => (stations ?? []).filter((s) => s.active && s.kind !== 'pase' && s.id !== stationId).map((s) => {
    const ts = (load ?? []).filter((t) => t.station_id === s.id);
    return { s, count: ts.length, urgent: ts.filter((t) => t.priority || ticketTiming(t, now, restaurant?.settings).urgency === 'late').length };
  }), [stations, stationId, load, now, restaurant?.settings]);

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

  const scrollTo = (id: string) => listRef.current?.querySelector(`[data-ticket-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  // Abrir y pasar solo al siguiente sin abrir (el de abajo; si no hay, el primero de arriba).
  const openSelected = () => {
    if (!selected || selected.status !== 'nuevo') return;
    void act(selected, 'iniciar');
    const i = queue.findIndex((t) => t.id === selected.id);
    const next = queue.slice(i + 1).find((t) => t.status === 'nuevo') ?? queue.find((t) => t.status === 'nuevo' && t.id !== selected.id);
    setSelectedId(next?.id ?? null);
    if (next) scrollTo(next.id);
  };
  const page = (dir: 1 | -1) => {
    const el = listRef.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.8, behavior: 'smooth' });
  };
  const moveSelection = (dir: 1 | -1) => {
    if (!queue.length) return;
    const i = Math.max(0, queue.findIndex((t) => t.id === selected?.id));
    const next = queue[Math.min(queue.length - 1, Math.max(0, i + dir))];
    setSelectedId(next.id);
    scrollTo(next.id);
  };

  // Bump-bar / teclado: ↑↓ selecciona, Enter abre (o marca listo si ya está abierto), R historial, S resumen.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (tab !== 'estacion') return;
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [role="dialog"]') || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
      else if (e.key === 'Enter' && selected) {
        if (selected.status === 'nuevo') openSelected(); else void act(selected, 'listo');
      } else if (e.key.toLowerCase() === 'r') setShowHistory((v) => !v);
      else if (e.key.toLowerCase() === 's') setSummary((v) => !v);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const late = queue.filter((t) => ticketTiming(t, now, restaurant?.settings).urgency === 'late').length;
  const saturated = queue.length >= SATURATION_TICKETS;
  const staleSec = Math.round((now - dataUpdatedAt) / 1000);
  const sideBtn = 'flex w-full flex-col items-center justify-center gap-1 rounded-xl font-black transition disabled:opacity-30';

  return (
    <div className="kds flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-kds-line bg-black/40 px-3 py-2">
        {!device || device.mode === 'expo' ? (
          <button onClick={() => nav(device ? '/pase' : '/cocina')} className="rounded-lg p-2 hover:bg-white/10" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
        ) : null}
        <nav className="flex items-center gap-1 rounded-xl bg-slate-900 p-1" role="tablist">
          <button role="tab" aria-selected={tab === 'estacion'} onClick={() => setTab('estacion')} data-testid="tab-estacion"
            className={cx('flex items-center gap-2 rounded-lg px-3 py-1.5 text-lg font-black', tab === 'estacion' ? 'bg-white text-slate-900' : 'text-slate-300')}>
            <span className="h-3.5 w-3.5 rounded" style={{ background: station?.color ?? '#64748b' }} />
            <span data-testid="kds-station">{station?.name ?? 'Cocina'}</span>
            <span className={cx('rounded-full px-2 text-sm', tab === 'estacion' ? 'bg-slate-200' : 'bg-slate-700')} data-testid="kds-queue-count">{queue.length}</span>
            {late > 0 && <span className="rounded-full bg-red-600 px-2 text-sm text-white" data-testid="kds-late-count">{late}</span>}
          </button>
          <button role="tab" aria-selected={tab === 'recetas'} onClick={() => setTab('recetas')} data-testid="tab-recetas"
            className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold', tab === 'recetas' ? 'bg-white text-slate-900' : 'text-slate-300')}>
            <BookOpen className="h-4 w-4" />Recetas
          </button>
          <button role="tab" aria-selected={tab === 'ayuda'} onClick={() => setTab('ayuda')} data-testid="tab-ayuda"
            className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold', tab === 'ayuda' ? 'bg-white text-slate-900' : 'text-slate-300')}>
            <CircleHelp className="h-4 w-4" />Ayuda
          </button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-testid="other-stations" aria-label="Otras estaciones: tickets y urgentes">
          {others.map(({ s, count, urgent }) => (
            <div key={s.id} className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 py-1 pl-2 pr-1 text-sm" data-testid={`load-${s.name}`}
              title={`${s.name}: ${count} tickets, ${urgent} urgentes`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="font-semibold">{s.name}</span>
              <span className="min-w-[1.75rem] rounded bg-slate-700 px-1 text-center font-bold tabular-nums" data-testid="load-count">{count}</span>
              <span className={cx('min-w-[1.75rem] rounded px-1 text-center font-bold tabular-nums', urgent ? 'bg-red-600' : 'bg-slate-800 text-slate-500')} data-testid="load-urgent">{urgent}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {stationId && <StationCrewChip stationId={stationId} stationName={station?.name ?? 'la estación'} />}
          <button onClick={() => setShow86(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Disponibilidad (86)" title="Agotados (86)"><Ban className="h-5 w-5" /></button>
          <button onClick={() => setShowIncident(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Reportar incidencia" title="Reportar incidencia"><AlertTriangle className="h-5 w-5" /></button>
          <button onClick={() => { const v = !sound; setSound(v); localStorage.setItem('prepiq-kds-sound', v ? 'on' : 'off'); if (v) beep(660, 80); }}
            className="rounded-lg p-2 hover:bg-white/10" aria-label={sound ? 'Silenciar' : 'Activar sonido'}>
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <SyncIndicator dark compact />
        </div>
      </header>

      {(!online || isError) && (
        <div className="flex shrink-0 items-center gap-2 bg-red-700 px-4 py-2 text-sm font-semibold" role="alert">
          <WifiOff className="h-4 w-4" />
          Sin conexión. Mostrando datos de hace {staleSec >= 60 ? `${Math.floor(staleSec / 60)} min` : `${staleSec} s`}. Tus acciones se guardan y se enviarán al reconectar.
        </div>
      )}
      {saturated && online && tab === 'estacion' && (
        <div className="shrink-0 bg-amber-500 px-4 py-1.5 text-sm font-bold text-black" role="status">
          Saturación: {queue.length} tickets en cola{late ? `, ${late} tarde` : ''}. Avisen al responsable de turno si necesitan apoyo.
        </div>
      )}

      {tab === 'recetas' ? <RecipeBook stationId={stationId} /> : tab === 'ayuda' ? <KdsHelp /> : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-28 shrink-0 flex-col gap-2 border-r border-kds-line p-2" data-testid="kds-left">
            <button onClick={openSelected} disabled={!selected || selected.status !== 'nuevo' || summary}
              className={cx(sideBtn, 'h-28 bg-brand-600 text-lg hover:bg-brand-500')} data-testid="kds-open">
              <PlayCircle className="h-8 w-8" />Abrir
            </button>
            <button onClick={() => setSummary((v) => !v)} aria-pressed={summary}
              className={cx(sideBtn, 'h-28 text-lg', summary ? 'bg-white text-slate-900' : 'bg-slate-800 hover:bg-slate-700')} data-testid="kds-summary">
              <Layers className="h-8 w-8" />Resumen
            </button>
          </aside>

          <main ref={listRef} className="min-h-0 flex-1 overflow-y-auto" data-testid="kds-list">
            {isLoading ? <Spinner className="text-slate-400" /> : summary ? (
              <SummaryView tickets={queue} now={now} settings={restaurant!.settings} />
            ) : queue.length === 0 ? (
              <EmptyState className="m-6 mt-16 border-slate-700" icon={<ChefHat className="h-12 w-12" />} title="Sin tickets en cola">
                <span className="text-slate-400">Los nuevos pedidos aparecerán aquí al instante.{done.length > 0 && ` ${done.length} en el historial.`}</span>
              </EmptyState>
            ) : (
              <div className="space-y-2 p-2">
                {queue.map((t, i) => (
                  <TicketRow key={t.id} ticket={t} index={i} now={now} tz={restaurant!.timezone} settings={restaurant!.settings}
                    selected={t.id === selected?.id} isNew={fresh.has(t.id)} orderPos={orderPos.get(t.id)}
                    onSelect={() => setSelectedId(t.id)}
                    onBump={() => void act(t, 'listo')}
                    onMenu={() => setMenuFor(t)}
                    onRecipe={() => setRecipeFor({ menuItemId: t.items[0]?.menu_item_id ?? null, name: t.items[0]?.display_name ?? '' })}
                    onToggleItem={(id, ready) => void toggleItem(t, id, ready)} />
                ))}
              </div>
            )}
          </main>

          <aside className="flex w-20 shrink-0 flex-col gap-2 border-l border-kds-line p-2" data-testid="kds-right">
            <button onClick={() => page(-1)} className={cx(sideBtn, 'h-24 bg-slate-800 hover:bg-slate-700')} aria-label="Subir" data-testid="kds-up">
              <ChevronUp className="h-10 w-10" />
            </button>
            <button onClick={() => page(1)} className={cx(sideBtn, 'h-24 bg-slate-800 hover:bg-slate-700')} aria-label="Bajar" data-testid="kds-down">
              <ChevronDown className="h-10 w-10" />
            </button>
            <div className="flex-1" />
            <button onClick={() => setShowHistory(true)} className={cx(sideBtn, 'h-24 bg-slate-800 text-xs hover:bg-slate-700')} data-testid="kds-recent">
              <History className="h-7 w-7" />Historial
            </button>
          </aside>
        </div>
      )}

      <HistoryModal open={showHistory} onClose={() => setShowHistory(false)} tickets={done} now={now} tz={restaurant!.timezone} settings={restaurant!.settings}
        onReopen={(t) => { setShowHistory(false); setReopenFor(t); }} onTimeline={(id) => setHistoryFor(id)} />
      <TicketMenu ticket={menuFor} onClose={() => setMenuFor(null)} onHistory={(id) => setHistoryFor(id)} />
      <TicketHistory ticketId={historyFor} onClose={() => setHistoryFor(null)} />
      <ReopenDialog ticket={reopenFor} onClose={() => setReopenFor(null)} />
      <RecipeModal menuItemId={recipeFor ? recipeFor.menuItemId : undefined} name={recipeFor?.name ?? ''} onClose={() => setRecipeFor(null)} />
      <AvailabilityModal open={show86} onClose={() => setShow86(false)} dark />
      <IncidentModal open={showIncident} onClose={() => setShowIncident(false)} stationId={stationId} dark />
      <div className="sr-only" aria-live="polite">{queue.length ? `${queue.length} tickets en cola` : 'Sin tickets'}</div>
    </div>
  );
}
