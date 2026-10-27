import { History, Layers, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { modifierChips, ticketTiming } from '@/lib/kitchen';
import { clock, formatTime } from '@/lib/time';
import type { RestaurantSettings, TicketWithItems } from '@/lib/types';
import { EmptyState, Modal, cx } from '@/components/ui';
import { ticketPlace } from './TicketRow';

interface SummaryRow { key: string; name: string; chips: { text: string; negative: boolean }[]; notes: string[]; total: number; open: number; late: number }

/** Resumen: platillos iguales juntos (de todos los tickets en cola). */
export function SummaryView({ tickets, now, settings }: { tickets: TicketWithItems[]; now: number; settings: RestaurantSettings }) {
  const groups = useMemo(() => {
    const byName = new Map<string, { name: string; total: number; variants: Map<string, SummaryRow> }>();
    for (const t of tickets) {
      const late = ticketTiming(t, now, settings).urgency === 'late';
      for (const i of t.items) {
        if (i.status === 'anulado' || i.status === 'listo') continue;
        const chips = modifierChips(i.modifiers ?? []);
        const vkey = chips.map((c) => c.text).join('|');
        const g = byName.get(i.display_name) ?? { name: i.display_name, total: 0, variants: new Map() };
        const v = g.variants.get(vkey) ?? { key: vkey, name: i.display_name, chips, notes: [], total: 0, open: 0, late: 0 };
        v.total += i.qty; g.total += i.qty;
        if (t.status === 'en_preparacion') v.open += i.qty;
        if (late) v.late += i.qty;
        if (i.notes) v.notes.push(i.notes);
        g.variants.set(vkey, v);
        byName.set(i.display_name, g);
      }
    }
    return [...byName.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [tickets, now, settings]);

  if (groups.length === 0) {
    return <EmptyState className="mt-16 border-slate-700" icon={<Layers className="h-10 w-10" />} title="Nada en cola" />;
  }
  return (
    <div className="grid gap-3 p-3 lg:grid-cols-2" data-testid="kds-summary-view">
      {groups.map((g) => (
        <section key={g.name} className="rounded-xl border border-kds-line bg-kds-card p-3" data-testid={`summary-${g.name}`}>
          <h3 className="mb-2 flex items-baseline gap-3 text-2xl font-black">
            <span className="tabular-nums text-brand-500" data-testid="summary-total">{g.total}</span>{g.name}
          </h3>
          <ul className="space-y-1">
            {[...g.variants.values()].sort((a, b) => b.total - a.total).map((v) => (
              <li key={v.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5">
                <span className="min-w-[2.5ch] text-xl font-bold tabular-nums">{v.total}×</span>
                {v.chips.length ? v.chips.map((c, k) => (
                  <span key={k} className={cx('rounded px-1.5 text-sm font-bold', c.negative ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/20 text-sky-200')}>{c.text}</span>
                )) : <span className="text-sm text-slate-400">sin cambios</span>}
                <span className="ml-auto text-xs text-slate-400">{v.open} abiertos · {v.total - v.open} cerrados{v.late ? ` · ${v.late} tarde` : ''}</span>
                {v.notes.length > 0 && <div className="w-full text-sm italic text-amber-300">“{v.notes.join('” · “')}”</div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Historial de la estación (todos los tickets terminados recientes): ver detalle o reabrir. */
export function HistoryModal({ open, onClose, tickets, now, tz, settings, onReopen, onTimeline }: {
  open: boolean; onClose: () => void; tickets: TicketWithItems[]; now: number; tz: string; settings: RestaurantSettings;
  onReopen: (t: TicketWithItems) => void; onTimeline: (id: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Historial de la estación (últimas 3 horas)" dark size="xl">
      {tickets.length === 0 ? <p className="text-slate-400">Todavía no hay tickets terminados.</p> : (
        <ul className="divide-y divide-slate-800" data-testid="kds-history">
          {tickets.map((t) => {
            const timing = ticketTiming(t, now, settings);
            const voided = t.status === 'anulado';
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2" data-testid={`history-${t.order_number}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <b className="text-lg">#{t.order_number}</b>
                    <span className="font-semibold">{ticketPlace(t)}</span>
                    {(t.unit_count ?? 1) > 1 && <span className="rounded bg-slate-700 px-1.5 text-xs font-bold">{t.unit_no}/{t.unit_count}</span>}
                    {voided && <span className="rounded bg-red-800 px-1.5 text-xs font-bold">ANULADO</span>}
                    {t.reopen_count > 0 && <span className="rounded bg-orange-700 px-1.5 text-xs font-bold">Reabierto ×{t.reopen_count}</span>}
                  </div>
                  <div className="truncate text-sm text-slate-300">{t.items.filter((i) => i.status !== 'anulado').map((i) => `${i.qty > 1 ? `${i.qty} ` : ''}${i.display_name}`).join(', ') || t.items.map((i) => i.display_name).join(', ')}</div>
                  <div className="text-xs text-slate-500">
                    Llegó {formatTime(t.fired_at ?? t.created_at, tz)}
                    {t.ready_at && <> · Terminado {formatTime(t.ready_at, tz)} · tardó {clock(timing.activeSec)} (meta {t.target_minutes} min)</>}
                  </div>
                </div>
                <button onClick={() => onTimeline(t.id)} className="flex h-11 items-center gap-1 rounded-lg bg-slate-800 px-3 text-sm hover:bg-slate-700">
                  <History className="h-4 w-4" />Detalle
                </button>
                {!voided && (
                  <button onClick={() => onReopen(t)} className="flex h-11 items-center gap-1 rounded-lg bg-amber-500 px-4 font-bold text-black hover:bg-amber-400" data-testid="ticket-reopen">
                    <RotateCcw className="h-4 w-4" />Reabrir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
