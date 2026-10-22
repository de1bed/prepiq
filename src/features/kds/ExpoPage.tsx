import { ArrowLeft, CheckCheck, PackageCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveTables, useStations, useTickets } from '@/data/hooks';
import { applyPendingTicketOps, sortTickets } from '@/lib/kitchen';
import { useApp } from '@/state/session';
import { useSync } from '@/state/sync';
import { OperatorBadge } from '@/components/Pin';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Button, EmptyState, Spinner, Tabs, cx } from '@/components/ui';
import { ORDER_TYPE_LABELS } from '@/lib/format';
import type { TicketWithItems } from '@/lib/types';
import { TicketCard } from './TicketCard';
import { ReopenDialog, TicketHistory, TicketMenu, useTicketActions } from './shared';
import { useNow, useWakeLock } from './useNow';

/** Pase (expo): todas las estaciones, agrupado por orden; despacha cuando todo está listo. */
export function ExpoPage() {
  useWakeLock();
  const nav = useNavigate();
  const { restaurant, device } = useApp();
  const { ops } = useSync();
  const now = useNow(1000);
  useLiveTables('expo', ['kitchen_tickets', 'ticket_items'], [['tickets']]);
  const { data: serverTickets, isLoading } = useTickets({ recentMinutes: 30 });
  const { data: stations } = useStations();
  const { act } = useTicketActions();
  const [view, setView] = useState<'ordenes' | 'tickets'>('ordenes');
  const [menuFor, setMenuFor] = useState<TicketWithItems | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [reopenFor, setReopenFor] = useState<TicketWithItems | null>(null);

  const all = useMemo(() => applyPendingTicketOps(serverTickets ?? [], ops), [serverTickets, ops]);
  const active = useMemo(() => sortTickets(all.filter((t) => ['nuevo', 'en_preparacion', 'listo', 'en_espera'].includes(t.status))), [all]);
  const stationName = (id: string) => stations?.find((s) => s.id === id)?.name ?? '';

  const orders = useMemo(() => {
    const m = new Map<string, TicketWithItems[]>();
    for (const t of active) m.set(t.order_id, [...(m.get(t.order_id) ?? []), t]);
    return [...m.values()].map((ts) => ({
      tickets: ts,
      head: ts[0],
      allReady: ts.filter((t) => t.status !== 'en_espera').every((t) => t.status === 'listo'),
      readyCount: ts.filter((t) => t.status === 'listo').length,
    })).sort((a, b) => Number(b.allReady) - Number(a.allReady));
  }, [active]);

  return (
    <div className="kds min-h-screen">
      <header className="flex flex-wrap items-center gap-2 border-b border-kds-line bg-black/40 px-3 py-2">
        {!device && <button onClick={() => nav('/')} className="rounded-lg p-2 hover:bg-white/10" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>}
        <h1 className="text-xl font-black">Pase</h1>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-sm">{orders.filter((o) => o.allReady).length} órdenes listas para salir</span>
        <Tabs dark value={view} onChange={setView} className="ml-2" tabs={[{ value: 'ordenes', label: 'Por orden' }, { value: 'tickets', label: 'Por ticket' }]} />
        <div className="ml-auto flex items-center gap-2"><SyncIndicator dark /><OperatorBadge dark /></div>
      </header>
      <main className="p-3">
        {isLoading ? <Spinner /> : active.length === 0 ? (
          <EmptyState className="mt-16 border-slate-700" icon={<PackageCheck className="h-12 w-12" />} title="Nada pendiente en el pase" />
        ) : view === 'tickets' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {active.map((t, i) => (
              <TicketCard key={t.id} ticket={t} index={i} now={now} tz={restaurant!.timezone} settings={restaurant!.settings} mode="expo"
                showStation stationName={stationName(t.station_id)} onDeliver={() => void act(t, 'entregar')}
                onMenu={() => setMenuFor(t)} onHistory={() => setHistoryFor(t.id)} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {orders.map(({ head, tickets, allReady, readyCount }) => (
              <section key={head.order_id} className={cx('rounded-xl bg-kds-card p-3 ring-2', allReady ? 'ring-emerald-500' : 'ring-slate-700')} data-testid={`expo-order-${head.order_number}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xl font-black">#{head.order_number} · {head.order_type === 'mesa' ? `Mesa ${head.table_label}` : ORDER_TYPE_LABELS[head.order_type]}</div>
                  <span className={cx('rounded px-2 py-0.5 text-sm font-bold', allReady ? 'bg-emerald-600' : 'bg-slate-700')}>
                    {allReady ? 'LISTA PARA SALIR' : `${readyCount}/${tickets.length} estaciones listas`}
                  </span>
                </div>
                <ul className="space-y-2">
                  {tickets.map((t) => (
                    <li key={t.id} className="rounded-lg bg-black/20 p-2">
                      <div className="mb-1 flex items-center justify-between text-sm font-bold">
                        <span>{stationName(t.station_id)}{t.course > 1 && ` · T${t.course}`}</span>
                        <span className={cx('rounded px-1.5', t.blocked ? 'bg-red-600' : t.status === 'listo' ? 'bg-emerald-600' : t.status === 'en_espera' ? 'bg-violet-700' : t.status === 'nuevo' ? 'bg-sky-700' : 'bg-amber-500 text-black')}>
                          {t.blocked ? 'FALTANTE' : t.status === 'listo' ? 'LISTO' : t.status === 'en_espera' ? 'EN ESPERA' : t.status === 'nuevo' ? 'EN COLA' : 'PREPARANDO'}
                        </span>
                      </div>
                      <div className="text-sm text-slate-300">{t.items.filter((i) => i.status !== 'anulado').map((i) => `${i.qty}× ${i.display_name}`).join(' · ')}</div>
                      <div className="mt-1 flex gap-2">
                        <button className="text-xs text-slate-400 underline" onClick={() => setHistoryFor(t.id)}>historial</button>
                        {t.status === 'listo' && <button className="text-xs text-orange-400 underline" onClick={() => setReopenFor(t)}>reabrir</button>}
                      </div>
                    </li>
                  ))}
                </ul>
                <Button className="mt-3 w-full" size="lg" variant={allReady ? 'success' : 'dark'} disabled={readyCount === 0} icon={<CheckCheck className="h-5 w-5" />}
                  data-testid="expo-deliver"
                  onClick={() => tickets.filter((t) => t.status === 'listo').forEach((t) => void act(t, 'entregar'))}>
                  {allReady ? 'Despachar orden' : 'Despachar lo listo'}
                </Button>
              </section>
            ))}
          </div>
        )}
      </main>
      <TicketMenu ticket={menuFor} onClose={() => setMenuFor(null)} />
      <TicketHistory ticketId={historyFor} onClose={() => setHistoryFor(null)} />
      <ReopenDialog ticket={reopenFor} onClose={() => setReopenFor(null)} />
    </div>
  );
}
