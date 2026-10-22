import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMenu, useStations, type MenuData } from '@/data/hooks';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/session';
import { formatMoney } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Table, Tabs, Td, Th, Textarea } from '@/components/ui';
import type { MenuItem, ModifierGroup } from '@/lib/types';
import { useConfigWrite } from './crud';

export function MenuAdmin() {
  const [tab, setTab] = useState<'productos' | 'categorias' | 'modificadores'>('productos');
  const { data: menu, isLoading } = useMenu();
  if (isLoading || !menu) return <Spinner />;
  return (
    <>
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { value: 'productos', label: 'Productos', count: menu.items.length },
        { value: 'categorias', label: 'Categorías', count: menu.categories.length },
        { value: 'modificadores', label: 'Modificadores', count: menu.groups.length },
      ]} />
      {tab === 'productos' && <Items menu={menu} />}
      {tab === 'categorias' && <Categories menu={menu} />}
      {tab === 'modificadores' && <Modifiers menu={menu} />}
    </>
  );
}

function Items({ menu }: { menu: MenuData }) {
  const { restaurant } = useApp();
  const { data: stations } = useStations();
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [q, setQ] = useState('');
  const list = menu.items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Button className="ml-auto" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ price: 0, prep_minutes: 10, complexity: 1, active: true, available: true, allergens: [] })}>Nuevo producto</Button>
      </div>
      {list.length === 0 ? <EmptyState title="Sin productos">Agrega productos o usa <b>Importar menú</b>.</EmptyState> : (
        <Table>
          <thead><tr><Th>Producto</Th><Th>Categoría</Th><Th>Precio</Th><Th>Estaciones</Th><Th>Objetivo</Th><Th>Estado</Th><Th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((i) => {
              const routes = menu.routes.filter((r) => r.menu_item_id === i.id);
              return (
                <tr key={i.id} className={!i.active ? 'opacity-50' : ''}>
                  <Td><div className="font-medium">{i.name}</div>{i.kitchen_name && <div className="text-xs text-slate-500">Cocina: {i.kitchen_name}</div>}</Td>
                  <Td>{menu.categories.find((c) => c.id === i.category_id)?.name ?? '—'}</Td>
                  <Td>{formatMoney(Number(i.price), restaurant!.currency)}</Td>
                  <Td>{routes.length === 0 ? <Badge tone="red">Sin estación</Badge> : routes.map((r) => <Badge key={r.id} className="mr-1">{stations?.find((s) => s.id === r.station_id)?.name}{r.component ? ` · ${r.component}` : ''}</Badge>)}</Td>
                  <Td>{i.prep_minutes} min · C{i.complexity}</Td>
                  <Td>{!i.active ? <Badge>Inactivo</Badge> : !i.available ? <Badge tone="red">86</Badge> : <Badge tone="green">Disponible</Badge>}</Td>
                  <Td><Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(i)}>Editar</Button></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {editing && <ItemEditor item={editing} menu={menu} onClose={() => setEditing(null)} />}
    </>
  );
}

function ItemEditor({ item, menu, onClose }: { item: Partial<MenuItem>; menu: MenuData; onClose: () => void }) {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: stations } = useStations();
  const w = useConfigWrite(['menu']);
  const [f, setF] = useState({
    name: item.name ?? '', kitchen_name: item.kitchen_name ?? '', description: item.description ?? '', category_id: item.category_id ?? '',
    price: String(item.price ?? 0), prep_minutes: item.prep_minutes ?? 10, complexity: item.complexity ?? 1,
    allergens: (item.allergens ?? []).join(', '), active: item.active ?? true,
  });
  const [routes, setRoutes] = useState(() => menu.routes.filter((r) => r.menu_item_id === item.id).map((r) => ({ station_id: r.station_id, component: r.component ?? '' })));
  const [groups, setGroups] = useState(() => menu.itemGroups.filter((g) => g.menu_item_id === item.id).map((g) => g.group_id));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const row = {
      restaurant_id: rid, name: f.name.trim(), kitchen_name: f.kitchen_name.trim() || null, description: f.description || null,
      category_id: f.category_id || null, price: Number(f.price) || 0, prep_minutes: f.prep_minutes, complexity: f.complexity,
      allergens: f.allergens.split(',').map((a) => a.trim()).filter(Boolean), active: f.active,
    };
    let id = item.id;
    if (id) {
      if (!(await w.update('menu_items', id, row, ''))) { setBusy(false); return; }
    } else {
      const res = await supabase.from('menu_items').insert(row).select('id').single();
      if (res.error || !res.data) { await w.run(Promise.resolve(res)); setBusy(false); return; }
      id = res.data.id as string;
    }
    // Rutas y grupos: reemplazo completo (auditado en servidor).
    await w.run(supabase.from('menu_item_routes').delete().eq('menu_item_id', id));
    if (routes.length) await w.run(supabase.from('menu_item_routes').insert(routes.map((r, i) => ({ restaurant_id: rid, menu_item_id: id, station_id: r.station_id, component: r.component.trim() || null, sort: i }))));
    await w.run(supabase.from('menu_item_modifier_groups').delete().eq('menu_item_id', id));
    if (groups.length) await w.run(supabase.from('menu_item_modifier_groups').insert(groups.map((g, i) => ({ restaurant_id: rid, menu_item_id: id, group_id: g, sort: i }))));
    setBusy(false);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={item.id ? `Editar: ${item.name}` : 'Nuevo producto'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!f.name.trim() || routes.length === 0} onClick={() => void save()}>Guardar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre (meseros)"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Nombre corto (cocina)"><Input value={f.kitchen_name} onChange={(e) => setF({ ...f, kitchen_name: e.target.value })} placeholder="Opcional" /></Field>
        <Field label="Categoría"><Select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">—</option>{menu.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Precio de referencia"><Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="Tiempo objetivo (min)" hint="Para avisos del KDS e indicadores."><Input type="number" min={1} max={240} value={f.prep_minutes} onChange={(e) => setF({ ...f, prep_minutes: Number(e.target.value) || 1 })} /></Field>
        <Field label="Complejidad (1–5)" hint="Pondera la carga; no se premia solo velocidad."><Input type="number" min={1} max={5} value={f.complexity} onChange={(e) => setF({ ...f, complexity: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
        <Field label="Alérgenos (separados por coma)" className="sm:col-span-2" hint="Informativo; valídalo con tu proveedor y receta."><Input value={f.allergens} onChange={(e) => setF({ ...f, allergens: e.target.value })} /></Field>
        <Field label="Descripción" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>

      <h3 className="mb-2 mt-4 font-semibold">Estaciones (obligatorio)</h3>
      {routes.map((r, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <Select value={r.station_id} onChange={(e) => setRoutes(routes.map((x, j) => (j === i ? { ...x, station_id: e.target.value } : x)))}>
            {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input placeholder="Componente (opcional, ej. papas)" value={r.component} onChange={(e) => setRoutes(routes.map((x, j) => (j === i ? { ...x, component: e.target.value } : x)))} />
          <Button variant="ghost" onClick={() => setRoutes(routes.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} disabled={!stations?.length} onClick={() => setRoutes([...routes, { station_id: stations![0].id, component: '' }])}>Agregar estación</Button>

      <h3 className="mb-2 mt-4 font-semibold">Grupos de modificadores</h3>
      <div className="flex flex-wrap gap-2">
        {menu.groups.map((g) => (
          <label key={g.id} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
            <input type="checkbox" checked={groups.includes(g.id)} onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))} />
            {g.name} <span className="text-xs text-slate-400">({g.min_select}–{g.max_select})</span>
          </label>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Activo en el menú</label>
      <p className="mt-2 text-xs text-slate-500">Para inventario, define su receta en Administración → Recetas.</p>
    </Modal>
  );
}

function Categories({ menu }: { menu: MenuData }) {
  const { restaurant } = useApp();
  const w = useConfigWrite(['menu']);
  const [name, setName] = useState('');
  return (
    <Card className="max-w-xl p-4">
      <ul className="mb-3 divide-y">
        {menu.categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <Input defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && void w.update('menu_categories', c.id, { name: e.target.value })} />
            <Input type="number" className="w-20" defaultValue={c.sort} onBlur={(e) => void w.update('menu_categories', c.id, { sort: Number(e.target.value) })} aria-label="Orden" />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" defaultChecked={c.active} onChange={(e) => void w.update('menu_categories', c.id, { active: e.target.checked })} />Activa</label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim()} onClick={async () => { if (await w.insert('menu_categories', { restaurant_id: restaurant!.id, name: name.trim(), sort: menu.categories.length + 1 })) setName(''); }}>Agregar</Button>
      </div>
    </Card>
  );
}

function Modifiers({ menu }: { menu: MenuData }) {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const w = useConfigWrite(['menu']);
  const [groupName, setGroupName] = useState('');
  const [newMod, setNewMod] = useState<Record<string, { name: string; label: string; price: string }>>({});
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {menu.groups.map((g: ModifierGroup) => {
        const nm = newMod[g.id] ?? { name: '', label: '', price: '' };
        return (
          <Card key={g.id} className="p-4">
            <div className="mb-2 grid grid-cols-[1fr_70px_70px] items-end gap-2">
              <Field label="Grupo"><Input defaultValue={g.name} onBlur={(e) => e.target.value !== g.name && void w.update('modifier_groups', g.id, { name: e.target.value })} /></Field>
              <Field label="Mín."><Input type="number" min={0} defaultValue={g.min_select} onBlur={(e) => void w.update('modifier_groups', g.id, { min_select: Number(e.target.value) })} /></Field>
              <Field label="Máx."><Input type="number" min={1} defaultValue={g.max_select} onBlur={(e) => void w.update('modifier_groups', g.id, { max_select: Number(e.target.value) })} /></Field>
            </div>
            <ul className="divide-y text-sm">
              {menu.modifiers.filter((m) => m.group_id === g.id).map((m) => (
                <li key={m.id} className="grid grid-cols-[1fr_1fr_80px_auto] items-center gap-2 py-1.5">
                  <Input defaultValue={m.name} onBlur={(e) => e.target.value !== m.name && void w.update('modifiers', m.id, { name: e.target.value })} />
                  <Input defaultValue={m.kitchen_label ?? ''} placeholder="Texto cocina" onBlur={(e) => void w.update('modifiers', m.id, { kitchen_label: e.target.value || null })} />
                  <Input inputMode="decimal" defaultValue={m.price_delta} onBlur={(e) => void w.update('modifiers', m.id, { price_delta: Number(e.target.value) || 0 })} aria-label="Precio extra" />
                  <label className="flex items-center gap-1"><input type="checkbox" defaultChecked={m.active} onChange={(e) => void w.update('modifiers', m.id, { active: e.target.checked })} />Activo</label>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid grid-cols-[1fr_1fr_80px_auto] gap-2">
              <Input placeholder="Opción" value={nm.name} onChange={(e) => setNewMod({ ...newMod, [g.id]: { ...nm, name: e.target.value } })} />
              <Input placeholder="Texto cocina" value={nm.label} onChange={(e) => setNewMod({ ...newMod, [g.id]: { ...nm, label: e.target.value } })} />
              <Input placeholder="+$" value={nm.price} onChange={(e) => setNewMod({ ...newMod, [g.id]: { ...nm, price: e.target.value } })} />
              <Button size="md" disabled={!nm.name.trim()} onClick={async () => {
                if (await w.insert('modifiers', { restaurant_id: rid, group_id: g.id, name: nm.name.trim(), kitchen_label: nm.label.trim() || null, price_delta: Number(nm.price) || 0 }))
                  setNewMod({ ...newMod, [g.id]: { name: '', label: '', price: '' } });
              }}>+</Button>
            </div>
          </Card>
        );
      })}
      <Card className="p-4">
        <h3 className="mb-2 font-semibold">Nuevo grupo</h3>
        <p className="mb-2 text-xs text-slate-500">Ej. "Tortilla" (mín. 1, máx. 1) obliga a elegir; "Extras" (mín. 0, máx. 3) es opcional. Usa "SIN …" en el texto de cocina para que se resalte en rojo.</p>
        <div className="flex gap-2">
          <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Nombre del grupo" />
          <Button disabled={!groupName.trim()} onClick={async () => { if (await w.insert('modifier_groups', { restaurant_id: rid, name: groupName.trim(), min_select: 0, max_select: 1, sort: menu.groups.length + 1 })) setGroupName(''); }}>Crear</Button>
        </div>
      </Card>
    </div>
  );
}
