import { Delete, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { rpc, asAppError } from '@/lib/rpc';
import { messageForCode } from '@/lib/errors';
import { useApp, type Operator } from '@/state/session';
import { Button, Modal, cx } from './ui';

/** Teclado numérico grande, usable con guantes y a distancia. */
export function PinPad({ onSubmit, busy, error, dark, length = 6, submitLabel = 'Entrar' }: {
  onSubmit: (pin: string) => void; busy?: boolean; error?: string | null; dark?: boolean; length?: number; submitLabel?: string;
}) {
  const [pin, setPin] = useState('');
  const press = (d: string) => setPin((p) => (p.length < length ? p + d : p));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter' && pin.length >= 4) { onSubmit(pin); setPin(''); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const key = cx('h-16 rounded-xl text-2xl font-bold transition active:scale-95',
    dark ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-900 hover:bg-slate-200');
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-3 flex h-12 items-center justify-center gap-3" aria-live="polite" aria-label={`${pin.length} dígitos`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={cx('h-4 w-4 rounded-full', i < pin.length ? (dark ? 'bg-white' : 'bg-slate-900') : (dark ? 'bg-slate-700' : 'bg-slate-300'))} />
        ))}
      </div>
      {error && <p className="mb-3 text-center text-sm font-semibold text-red-500" role="alert">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} aria-label={d}>{d}</button>
        ))}
        <button type="button" className={key} onClick={() => setPin('')} aria-label="Borrar todo">C</button>
        <button type="button" className={key} onClick={() => press('0')} aria-label="0">0</button>
        <button type="button" className={key} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Borrar"><Delete className="mx-auto h-6 w-6" /></button>
      </div>
      <Button className="mt-3 w-full" size="xl" variant="primary" loading={busy} disabled={pin.length < 4}
        onClick={() => { onSubmit(pin); setPin(''); }} data-testid="pin-submit">
        {submitLabel}
      </Button>
    </div>
  );
}

/** En dispositivos compartidos exige que alguien se identifique con PIN. */
export function OperatorGate({ children, title, dark = true }: { children: ReactNode; title: string; dark?: boolean }) {
  const { device, operator, setOperator } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!device || operator) return <>{children}</>;
  const login = async (pin: string) => {
    setBusy(true); setError(null);
    try {
      const r = await rpc<{ ok: boolean; error?: string; hint?: string } & Operator>('rpc_device_login', { p_pin: pin });
      if (!r.ok) setError(r.hint ?? messageForCode(r.error ?? 'pin_incorrecto'));
      else setOperator({ token: r.token, staff_id: r.staff_id, display_name: r.display_name, roles: r.roles, permissions: r.permissions, expires_at: r.expires_at });
    } catch (e) {
      setError(asAppError(e).message);
    } finally { setBusy(false); }
  };
  return (
    <div className={cx('flex min-h-screen flex-col items-center justify-center p-6', dark ? 'bg-kds-bg text-white' : 'bg-slate-50')}>
      <div className="mb-6 text-center">
        <KeyRound className="mx-auto mb-2 h-10 w-10 text-brand-500" />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className={dark ? 'text-slate-400' : 'text-slate-500'}>{device.name} · Ingresa tu PIN</p>
      </div>
      <PinPad onSubmit={login} busy={busy} error={error} dark={dark} />
    </div>
  );
}

export function OperatorBadge({ dark }: { dark?: boolean }) {
  const { device, operator, setOperator, actor } = useApp();
  if (!actor) return null;
  return (
    <div className={cx('flex items-center gap-2 rounded-full px-3 py-1 text-sm', dark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700')}>
      <UserRound className="h-4 w-4" aria-hidden />
      <span className="font-semibold" data-testid="operator-name">{actor.name}</span>
      {device && operator && (
        <button onClick={async () => {
          try { await rpc('rpc_device_logout', { p_token: operator.token }); } catch { /* expira solo */ }
          setOperator(null);
        }} className="ml-1 rounded-full p-1 hover:bg-black/20" aria-label="Cambiar de persona" title="Cambiar de persona">
          <LogOut className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Autorización en sitio (PIN de gerente)
// ---------------------------------------------------------------------
type OverrideFn = (permission: string, reason: string) => Promise<string | null>;
const OverrideCtx = createContext<OverrideFn>(async () => null);

export function OverrideProvider({ children }: { children: ReactNode }) {
  const { restaurant } = useApp();
  const [req, setReq] = useState<{ permission: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const request = useCallback<OverrideFn>((permission, reason) => new Promise((resolve) => {
    resolver.current = resolve;
    setError(null);
    setReq({ permission, reason });
  }), []);

  const close = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setReq(null);
  };

  const submit = async (pin: string) => {
    if (!req || !restaurant) return;
    setBusy(true); setError(null);
    try {
      const r = await rpc<{ ok: boolean; override?: string; error?: string; hint?: string; authorizer_name?: string }>(
        'rpc_request_override', { p_restaurant_id: restaurant.id, p_pin: pin, p_permission: req.permission });
      if (r.ok && r.override) close(r.override);
      else setError(r.hint ?? messageForCode(r.error ?? 'pin_incorrecto'));
    } catch (e) {
      setError(asAppError(e).message);
    } finally { setBusy(false); }
  };

  return (
    <OverrideCtx.Provider value={request}>
      {children}
      <Modal open={!!req} onClose={() => close(null)} title={<span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-600" />Autorización de gerente</span>} size="sm">
        <p className="mb-4 text-center text-sm text-slate-600">{req?.reason}<br />Un gerente presente ingresa su PIN.</p>
        <PinPad onSubmit={submit} busy={busy} error={error} submitLabel="Autorizar" />
      </Modal>
    </OverrideCtx.Provider>
  );
}

export const useOverride = () => useContext(OverrideCtx);
