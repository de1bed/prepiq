import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read, rpc, asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { useStaff } from '@/data/hooks';
import { useApp } from '@/state/session';
import { ROLE_LABELS } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Table, Td, Th, useToast } from '@/components/ui';
import type { AppRole, Staff } from '@/lib/types';
import { useConfigWrite } from './crud';

const ROLES: AppRole[] = ['admin', 'gerente', 'cocinero', 'mesero'];

export function JoinRequests({ kind }: { kind: 'persona' | 'dispositivo' }) {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const toast = useToast();
  const qc = useQueryClient();
  const { data: staff } = useStaff();
  const { data: stations } = useQuery({ queryKey: ['stations', rid], queryFn: () => read<{ id: string; name: string }[]>(supabase.from('stations').select('id, name').eq('restaurant_id', rid)) });
  const { data } = useQuery({
    queryKey: ['join-requests', rid, kind],
    refetchInterval: 15_000,
    queryFn: () => read<{ id: string; display_name: string; created_at: string }[]>(supabase.from('join_requests').select('id, display_name, created_at')
      .eq('restaurant_id', rid).eq('kind', kind).eq('status', 'pendiente').order('created_at')),
  });
  const [args, setArgs] = useState<Record<string, { roles: AppRole[]; staff_id: string; mode: string; station_id: string }>>({});
  if (!data?.length) return null;
  const decide = async (id: string, approve: boolean) => {
    const a = args[id] ?? { roles: ['cocinero'], staff_id: '', mode: 'kds', station_id: '' };
    try {
      await rpc('rpc_join_decide', { p_request_id: id, p_approve: approve, p_args: kind === 'persona'
        ? { roles: a.roles, staff_id: a.staff_id || null } : { mode: a.mode, station_id: a.station_id || null } });
      toast('success', approve ? 'Aprobado' : 'Rechazado');
      qc.invalidateQueries({ queryKey: ['join-requests'] }); qc.invalidateQueries({ queryKey: ['staff'] }); qc.invalidateQueries({ queryKey: ['devices'] });
    } catch (e) { toast('error', errorText(asAppError(e))); }
  };
  return (
    <Card className="mb-4 border-amber-300 bg-amber-50 p-4">
      <h3 className="mb-2 font-semibold text-amber-900">Solicitudes pendientes</h3>
      {data.map((r) => {
        const a = args[r.id] ?? { roles: ['cocinero'] as AppRole[], staff_id: '', mode: 'kds', station_id: '' };
        const set = (patch: Partial<typeof a>) => setArgs({ ...args, [r.id]: { ...a, ...patch } });
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-t border-amber-200 py-2 text-sm first:border-0">
            <b className="min-w-[120px]">{r.display_name}</b>
            {kind === 'persona' ? (
              <>
                <Select className="w-56" value={a.staff_id} onChange={(e) => set({ staff_id: e.target.value })}>
                  <option value="">Crear como colaborador nuevo</option>
                  {staff?.filter((s) => !s.user_id).map((s) => <option key={s.id} value={s.id}>Vincular a: {s.display_name}</option>)}
                </Select>
                {!a.staff_id && ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-1"><input type="checkbox" checked={a.roles.includes(role)}
                    onChange={(e) => set({ roles: e.target.checked ? [...a.roles, role] : a.roles.filter((x) => x !== role) })} />{ROLE_LABELS[role].split(' ')[0]}</label>
                ))}
              </>
            ) : (
              <>
                <Select className="w-44" value={a.mode} onChange={(e) => set({ mode: e.target.value })}>
                  <option value="kds">Pantalla de cocina</option><option value="expo">Pase</option><option value="pos">Terminal de meseros</option><option value="kiosko">Reloj checador</option>
                </Select>
                {a.mode === 'kds' && <Select className="w-40" value={a.station_id} onChange={(e) => set({ station_id: e.target.value })}><option value="">Elegir estación en el equipo</option>{stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
              </>
            )}
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="secondary" icon={<UserX className="h-3.5 w-3.5" />} onClick={() => void decide(r.id, false)}>Rechazar</Button>
              <Button size="sm" variant="success" icon={<UserCheck className="h-3.5 w-3.5" />} disabled={kind === 'persona' && !a.staff_id && a.roles.length === 0} onClick={() => void decide(r.id, true)}>Aprobar</Button>
            </span>
          </div>
        );
      })}
    </Card>
  );
}

