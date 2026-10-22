import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Copy, Moon, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read, rpc, asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { addDaysStr, formatDateTime, formatDayLabel, formatTime, toDateStr, toTimeStr, weekStartStr, zonedToUtc } from '@/lib/time';
import { useStaff, useStations } from '@/data/hooks';
import { useApp } from '@/state/session';
import { useDirectRpc } from '@/state/sync';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Th, Textarea, cx, useToast } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/format';
import type { AppRole, Shift } from '@/lib/types';

export function SchedulePage() {
  const [tab, setTab] = useState<'semana' | 'solicitudes' | 'asistencia'>('semana');
  return (
    <div>
      <PageHeader title="Horarios y asistencia" subtitle="Programa turnos, publica y aprueba cambios. Sin cálculo de nómina." />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { value: 'semana', label: 'Semana' }, { value: 'solicitudes', label: 'Solicitudes' }, { value: 'asistencia', label: 'Asistencia' },
      ]} />
      {tab === 'semana' && <WeekView />}
      {tab === 'solicitudes' && <Requests />}
      {tab === 'asistencia' && <Attendance />}
    </div>
  );
}

function useWeek() {
  const { restaurant } = useApp();
  const tz = restaurant!.timezone;
  const [week, setWeek] = useState(() => weekStartStr(new Date(), tz));
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(week, i));
  const from = zonedToUtc(week, '00:00', tz);
  const to = zonedToUtc(addDaysStr(week, 7), '00:00', tz);
  return { tz, week, setWeek, days, from, to };
}

