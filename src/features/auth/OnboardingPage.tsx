import { Building2, Clock, KeyRound, LogOut, MonitorSmartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { rpc, asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { useApp } from '@/state/session';
import { Badge, Button, Card, Field, Input, Select, Tabs } from '@/components/ui';

const TIMEZONES = [
  'America/Mexico_City', 'America/Monterrey', 'America/Cancun', 'America/Tijuana', 'America/Hermosillo', 'America/Mazatlan',
  'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Guatemala',
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Phoenix', 'Europe/Madrid',
];

export function OnboardingPage() {
  const { contexts, refreshContexts, signOut, session } = useApp();
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const pending = contexts?.pending_requests ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">Bienvenido a PrepIQ</h1>
            <p className="text-sm text-slate-500">{session?.user.email}</p>
          </div>
          <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>Salir</Button>
        </div>

        {pending.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <div className="mb-1 flex items-center gap-2 font-semibold text-amber-900"><Clock className="h-4 w-4" />Solicitud enviada</div>
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span>{p.restaurant_name} · {p.kind === 'dispositivo' ? 'dispositivo' : 'colaborador'}</span>
                <Badge tone="amber">Esperando aprobación</Badge>
              </div>
            ))}
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => void refreshContexts()}>Ya me aprobaron, actualizar</Button>
          </div>
        )}

        <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
          { value: 'join', label: 'Unirme con código' },
          { value: 'create', label: 'Crear mi restaurante' },
        ]} />
        {tab === 'join' ? <JoinForm onDone={refreshContexts} /> : <CreateForm onDone={refreshContexts} />}
      </Card>
    </div>
  );
}

function JoinForm({ onDone }: { onDone: () => Promise<unknown> }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'persona' | 'dispositivo'>('persona');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await rpc('rpc_join_request', { p_join_code: code, p_kind: kind, p_display_name: name });
      await onDone();
    } catch (e2) { setErr(errorText(asAppError(e2))); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">Pide el <b>código del restaurante</b> a la administración. Tu solicitud quedará pendiente hasta que la aprueben y te asignen roles.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setKind('persona')} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm ${kind === 'persona' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
          <KeyRound className="h-5 w-5" /> Soy colaborador
        </button>
        <button type="button" onClick={() => setKind('dispositivo')} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm ${kind === 'dispositivo' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
          <MonitorSmartphone className="h-5 w-5" /> Es un dispositivo
        </button>
      </div>
      <Field label="Código del restaurante"><Input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ej. 7F3A9C21" className="font-mono uppercase" /></Field>
      <Field label={kind === 'persona' ? 'Tu nombre (como te conocen en cocina)' : 'Nombre del dispositivo'}>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'persona' ? 'Ej. Carla' : 'Ej. Tableta Parrilla'} />
      </Field>
      {err && <p className="text-sm font-medium text-red-600">{err}</p>}
      <Button type="submit" className="w-full" loading={busy}>Enviar solicitud</Button>
    </form>
  );
}

function CreateForm({ onDone }: { onDone: () => Promise<unknown> }) {
  const [org, setOrg] = useState('');
  const [rest, setRest] = useState('');
  const [me, setMe] = useState('');
  const [tz, setTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City');
  const [currency, setCurrency] = useState('MXN');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await rpc('rpc_create_restaurant', { p_org_name: org || rest, p_restaurant_name: rest, p_display_name: me, p_timezone: tz, p_currency: currency });
      await onDone();
    } catch (e2) { setErr(errorText(asAppError(e2))); } finally { setBusy(false); }
  };
  const tzs = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nombre del restaurante"><Input required minLength={2} value={rest} onChange={(e) => setRest(e.target.value)} /></Field>
      <Field label="Empresa / grupo" hint="Opcional. Permite agregar más sucursales después."><Input value={org} onChange={(e) => setOrg(e.target.value)} /></Field>
      <Field label="Tu nombre"><Input required value={me} onChange={(e) => setMe(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Zona horaria"><Select value={tz} onChange={(e) => setTz(e.target.value)}>{tzs.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Moneda"><Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{['MXN', 'USD', 'COP', 'PEN', 'CLP', 'ARS', 'GTQ', 'EUR'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      {err && <p className="text-sm font-medium text-red-600">{err}</p>}
      <Button type="submit" className="w-full" loading={busy} icon={<Building2 className="h-4 w-4" />}>Crear restaurante</Button>
      <p className="text-xs text-slate-500">Quedarás como administrador. Después configura estaciones, menú y personal desde Administración.</p>
    </form>
  );
}
