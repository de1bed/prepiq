import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useStations } from '@/data/hooks';
import { useApp } from '@/state/session';
import { Button, Card, Field, Input, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useConfigWrite } from './crud';

const KINDS = [{ v: 'cocina', l: 'Cocina' }, { v: 'barra', l: 'Barra / bebidas' }, { v: 'pase', l: 'Pase (expo)' }, { v: 'prep', l: 'Preparación' }];

export function StationsAdmin() {
  const { restaurant } = useApp();
  const { data, isLoading } = useStations();
  const { insert, update } = useConfigWrite(['stations', 'menu']);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('cocina');
  if (isLoading) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Table>
        <thead><tr><Th>Estación</Th><Th>Tipo</Th><Th>Color</Th><Th>Orden</Th><Th>Activa</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {(data ?? []).map((s) => (
            <tr key={s.id}>
              <Td><Input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && void update('stations', s.id, { name: e.target.value })} /></Td>
              <Td><Select defaultValue={s.kind} onChange={(e) => void update('stations', s.id, { kind: e.target.value })}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</Select></Td>
              <Td><input type="color" defaultValue={s.color} onBlur={(e) => void update('stations', s.id, { color: e.target.value })} className="h-9 w-14 rounded" aria-label="Color" /></Td>
              <Td><Input type="number" className="w-20" defaultValue={s.sort} onBlur={(e) => void update('stations', s.id, { sort: Number(e.target.value) })} /></Td>
              <Td><input type="checkbox" defaultChecked={s.active} onChange={(e) => void update('stations', s.id, { active: e.target.checked })} aria-label="Activa" /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Card className="p-4">
        <h3 className="mb-3 font-semibold">Nueva estación</h3>
        <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Parrilla" /></Field>
        <Field label="Tipo" className="mt-3"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</Select></Field>
        <Button className="mt-3" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()} onClick={async () => {
          if (await insert('stations', { restaurant_id: restaurant!.id, name: name.trim(), kind, sort: (data?.length ?? 0) + 1 })) setName('');
        }}>Agregar</Button>
        <p className="mt-3 text-xs text-slate-500">Cada producto del menú se asigna a una o varias estaciones. Cada pantalla de cocina muestra solo los tickets de su estación.</p>
      </Card>
    </div>
  );
}
