// Vincular este equipo (tableta, terminal o reloj) con el código o QR que
// genera Administración → Dispositivos. No hace falta crear cuentas: el
// servidor crea la del equipo con una contraseña aleatoria y aquí se inicia
// sesión sola.
import { CheckCircle2, ChefHat, MonitorSmartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { asAppError, rpc } from '@/lib/rpc';
import { errorText, messageForCode } from '@/lib/errors';
import { useApp } from '@/state/session';
import { Button, Card, Field, Input } from '@/components/ui';
import { DEVICE_MODE_LABELS, normalizePairingCode } from './pairing';

interface Peek {
  ok: boolean; error?: string; restaurant_name?: string; name?: string; mode?: string;
  station_name?: string | null; replaces?: boolean;
}
interface PairResult { email: string; password: string; device_name: string; restaurant_name: string; mode: string }

function codeFromUrl(): string {
  const fromHash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const fromQuery = new URLSearchParams(window.location.search).get('codigo') ?? '';
  return normalizePairingCode(fromHash || fromQuery);
}

export function PairPage() {
  const { session, contexts, signOut } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState(codeFromUrl);
  const [preview, setPreview] = useState<Peek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PairResult | null>(null);

  const check = async (c: string) => {
    setError(null); setPreview(null);
    if (c.length !== 8) { setError('El código tiene 8 caracteres (p. ej. ABCD-EF23).'); return; }
    setBusy(true);
    try {
      const p = await rpc<Peek>('rpc_device_pairing_peek', { p_code: c });
      if (p.ok) setPreview(p);
      else setError(messageForCode(p.error ?? 'codigo_invalido'));
    } catch (e) { setError(errorText(asAppError(e))); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (code.length === 8) void check(code); // solo al abrir con el código en el enlace
  }, []);

  const signIn = async (res: PairResult) => {
    const { error: err } = await supabase.auth.signInWithPassword({ email: res.email, password: res.password });
    if (err) {
      setPending(res);
      setError('El equipo quedó vinculado pero no se pudo iniciar sesión (¿sin internet?). Toca "Reintentar".');
      return;
    }
    setPending(null);
    navigate('/', { replace: true });
  };

  const pair = async () => {
    setBusy(true); setError(null);
    try {
      const res = await rpc<PairResult>('rpc_device_pair', { p_code: code });
      if (session) await signOut();
      await signIn(res);
    } catch (e) {
      setError(errorText(asAppError(e)));
    } finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void check(code); };
  const currentAccount = session
    ? contexts?.device ? `el dispositivo "${contexts.device.name}"` : session.user.email ?? 'otra cuenta'
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white"><ChefHat className="h-6 w-6" /></span>
          <div>
            <h1 className="text-xl font-black">Vincular este equipo</h1>
            <p className="text-sm text-slate-500">Tableta de cocina, terminal de meseros o reloj checador</p>
          </div>
        </div>

        {pending ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-600" role="alert">{error}</p>
            <Button className="w-full" size="lg" loading={busy} onClick={() => { setBusy(true); void signIn(pending).finally(() => setBusy(false)); }}>
              Reintentar
            </Button>
          </div>
        ) : preview?.ok ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-500"><MonitorSmartphone className="h-4 w-4" />{preview.restaurant_name}</div>
              <div className="mt-1 text-2xl font-black" data-testid="pair-device-name">{preview.name}</div>
              <div className="text-sm text-slate-600">
                {DEVICE_MODE_LABELS[preview.mode ?? ''] ?? preview.mode}{preview.station_name ? ` · ${preview.station_name}` : ''}
              </div>
              {preview.replaces && <p className="mt-2 text-sm text-amber-700">Reemplaza al equipo anterior con este nombre.</p>}
            </div>
            {currentAccount && (
              <p className="text-sm text-slate-600">Este navegador tiene abierta la sesión de <b>{currentAccount}</b>; se cerrará al vincular.</p>
            )}
            {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
            <Button className="w-full" size="lg" loading={busy} icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => void pair()}
              data-testid="pair-confirm">
              Vincular este equipo
            </Button>
            <button className="w-full text-sm text-slate-500 underline" onClick={() => { setPreview(null); setCode(''); }}>Usar otro código</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">
              En otro equipo, entra a <b>Administración → Dispositivos → Agregar dispositivo</b>. Escanea el QR con la cámara de este
              equipo o escribe aquí el código.
            </p>
            <Field label="Código">
              <Input value={code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code} autoCapitalize="characters" autoComplete="off"
                inputMode="text" className="text-center font-mono text-2xl tracking-widest" placeholder="ABCD-EF23" data-testid="pair-code"
                onChange={(e) => setCode(normalizePairingCode(e.target.value))} />
            </Field>
            {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
            <Button type="submit" className="w-full" size="lg" loading={busy}>Continuar</Button>
            {!session && (
              <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => navigate('/', { replace: true })}>
                Iniciar sesión con correo
              </button>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
