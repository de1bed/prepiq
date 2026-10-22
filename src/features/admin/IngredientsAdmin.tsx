import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read } from '@/lib/rpc';
import { useIngredients } from '@/data/hooks';
import { useApp } from '@/state/session';
import { formatMoney } from '@/lib/format';
import { Badge, Button, Field, Input, Modal, Select, Spinner, Table, Td, Th } from '@/components/ui';
import type { Ingredient } from '@/lib/types';
import { useConfigWrite } from './crud';

export function IngredientsAdmin() {
  const { restaurant, can } = useApp();
  const rid = restaurant!.id;
  const { data, isLoading } = useIngredients();
  const { data: costs } = useQuery({
    queryKey: ['ingredients', 'costs', rid],
    enabled: can('inventory.view_cost'),
    queryFn: () => read<{ ingredient_id: string; unit_cost: number }[]>(supabase.from('ingredient_costs').select('ingredient_id, unit_cost').eq('restaurant_id', rid)),
  });
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [q, setQ] = useState('');
  if (isLoading || !data) return <Spinner />;
  const list = data.ingredients.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Buscar insumo…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Button className="ml-auto" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ base_unit: 'g', kind: 'compra', active: true, allergens: [] })}>Nuevo insumo</Button>
      </div>
      <Table>
        <thead><tr><Th>Insumo</Th><Th>Categoría</Th><Th>Unidad base</Th><Th>Unidades propias</Th><Th>Referencia</Th>{can('inventory.view_cost') && <Th>Costo / unidad base</Th>}<Th /></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((i) => (
            <tr key={i.id} className={!i.active ? 'opacity-50' : ''}>
              <Td><span className="font-medium">{i.name}</span>{i.kind === 'preparado' && <Badge tone="violet" className="ml-2">Preparado</Badge>}</Td>
              <Td>{i.category ?? '—'}</Td>
              <Td className="font-mono">{i.base_unit}</Td>
              <Td className="text-xs">{data.ingredientUnits.filter((u) => u.ingredient_id === i.id).map((u) => `${u.name}=${u.to_base}${i.base_unit}`).join(', ') || '—'}</Td>
              <Td>{i.par_level ?? '—'}</Td>
              {can('inventory.view_cost') && <Td>{(() => { const c = costs?.find((x) => x.ingredient_id === i.id); return c ? formatMoney(Number(c.unit_cost), restaurant!.currency) : '—'; })()}</Td>}
              <Td><Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(i)}>Editar</Button></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <IngredientEditor value={editing} cost={costs?.find((c) => c.ingredient_id === editing.id)?.unit_cost} onClose={() => setEditing(null)} />}
    </>
  );
}

function IngredientEditor({ value, cost, onClose }: { value: Partial<Ingredient>; cost?: number; onClose: () => void }) {
  const { restaurant, can } = useApp();
  const rid = restaurant!.id;
  const w = useConfigWrite(['ingredients', 'stock']);
  const { data } = useIngredients();
  const own = (data?.ingredientUnits ?? []).filter((u) => u.ingredient_id === value.id);
  const [f, setF] = useState({
    name: value.name ?? '', category: value.category ?? '', base_unit: value.base_unit ?? 'g', kind: value.kind ?? 'compra',
    par_level: value.par_level != null ? String(value.par_level) : '', storage: value.storage ?? '', allergens: (value.allergens ?? []).join(', '),
    active: value.active ?? true, cost: cost != null ? String(cost) : '',
  });
  const [newUnit, setNewUnit] = useState({ name: '', to_base: '' });
  const save = async () => {
    const row = {
      restaurant_id: rid, name: f.name.trim(), category: f.category.trim() || null, base_unit: f.base_unit, kind: f.kind,
      par_level: f.par_level ? Number(f.par_level) : null, storage: f.storage || null,
      allergens: f.allergens.split(',').map((a) => a.trim()).filter(Boolean), active: f.active,
    };
    let id = value.id;
    if (id) { if (!(await w.update('ingredients', id, row, ''))) return; }
    else {
      const res = await supabase.from('ingredients').insert(row).select('id').single();
      if (res.error) { await w.run(Promise.resolve(res)); return; }
      id = res.data.id as string;
    }
    if (can('inventory.view_cost') && f.cost !== '') {
      await w.run(supabase.from('ingredient_costs').upsert({ ingredient_id: id, restaurant_id: rid, unit_cost: Number(f.cost) }));
    }
    await w.run(Promise.resolve({ error: null }), 'Guardado');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={value.id ? `Editar: ${value.name}` : 'Nuevo insumo'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!f.name.trim()} onClick={() => void save()}>Guardar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Categoría"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Ej. Verduras" /></Field>
        <Field label="Unidad base" hint={value.id ? 'No se puede cambiar si ya tiene movimientos.' : 'g = masa, ml = volumen, pza = piezas.'}>
          <Select value={f.base_unit} onChange={(e) => setF({ ...f, base_unit: e.target.value as 'g' })}><option value="g">g (gramos)</option><option value="ml">ml (mililitros)</option><option value="pza">pza (piezas)</option></Select>
        </Field>
        <Field label="Tipo"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'compra' })}><option value="compra">Se compra</option><option value="preparado">Se prepara en casa (tiene receta)</option></Select></Field>
        <Field label={`Nivel de referencia (${f.base_unit})`} hint="Para avisos de revisión. Orientativo."><Input inputMode="decimal" value={f.par_level} onChange={(e) => setF({ ...f, par_level: e.target.value })} /></Field>
        {can('inventory.view_cost') && <Field label={`Costo por ${f.base_unit}`}><Input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>}
        <Field label="Conservación"><Input value={f.storage} onChange={(e) => setF({ ...f, storage: e.target.value })} placeholder="refrigerado, congelado…" /></Field>
        <Field label="Alérgenos (coma)"><Input value={f.allergens} onChange={(e) => setF({ ...f, allergens: e.target.value })} /></Field>
      </div>
      {value.id && (
        <>
          <h3 className="mb-2 mt-4 font-semibold">Unidades propias</h3>
          <p className="mb-2 text-xs text-slate-500">Para contar o recibir en presentaciones: "caja = 24 pza", "tortilla = 30 g". Así las recetas y conteos convierten sin errores.</p>
          <ul className="mb-2 divide-y text-sm">
            {own.map((u) => (
              <li key={u.id} className="flex items-center gap-2 py-1">
                <span className="flex-1">1 {u.name} = {u.to_base} {f.base_unit}</span>
                <Button size="sm" variant="ghost" onClick={() => void w.remove('ingredient_units', u.id)} aria-label="Quitar"><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input placeholder="Nombre (ej. caja)" value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value.toLowerCase() })} />
            <Input placeholder={`Equivale a (${f.base_unit})`} inputMode="decimal" value={newUnit.to_base} onChange={(e) => setNewUnit({ ...newUnit, to_base: e.target.value })} />
            <Button disabled={!newUnit.name || !(Number(newUnit.to_base) > 0)} onClick={async () => {
              if (await w.insert('ingredient_units', { restaurant_id: rid, ingredient_id: value.id, name: newUnit.name.trim(), to_base: Number(newUnit.to_base) })) setNewUnit({ name: '', to_base: '' });
            }}>Agregar</Button>
          </div>
        </>
      )}
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Activo</label>
    </Modal>
  );
}
