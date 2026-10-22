import { CheckCircle2, Clock, Coffee, LogIn, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { rpc, asAppError } from '@/lib/rpc';
import { errorText, messageForCode } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { uuid } from '@/lib/ids';
import { useApp } from '@/state/session';
import { useEnqueue, useSync } from '@/state/sync';
import { PinPad } from '@/components/Pin';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Button, Spinner } from '@/components/ui';
import { useNow } from '../kds/useNow';

const ACTIONS: Record<string, { label: string; icon: typeof LogIn; tone: string }> = {
  entrada: { label: 'Registrar entrada', icon: LogIn, tone: 'bg-emerald-600 hover:bg-emerald-500' },
  inicio_descanso: { label: 'Iniciar descanso', icon: Coffee, tone: 'bg-amber-500 text-black hover:bg-amber-400' },
  fin_descanso: { label: 'Terminar descanso', icon: Coffee, tone: 'bg-sky-600 hover:bg-sky-500' },
  salida: { label: 'Registrar salida', icon: LogOut, tone: 'bg-red-600 hover:bg-red-500' },
};
const KIND_TEXT: Record<string, string> = { entrada: 'Entrada', inicio_descanso: 'Inicio de descanso', fin_descanso: 'Fin de descanso', salida: 'Salida' };

interface Status {
  staff_id: string; staff_name: string; last_punch: { kind: string; at: string } | null; allowed: string[];
  shift: { starts_at: string; ends_at: string; station: string | null } | null;
}

/**
 * Reloj checador. En un dispositivo "kiosko" cada persona se identifica con su
 * PIN (sesión de 2 minutos). Las marcas se encolan: si no hay conexión se
 * guardan con la hora del dispositivo y el servidor las marca para revisión.
 */
export function KioskPage() {
  const { restaurant, device, staff, signOut } = useApp();
  const enqueue = useEnqueue();
  const { online } = useSync();
  const now = useNow(1000);
  const [session, setSession] = useState<{ token: string | null; status: Status } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; kind: string; at: Date; offline: boolean } | null>(null);
  const tz = restaurant?.timezone ?? 'America/Mexico_City';

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(t);
  }, [done]);
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => setSession(null), 60_000); // inactividad
    return () => clearTimeout(t);
  }, [session]);

  // Cuenta personal: estado propio sin PIN.
  useEffect(() => {
    if (device || !staff || session) return;
    rpc<Status>('rpc_punch_status', { p_restaurant_id: restaurant!.id, p_actor_token: null })
      .then((s) => setSession({ token: null, status: s })).catch(() => undefined);
  }, [device, staff, session, restaurant]);

  const login = async (pin: string) => {
    setBusy(true); setError(null);
    try {
      const r = await rpc<{ ok: boolean; token: string; error?: string; hint?: string }>('rpc_device_login', { p_pin: pin });
      if (!r.ok) { setError(r.hint ?? messageForCode(r.error ?? 'pin_incorrecto')); return; }
      const s = await rpc<Status>('rpc_punch_status', { p_restaurant_id: restaurant!.id, p_actor_token: r.token });
      setSession({ token: r.token, status: s });
    } catch (e) {
      setError(asAppError(e).kind === 'network' ? 'Sin conexión: no se puede verificar el PIN. Intenta de nuevo en un momento.' : errorText(asAppError(e)));
    } finally { setBusy(false); }
  };

  const punch = async (kind: string) => {
    if (!session) return;
    const at = new Date();
    await enqueue('rpc_punch', { p_actor_token: session.token, p_kind: kind, p_client_at: at.toISOString(), p_note: null },
      { label: `${session.status.staff_name}: ${KIND_TEXT[kind]}`, opId: uuid() });
    setDone({ name: session.status.staff_name, kind, at, offline: !online });
    if (device && session.token) void rpc('rpc_device_logout', { p_token: session.token }).catch(() => undefined);
    setSession(device ? null : { ...session, status: { ...session.status, last_punch: { kind, at: at.toISOString() }, allowed: nextAllowed(kind) } });
  };

  return (
    <div className="kds flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div>
          <div className="text-lg font-bold">{restaurant?.name}</div>
          <div className="text-sm text-slate-400">Reloj checador{device ? ` · ${device.name}` : ''}</div>
        </div>
        <div className="flex items-center gap-3"><SyncIndicator dark />{!device && <Button variant="dark" size="sm" onClick={() => history.back()}>Salir</Button>}</div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <div className="font-mono text-6xl font-black tabular-nums">{formatTime(new Date(now), tz)}</div>
          <div className="text-slate-400">{new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now))}</div>
        </div>

        {done ? (
          <div className="text-center" role="status" data-testid="punch-done">
            <CheckCircle2 className="mx-auto mb-3 h-20 w-20 text-emerald-400" />
            <div className="text-3xl font-bold">{KIND_TEXT[done.kind]} registrada</div>
            <div className="text-xl text-slate-300">{done.name} · {formatTime(done.at, tz)}</div>
            {done.offline && <div className="mt-2 text-amber-300">Sin conexión: se enviará al reconectar (se marcará para revisión).</div>}
          </div>
        ) : !session ? (
          device ? (
            <>
              <p className="mb-4 text-lg text-slate-300">Ingresa tu PIN</p>
              <PinPad onSubmit={login} busy={busy} error={error} dark submitLabel="Continuar" />
            </>
          ) : (
            staff ? <Spinner className="text-slate-400" /> : <p>Esta pantalla es para el reloj del restaurante.</p>
          )
        ) : (
          <div className="w-full max-w-md text-center">
            <div className="mb-1 text-3xl font-bold" data-testid="kiosk-name">Hola, {session.status.staff_name}</div>
            <div className="mb-6 text-slate-400">
              {session.status.last_punch ? `Última marca: ${KIND_TEXT[session.status.last_punch.kind]} a las ${formatTime(session.status.last_punch.at, tz)}` : 'Sin marcas previas'}
              {session.status.shift && <div><Clock className="mr-1 inline h-4 w-4" />Turno: {formatTime(session.status.shift.starts_at, tz)}–{formatTime(session.status.shift.ends_at, tz)}{session.status.shift.station ? ` · ${session.status.shift.station}` : ''}</div>}
            </div>
            <div className="grid gap-3">
              {session.status.allowed.map((k) => {
                const a = ACTIONS[k];
                return (
                  <button key={k} onClick={() => void punch(k)} className={`flex h-20 items-center justify-center gap-3 rounded-2xl text-2xl font-black ${a.tone}`} data-testid={`punch-${k}`}>
                    <a.icon className="h-7 w-7" />{a.label}
                  </button>
                );
              })}
            </div>
            {device && <button className="mt-6 text-slate-400 underline" onClick={() => setSession(null)}>No soy yo</button>}
            {!device && staff && !restaurant?.settings.allow_personal_punch && (
              <p className="mt-4 text-sm text-amber-300">Tu restaurante solo acepta marcas desde el reloj del local.</p>
            )}
          </div>
        )}
      </main>
      {device && <footer className="p-3 text-center"><button className="text-xs text-slate-600" onClick={() => void signOut()}>Cerrar sesión del dispositivo</button></footer>}
    </div>
  );
}

function nextAllowed(kind: string): string[] {
  if (kind === 'salida') return ['entrada'];
  if (kind === 'inicio_descanso') return ['fin_descanso', 'salida'];
  return ['inicio_descanso', 'salida'];
}
