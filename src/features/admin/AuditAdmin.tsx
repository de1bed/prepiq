import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read } from '@/lib/rpc';
import { useStaff } from '@/data/hooks';
import { useApp } from '@/state/session';
import { formatDateTime } from '@/lib/time';
import { Badge, Modal, Select, Spinner, Table, Td, Th } from '@/components/ui';

interface AuditRow { id: number; table_name: string; row_id: string | null; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; staff_id: string | null; at: string }

const TABLES: Record<string, string> = {
  restaurants: 'Restaurante', staff: 'Personal', devices: 'Dispositivos', stations: 'Estaciones', menu_items: 'Productos', menu_categories: 'Categorías',
  menu_item_routes: 'Ruteo', modifier_groups: 'Grupos de modificadores', modifiers: 'Modificadores', ingredients: 'Insumos', ingredient_costs: 'Costos',
  recipes: 'Recetas', recipe_versions: 'Versiones de receta', recipe_lines: 'Líneas de receta', shifts: 'Turnos', label_templates: 'Formatos de etiqueta',
  shelf_life_rules: 'Vida útil', orders: 'Órdenes',
};

export function AuditAdmin() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: staff } = useStaff();
  const [table, setTable] = useState('');
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['audit', rid, table],
    queryFn: () => {
      let q = supabase.from('audit_log').select('*').eq('restaurant_id', rid);
      if (table) q = q.eq('table_name', table);
      return read<AuditRow[]>(q.order('at', { ascending: false }).limit(300));
    },
  });
  const changed = (r: AuditRow) => {
    if (r.action !== 'UPDATE' || !r.old_data || !r.new_data) return '';
    return Object.keys(r.new_data).filter((k) => k !== 'updated_at' && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k])).join(', ');
  };
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Select className="w-64" value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">Todos los cambios</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <span className="text-sm text-slate-500">Registro automático de cambios de configuración (quién, qué y cuándo).</span>
      </div>
      {isLoading ? <Spinner /> : (
        <Table>
          <thead><tr><Th>Momento</Th><Th>Quién</Th><Th>Qué</Th><Th>Acción</Th><Th>Campos</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(data ?? []).map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(r)}>
                <Td className="whitespace-nowrap">{formatDateTime(r.at, restaurant!.timezone)}</Td>
                <Td>{staff?.find((s) => s.id === r.staff_id)?.display_name ?? '—'}</Td>
                <Td>{TABLES[r.table_name] ?? r.table_name} <span className="text-xs text-slate-400">{String((r.new_data ?? r.old_data)?.name ?? '')}</span></Td>
                <Td><Badge tone={r.action === 'DELETE' ? 'red' : r.action === 'INSERT' ? 'green' : 'blue'}>{r.action === 'INSERT' ? 'Alta' : r.action === 'DELETE' ? 'Baja' : 'Cambio'}</Badge></Td>
                <Td className="max-w-xs truncate text-xs">{changed(r)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle del cambio" size="lg">
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div><div className="mb-1 font-semibold">Antes</div><pre className="overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(detail?.old_data, null, 2)}</pre></div>
          <div><div className="mb-1 font-semibold">Después</div><pre className="overflow-x-auto rounded bg-slate-50 p-2">{JSON.stringify(detail?.new_data, null, 2)}</pre></div>
        </div>
      </Modal>
    </>
  );
}
