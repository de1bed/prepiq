import { AlertOctagon, BookOpen, Check, CloudOff, Lock, MoreHorizontal, RotateCcw, Share2, Star } from 'lucide-react';
import { memo } from 'react';
import { modifierChips, ticketTiming, actionLabel, type PendingInfo } from '@/lib/kitchen';
import { clock, formatTime } from '@/lib/time';
import { ORDER_TYPE_LABELS } from '@/lib/format';
import type { RestaurantSettings, TicketWithItems } from '@/lib/types';
import { cx } from '@/components/ui';

const URGENCY = {
  ok: { bar: 'bg-emerald-500', timer: 'text-slate-100', text: 'A tiempo' },
  warn: { bar: 'bg-amber-400', timer: 'text-amber-300', text: 'Atención' },
  late: { bar: 'bg-red-600', timer: 'text-red-400', text: 'Tarde' },
};

export function ticketPlace(t: Pick<TicketWithItems, 'order_type' | 'table_label'>): string {
  return t.order_type === 'mesa' ? `Mesa ${t.table_label}` : ORDER_TYPE_LABELS[t.order_type];
}

export interface TicketRowProps {
  ticket: TicketWithItems & { _pending?: PendingInfo };
  index: number;
  now: number;
  tz: string;
  settings: RestaurantSettings;
  selected: boolean;
  isNew?: boolean;
  onSelect: () => void;
  onBump: () => void;
  onMenu: () => void;
  onRecipe: () => void;
  onToggleItem?: (itemId: string, ready: boolean) => void;
}

/**
 * Un renglón por ticket. Cerrado (nuevo) no muestra el contenido; al
 * abrirlo (botón "Abrir" del costado) se ve el platillo y aparecen
 * Receta, "…" y Listo. El cronómetro corre desde que llegó a cocina.
 */
