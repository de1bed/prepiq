import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone, Plus, QrCode } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read } from '@/lib/rpc';
import { useStations } from '@/data/hooks';
import { useApp } from '@/state/session';
import { formatDateTime } from '@/lib/time';
import { Badge, Button, Card, EmptyState, Input, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { DEVICE_MODE_LABELS } from '@/features/auth/pairing';
import { JoinRequests } from './StaffAdmin';
import { useConfigWrite } from './crud';
import { DevicePairingModal, type ReplaceTarget } from './DevicePairing';

interface Device { id: string; name: string; mode: string; station_id: string | null; active: boolean; last_seen_at: string | null }

export function DevicesAdmin() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: stations } = useStations();
  const w = useConfigWrite(['devices']);
  const [pairOpen, setPairOpen] = useState(false);
  const [replace, setReplace] = useState<ReplaceTarget | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['devices', rid],
    queryFn: () => read<Device[]>(supabase.from('devices').select('id, name, mode, station_id, active, last_seen_at').eq('restaurant_id', rid).order('name')),
  });
  if (isLoading) return <Spinner />;
  const openPairing = (target: ReplaceTarget | null) => { setReplace(target); setPairOpen(true); };
  return (
    <>
      <JoinRequests kind="dispositivo" />
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-4 text-sm text-slate-600">
        <MonitorSmartphone className="h-8 w-8 shrink-0 text-brand-600" />
        <div className="min-w-[240px] flex-1">
          <div className="font-semibold text-slate-800">Agregar una tableta, terminal o reloj</div>
          Genera un QR, escanéalo con la cámara del equipo y listo: no hay que crear cuentas ni contraseñas. El código sirve una sola
          vez y vence en 15 minutos. Cada persona entra después con su PIN.
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => openPairing(null)} data-testid="add-device">Agregar dispositivo</Button>
      </Card>
      {(data ?? []).length === 0 ? <EmptyState title="Sin dispositivos vinculados" /> : (
        <Table>
          <thead><tr><Th>Nombre</Th><Th>Modo</Th><Th>Estación</Th><Th>Última actividad</Th><Th>Activo</Th><Th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data!.map((d) => (
              <tr key={d.id}>
                <Td><Input defaultValue={d.name} onBlur={(e) => e.target.value !== d.name && void w.update('devices', d.id, { name: e.target.value })} /></Td>
                <Td><Select defaultValue={d.mode} onChange={(e) => void w.update('devices', d.id, { mode: e.target.value })}>{Object.entries(DEVICE_MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Td>
                <Td><Select defaultValue={d.station_id ?? ''} onChange={(e) => void w.update('devices', d.id, { station_id: e.target.value || null })}><option value="">—</option>{stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Td>
                <Td>{d.last_seen_at ? formatDateTime(d.last_seen_at, restaurant!.timezone) : <Badge>Nunca</Badge>}</Td>
                <Td><input type="checkbox" defaultChecked={d.active} onChange={(e) => void w.update('devices', d.id, { active: e.target.checked })} aria-label="Activo" /></Td>
                <Td>
                  <Button variant="ghost" size="sm" icon={<QrCode className="h-4 w-4" />} title="Cambiaste de tableta o se borró el navegador"
                    onClick={() => openPairing({ id: d.id, name: d.name, mode: d.mode, station_id: d.station_id })}>
                    Volver a vincular
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <DevicePairingModal open={pairOpen} onClose={() => setPairOpen(false)} replace={replace} />
    </>
  );
}