export function StaffAdmin() {
  const { data, isLoading } = useStaff();
  const [editing, setEditing] = useState<Partial<Staff> | null>(null);
  const [pinFor, setPinFor] = useState<Staff | null>(null);
  if (isLoading) return <Spinner />;
  return (
    <>
      <JoinRequests kind="persona" />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-600">Las personas pueden tener <b>varios roles</b>. Quien solo usa dispositivos compartidos no necesita cuenta: basta un PIN.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ roles: ['cocinero'], active: true })}>Agregar persona</Button>
      </div>
      <Table>
        <thead><tr><Th>Nombre</Th><Th>Roles</Th><Th>No. empleado</Th><Th>Cuenta</Th><Th>PIN</Th><Th>Estado</Th><Th /></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {(data ?? []).map((s) => (
            <tr key={s.id} className={!s.active ? 'opacity-50' : ''}>
              <Td className="font-medium"><span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ background: s.color ?? '#cbd5e1' }} />{s.display_name}</Td>
              <Td>{s.roles.map((r) => <Badge key={r} className="mr-1">{ROLE_LABELS[r].split(' ')[0]}</Badge>)}</Td>
              <Td>{s.employee_code ?? '—'}</Td>
              <Td>{s.user_id ? <Badge tone="green">Vinculada</Badge> : <span className="text-slate-400">Solo PIN</span>}</Td>
              <Td>{s.pin_set_at ? <Badge tone="blue">Asignado</Badge> : <Badge tone="amber">Sin PIN</Badge>}</Td>
              <Td>{s.active ? 'Activo' : 'Inactivo'}</Td>
              <Td className="whitespace-nowrap">
                <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(s)}>Editar</Button>
                <Button size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setPinFor(s)}>PIN</Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <StaffEditor value={editing} onClose={() => setEditing(null)} />}
      {pinFor && <PinDialog staff={pinFor} onClose={() => setPinFor(null)} />}
    </>
  );
}