export const TicketRow = memo(function TicketRow(p: TicketRowProps) {
  const t = p.ticket;
  const timing = ticketTiming(t, p.now, p.settings);
  const u = URGENCY[timing.urgency];
  const open = t.status === 'en_preparacion';
  const live = t.items.filter((i) => i.status !== 'anulado');
  const multi = live.length > 1;

  return (
    <article
      onClick={p.onSelect}
      className={cx('flex cursor-pointer items-stretch overflow-hidden rounded-lg border-2 bg-kds-card transition',
        p.selected ? 'border-white' : t.blocked ? 'border-red-500' : timing.urgency === 'late' ? 'border-red-900' : 'border-kds-line',
        timing.urgency === 'late' && !p.selected && 'bg-red-950/40', p.isNew && 'ticket-new')}
      data-testid={`ticket-${t.order_number}`}
      data-ticket-id={t.id}
      data-open={open ? 'true' : 'false'}
      aria-selected={p.selected}
      aria-label={`Ticket ${t.order_number}, ${ticketPlace(t)}, ${open ? 'abierto' : 'cerrado'}, ${u.text}`}
    >
      <div className={cx('w-2 shrink-0', u.bar)} aria-hidden />
      <div className="flex w-10 shrink-0 items-start justify-center pt-3 text-sm font-bold text-slate-400">{p.index + 1}</div>

      <div className="min-w-0 flex-1 py-2 pr-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xl font-black leading-none">#{t.order_number}</span>
          <span className="text-lg font-bold leading-none">{ticketPlace(t)}</span>
          {t.server_name && <span className="text-sm text-slate-400">{t.server_name}</span>}
          {(t.unit_count ?? 1) > 1 && (
            <span className="rounded bg-slate-700 px-1.5 text-xs font-bold" title="Unidad de la misma línea">{t.unit_no}/{t.unit_count}</span>
          )}
          {t.priority && <span className="flex items-center gap-1 rounded bg-fuchsia-600 px-1.5 text-xs font-bold uppercase"><Star className="h-3 w-3" />Prioridad</span>}
          {t.course > 1 && <span className="rounded bg-violet-700 px-1.5 text-xs font-bold uppercase">Tiempo {t.course}</span>}
          {t.extra_station && <span className="flex items-center gap-1 rounded bg-sky-700 px-1.5 text-xs font-bold uppercase"><Share2 className="h-3 w-3" />Extra</span>}
          {t.reopen_count > 0 && <span className="flex items-center gap-1 rounded bg-orange-600 px-1.5 text-xs font-bold uppercase"><RotateCcw className="h-3 w-3" />Reabierto</span>}
          {t.blocked && <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 text-xs font-bold uppercase"><AlertOctagon className="h-3 w-3" />Falta: {t.blocked_reason}</span>}
          {t._pending && (
            <span className={cx('flex items-center gap-1 rounded px-1.5 text-xs font-bold', t._pending.failed ? 'bg-red-700' : 'bg-amber-600 text-black')}>
              <CloudOff className="h-3 w-3" />{t._pending.failed ? 'No se pudo enviar' : 'Sincronizando'}
            </span>
          )}
        </div>

        {open ? (
          <ul className="mt-2 space-y-1" data-testid="ticket-items">
            {t.items.map((i) => {
              const chips = modifierChips(i.modifiers ?? []);
              const voided = i.status === 'anulado';
              const canToggle = multi && !voided && !!p.onToggleItem;
              return (
                <li key={i.id}>
                  <button type="button" disabled={!canToggle}
                    onClick={(e) => { e.stopPropagation(); p.onToggleItem?.(i.id, i.status !== 'listo'); }}
                    className={cx('w-full rounded px-1 text-left', canToggle && 'hover:bg-white/5', i.status === 'listo' && multi && 'bg-emerald-900/40')}>
                    <div className={cx('flex items-start gap-2 text-2xl font-bold leading-tight', voided && 'text-red-400 line-through')}>
                      {i.qty > 1 && <span className="tabular-nums text-brand-500">{i.qty}</span>}
                      <span className="flex-1">
                        {i.display_name}
                        {i.is_change && <span className="ml-2 rounded bg-violet-600 px-1 align-middle text-xs">CAMBIO</span>}
                        {i.seat && <span className="ml-2 align-middle text-sm text-slate-400">Asiento {i.seat}</span>}
                      </span>
                      {i.status === 'listo' && multi && <Check className="h-6 w-6 text-emerald-400" aria-hidden />}
                      {voided && <span className="text-sm font-bold text-red-400 no-underline">ANULADO</span>}
                    </div>
                    {chips.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {chips.map((c, k) => (
                          <span key={k} className={cx('rounded px-1.5 text-base font-bold', c.negative ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/20 text-sky-200')}>{c.text}</span>
                        ))}
                      </div>
                    )}
                    {i.notes && <div className="mt-0.5 text-base font-semibold italic text-amber-300">“{i.notes}”</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500" data-testid="ticket-closed">
            <Lock className="h-3.5 w-3.5" /> Cerrado · selecciónalo y toca <b className="text-slate-300">Abrir</b>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center px-3 text-right">
        <div className={cx('font-mono text-3xl font-black leading-none tabular-nums', u.timer)} data-testid="ticket-timer">{clock(timing.activeSec)}</div>
        <div className="mt-1 text-xs text-slate-400">Llegó {formatTime(t.fired_at ?? t.created_at, p.tz)} · meta {t.target_minutes} min</div>
      </div>

      {open && (
        <div className="flex shrink-0 items-center gap-1 border-l border-kds-line px-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={p.onRecipe} className="flex h-14 flex-col items-center justify-center rounded-lg px-2 text-xs text-slate-300 hover:bg-white/10" data-testid="ticket-recipe" aria-label="Ver receta">
            <BookOpen className="h-6 w-6" />Receta
          </button>
          <button onClick={p.onMenu} className="flex h-14 items-center rounded-lg px-2 text-slate-300 hover:bg-white/10" aria-label="Más acciones" data-testid="ticket-menu">
            <MoreHorizontal className="h-6 w-6" />
          </button>
          <button onClick={p.onBump} className="flex h-14 min-w-[104px] items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 text-xl font-black hover:bg-emerald-500" data-testid="ticket-bump">
            <Check className="h-6 w-6" />{actionLabel('bump', p.settings)}
          </button>
        </div>
      )}
    </article>
  );
});
