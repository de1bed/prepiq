import { AlertTriangle, CloudOff, RefreshCw, Trash2, Wifi, Zap } from 'lucide-react';
import { useState } from 'react';
import { useSync } from '@/state/sync';
import { useApp } from '@/state/session';
import { errorText } from '@/lib/errors';
import { Badge, Button, Modal, cx } from './ui';

/** Indicador permanente del estado de sincronización (texto + color). */
export function SyncIndicator({ dark }: { dark?: boolean }) {
  const { online, pendingCount, failedCount, realtime } = useSync();
  const [open, setOpen] = useState(false);
  let tone = 'ok';
  let text = 'En línea';
  let detail = '';
  let Icon = Zap;
  if (!online) { tone = 'off'; text = pendingCount ? `Sin conexión · ${pendingCount} por enviar` : 'Sin conexión'; Icon = CloudOff; }
  else if (failedCount) { tone = 'fail'; text = `${failedCount} con error`; Icon = AlertTriangle; }
  else if (pendingCount) { tone = 'sync'; text = `Enviando ${pendingCount}…`; Icon = RefreshCw; }
  else if (realtime === 'polling') { tone = 'poll'; text = 'En línea'; detail = ' · actualiza cada 8 s'; Icon = Wifi; }
  else if (realtime === 'connecting') { tone = 'poll'; text = 'Conectando…'; Icon = Wifi; }
  else if (realtime === 'live') { text = 'En línea'; detail = ' · tiempo real'; }

  const cls = {
    ok: dark ? 'bg-emerald-900/60 text-emerald-200 ring-emerald-700' : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    poll: dark ? 'bg-sky-900/60 text-sky-200 ring-sky-700' : 'bg-sky-50 text-sky-700 ring-sky-200',
    sync: dark ? 'bg-amber-900/60 text-amber-200 ring-amber-700' : 'bg-amber-50 text-amber-800 ring-amber-200',
    off: 'bg-red-600 text-white ring-red-700 animate-pulse',
    fail: 'bg-red-600 text-white ring-red-700',
  }[tone];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset', cls)}
        aria-label={`Sincronización: ${text}${detail}`}
        data-testid="sync-indicator"
      >
        <Icon className={cx('h-3.5 w-3.5', tone === 'sync' && 'animate-spin')} aria-hidden />
        <span className="whitespace-nowrap">{text}<span className="hidden md:inline">{detail}</span></span>
      </button>
      <SyncPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SyncPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ops, outbox, online, realtime, lastSyncAt } = useSync();
  const { actor } = useApp();
  return (
    <Modal open={open} onClose={onClose} title="Sincronización" size="lg">
      <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3"><div className="text-slate-500">Conexión</div><div className="font-semibold">{online ? 'En línea' : 'Sin conexión'}</div></div>
        <div className="rounded-lg bg-slate-50 p-3"><div className="text-slate-500">Actualización</div><div className="font-semibold">{realtime === 'live' ? 'Tiempo real' : realtime === 'none' ? 'Al abrir y cada 30 s' : 'Sondeo cada 8 s'}</div></div>
        <div className="rounded-lg bg-slate-50 p-3"><div className="text-slate-500">Último envío</div><div className="font-semibold">{lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : '—'}</div></div>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        Las acciones se guardan en este dispositivo y se envían en orden. Si se pierde la conexión, se reintentan solas;
        el servidor reconoce los reintentos y <b>no duplica</b> órdenes ni movimientos.
      </p>
      {ops.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No hay operaciones pendientes.</div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {ops.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{o.label}</div>
                <div className="text-xs text-slate-500">
                  {new Date(o.createdAt).toLocaleTimeString()} · intentos: {o.attempts}
                  {o.error && <> · <span className={o.status === 'failed' ? 'text-red-600' : 'text-amber-700'}>{errorText(o.error)}</span></>}
                </div>
              </div>
              {o.status === 'failed' ? <Badge tone="red">Error</Badge> : <Badge tone="amber">Pendiente</Badge>}
              {o.status === 'failed' && (
                <>
                  <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => outbox.retry(o.id, actor?.token ? { p_actor_token: actor.token } : undefined)}>
                    Reintentar
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => outbox.discard(o.id)}>
                    Descartar
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => outbox.kick()} icon={<RefreshCw className="h-4 w-4" />}>Reintentar ahora</Button></div>
    </Modal>
  );
}
