import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, GitBranchPlus, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read, rpc, asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { unitOptionsFor, useIngredients, useMenu } from '@/data/hooks';
import { useApp } from '@/state/session';
import { formatQty } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner, Tabs, Textarea, cx, useToast } from '@/components/ui';
import type { Recipe, RecipeLine, RecipeVersion } from '@/lib/types';
import { useConfigWrite } from './crud';

/**
 * Recetas versionadas: una versión activa se usa para el consumo teórico.
 * Para cambiarla se crea una nueva versión (borrador), se edita y se activa.
 * Las versiones usadas se conservan: el historial de consumo no cambia.
 */
export function RecipesAdmin() {
  const [tab, setTab] = useState<'recetas' | 'modificadores'>('recetas');
  return (
    <>
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'recetas', label: 'Recetas' }, { value: 'modificadores', label: 'Efecto de modificadores' }]} />
      {tab === 'recetas' ? <RecipesList /> : <ModifierInventory />}
    </>
  );
}

/** "Extra queso" suma queso; "sin cebolla" resta la cebolla de la receta. */
function ModifierInventory() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: menu } = useMenu();
  const { data: ingData } = useIngredients();
  const w = useConfigWrite(['modifier-inventory']);
  const { data: lines } = useQuery({
    queryKey: ['modifier-inventory', rid],
    queryFn: () => read<{ id: string; modifier_id: string; ingredient_id: string; qty: number; unit: string }[]>(
      supabase.from('modifier_inventory_lines').select('id, modifier_id, ingredient_id, qty, unit').eq('restaurant_id', rid)),
  });
  const [form, setForm] = useState<Record<string, { ingredient_id: string; qty: string; unit: string; sign: 1 | -1 }>>({});
  if (!menu || !ingData) return <Spinner />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Por cada unidad del platillo. Usa <b>Resta</b> para "sin …" (nunca baja de cero). Los modificadores sin efecto no cambian el consumo.</p>
      {menu.groups.map((g) => (
        <Card key={g.id} className="p-4">
          <h3 className="mb-2 font-semibold">{g.name}</h3>
          {menu.modifiers.filter((m) => m.group_id === g.id).map((m) => {
            const f = form[m.id] ?? { ingredient_id: '', qty: '', unit: '', sign: 1 as const };
            const ing = ingData.ingredients.find((i) => i.id === f.ingredient_id);
            return (
              <div key={m.id} className="border-t py-2 first:border-0">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-[140px] font-medium">{m.name}</span>
                  {(lines ?? []).filter((l) => l.modifier_id === m.id).map((l) => (
                    <Badge key={l.id} tone={Number(l.qty) < 0 ? 'red' : 'green'}>
                      {Number(l.qty) > 0 ? '+' : ''}{Number(l.qty)} {l.unit} {ingData.ingredients.find((i) => i.id === l.ingredient_id)?.name}
                      <button className="ml-1" aria-label="Quitar" onClick={() => void w.remove('modifier_inventory_lines', l.id, '')}>×</button>
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-[110px_2fr_1fr_1fr_auto] gap-2">
                  <Select value={f.sign} onChange={(e) => setForm({ ...form, [m.id]: { ...f, sign: Number(e.target.value) as 1 | -1 } })}><option value={1}>Suma</option><option value={-1}>Resta</option></Select>
                  <Select value={f.ingredient_id} onChange={(e) => setForm({ ...form, [m.id]: { ...f, ingredient_id: e.target.value, unit: ingData.ingredients.find((i) => i.id === e.target.value)?.base_unit ?? '' } })}>
                    <option value="">Insumo…</option>{ingData.ingredients.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </Select>
                  <Input inputMode="decimal" placeholder="Cantidad" value={f.qty} onChange={(e) => setForm({ ...form, [m.id]: { ...f, qty: e.target.value } })} />
                  <Select value={f.unit} onChange={(e) => setForm({ ...form, [m.id]: { ...f, unit: e.target.value } })}>
                    {unitOptionsFor(ing, ingData.units, ingData.ingredientUnits).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  <Button size="md" disabled={!f.ingredient_id || !(Number(f.qty) > 0)} onClick={async () => {
                    if (await w.insert('modifier_inventory_lines', { restaurant_id: rid, modifier_id: m.id, ingredient_id: f.ingredient_id, qty: Number(f.qty) * f.sign, unit: f.unit }, ''))
                      setForm({ ...form, [m.id]: { ingredient_id: '', qty: '', unit: '', sign: 1 } });
                  }}>+</Button>
                </div>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}

function RecipesList() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: menu } = useMenu();
  const { data: ingData } = useIngredients();
  const { data, isLoading } = useQuery({
    queryKey: ['recipes', rid, 'admin'],
    queryFn: async () => {
      const [recipes, versions] = await Promise.all([
        read<Recipe[]>(supabase.from('recipes').select('*').eq('restaurant_id', rid).order('name')),
        read<RecipeVersion[]>(supabase.from('recipe_versions').select('*').eq('restaurant_id', rid).order('version', { ascending: false })),
      ]);
      return { recipes, versions };
    },
  });
  const [sel, setSel] = useState<string | null>(null);
  const w = useConfigWrite(['recipes']);
  if (isLoading || !data || !menu || !ingData) return <Spinner />;

  const menuWithout = menu.items.filter((i) => i.active && !data.recipes.some((r) => r.menu_item_id === i.id));
  const prepWithout = ingData.ingredients.filter((i) => i.kind === 'preparado' && !data.recipes.some((r) => r.output_ingredient_id === i.id));
  const create = async (kind: 'menu' | 'prep', id: string, name: string) => {
    const res = await supabase.from('recipes').insert({ restaurant_id: rid, kind, name, menu_item_id: kind === 'menu' ? id : null, output_ingredient_id: kind === 'prep' ? id : null }).select('id').single();
    if (res.error) { await w.run(Promise.resolve(res)); return; }
    await w.run(supabase.from('recipe_versions').insert({ restaurant_id: rid, recipe_id: res.data.id, version: 1 }), 'Receta creada');
    setSel(res.data.id as string);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3">
        <Card className="max-h-[60vh] overflow-y-auto p-2">
          {data.recipes.map((r) => {
            const active = data.versions.find((v) => v.recipe_id === r.id && v.status === 'activa');
            const draft = data.versions.find((v) => v.recipe_id === r.id && v.status === 'borrador');
            return (
              <button key={r.id} onClick={() => setSel(r.id)} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', sel === r.id ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                <span className="flex-1 truncate font-medium">{r.name}</span>
                {r.kind === 'prep' && <Badge tone="violet">Prep</Badge>}
                {active ? <Badge tone="green">v{active.version}</Badge> : <Badge tone="red">Sin activa</Badge>}
                {draft && <Badge tone="amber">borrador</Badge>}
              </button>
            );
          })}
        </Card>
        {(menuWithout.length > 0 || prepWithout.length > 0) && (
          <Card className="p-3">
            <div className="mb-2 text-sm font-semibold">Crear receta para…</div>
            <Select defaultValue="" onChange={(e) => {
              const [kind, id] = e.target.value.split(':');
              const name = kind === 'menu' ? menu.items.find((i) => i.id === id)?.name : ingData.ingredients.find((i) => i.id === id)?.name;
              if (kind && id && name) void create(kind as 'menu', id, name);
              e.target.value = '';
            }}>
              <option value="">Elige producto o preparado…</option>
              {menuWithout.length > 0 && <optgroup label="Platillos">{menuWithout.map((i) => <option key={i.id} value={`menu:${i.id}`}>{i.name}</option>)}</optgroup>}
              {prepWithout.length > 0 && <optgroup label="Preparados">{prepWithout.map((i) => <option key={i.id} value={`prep:${i.id}`}>{i.name}</option>)}</optgroup>}
            </Select>
          </Card>
        )}
      </div>
      <div>
        {sel ? <RecipeEditor recipe={data.recipes.find((r) => r.id === sel)!} versions={data.versions.filter((v) => v.recipe_id === sel)} />
          : <EmptyState title="Elige una receta">Cada platillo vendido descuenta los insumos de su receta activa. Los preparados (salsas, aguas) tienen receta con rendimiento.</EmptyState>}
      </div>
    </div>
  );
}

function RecipeEditor({ recipe, versions }: { recipe: Recipe; versions: RecipeVersion[] }) {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const toast = useToast();
  const qc = useQueryClient();
  const w = useConfigWrite(['recipes']);
  const { data: ingData } = useIngredients();
  const [vid, setVid] = useState<string | null>(null);
  const version = versions.find((v) => v.id === vid) ?? versions.find((v) => v.status === 'borrador') ?? versions.find((v) => v.status === 'activa') ?? versions[0];
  const { data: lines } = useQuery({
    queryKey: ['recipes', 'lines', version?.id],
    enabled: !!version,
    queryFn: () => read<RecipeLine[]>(supabase.from('recipe_lines').select('*').eq('version_id', version!.id).order('sort')),
  });
  const editable = version?.status === 'borrador';
  const [nl, setNl] = useState({ ingredient_id: '', qty: '', unit: '' });
  const ings = useMemo(() => (ingData?.ingredients ?? []).filter((i) => i.active && i.id !== recipe.output_ingredient_id), [ingData, recipe]);
  const output = ingData?.ingredients.find((i) => i.id === recipe.output_ingredient_id);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['recipes'] }); };
  const newVersion = async () => {
    try { const r = await rpc<{ version_id: string }>('rpc_recipe_new_version', { p_restaurant_id: rid, p_recipe_id: recipe.id }); refresh(); setVid(r.version_id); }
    catch (e) { toast('error', errorText(asAppError(e))); }
  };
  const activate = async () => {
    try { await rpc('rpc_recipe_activate', { p_restaurant_id: rid, p_version_id: version!.id }); refresh(); toast('success', 'Versión activada: las próximas ventas usarán esta receta'); }
    catch (e) { toast('error', errorText(asAppError(e))); }
  };

  if (!version) return <Spinner />;
  const ingName = (id: string) => ingData?.ingredients.find((i) => i.id === id);
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{recipe.name}</h2>
        <Select className="w-auto" value={version.id} onChange={(e) => setVid(e.target.value)}>
          {versions.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.status}</option>)}
        </Select>
        <div className="ml-auto flex gap-2">
          {!versions.some((v) => v.status === 'borrador') && <Button variant="secondary" icon={<GitBranchPlus className="h-4 w-4" />} onClick={() => void newVersion()}>Nueva versión</Button>}
          {editable && <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void activate()} disabled={!lines?.length}>Activar esta versión</Button>}
        </div>
      </div>
      {!editable && <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">Versión {version.status}: solo lectura. Crea una nueva versión para cambiarla.</p>}

      {recipe.kind === 'prep' && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:w-96">
          <Field label="Rinde"><Input disabled={!editable} defaultValue={version.yield_qty ?? ''} inputMode="decimal" onBlur={(e) => void w.update('recipe_versions', version.id, { yield_qty: Number(e.target.value) || null }, '')} /></Field>
          <Field label="Unidad">
            <Select disabled={!editable} defaultValue={version.yield_unit ?? output?.base_unit ?? ''} onChange={(e) => void w.update('recipe_versions', version.id, { yield_unit: e.target.value }, '')}>
              {unitOptionsFor(output, ingData?.units ?? [], ingData?.ingredientUnits ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <table className="mb-3 w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Insumo</th><th>Cantidad</th><th>En unidad base</th><th /></tr></thead>
        <tbody className="divide-y">
          {(lines ?? []).map((l) => {
            const ing = ingName(l.ingredient_id);
            return (
              <tr key={l.id}>
                <td className="py-1.5">{ing?.name}</td>
                <td>{l.qty} {l.unit}</td>
                <td className="font-mono text-slate-500">{ing ? formatQty(Number(l.base_qty), ing.base_unit) : ''}</td>
                <td className="text-right">{editable && <Button size="sm" variant="ghost" onClick={() => void w.remove('recipe_lines', l.id, '')} aria-label="Quitar"><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editable && (
        <div className="mb-4 grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
          <Select value={nl.ingredient_id} onChange={(e) => setNl({ ...nl, ingredient_id: e.target.value, unit: ings.find((i) => i.id === e.target.value)?.base_unit ?? '' })}>
            <option value="">Insumo…</option>{ings.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
          <Input inputMode="decimal" placeholder="Cantidad" value={nl.qty} onChange={(e) => setNl({ ...nl, qty: e.target.value })} />
          <Select value={nl.unit} onChange={(e) => setNl({ ...nl, unit: e.target.value })}>
            {unitOptionsFor(ings.find((i) => i.id === nl.ingredient_id), ingData?.units ?? [], ingData?.ingredientUnits ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Button icon={<Plus className="h-4 w-4" />} disabled={!nl.ingredient_id || !(Number(nl.qty) > 0)} onClick={async () => {
            if (await w.insert('recipe_lines', { restaurant_id: rid, version_id: version.id, ingredient_id: nl.ingredient_id, qty: Number(nl.qty), unit: nl.unit, sort: (lines?.length ?? 0) + 1 }, '')) {
              setNl({ ingredient_id: '', qty: '', unit: '' }); qc.invalidateQueries({ queryKey: ['recipes', 'lines'] });
            }
          }}>Agregar</Button>
        </div>
      )}
      <Field label="Instrucciones (visibles para cocina)">
        <Textarea disabled={!editable} defaultValue={version.instructions ?? ''} rows={6} onBlur={(e) => void w.update('recipe_versions', version.id, { instructions: e.target.value || null }, '')} />
      </Field>
    </Card>
  );
}
