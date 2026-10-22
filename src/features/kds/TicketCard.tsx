import { AlertOctagon, Check, CloudOff, Flame, History, MoreHorizontal, Play, RotateCcw, Star } from 'lucide-react';
import { memo } from 'react';
import { modifierChips, statusLabel, ticketTiming, actionLabel, type PendingInfo } from '@/lib/kitchen';
import { clock, formatTime } from '@/lib/time';
import { ORDER_TYPE_LABELS } from '@/lib/format';
import type { RestaurantSettings, TicketWithItems } from '@/lib/types';
import { cx } from '@/components/ui';

const URGENCY = {
  ok: { bar: 'bg-emerald-600', text: 'A tiempo', ring: 'ring-slate-700' },
  warn: { bar: 'bg-amber-500 text-black', text: 'Atención', ring: 'ring-amber-500' },
  late: { bar: 'bg-red-600', text: 'Tarde', ring: 'ring-red-500' },
};

export interface TicketCardProps {
  ticket: TicketWithItems & { _pending?: PendingInfo };
  now: number;
  tz: string;
  settings: RestaurantSettings;
  index: number;
  selected?: boolean;
  isNew?: boolean;
  stationName?: string;
  showStation?: boolean;
  mode: 'cook' | 'expo' | 'recent';
  onBump?: () => void;
  onStart?: () => void;
  onToggleItem?: (itemId: string, ready: boolean) => void;
  onMenu?: () => void;
  onReopen?: () => void;
  onDeliver?: () => void;
  onHistory?: () => void;
}

