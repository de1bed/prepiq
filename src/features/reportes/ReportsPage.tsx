import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { rpc } from '@/lib/rpc';
import { useApp } from '@/state/session';
import { useStations } from '@/data/hooks';
import { addDaysStr, toDateStr, zonedToUtc } from '@/lib/time';
import { formatMoney, REOPEN_REASONS, VOID_REASONS, WASTE_REASONS, MOVEMENT_LABELS } from '@/lib/format';
import { Card, EmptyState, PageHeader, Select, Spinner, Table, Td, Th, Tabs } from '@/components/ui';

interface StationRow {
  station_id: string; name: string; tickets: number; completed: number; avg_cycle: number | null; p50_cycle: number | null;
  p90_cycle: number | null; avg_wait: number | null; on_time_pct: number | null; reopens: number; blocked_tickets: number;
  blocked_minutes: number | null; complexity_points: number | null;
}
interface KitchenReport {
  stations: StationRow[]; reopen_reasons: Record<string, number>; void_reasons: Record<string, number>; voids_after_send: number;
  shortages: number; orders: number; by_hour: { hour: number; tickets: number; avg_cycle: number | null }[];
}

function Bars({ data, labels }: { data: Record<string, number>; labels?: { value: string; label: string }[] }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  if (!entries.length) return <p className="text-sm text-slate-500">Sin registros en el periodo.</p>;
  return (
    <ul className="space-y-1.5">
      {entries.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[140px_1fr_40px] items-center gap-2 text-sm">
          <span className="truncate">{labels?.find((l) => l.value === k)?.label ?? k}</span>
          <span className="h-3 rounded bg-slate-100"><span className="block h-3 rounded bg-brand-500" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="text-right font-mono">{v}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReportsPage() {
  const { restaurant, can } = useApp();
  const rid = restaurant!.id;
  const tz = restaurant!.timezone;
  const [range, setRange] = useState<'hoy' | 'ayer' | '7' | '30'>('hoy');
  const [station, setStation] = useState('');
  const [tab, setTab] = useState<'cocina' | 'mermas' | 'cobertura'>('cocina');
  const { data: stations } = useStations();
  const today = toDateStr(new Date(), tz);
  const fromDay = range === 'hoy' ? today : range === 'ayer' ? addDaysStr(today, -1) : addDaysStr(today, -Number(range) + 1);
  const toDay = range === 'ayer' ? today : addDaysStr(today, 1);
  const from = zonedToUtc(fromDay, '00:00', tz).toISOString();
  const to = zonedToUtc(toDay, '00:00', tz).toISOString();

  const kitchen = useQuery({ queryKey: ['report', 'kitchen', rid, from, to, station], enabled: tab === 'cocina',
    queryFn: () => rpc<KitchenReport>('report_kitchen', { p_restaurant_id: rid, p_from: from, p_to: to, p_station_id: station || null }) });
  const waste = useQuery({ queryKey: ['report', 'waste', rid, from, to], enabled: tab === 'mermas' && can('inventory.view'),
    queryFn: () => rpc<{ by_reason: { reason: string; movements: number; value: number | null }[]; by_ingredient: { name: string; base_unit: string; kind: string; reason: string; qty: number; value: number | null }[] }>(
      'report_waste', { p_restaurant_id: rid, p_from: from, p_to: to }) });
  const coverage = useQuery({ queryKey: ['report', 'coverage', rid], enabled: tab === 'cobertura' && can('inventory.view'),
    queryFn: () => rpc<{ menu_items_total: number; without_recipe: { id: string; name: string }[]; prepared_without_recipe: { id: string; name: string }[] }>(
      'report_recipe_coverage', { p_restaurant_id: rid }) });

  return (
    <div>
      <PageHeader title="Reportes" subtitle={<span className="flex items-center gap-1"><Info className="h-3.5 w-3.5" />Calculados con lo registrado en PrepIQ. Sin cifras estimadas ni de ejemplo (salvo en el restaurante demo).</span>}
        actions={<>
          <Select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="w-36">
            <option value="hoy">Hoy</option><option value="ayer">Ayer</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option>
          </Select>
          {tab === 'cocina' && <Select value={station} onChange={(e) => setStation(e.target.value)} className="w-44"><option value="">Todas las estaciones</option>{stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
        </>} />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { value: 'cocina', label: 'Cocina' },
        ...(can('inventory.view') ? [{ value: 'mermas' as const, label: 'Mermas y reprocesos' }, { value: 'cobertura' as const, label: 'Cobertura de recetas' }] : []),
      ]} />

      {tab === 'cocina' && (kitchen.isLoading || !kitchen.data ? <Spinner /> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Kpi label="Órdenes" value={kitchen.data.orders} />
            <Kpi label="Anulaciones después de enviar" value={kitchen.data.voids_after_send} />
            <Kpi label="Faltantes reportados" value={kitchen.data.shortages} />
            <Kpi label="Reaperturas" value={kitchen.data.stations.reduce((s, r) => s + Number(r.reopens ?? 0), 0)} />
          </div>
          <Table className="mb-4">
            <thead><tr><Th>Estación</Th><Th>Tickets</Th><Th>A tiempo</Th><Th>Ciclo prom.</Th><Th>Mediana</Th><Th>P90</Th><Th>Espera prom.</Th><Th>Reaperturas</Th><Th>Bloqueado</Th><Th>Puntos</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {kitchen.data.stations.map((r) => (
                <tr key={r.station_id}>
                  <Td className="font-medium">{r.name}</Td><Td>{r.tickets}</Td>
                  <Td>{r.on_time_pct != null ? `${r.on_time_pct}%` : '—'}</Td>
                  <Td>{fmtMin(r.avg_cycle)}</Td><Td>{fmtMin(r.p50_cycle)}</Td><Td>{fmtMin(r.p90_cycle)}</Td><Td>{fmtMin(r.avg_wait)}</Td>
                  <Td>{r.reopens}</Td><Td>{r.blocked_tickets ? `${r.blocked_tickets} (${r.blocked_minutes} min)` : '—'}</Td><Td>{r.complexity_points ?? 0}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mb-4 text-xs text-slate-500">Ciclo = de que el ticket entra a la cola a que se marca listo, sin contar el tiempo bloqueado por faltantes. "A tiempo" compara contra el tiempo objetivo del producto más tardado del ticket. Los puntos reflejan complejidad (no solo velocidad).</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4"><h3 className="mb-2 font-semibold">Motivos de reapertura</h3><Bars data={kitchen.data.reopen_reasons} labels={REOPEN_REASONS} /></Card>
            <Card className="p-4"><h3 className="mb-2 font-semibold">Motivos de anulación</h3><Bars data={kitchen.data.void_reasons} labels={VOID_REASONS} /></Card>
            <Card className="p-4"><h3 className="mb-2 font-semibold">Tickets por hora</h3>
              <Bars data={Object.fromEntries(kitchen.data.by_hour.map((h) => [`${String(h.hour).padStart(2, '0')}:00`, h.tickets]))} />
            </Card>
          </div>
        </>
      ))}

      {tab === 'mermas' && (waste.isLoading || !waste.data ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Card className="p-4"><h3 className="mb-2 font-semibold">Por motivo</h3>
            <Bars data={Object.fromEntries(waste.data.by_reason.map((r) => [r.reason, Number(r.movements)]))} labels={[...WASTE_REASONS, { value: 'anulacion_preparada', label: 'Anulado ya preparado' }, ...Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({ value, label }))]} />
          </Card>
          <Table>
            <thead><tr><Th>Insumo</Th><Th>Tipo</Th><Th>Motivo</Th><Th className="text-right">Cantidad</Th>{can('inventory.view_cost') && <Th className="text-right">Valor</Th>}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {waste.data.by_ingredient.map((r, i) => (
                <tr key={i}><Td>{r.name}</Td><Td>{MOVEMENT_LABELS[r.kind] ?? r.kind}</Td><Td>{WASTE_REASONS.find((w) => w.value === r.reason)?.label ?? (r.reason === 'anulacion_preparada' ? 'Anulado ya preparado' : r.reason || '—')}</Td>
                  <Td className="text-right font-mono">{r.qty} {r.base_unit}</Td>{can('inventory.view_cost') && <Td className="text-right">{r.value != null ? formatMoney(Number(r.value), restaurant!.currency) : '—'}</Td>}</tr>
              ))}
              {waste.data.by_ingredient.length === 0 && <tr><Td colSpan={5}><span className="text-slate-500">Sin mermas registradas en el periodo.</span></Td></tr>}
            </tbody>
          </Table>
        </div>
      ))}

      {tab === 'cobertura' && (coverage.isLoading || !coverage.data ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-1 font-semibold">Productos sin receta activa</h3>
            <p className="mb-2 text-sm text-slate-500">El inventario teórico no descuenta nada al venderlos. {coverage.data.without_recipe.length} de {coverage.data.menu_items_total}.</p>
            {coverage.data.without_recipe.length === 0 ? <EmptyState className="p-4" title="Todos tienen receta" /> : <ul className="list-disc pl-5 text-sm">{coverage.data.without_recipe.map((m) => <li key={m.id}>{m.name}</li>)}</ul>}
          </Card>
          <Card className="p-4">
            <h3 className="mb-1 font-semibold">Preparados sin receta</h3>
            <p className="mb-2 text-sm text-slate-500">Al producirlos no se descuentan sus insumos.</p>
            {coverage.data.prepared_without_recipe.length === 0 ? <EmptyState className="p-4" title="Todos tienen receta" /> : <ul className="list-disc pl-5 text-sm">{coverage.data.prepared_without_recipe.map((m) => <li key={m.id}>{m.name}</li>)}</ul>}
          </Card>
        </div>
      ))}
    </div>
  );
}

const fmtMin = (v: number | null) => (v == null ? '—' : `${Number(v).toFixed(1)} min`);

function Kpi({ label, value }: { label: string; value: number | string }) {
  return <Card className="p-4"><div className="text-2xl font-bold">{value}</div><div className="text-sm text-slate-500">{label}</div></Card>;
}
