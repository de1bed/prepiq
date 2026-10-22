import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read, rpc } from '@/lib/rpc';
import { useApp } from '@/state/session';
import { Button, Card, Field, Input, Select, Spinner, useToast } from '@/components/ui';
import type { RestaurantSettings as Settings } from '@/lib/types';
import { useConfigWrite } from './crud';

interface RestaurantRow { id: string; name: string; timezone: string; day_cutover_hour: number; currency: string; settings: Settings; is_demo: boolean }

export function RestaurantSettings() {
  const { restaurant, refreshContexts, can } = useApp();
  const rid = restaurant!.id;
  const toast = useToast();
  const qc = useQueryClient();
  const { update } = useConfigWrite(['restaurant']);
  const { data } = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: async () => (await read<RestaurantRow[]>(supabase.from('restaurants').select('id, name, timezone, day_cutover_hour, currency, settings, is_demo').eq('id', rid)))[0],
  });
  const { data: code, refetch: refetchCode } = useQuery({
    queryKey: ['join-code', rid],
    enabled: can('staff.manage') || can('devices.manage'),
    queryFn: () => rpc<{ join_code: string }>('rpc_get_join_code', { p_restaurant_id: rid }),
  });
  const [form, setForm] = useState<RestaurantRow | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (!form) return <Spinner />;
  const s = form.settings ?? {};
  const setS = (patch: Partial<Settings>) => setForm({ ...form, settings: { ...s, ...patch } });
  const labels = s.labels ?? {};

  const save = async () => {
    const ok = await update('restaurants', rid, {
      name: form.name, timezone: form.timezone, day_cutover_hour: form.day_cutover_hour, currency: form.currency, settings: form.settings,
    });
    if (ok) { await refreshContexts(); qc.invalidateQueries(); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Datos generales</h2>
        <div className="grid gap-3">
          <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zona horaria" hint="Nombre IANA, ej. America/Mexico_City"><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
            <Field label="Moneda"><Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label="Hora de corte del día de negocio" hint="Un servicio que termina después de medianoche cuenta para el día anterior hasta esta hora.">
            <Select value={form.day_cutover_hour} onChange={(e) => setForm({ ...form, day_cutover_hour: Number(e.target.value) })}>
              {Array.from({ length: 13 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Operación</h2>
        <div className="grid gap-3 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" checked={s.auto_open_service_day ?? true} onChange={(e) => setS({ auto_open_service_day: e.target.checked })} />
            <span><b>Abrir jornada automáticamente</b> con la primera orden. Si se desactiva, un gerente debe abrirla.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={s.allow_personal_punch ?? false} onChange={(e) => setS({ allow_personal_punch: e.target.checked })} />
            <span><b>Permitir marcar asistencia desde el celular personal.</b> (No verifica ubicación.) Si no, solo desde el reloj del local.</span></label>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Meta de equipo (% a tiempo)"><Input type="number" min={50} max={100} value={s.team_on_time_goal_pct ?? 85} onChange={(e) => setS({ team_on_time_goal_pct: Number(e.target.value) })} /></Field>
            <Field label="Aviso KDS (% del objetivo)"><Input type="number" min={30} max={100} value={s.kds_warn_pct ?? 75} onChange={(e) => setS({ kds_warn_pct: Number(e.target.value) })} /></Field>
            <Field label="Tarde (% del objetivo)"><Input type="number" min={50} max={300} value={s.kds_late_pct ?? 100} onChange={(e) => setS({ kds_late_pct: Number(e.target.value) })} /></Field>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Lenguaje de cocina</h2>
        <p className="mb-3 text-sm text-slate-500">Cómo se llaman los estados y botones en tu cocina (p. ej. "Vender" en lugar de "Listo"). Los estados internos no cambian.</p>
        <div className="grid grid-cols-2 gap-3">
          {([['nuevo', 'Estado: nuevo'], ['en_preparacion', 'Estado: en preparación'], ['listo', 'Estado: listo'], ['entregado', 'Estado: entregado'], ['bump', 'Botón para marcar listo'], ['deliver', 'Botón para entregar']] as const).map(([k, l]) => (
            <Field key={k} label={l}><Input value={labels[k] ?? ''} placeholder="Predeterminado" onChange={(e) => setS({ labels: { ...labels, [k]: e.target.value || undefined } })} /></Field>
          ))}
        </div>
      </Card>

      {code && (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Código para unirse</h2>
          <p className="mb-3 text-sm text-slate-500">Compártelo con tu equipo o úsalo en cada dispositivo nuevo. Cada solicitud la apruebas tú en Personal o Dispositivos.</p>
          <div className="flex items-center gap-2">
            <code className="rounded-lg bg-slate-900 px-4 py-2 font-mono text-xl tracking-widest text-white" data-testid="join-code">{code.join_code}</code>
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => { void navigator.clipboard?.writeText(code.join_code); toast('info', 'Copiado'); }}>Copiar</Button>
            <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={async () => { await rpc('rpc_rotate_join_code', { p_restaurant_id: rid }); void refetchCode(); toast('success', 'Código nuevo generado'); }}>Cambiar</Button>
          </div>
        </Card>
      )}
      <div className="lg:col-span-2"><Button size="lg" onClick={() => void save()}>Guardar cambios</Button></div>
    </div>
  );
}
