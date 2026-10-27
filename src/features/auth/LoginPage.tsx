import { ChefHat, QrCode } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button, Card, Field, Input } from '@/components/ui';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setMsg({ tone: 'error', text: error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message });
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) setMsg({ tone: 'error', text: error.message });
        else if (!data.session) setMsg({ tone: 'ok', text: 'Revisa tu correo para confirmar la cuenta y luego inicia sesión.' });
      }
    } catch {
      setMsg({ tone: 'error', text: 'Sin conexión con el servidor.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white"><ChefHat className="h-6 w-6" /></span>
          <div>
            <h1 className="text-xl font-black">PrepIQ</h1>
            <p className="text-sm text-slate-500">Operación de cocina</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Correo">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contraseña" hint={mode === 'signup' ? 'Mínimo 8 caracteres.' : undefined}>
            <Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : 1}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {msg && <p className={msg.tone === 'error' ? 'text-sm font-medium text-red-600' : 'text-sm font-medium text-emerald-700'} role="alert">{msg.text}</p>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button className="font-semibold text-brand-700 underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null); }}>
            {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </p>
        <Link to="/vincular" className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          data-testid="go-pair">
          <QrCode className="h-4 w-4" />¿Es una tableta o reloj del restaurante? Vincular con código
        </Link>
      </Card>
    </div>
  );
}
