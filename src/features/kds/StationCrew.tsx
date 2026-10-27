import { UserMinus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useStationCrew } from '@/data/hooks';
import { useApp } from '@/state/session';
import { useEnqueue } from '@/state/sync';
import { useOverride } from '@/components/Pin';
import { Button, Modal, Select } from '@/components/ui';

/**
 * Quién está en la estación. Sale del horario publicado; el responsable de
 * turno lo corrige en vivo (alguien no llegó o cubre otra estación) para que
 * los tiempos se atribuyan a quien realmente estuvo. Cocina no usa PIN.
 */
export function StationCrewChip({ stationId, stationName }: { stationId: string; stationName: string }) {
  const { data } = useStationCrew();
  const { can } = useApp();
  const enqueue = useEnqueue();
  const requestOverride = useOverride();
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState('');
  const crew = data?.stations.find((s) => s.station_id === stationId)?.staff ?? [];

  const change = async (staffId: string, name: string, present: boolean) => {
    let override: string | null = null;
    if (!can('service.open_close')) {
      override = await requestOverride('service.open_close', `Cambiar quién está en ${stationName}`);
      if (!override) return;
    }
    await enqueue('rpc_station_crew_set', { p_station_id: stationId, p_staff_id: staffId, p_present: present, p_override: override },
      { label: `${stationName}: ${present ? 'entra' : 'sale'} ${name}` });
    setAdd('');
  };

  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="station-crew"
        className="flex max-w-[260px] items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700" title="Quién está en esta estación">
        <Users className="h-4 w-4 shrink-0 text-sky-300" />
        <span className="truncate">{crew.length ? crew.map((c) => c.name).join(', ') : 'Sin equipo asignado'}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Equipo en ${stationName}`} dark size="sm">
        <p className="mb-3 text-sm text-slate-400">
          Sale del horario publicado. Si alguien no llegó o cubre aquí, corrígelo (pide autorización al responsable de turno).
          Los tiempos de cada ticket se atribuyen a este equipo.
        </p>
        <ul className="mb-4 divide-y divide-slate-800 rounded-lg bg-slate-950">
          {crew.length === 0 && <li className="p-3 text-sm text-slate-500">Nadie asignado ahora.</li>}
          {crew.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="font-semibold">{c.name}{c.manual && <span className="ml-2 text-xs font-normal text-sky-300">agregado en vivo</span>}</span>
              <Button size="sm" variant="dark" icon={<UserMinus className="h-4 w-4" />} onClick={() => void change(c.id, c.name, false)} data-testid={`crew-remove-${c.name}`}>No está</Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Select value={add} onChange={(e) => setAdd(e.target.value)} className="border-slate-600 bg-slate-800 text-white" data-testid="crew-add-select">
            <option value="">Agregar a alguien…</option>
            {(data?.people ?? []).filter((p) => !crew.some((c) => c.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button disabled={!add} icon={<UserPlus className="h-4 w-4" />} data-testid="crew-add"
            onClick={() => { const p = data?.people.find((x) => x.id === add); if (p) void change(p.id, p.name, true); }}>Agregar</Button>
        </div>
      </Modal>
    </>
  );
}
