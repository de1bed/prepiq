import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { read } from '@/lib/rpc';
import { useStations } from '@/data/hooks';
import { useApp } from '@/state/session';
import { formatDateTime } from '@/lib/time';
import { Badge, Card, EmptyState, Input, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { JoinRequests } from './StaffAdmin';
import { useConfigWrite } from './crud';

interface Device { id: string; name: string; mode: string; station_id: string | null; active: boolean; last_seen_at: string | null }
const MODES = [{ v: 'kds', l: 'Pantalla de cocina' }, { v: 'expo', l: 'Pase' }, { v: 'pos', l: 'Terminal de meseros' }, { v: 'kiosko', l: 'Reloj checador' }];

export function DevicesAdmin() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: stations } = useStations();
  const w = useConfigWrite(['devices']);
  const { data, isLoading } = useQuery({
    queryKey: ['devices', rid],
    queryFn: () => read<Device[]>(supabase.from('devices').select('id, name, mode, station_id, active, last_seen_at').eq('restaurant_id', rid).order('name')),
  });
  if (isLoading) return <Spinner />;
  return (
    <>
      <JoinRequests kind="dispositivo" />
      <Card className="mb-4 p-4 text-sm text-slate-600">
        <div className="mb-1 flex items-center gap-2 font-semibold text-slate-800"><MonitorSmartphone className="h-4 w-4" />Cómo agregar un dispositivo</div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Crea una cuenta para el equipo (p. ej. <code>cocina-parrilla@turestaurante.com</code>) e inicia sesión en él.</li>
          <li>Elige <b>Unirme con código → Es un dispositivo</b> y escribe el código del restaurante (Administración → Restaurante).</li>
          <li>Aprueba la solicitud aquí y elige su modo. El equipo abrirá directo en esa pantalla y pedirá PIN a cada persona.</li>
        </ol>
      </Card>
      {(data ?? []).length === 0 ? <EmptyState title="Sin dispositivos vinculados" /> : (
        <Table>
          <thead><tr><Th>Nombre</Th><Th>Modo</Th><Th>Estación</Th><Th>Última actividad</Th><Th>Activo</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data!.map((d) => (
              <tr key={d.id}>
                <Td><Input defaultValue={d.name} onBlur={(e) => e.target.value !== d.name && void w.update('devices', d.id, { name: e.target.value })} /></Td>
                <Td><Select defaultValue={d.mode} onChange={(e) => void w.update('devices', d.id, { mode: e.target.value })}>{MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</Select></Td>
                <Td><Select defaultValue={d.station_id ?? ''} onChange={(e) => void w.update('devices', d.id, { station_id: e.target.value || null })}><option value="">—</option>{stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Td>
                <Td>{d.last_seen_at ? formatDateTime(d.last_seen_at, restaurant!.timezone) : <Badge>Nunca</Badge>}</Td>
                <Td><input type="checkbox" defaultChecked={d.active} onChange={(e) => void w.update('devices', d.id, { active: e.target.checked })} aria-label="Activo" /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
