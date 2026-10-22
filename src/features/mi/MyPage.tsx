import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, Repeat, Plane, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { read, rpc, asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { formatDateTime, formatTime, toDateStr, zonedToUtc } from '@/lib/time';
import { useApp } from '@/state/session';
import { useStaff } from '@/data/hooks';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/format';
import type { Shift } from '@/lib/types';
import { CorrectionDialog } from '../horarios/SchedulePage';

export function MyPage() {
  const { restaurant, staff, actor } = useApp();
  const rid = restaurant!.id;
  const tz = restaurant!.timezone;
  const toast = useToast();
  const qc = useQueryClient();
  const { data: people } = useStaff();
  const [timeOff, setTimeOff] = useState(false);
  const [swapFor, setSwapFor] = useState<Shift | null>(null);
  const [correction, setCorrection] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my', rid],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400_000).toISOString();
      const [shifts, openSwaps, myRequests, sessions] = await Promise.all([
        read<Shift[]>(supabase.from('shifts').select('*').eq('restaurant_id', rid).eq('status', 'publicado')
          .gte('ends_at', new Date().toISOString()).order('starts_at').limit(30)),
        read<{ id: string; shift_id: string; from_staff: string; to_staff: string | null; status: string; shift: Shift }[]>(
          supabase.from('shift_swap_requests').select('*, shift:shifts(*)').eq('restaurant_id', rid).in('status', ['pendiente', 'aceptada'])),
        read<{ id: string; starts_at: string; ends_at: string; status: string; reason: string | null }[]>(
          supabase.from('time_off_requests').select('*').eq('restaurant_id', rid).eq('staff_id', actor!.staffId).order('created_at', { ascending: false }).limit(10)),
        rpc<{ entrada: string; salida: string | null; worked_minutes: number | null; break_minutes: number; has_corrections: boolean; has_offline: boolean }[]>(
          'attendance_sessions', { p_restaurant_id: rid, p_from: since, p_to: new Date(Date.now() + 86400_000).toISOString(), p_staff_id: actor!.staffId }),
      ]);
      return { shifts, openSwaps, myRequests, sessions };
    },
  });
  const name = (id: string | null) => people?.find((p) => p.id === id)?.display_name ?? '—';
  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    try { await rpc(fn, { p_restaurant_id: rid, ...args }); toast('success', ok); qc.invalidateQueries({ queryKey: ['my'] }); }
    catch (e) { toast('error', errorText(asAppError(e))); }
  };

  if (isLoading || !data) return <Spinner />;
  const mine = data.shifts.filter((s) => s.staff_id === actor!.staffId);
  const openShifts = data.shifts.filter((s) => s.staff_id === null);
  const offers = data.openSwaps.filter((s) => s.from_staff !== actor!.staffId && (s.to_staff === null || s.to_staff === actor!.staffId) && s.status === 'pendiente');
  const minePending = data.openSwaps.filter((s) => s.from_staff === actor!.staffId);

  return (
    <div>
      <PageHeader title="Mi espacio" subtitle={<span className="flex items-center gap-1"><UserRound className="h-4 w-4" />{actor?.name} · {staff?.roles.map((r) => ROLE_LABELS[r]).join(' · ')}</span>}
        actions={<>
          <Button variant="secondary" icon={<Plane className="h-4 w-4" />} onClick={() => setTimeOff(true)}>Pedir ausencia</Button>
          <Button variant="secondary" icon={<Clock className="h-4 w-4" />} onClick={() => setCorrection(true)}>Olvidé marcar</Button>
          {restaurant?.settings.allow_personal_punch && <Link to="/reloj"><Button>Registrar asistencia</Button></Link>}
        </>} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-brand-600" />Mis próximos turnos</h2>
          {mine.length === 0 ? <EmptyState className="p-4" title="Sin turnos publicados" /> : (
            <ul className="divide-y">
              {mine.map((s) => {
                const pending = minePending.find((p) => p.shift_id === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1"><b>{formatDateTime(s.starts_at, tz)}</b> – {formatTime(s.ends_at, tz)}
                      {toDateStr(new Date(s.ends_at), tz) !== toDateStr(new Date(s.starts_at), tz) && <span className="text-xs text-slate-500"> (día siguiente)</span>}</span>
                    {pending ? <Badge tone="amber">Cambio {pending.status}</Badge> : (
                      new Date(s.starts_at) > new Date() && <Button size="sm" variant="ghost" icon={<Repeat className="h-3.5 w-3.5" />} onClick={() => setSwapFor(s)}>Ceder</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 font-semibold">Turnos disponibles para tomar</h2>
          {offers.length === 0 && openShifts.length === 0 ? <p className="text-sm text-slate-500">Nada disponible por ahora.</p> : (
            <ul className="divide-y">
              {offers.map((o) => (
                <li key={o.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1">{name(o.from_staff)} cede {o.shift && `${formatDateTime(o.shift.starts_at, tz)}–${formatTime(o.shift.ends_at, tz)}`}</span>
                  <Button size="sm" onClick={() => void run('rpc_shift_swap', { p_action: 'aceptar', p_request_id: o.id }, 'Aceptado: falta aprobación del gerente')}>Lo tomo</Button>
                </li>
              ))}
              {openShifts.map((s) => (
                <li key={s.id} className="py-2 text-sm text-slate-600">Turno abierto {formatDateTime(s.starts_at, tz)}–{formatTime(s.ends_at, tz)} · pídelo a tu gerente</li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 font-semibold">Mi asistencia (14 días)</h2>
          {data.sessions.length === 0 ? <p className="text-sm text-slate-500">Sin registros.</p> : (
            <ul className="divide-y text-sm">
              {data.sessions.map((r, i) => (
                <li key={i} className="flex items-center gap-2 py-2">
                  <span className="flex-1">{formatDateTime(r.entrada, tz)} → {r.salida ? formatTime(r.salida, tz) : <Badge tone="amber">sin salida</Badge>}</span>
                  {r.worked_minutes != null && <span className="font-mono">{(Number(r.worked_minutes) / 60).toFixed(2)} h</span>}
                  {r.has_corrections && <Badge tone="violet">Corregido</Badge>}
                  {r.has_offline && <Badge tone="amber">Sin conexión</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 font-semibold">Mis solicitudes de ausencia</h2>
          {data.myRequests.length === 0 ? <p className="text-sm text-slate-500">Ninguna.</p> : (
            <ul className="divide-y text-sm">
              {data.myRequests.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1">{formatDateTime(r.starts_at, tz)} → {formatDateTime(r.ends_at, tz)}</span>
                  <Badge tone={r.status === 'aprobada' ? 'green' : r.status === 'rechazada' ? 'red' : 'amber'}>{r.status}</Badge>
                  {r.status === 'pendiente' && <Button size="sm" variant="ghost" onClick={() => void run('rpc_time_off', { p_action: 'cancelar', p_request_id: r.id }, 'Cancelada')}>Cancelar</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Availability />
      </div>

      <TimeOffDialog open={timeOff} onClose={() => setTimeOff(false)} onSubmit={(from, to, note) => run('rpc_time_off', { p_action: 'solicitar', p_starts_at: from, p_ends_at: to, p_note: note }, 'Solicitud enviada')} />
      <SwapDialog shift={swapFor} onClose={() => setSwapFor(null)} people={(people ?? []).filter((p) => p.active && p.id !== actor!.staffId)}
        onSubmit={(to, note) => run('rpc_shift_swap', { p_action: 'solicitar', p_shift_id: swapFor!.id, p_to_staff: to || null, p_note: note || null }, 'Solicitud enviada')} />
      {correction && <CorrectionDialog row={{ staff_id: actor!.staffId }} self onClose={() => setCorrection(false)} />}
    </div>
  );
}

function TimeOffDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (from: string, to: string, note: string) => Promise<void> }) {
  const { restaurant } = useApp();
  const tz = restaurant!.timezone;
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [note, setNote] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Pedir ausencia" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!from || !to || to < from} onClick={async () => {
        await onSubmit(zonedToUtc(from, '00:00', tz).toISOString(), zonedToUtc(to, '23:59', tz).toISOString(), note); onClose();
      }}>Enviar</Button></>}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2"><Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
        <Field label="Motivo (opcional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function SwapDialog({ shift, onClose, people, onSubmit }: { shift: Shift | null; onClose: () => void; people: { id: string; display_name: string }[]; onSubmit: (to: string, note: string) => Promise<void> }) {
  const [to, setTo] = useState(''); const [note, setNote] = useState('');
  return (
    <Modal open={!!shift} onClose={onClose} title="Ceder turno" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={async () => { await onSubmit(to, note); onClose(); }}>Enviar</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Un compañero debe aceptarlo y después un gerente lo aprueba. Hasta entonces el turno sigue siendo tuyo.</p>
      <Field label="¿A quién?"><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Cualquiera que lo tome</option>{people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select></Field>
      <Field label="Nota" className="mt-3"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Disponibilidad semanal declarada por la persona (la ve el gerente al programar). */
function Availability() {
  const { restaurant, actor } = useApp();
  const rid = restaurant!.id;
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['availability', rid, actor!.staffId],
    queryFn: () => read<{ id: string; weekday: number; start_time: string; end_time: string; kind: string; note: string | null }[]>(
      supabase.from('staff_availability').select('id, weekday, start_time, end_time, kind, note').eq('staff_id', actor!.staffId).order('weekday').order('start_time')),
  });
  const [f, setF] = useState({ weekday: 1, start: '09:00', end: '17:00', kind: 'disponible' });
  const save = async () => {
    const res = await supabase.from('staff_availability').insert({ restaurant_id: rid, staff_id: actor!.staffId, weekday: f.weekday, start_time: f.start, end_time: f.end, kind: f.kind });
    if (res.error) toast('error', errorText(asAppError(res.error))); else { qc.invalidateQueries({ queryKey: ['availability'] }); toast('success', 'Guardado'); }
  };
  const remove = async (id: string) => {
    const res = await supabase.from('staff_availability').delete().eq('id', id);
    if (res.error) toast('error', errorText(asAppError(res.error))); else qc.invalidateQueries({ queryKey: ['availability'] });
  };
  return (
    <Card className="p-4 lg:col-span-2">
      <h2 className="mb-1 font-semibold">Mi disponibilidad semanal</h2>
      <p className="mb-3 text-sm text-slate-500">Indica cuándo puedes o no puedes trabajar. Es una referencia para quien arma los horarios; no es una solicitud de ausencia.</p>
      <ul className="mb-3 flex flex-wrap gap-2">
        {(data ?? []).map((a) => (
          <li key={a.id}>
            <Badge tone={a.kind === 'disponible' ? 'green' : 'red'}>
              {WEEKDAYS[a.weekday]} {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)} · {a.kind === 'disponible' ? 'disponible' : 'no disponible'}
              <button className="ml-1" aria-label="Quitar" onClick={() => void remove(a.id)}>×</button>
            </Badge>
          </li>
        ))}
        {(data ?? []).length === 0 && <li className="text-sm text-slate-400">Sin registros.</li>}
      </ul>
      <div className="grid gap-2 sm:grid-cols-5">
        <Select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</Select>
        <Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} aria-label="Desde" />
        <Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} aria-label="Hasta" />
        <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="disponible">Disponible</option><option value="no_disponible">No disponible</option></Select>
        <Button onClick={() => void save()}>Agregar</Button>
      </div>
    </Card>
  );
}