export const TicketCard = memo(function TicketCard(p: TicketCardProps) {
  const t = p.ticket;
  const timing = ticketTiming(t, p.now, p.settings);
  const u = URGENCY[timing.urgency];
  const held = t.status === 'en_espera';
  const done = t.status === 'listo' || t.status === 'entregado';
  const live = t.items.filter((i) => i.status !== 'anulado');
  const readyCount = live.filter((i) => i.status === 'listo').length;

  return (
    <article
      className={cx('flex flex-col overflow-hidden rounded-xl bg-kds-card ring-2 transition',
        p.selected ? 'ring-white' : t.blocked ? 'ring-red-500' : held ? 'ring-violet-700' : u.ring,
        held && 'opacity-60', p.isNew && 'ticket-new')}
      data-testid={`ticket-${t.order_number}`}
      aria-label={`Ticket ${t.order_number}, ${statusLabel(t.status, p.settings)}`}
    >
      {/* Encabezado: estado con TEXTO además de color */}
      <header className={cx('flex items-center justify-between gap-2 px-3 py-2 font-bold', held ? 'bg-violet-800' : done ? 'bg-slate-600' : u.bar)}>
        <div className="flex items-baseline gap-2">
          <span className="rounded bg-black/30 px-1.5 text-xs">{p.index + 1}</span>
          <span className="text-2xl leading-none">#{t.order_number}</span>
          <span className="text-sm font-semibold opacity-90">
            {t.order_type === 'mesa' ? `Mesa ${t.table_label}` : ORDER_TYPE_LABELS[t.order_type]}
          </span>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl leading-none tabular-nums" data-testid="ticket-timer">{clock(timing.activeSec)}</div>
          <div className="text-[11px] uppercase tracking-wide opacity-90">
            {held ? 'En espera' : done ? statusLabel(t.status, p.settings) : `${u.text} · ${t.target_minutes} min`}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 px-3 pt-2 text-[11px] font-bold uppercase">
        {p.showStation && p.stationName && <span className="rounded bg-slate-700 px-1.5 py-0.5">{p.stationName}</span>}
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{statusLabel(t.status, p.settings)}</span>
        {t.priority && <span className="flex items-center gap-1 rounded bg-fuchsia-600 px-1.5 py-0.5"><Star className="h-3 w-3" />Prioridad</span>}
        {t.course > 1 && <span className="rounded bg-violet-700 px-1.5 py-0.5">Tiempo {t.course}</span>}
        {t.reopen_count > 0 && <span className="flex items-center gap-1 rounded bg-orange-600 px-1.5 py-0.5"><RotateCcw className="h-3 w-3" />Reabierto ×{t.reopen_count}</span>}
        {t.blocked && <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5"><AlertOctagon className="h-3 w-3" />Faltante: {t.blocked_reason}</span>}
        {t._pending && (
          <span className={cx('flex items-center gap-1 rounded px-1.5 py-0.5', t._pending.failed ? 'bg-red-700' : 'bg-amber-600 text-black')}>
            <CloudOff className="h-3 w-3" />{t._pending.failed ? 'No se pudo enviar' : 'Sincronizando'}
          </span>
        )}
      </div>

      <ul className="flex-1 space-y-1.5 px-3 py-2">
        {t.items.map((i) => {
          const chips = modifierChips(i.modifiers ?? []);
          const voided = i.status === 'anulado';
          return (
            <li key={i.id}>
              <button
                type="button"
                disabled={voided || !p.onToggleItem || held || done}
                onClick={() => p.onToggleItem?.(i.id, i.status !== 'listo')}
                className={cx('w-full rounded-lg px-2 py-1 text-left transition',
                  !voided && p.onToggleItem && !held && !done && 'hover:bg-white/5',
                  i.status === 'listo' && 'bg-emerald-900/40')}
                aria-label={`${i.qty} ${i.display_name}${i.status === 'listo' ? ', listo' : ''}`}
              >
                <div className={cx('flex items-start gap-2 text-lg font-semibold leading-tight', voided && 'text-red-400 line-through')}>
                  <span className="min-w-[2ch] text-right tabular-nums text-brand-500">{i.qty}</span>
                  <span className="flex-1">
                    {i.display_name}
                    {i.is_change && <span className="ml-2 rounded bg-violet-600 px-1 text-xs no-underline">CAMBIO</span>}
                    {i.seat && <span className="ml-2 text-xs text-slate-400">A{i.seat}</span>}
                  </span>
                  {i.status === 'listo' && <Check className="h-5 w-5 text-emerald-400" aria-hidden />}
                  {voided && <span className="text-xs font-bold text-red-400 no-underline">ANULADO</span>}
                </div>
                {chips.length > 0 && (
                  <div className="ml-7 mt-0.5 flex flex-wrap gap-1">
                    {chips.map((c, k) => (
                      <span key={k} className={cx('rounded px-1.5 text-sm font-bold', c.negative ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/20 text-sky-200')}>{c.text}</span>
                    ))}
                  </div>
                )}
                {i.notes && <div className="ml-7 mt-0.5 text-sm font-semibold italic text-amber-300">“{i.notes}”</div>}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="flex items-center gap-1 border-t border-kds-line px-2 py-2">
        <span className="mr-auto px-1 text-xs text-slate-400">
          {t.server_name ?? ''} · {formatTime(t.fired_at ?? t.created_at, p.tz)}
          {live.length > 1 && !done && ` · ${readyCount}/${live.length}`}
          {timing.blockedSec >= 60 && ` · ${Math.round(timing.blockedSec / 60)} min bloqueado`}
        </span>
        {p.onHistory && (
          <button onClick={p.onHistory} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Historial"><History className="h-5 w-5" /></button>
        )}
        {p.onMenu && (
          <button onClick={p.onMenu} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Más acciones" data-testid="ticket-menu"><MoreHorizontal className="h-5 w-5" /></button>
        )}
        {p.mode === 'cook' && t.status === 'nuevo' && p.onStart && (
          <button onClick={p.onStart} className="flex h-12 items-center gap-1 rounded-lg bg-slate-700 px-3 font-bold hover:bg-slate-600" data-testid="ticket-start">
            <Play className="h-4 w-4" />Iniciar
          </button>
        )}
        {p.mode === 'cook' && (t.status === 'nuevo' || t.status === 'en_preparacion') && p.onBump && (
          <button onClick={p.onBump} className="flex h-12 min-w-[96px] items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 text-lg font-black hover:bg-emerald-500" data-testid="ticket-bump">
            <Check className="h-5 w-5" />{actionLabel('bump', p.settings)}
          </button>
        )}
        {p.mode === 'cook' && held && <span className="flex items-center gap-1 px-2 text-sm text-violet-300"><Flame className="h-4 w-4" />Espera marcha</span>}
        {(p.mode === 'expo' || p.mode === 'recent') && t.status === 'listo' && p.onDeliver && (
          <button onClick={p.onDeliver} className="flex h-12 items-center gap-1 rounded-lg bg-emerald-600 px-4 font-black hover:bg-emerald-500" data-testid="ticket-deliver">
            <Check className="h-5 w-5" />{actionLabel('deliver', p.settings)}
          </button>
        )}
        {p.mode === 'recent' && p.onReopen && (t.status === 'listo' || t.status === 'entregado') && (
          <button onClick={p.onReopen} className="flex h-12 items-center gap-1 rounded-lg bg-orange-600 px-3 font-bold hover:bg-orange-500" data-testid="ticket-reopen">
            <RotateCcw className="h-4 w-4" />Reabrir
          </button>
        )}
      </footer>
    </article>
  );
});
