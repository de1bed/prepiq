// Agregar o volver a vincular un equipo con un QR / código de un solo uso.
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, QrCode, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { asAppError, rpc } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { useStations } from '@/data/hooks';
import { useApp } from '@/state/session';
import { Badge, Button, Field, Input, Modal, Select, useToast } from '@/components/ui';
import { DEVICE_MODE_LABELS, pairingUrl } from '@/features/auth/pairing';

interface Pairing { pairing_id: string; code: string; expires_at: string; name: string; mode: string; replaces: boolean }
interface PairingStatus { status: 'pendiente' | 'usado' | 'vencido' | 'cancelado' }

export interface ReplaceTarget { id: string; name: string; mode: string; station_id: string | null }

export function DevicePairingModal({ open, onClose, replace }: { open: boolean; onClose: () => void; replace?: ReplaceTarget | null }) {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: stations } = useStations();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [mode, setMode] = useState('kds');
  const [station, setStation] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [svg, setSvg] = useState('');
  const [status, setStatus] = useState<PairingStatus['status']>('pendiente');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    setPairing(null); setStatus('pendiente'); setSvg('');
    setName(replace?.name ?? ''); setMode(replace?.mode ?? 'kds'); setStation(replace?.station_id ?? '');
  }, [open, replace]);

  const url = pairing ? pairingUrl(window.location.origin, pairing.code.replace('-', '')) : '';
  useEffect(() => {
    if (!url) return;
    void QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg);
  }, [url]);

  // Cuenta regresiva y espera a que el equipo use el código.
  useEffect(() => {
    if (!pairing || status !== 'pendiente') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const s = await rpc<PairingStatus>('rpc_device_pairing_status', { p_restaurant_id: rid, p_pairing_id: pairing.pairing_id });
        if (s.status !== 'pendiente') {
          setStatus(s.status);
          if (s.status === 'usado') void qc.invalidateQueries({ queryKey: ['devices', rid] });
        }
      } catch { /* sin red: se reintenta en el siguiente ciclo */ }
    }, 2500);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [pairing, status, rid, qc]);

  const generate = async () => {
    setBusy(true);
    try {
      const p = await rpc<Pairing>('rpc_device_pairing_create', {
        p_restaurant_id: rid, p_name: name, p_mode: mode, p_station_id: station || null, p_device_id: replace?.id ?? null,
      });
      setPairing(p); setStatus('pendiente'); setNow(Date.now());
    } catch (e) { toast('error', errorText(asAppError(e))); }
    finally { setBusy(false); }
  };

  const close = () => {
    if (pairing && status === 'pendiente') {
      void rpc('rpc_device_pairing_cancel', { p_restaurant_id: rid, p_pairing_id: pairing.pairing_id }).catch(() => undefined);
    }
    onClose();
  };

  const secondsLeft = pairing ? Math.max(0, Math.round((new Date(pairing.expires_at).getTime() - now) / 1000)) : 0;
  const expired = status === 'vencido' || (status === 'pendiente' && pairing !== null && secondsLeft === 0);
  const needsStation = mode === 'kds';

  return (
    <Modal open={open} onClose={close} title={replace ? `Volver a vincular "${replace.name}"` : 'Agregar dispositivo'} size="md">
      {!pairing ? (
        <div className="space-y-4">
          {replace && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Úsalo si cambiaste de tableta o se borró el navegador. El equipo anterior dejará de funcionar; el historial se conserva.
            </p>
          )}
          <Field label="Nombre del equipo">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tableta parrilla" data-testid="pairing-name" autoFocus />
          </Field>
          <Field label="¿Qué será?">
            <Select value={mode} onChange={(e) => setMode(e.target.value)} data-testid="pairing-mode">
              {Object.entries(DEVICE_MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          {needsStation && (
            <Field label="Estación" hint="La tableta abrirá directo en esa estación.">
              <Select value={station} onChange={(e) => setStation(e.target.value)} data-testid="pairing-station">
                <option value="">Elegir al abrir</option>
                {stations?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          <Button className="w-full" size="lg" icon={<QrCode className="h-5 w-5" />} loading={busy} disabled={!name.trim()}
            onClick={() => void generate()} data-testid="pairing-generate">
            Generar QR
          </Button>
        </div>
      ) : status === 'usado' ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="pairing-done">
          <CheckCircle2 className="h-14 w-14 text-emerald-600" />
          <p className="text-lg font-bold">"{pairing.name}" quedó vinculado</p>
          <p className="text-sm text-slate-600">Ya abre en su pantalla. Cada persona entra con su PIN.</p>
          <Button onClick={onClose}>Listo</Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-slate-600">
            En la tableta, abre la <b>cámara</b> y apunta al código. O entra a <b>{window.location.host}/vincular</b> y escribe:
          </p>
          <div className={expired ? 'opacity-20' : ''} aria-label="Código QR para vincular" role="img"
            style={{ width: 240, height: 240 }} dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="font-mono text-4xl font-black tracking-widest" data-testid="pairing-code">{pairing.code}</div>
          <div className="text-sm">
            <b>{pairing.name}</b> · {DEVICE_MODE_LABELS[pairing.mode] ?? pairing.mode}
          </div>
          {expired || status !== 'pendiente' ? (
            <div className="space-y-2">
              <Badge tone="red">{status === 'cancelado' ? 'Cancelado' : 'Venció'}</Badge>
              <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => void generate()} loading={busy}>Generar otro</Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Esperando al equipo… vence en {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} · sirve una sola vez
              </p>
              <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" />}
                onClick={() => void navigator.clipboard?.writeText(url).then(() => toast('success', 'Enlace copiado'), () => undefined)}>
                Copiar enlace
              </Button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