function WeekView() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { tz, week, setWeek, days, from, to } = useWeek();
  const qc = useQueryClient();
  const toast = useToast();
  const call = useDirectRpc();
  const { data: staff } = useStaff();
  const { data: stations } = useStations();
  const { data: shifts, isLoading } = useQuery({
    queryKey: ['shifts', rid, week],
    queryFn: () => read<Shift[]>(supabase.from('shifts').select('*').eq('restaurant_id', rid).neq('status', 'cancelado')
      .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at')),
  });
  const { data: summary } = useQuery({
    queryKey: ['shifts', 'summary', rid, week],
    queryFn: () => rpc<{ drafts: number; published: number; open_shifts: number; hours_by_staff: Record<string, number>; time_off: { staff_id: string; starts_at: string; ends_at: string; status: string }[] }>(
      'rpc_schedule_week_summary', { p_restaurant_id: rid, p_from: from.toISOString(), p_to: to.toISOString() }),
  });
  const [editing, setEditing] = useState<Partial<Shift> & { date?: string } | null>(null);

  const people = (staff ?? []).filter((s) => s.active);
  const rows: { id: string | null; name: string; roles: AppRole[] }[] = [...people.map((p) => ({ id: p.id, name: p.display_name, roles: p.roles })), { id: null, name: 'Turnos abiertos', roles: [] }];
  const shiftsFor = (staffId: string | null, day: string) => (shifts ?? []).filter((s) => s.staff_id === staffId && toDateStr(new Date(s.starts_at), tz) === day);
  const offFor = (staffId: string, day: string) => summary?.time_off.some((t) => t.staff_id === staffId && toDateStr(new Date(t.starts_at), tz) <= day && toDateStr(new Date(t.ends_at), tz) >= day);

  const refresh = () => qc.invalidateQueries({ queryKey: ['shifts'] });
  const publish = async () => {
    try {
      const r = await call<{ published: number }>('rpc_schedule_publish', { p_from: from.toISOString(), p_to: to.toISOString() }, { op: false });
      toast('success', `${r.published} turno(s) publicados`); refresh();
    } catch (e) { toast('error', errorText(asAppError(e))); }
  };
  const copyPrev = async () => {
    try {
      const prevFrom = zonedToUtc(addDaysStr(week, -7), '00:00', tz);
      const r = await call<{ copied: number }>('rpc_schedule_copy_week', { p_from_week_start: prevFrom.toISOString(), p_to_week_start: from.toISOString() }, { op: false });
      toast('success', `${r.copied} turno(s) copiados como borrador`); refresh();
    } catch (e) { toast('error', errorText(asAppError(e))); }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setWeek(addDaysStr(week, -7))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <div className="min-w-[200px] text-center font-semibold">{formatDayLabel(days[0])} – {formatDayLabel(days[6])}</div>
        <Button variant="secondary" onClick={() => setWeek(addDaysStr(week, 7))} aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={() => setWeek(weekStartStr(new Date(), tz))}>Hoy</Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {summary && <Badge tone="amber">{summary.drafts} borrador(es)</Badge>}
          {summary && summary.open_shifts > 0 && <Badge tone="violet">{summary.open_shifts} abierto(s)</Badge>}
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copyPrev()}>Copiar semana anterior</Button>
          <Button icon={<Send className="h-4 w-4" />} onClick={() => void publish()} disabled={!summary?.drafts}>Publicar semana</Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-slate-500">Horario en {tz}. Toca una celda para agregar un turno. Los borradores no los ve el equipo hasta publicar.</p>
      {isLoading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-[900px] text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 w-40 bg-slate-50 p-2 text-left">Persona</th>
                {days.map((d) => <th key={d} className="p-2 text-left font-semibold">{formatDayLabel(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? 'open'} className="border-t">
                  <td className="sticky left-0 bg-white p-2 align-top">
                    <div className="font-semibold">{r.name}</div>
                    {r.id && <div className="text-xs text-slate-500">{summary?.hours_by_staff[r.id] ?? 0} h programadas</div>}
                  </td>
                  {days.map((d) => (
                    <td key={d} className={cx('h-16 cursor-pointer p-1 align-top hover:bg-slate-50', r.id && offFor(r.id, d) && 'bg-amber-50')}
                      onClick={() => setEditing({ staff_id: r.id, date: d, role: r.roles[0] ?? null })}>
                      {r.id && offFor(r.id, d) && <div className="text-[10px] font-semibold text-amber-700">Ausencia</div>}
                      {shiftsFor(r.id, d).map((s) => {
                        const crosses = toDateStr(new Date(s.ends_at), tz) !== d;
                        return (
                          <button key={s.id} onClick={(e) => { e.stopPropagation(); setEditing({ ...s, date: d }); }}
                            className={cx('mb-1 block w-full rounded-md px-2 py-1 text-left text-xs',
                              s.status === 'publicado' ? 'bg-brand-100 text-brand-900' : 'border border-dashed border-slate-400 bg-slate-50 text-slate-700')}>
                            <div className="font-semibold">{formatTime(s.starts_at, tz)}–{formatTime(s.ends_at, tz)}{crosses && <Moon className="ml-1 inline h-3 w-3" aria-label="termina al día siguiente" />}</div>
                            <div className="truncate">{s.role ? ROLE_LABELS[s.role]?.split(' ')[0] : ''}{s.station_id ? ` · ${stations?.find((x) => x.id === s.station_id)?.name ?? ''}` : ''}</div>
                          </button>
                        );
                      })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ShiftDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

function ShiftDialog({ value, onClose, onSaved }: { value: (Partial<Shift> & { date?: string }) | null; onClose: () => void; onSaved: () => void }) {
  const { restaurant } = useApp();
  const tz = restaurant!.timezone;
  const toast = useToast();
  const { data: staff } = useStaff();
  const { data: stations } = useStations();
  const [form, setForm] = useState<{ staff_id: string; role: string; station_id: string; date: string; start: string; end: string; break_minutes: number; notes: string }>({
    staff_id: '', role: '', station_id: '', date: '', start: '09:00', end: '17:00', break_minutes: 30, notes: '',
  });
  const [busy, setBusy] = useState(false);
  const { data: availability } = useQuery({
    queryKey: ['availability', restaurant!.id, 'all'],
    queryFn: () => read<{ staff_id: string; weekday: number; start_time: string; end_time: string; kind: string }[]>(
      supabase.from('staff_availability').select('staff_id, weekday, start_time, end_time, kind').eq('restaurant_id', restaurant!.id)),
  });
  const key = value ? (value.id ?? `${value.staff_id}-${value.date}`) : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (value && key !== loadedKey) {
    setLoadedKey(key);
    setForm({
      staff_id: value.staff_id ?? '', role: value.role ?? '', station_id: value.station_id ?? '',
      date: value.date ?? '', start: value.starts_at ? toTimeStr(new Date(value.starts_at), tz) : '09:00',
      end: value.ends_at ? toTimeStr(new Date(value.ends_at), tz) : '17:00', break_minutes: value.break_minutes ?? 30, notes: value.notes ?? '',
    });
  }
  if (!value) return null;
  const startAt = form.date ? zonedToUtc(form.date, form.start, tz) : null;
  const weekday = form.date ? new Date(`${form.date}T12:00:00Z`).getUTCDay() : null;
  const declared = (availability ?? []).filter((a) => a.staff_id === form.staff_id && a.weekday === weekday);
  let endAt = form.date ? zonedToUtc(form.date, form.end, tz) : null;
  if (startAt && endAt && endAt <= startAt) endAt = zonedToUtc(addDaysStr(form.date, 1), form.end, tz); // cruza medianoche
  const hours = startAt && endAt ? (endAt.getTime() - startAt.getTime()) / 3600_000 : 0;

  const save = async () => {
    if (!startAt || !endAt) return;
    setBusy(true);
    const row = {
      restaurant_id: restaurant!.id, staff_id: form.staff_id || null, role: form.role || null, station_id: form.station_id || null,
      starts_at: startAt.toISOString(), ends_at: endAt.toISOString(), break_minutes: form.break_minutes, notes: form.notes || null,
    };
    const res = value.id ? await supabase.from('shifts').update(row).eq('id', value.id) : await supabase.from('shifts').insert(row);
    setBusy(false);
    if (res.error) {
      toast('error', res.error.code === '23P01' ? 'Esa persona ya tiene un turno que se empalma.' : errorText(asAppError(res.error)));
      return;
    }
    onSaved(); onClose();
  };
  const cancelShift = async () => {
    const res = value.status === 'borrador' ? await supabase.from('shifts').delete().eq('id', value.id!) : await supabase.from('shifts').update({ status: 'cancelado' }).eq('id', value.id!);
    if (res.error) toast('error', errorText(asAppError(res.error))); else { onSaved(); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title={value.id ? 'Editar turno' : 'Nuevo turno'}
      footer={<>
        {value.id && <Button variant="ghost" className="mr-auto text-red-600" onClick={() => void cancelShift()}>{value.status === 'borrador' ? 'Eliminar' : 'Cancelar turno'}</Button>}
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button loading={busy} disabled={!startAt || hours <= 0 || hours > 16} onClick={() => void save()}>Guardar</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Persona"><Select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
          <option value="">— Turno abierto —</option>{staff?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </Select></Field>
        <Field label="Rol"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="">—</option>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select></Field>
        <Field label="Estación"><Select value={form.station_id} onChange={(e) => setForm({ ...form, station_id: e.target.value })}>
          <option value="">—</option>{stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select></Field>
        <Field label="Fecha de inicio"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Entrada"><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
        <Field label="Salida" hint={endAt && form.date && toDateStr(endAt, tz) !== form.date ? 'Termina al día siguiente.' : undefined}>
          <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </Field>
        <Field label="Descanso (min)"><Input type="number" min={0} max={240} value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: Number(e.target.value) || 0 })} /></Field>
        <Field label="Duración"><div className={cx('py-2 text-sm font-semibold', hours > 16 && 'text-red-600')}>{hours.toFixed(1)} h{hours > 16 && ' (máximo 16 h)'}</div></Field>
        <Field label="Notas" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      {declared.length > 0 && (
        <p className="mt-3 rounded-lg bg-sky-50 p-2 text-xs text-sky-900">
          Disponibilidad declarada ese día: {declared.map((a) => `${a.kind === 'disponible' ? 'disponible' : 'NO disponible'} ${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`).join(' · ')}
        </p>
      )}
      {value.status === 'publicado' && <p className="mt-3 text-xs text-amber-700">Este turno ya está publicado: los cambios quedan en la auditoría y el equipo los verá de inmediato.</p>}
    </Modal>
  );
}

function Requests() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const tz = restaurant!.timezone;
  const toast = useToast();
  const qc = useQueryClient();
  const { data: staff } = useStaff();
  const name = (id: string | null) => staff?.find((s) => s.id === id)?.display_name ?? '—';
  const { data, isLoading } = useQuery({
    queryKey: ['requests', rid],
    queryFn: async () => {
      const [timeOff, swaps, corrections] = await Promise.all([
        read<{ id: string; staff_id: string; starts_at: string; ends_at: string; reason: string | null; status: string }[]>(supabase.from('time_off_requests').select('*').eq('restaurant_id', rid).eq('status', 'pendiente')),
        read<{ id: string; shift_id: string; from_staff: string; to_staff: string | null; status: string; note: string | null; shift: Shift }[]>(supabase.from('shift_swap_requests').select('*, shift:shifts(*)').eq('restaurant_id', rid).in('status', ['pendiente', 'aceptada'])),
        read<{ id: string; staff_id: string; action: string; kind: string | null; requested_at: string | null; reason: string; status: string; requested_by: string }[]>(supabase.from('punch_corrections').select('*').eq('restaurant_id', rid).eq('status', 'pendiente')),
      ]);
      return { timeOff, swaps, corrections };
    },
  });
  const run = async (fn: string, args: Record<string, unknown>) => {
    try { await rpc(fn, { p_restaurant_id: rid, ...args }); qc.invalidateQueries({ queryKey: ['requests'] }); qc.invalidateQueries({ queryKey: ['shifts'] }); toast('success', 'Hecho'); }
    catch (e) { toast('error', errorText(asAppError(e))); }
  };
  if (isLoading || !data) return <Spinner />;
  const empty = !data.timeOff.length && !data.swaps.length && !data.corrections.length;
  if (empty) return <EmptyState title="No hay solicitudes pendientes" />;
  return (
    <div className="space-y-4">
      {data.timeOff.length > 0 && <Card className="p-4"><h3 className="mb-2 font-semibold">Ausencias</h3>
        {data.timeOff.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-t py-2 text-sm first:border-0">
            <b>{name(r.staff_id)}</b> {formatDateTime(r.starts_at, tz)} → {formatDateTime(r.ends_at, tz)} {r.reason && <span className="text-slate-500">· {r.reason}</span>}
            <span className="ml-auto flex gap-1"><Button size="sm" variant="secondary" onClick={() => void run('rpc_time_off', { p_action: 'rechazar', p_request_id: r.id })}>Rechazar</Button>
              <Button size="sm" variant="success" onClick={() => void run('rpc_time_off', { p_action: 'aprobar', p_request_id: r.id })}>Aprobar</Button></span>
          </div>
        ))}</Card>}
      {data.swaps.length > 0 && <Card className="p-4"><h3 className="mb-2 font-semibold">Cambios de turno</h3>
        {data.swaps.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-t py-2 text-sm first:border-0">
            <b>{name(r.from_staff)}</b> cede {r.shift && `${formatDateTime(r.shift.starts_at, tz)}–${formatTime(r.shift.ends_at, tz)}`} a <b>{r.to_staff ? name(r.to_staff) : 'quien lo tome'}</b>
            <Badge tone={r.status === 'aceptada' ? 'green' : 'amber'}>{r.status === 'aceptada' ? 'Aceptado por compañero' : 'Esperando compañero'}</Badge>
            <span className="ml-auto flex gap-1"><Button size="sm" variant="secondary" onClick={() => void run('rpc_shift_swap', { p_action: 'rechazar', p_request_id: r.id })}>Rechazar</Button>
              <Button size="sm" variant="success" disabled={r.status !== 'aceptada'} onClick={() => void run('rpc_shift_swap', { p_action: 'aprobar', p_request_id: r.id })}>Aprobar</Button></span>
          </div>
        ))}</Card>}
      {data.corrections.length > 0 && <Card className="p-4"><h3 className="mb-2 font-semibold">Correcciones de asistencia</h3>
        {data.corrections.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-t py-2 text-sm first:border-0">
            <b>{name(r.staff_id)}</b> {r.action} {r.kind} {r.requested_at && formatDateTime(r.requested_at, tz)} <span className="text-slate-500">· “{r.reason}”</span>
            <span className="ml-auto flex gap-1"><Button size="sm" variant="secondary" onClick={() => void run('rpc_punch_correction', { p_action: 'rechazar', p_correction_id: r.id })}>Rechazar</Button>
              <Button size="sm" variant="success" onClick={() => void run('rpc_punch_correction', { p_action: 'aprobar', p_correction_id: r.id })}>Aprobar</Button></span>
          </div>
        ))}</Card>}
    </div>
  );
}

interface SessionRow {
  staff_id: string; staff_name: string; entrada: string; salida: string | null; break_minutes: number; worked_minutes: number | null;
  shift_id: string | null; shift_starts: string | null; shift_ends: string | null; has_offline: boolean; has_corrections: boolean; open_session: boolean;
}

function Attendance() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { tz, week, setWeek, days, from, to } = useWeek();
  const [fixFor, setFixFor] = useState<SessionRow | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', rid, week],
    queryFn: () => rpc<SessionRow[]>('attendance_sessions', { p_restaurant_id: rid, p_from: from.toISOString(), p_to: to.toISOString(), p_staff_id: null }),
  });
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    (data ?? []).forEach((r) => m.set(r.staff_name, (m.get(r.staff_name) ?? 0) + Number(r.worked_minutes ?? 0)));
    return [...m.entries()];
  }, [data]);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" onClick={() => setWeek(addDaysStr(week, -7))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="min-w-[200px] text-center font-semibold">{formatDayLabel(days[0])} – {formatDayLabel(days[6])}</div>
        <Button variant="secondary" onClick={() => setWeek(addDaysStr(week, 7))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      {isLoading ? <Spinner /> : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">{totals.map(([n, m]) => <Badge key={n} tone="blue">{n}: {(m / 60).toFixed(1)} h registradas</Badge>)}</div>
          <Table>
            <thead><tr><Th>Persona</Th><Th>Entrada</Th><Th>Salida</Th><Th>Descanso</Th><Th>Trabajado</Th><Th>Programado</Th><Th>Revisar</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((r, i) => (
                <tr key={i}>
                  <Td className="font-medium">{r.staff_name}</Td>
                  <Td>{formatDateTime(r.entrada, tz)}</Td>
                  <Td>{r.salida ? formatDateTime(r.salida, tz) : <Badge tone={r.open_session ? 'amber' : 'slate'}>Sin salida</Badge>}</Td>
                  <Td>{Number(r.break_minutes).toFixed(0)} min</Td>
                  <Td>{r.worked_minutes != null ? `${(Number(r.worked_minutes) / 60).toFixed(2)} h` : '—'}</Td>
                  <Td>{r.shift_starts ? `${formatTime(r.shift_starts, tz)}–${formatTime(r.shift_ends!, tz)}` : <span className="text-slate-400">Sin turno</span>}</Td>
                  <Td className="space-x-1">{r.has_offline && <Badge tone="amber">Sin conexión</Badge>}{r.has_corrections && <Badge tone="violet">Corregido</Badge>}</Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => setFixFor(r)}>Corregir</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
      <CorrectionDialog row={fixFor} onClose={() => setFixFor(null)} />
    </>
  );
}

export function CorrectionDialog({ row, onClose, self }: { row: { staff_id: string; staff_name?: string } | null; onClose: () => void; self?: boolean }) {
  const { restaurant } = useApp();
  const tz = restaurant!.timezone;
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState('salida');
  const [date, setDate] = useState(() => toDateStr(new Date(), tz));
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!row) return null;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ status: string }>('rpc_punch_correction', {
        p_restaurant_id: restaurant!.id, p_action: 'solicitar', p_staff_id: self ? null : row.staff_id, p_correction_action: 'agregar',
        p_kind: kind, p_requested_at: zonedToUtc(date, time, tz).toISOString(), p_reason: reason,
      });
      toast('success', r.status === 'aprobada' ? 'Corrección aplicada' : 'Solicitud enviada para aprobación');
      qc.invalidateQueries({ queryKey: ['attendance'] }); qc.invalidateQueries({ queryKey: ['requests'] }); qc.invalidateQueries({ queryKey: ['punches'] });
      onClose();
    } catch (e) { toast('error', errorText(asAppError(e))); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Agregar marca faltante${row.staff_name ? ` · ${row.staff_name}` : ''}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!time || !reason.trim()} onClick={() => void submit()}>{self ? 'Solicitar' : 'Aplicar corrección'}</Button></>}>
      <div className="grid gap-3">
        <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="entrada">Entrada</option><option value="inicio_descanso">Inicio de descanso</option><option value="fin_descanso">Fin de descanso</option><option value="salida">Salida</option>
        </Select></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Hora"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
        <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">{self ? 'Un gerente debe aprobarla.' : 'Quedará registrada con tu nombre como quien corrigió.'} Las marcas originales nunca se borran.</p>
      </div>
    </Modal>
  );
}