function StaffEditor({ value, onClose }: { value: Partial<Staff>; onClose: () => void }) {
  const { restaurant, actor } = useApp();
  const rid = restaurant!.id;
  const w = useConfigWrite(['staff']);
  const [f, setF] = useState({ display_name: value.display_name ?? '', roles: value.roles ?? [], employee_code: value.employee_code ?? '', color: value.color ?? '#64748b', active: value.active ?? true });
  const { data: priv } = useQuery({
    queryKey: ['staff-private', value.id],
    enabled: !!value.id,
    queryFn: async () => (await read<{ phone: string | null; email: string | null; emergency_contact: string | null; notes: string | null }[]>(
      supabase.from('staff_private').select('phone, email, emergency_contact, notes').eq('staff_id', value.id!)))[0] ?? null,
  });
  const [p, setP] = useState<{ phone: string; email: string; emergency_contact: string } | null>(null);
  const contact = p ?? { phone: priv?.phone ?? '', email: priv?.email ?? '', emergency_contact: priv?.emergency_contact ?? '' };
  const self = value.id === actor?.staffId;
  const save = async () => {
    const row = { restaurant_id: rid, display_name: f.display_name.trim(), roles: f.roles, employee_code: f.employee_code.trim() || null, color: f.color, active: f.active };
    let id = value.id;
    if (id) { if (!(await w.update('staff', id, self ? { ...row, roles: undefined } : row, ''))) return; }
    else {
      const res = await supabase.from('staff').insert(row).select('id').single();
      if (res.error) { await w.run(Promise.resolve(res)); return; }
      id = res.data.id as string;
    }
    if (p) await w.run(supabase.from('staff_private').upsert({ staff_id: id, restaurant_id: rid, ...p }));
    await w.run(Promise.resolve({ error: null }), 'Guardado');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={value.id ? `Editar: ${value.display_name}` : 'Agregar persona'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!f.display_name.trim() || f.roles.length === 0} onClick={() => void save()}>Guardar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre"><Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
        <Field label="No. de empleado"><Input value={f.employee_code} onChange={(e) => setF({ ...f, employee_code: e.target.value })} /></Field>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-sm font-medium">Roles {self && <span className="text-xs text-slate-500">(no puedes cambiar los tuyos)</span>}</div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
              <input type="checkbox" disabled={self} checked={f.roles.includes(r)} onChange={(e) => setF({ ...f, roles: e.target.checked ? [...f.roles, r] : f.roles.filter((x) => x !== r) })} />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">Color <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Activo</label>
      </div>
      {value.id && (
        <div className="mt-4 rounded-xl border p-3">
          <div className="mb-2 text-sm font-semibold">Contacto (solo administración)</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Teléfono" value={contact.phone} onChange={(e) => setP({ ...contact, phone: e.target.value })} />
            <Input placeholder="Correo" value={contact.email} onChange={(e) => setP({ ...contact, email: e.target.value })} />
            <Input placeholder="Emergencia" value={contact.emergency_contact} onChange={(e) => setP({ ...contact, emergency_contact: e.target.value })} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function PinDialog({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const { restaurant } = useApp();
  const toast = useToast();
  const qc = useQueryClient();
  const [custom, setCustom] = useState('');
  const [len, setLen] = useState(4);
  const [shown, setShown] = useState<string | null>(null);
  const assign = async (pin: string | null) => {
    try {
      const r = await rpc<{ pin: string }>('rpc_staff_set_pin', { p_restaurant_id: restaurant!.id, p_staff_id: staff.id, p_pin: pin, p_length: len });
      setShown(r.pin); qc.invalidateQueries({ queryKey: ['staff'] });
    } catch (e) { toast('error', errorText(asAppError(e))); }
  };
  return (
    <Modal open onClose={onClose} title={`PIN de ${staff.display_name}`} size="sm">
      {shown ? (
        <div className="text-center">
          <p className="mb-2 text-sm text-slate-600">Entrégalo en persona. <b>No se volverá a mostrar.</b></p>
          <div className="mb-4 font-mono text-5xl font-black tracking-[0.3em]" data-testid="pin-shown">{shown}</div>
          <Button onClick={onClose}>Listo</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">El PIN identifica a la persona en tabletas de cocina, terminal de meseros, reloj y autorizaciones. Se guarda cifrado. Asignar uno nuevo cierra sus sesiones abiertas.</p>
          <div className="flex items-end gap-2">
            <Field label="Longitud"><Select value={len} onChange={(e) => setLen(Number(e.target.value))}><option value={4}>4 dígitos</option><option value={5}>5 dígitos</option><option value={6}>6 dígitos</option></Select></Field>
            <Button onClick={() => void assign(null)}>Generar PIN aleatorio (recomendado)</Button>
          </div>
          <div className="flex items-end gap-2">
            <Field label="O elegir uno"><Input inputMode="numeric" maxLength={6} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button variant="secondary" disabled={custom.length < 4} onClick={() => void assign(custom)}>Asignar</Button>
          </div>
          {staff.pin_set_at && <Button variant="ghost" className="text-red-600" onClick={async () => {
            await rpc('rpc_staff_clear_pin', { p_restaurant_id: restaurant!.id, p_staff_id: staff.id }); qc.invalidateQueries({ queryKey: ['staff'] }); toast('info', 'PIN eliminado'); onClose();
          }}>Quitar PIN</Button>}
        </div>
      )}
    </Modal>
  );
}
