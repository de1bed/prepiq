import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ClipboardCheck, Factory, History, Info, PackagePlus, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read, rpc, asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { formatDateTime } from '@/lib/time';
import { formatMoney, formatQty, MOVEMENT_LABELS, WASTE_REASONS } from '@/lib/format';
import { unitOptionsFor, useIngredients, useMenu, useStock } from '@/data/hooks';
import { useApp } from '@/state/session';
import { useDirectRpc, useEnqueue } from '@/state/sync';
import { useOverride } from '@/components/Pin';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Th, Textarea, cx, useToast } from '@/components/ui';
import type { Ingredient, InventoryCount, InventoryCountLine, Recipe, RecipeLine, RecipeVersion } from '@/lib/types';

type Tab = 'existencias' | 'registrar' | 'conteos' | 'movimientos' | 'recetas';

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>('existencias');
  return (
    <div>
      <PageHeader title="Inventario" subtitle={<span className="flex items-center gap-1"><Info className="h-3.5 w-3.5" />Existencia <b>teórica</b> calculada por recetas y movimientos. El conteo físico es la referencia real.</span>} />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { value: 'existencias', label: 'Existencias' },
        { value: 'registrar', label: 'Registrar' },
        { value: 'conteos', label: 'Conteos' },
        { value: 'movimientos', label: 'Movimientos' },
        { value: 'recetas', label: 'Recetas' },
      ]} />
      {tab === 'existencias' && <StockTab />}
      {tab === 'registrar' && <RecordTab />}
      {tab === 'conteos' && <CountsTab />}
      {tab === 'movimientos' && <MovementsTab />}
      {tab === 'recetas' && <RecipesViewer />}
    </div>
  );
}

function StockTab() {
  const { data, isLoading } = useStock();
  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  if (isLoading) return <Spinner />;
  const rows = (data ?? []).filter((r) => r.active && r.name.toLowerCase().includes(q.toLowerCase()) && (!onlyLow || r.below_par));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Buscar insumo…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />Solo bajo nivel de referencia</label>
      </div>
      <Table>
        <thead><tr><Th>Insumo</Th><Th>Categoría</Th><Th className="text-right">Teórico</Th><Th className="text-right">Referencia</Th><Th>Último conteo</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.ingredient_id}>
              <Td><span className="font-medium">{r.name}</span>{r.kind === 'preparado' && <Badge tone="violet" className="ml-2">Preparado</Badge>}</Td>
              <Td>{r.category ?? '—'}</Td>
              <Td className={cx('text-right font-mono', Number(r.theoretical_qty) < 0 && 'text-red-600')}>
                {formatQty(Number(r.theoretical_qty), r.base_unit)}
                {Number(r.theoretical_qty) < 0 && <span title="Negativo: faltan recepciones, conteo o la receta consume de más"><TriangleAlert className="ml-1 inline h-4 w-4" /></span>}
              </Td>
              <Td className="text-right">{r.par_level != null ? formatQty(Number(r.par_level), r.base_unit) : '—'}{r.below_par && <Badge tone="red" className="ml-2">Revisar</Badge>}</Td>
              <Td>{r.last_count_at ? new Date(r.last_count_at).toLocaleDateString() : <span className="text-slate-400">Nunca</span>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

// ---------------------------------------------------------------------
function RecordTab() {
  const { can } = useApp();
  const [mode, setMode] = useState<'merma' | 'recepcion' | 'produccion' | 'ajuste'>(can('inventory.waste') ? 'merma' : 'recepcion');
  const tabs = [
    can('inventory.waste') && { value: 'merma' as const, label: 'Merma / consumo interno' },
    can('inventory.receive') && { value: 'recepcion' as const, label: 'Recepción' },
    can('inventory.produce') && { value: 'produccion' as const, label: 'Producción de preparados' },
    can('inventory.adjust') && { value: 'ajuste' as const, label: 'Ajuste manual' },
  ].filter(Boolean) as { value: typeof mode; label: string }[];
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.value} onClick={() => setMode(t.value)} className={cx('rounded-full px-4 py-2 text-sm font-semibold', mode === t.value ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200')}>{t.label}</button>
        ))}
      </div>
      {mode === 'merma' && <WasteForm />}
      {mode === 'recepcion' && <ReceiveForm />}
      {mode === 'produccion' && <ProduceForm />}
      {mode === 'ajuste' && <AdjustForm />}
    </>
  );
}

function IngredientUnitPicker({ ingredientId, setIngredientId, unit, setUnit, filter }: {
  ingredientId: string; setIngredientId: (v: string) => void; unit: string; setUnit: (v: string) => void; filter?: (i: Ingredient) => boolean;
}) {
  const { data } = useIngredients();
  const ings = (data?.ingredients ?? []).filter((i) => i.active && (!filter || filter(i)));
  const ing = ings.find((i) => i.id === ingredientId);
  const opts = unitOptionsFor(ing, data?.units ?? [], data?.ingredientUnits ?? []);
  return (
    <>
      <Field label="Insumo">
        <Select value={ingredientId} onChange={(e) => { setIngredientId(e.target.value); const i = ings.find((x) => x.id === e.target.value); setUnit(i?.base_unit ?? ''); }}>
          <option value="">Elige…</option>
          {ings.map((i) => <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ''}</option>)}
        </Select>
      </Field>
      <Field label="Unidad">
        <Select value={unit} onChange={(e) => setUnit(e.target.value)} disabled={!ing}>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    </>
  );
}

function WasteForm() {
  const enqueue = useEnqueue();
  const toast = useToast();
  const { data: menu } = useMenu();
  const [by, setBy] = useState<'insumo' | 'platillo'>('insumo');
  const [kind, setKind] = useState<'merma' | 'consumo_interno'>('merma');
  const [ingredientId, setIngredientId] = useState('');
  const [menuItemId, setMenuItemId] = useState('');
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('desperdicio');
  const [note, setNote] = useState('');
  const n = Number(qty.replace(',', '.'));
  const valid = n > 0 && (by === 'insumo' ? !!ingredientId && !!unit : !!menuItemId && Number.isInteger(n));
  const submit = async () => {
    await enqueue('rpc_inventory_record', {
      p_kind: kind, p_ingredient_id: by === 'insumo' ? ingredientId : null, p_menu_item_id: by === 'platillo' ? menuItemId : null,
      p_qty: n, p_unit: by === 'insumo' ? unit : null, p_reason: kind === 'merma' ? reason : null, p_note: note || null, p_override: null,
    }, { label: `${kind === 'merma' ? 'Merma' : 'Consumo interno'} registrada` });
    toast('success', 'Registrado');
    setQty(''); setNote('');
  };
  return (
    <Card className="max-w-2xl p-5">
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button onClick={() => setKind('merma')} className={cx('rounded-xl border-2 p-3 text-sm font-semibold', kind === 'merma' ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>Merma (desperdicio, quemado, caída…)</button>
        <button onClick={() => setKind('consumo_interno')} className={cx('rounded-xl border-2 p-3 text-sm font-semibold', kind === 'consumo_interno' ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>Consumo interno (comida de personal)</button>
      </div>
      <Tabs value={by} onChange={setBy} className="mb-4" tabs={[{ value: 'insumo', label: 'Por insumo' }, { value: 'platillo', label: 'Por platillo (usa su receta)' }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        {by === 'insumo' ? (
          <IngredientUnitPicker ingredientId={ingredientId} setIngredientId={setIngredientId} unit={unit} setUnit={setUnit} />
        ) : (
          <Field label="Platillo" className="sm:col-span-2">
            <Select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}>
              <option value="">Elige…</option>
              {menu?.items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={by === 'platillo' ? 'Platillos' : 'Cantidad'}><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        {kind === 'merma' && (
          <Field label="Motivo">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>{WASTE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>
          </Field>
        )}
        <Field label="Nota" className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <Button className="mt-4" disabled={!valid} onClick={() => void submit()} icon={<Trash2 className="h-4 w-4" />}>Registrar</Button>
    </Card>
  );
}

function ReceiveForm() {
  const call = useDirectRpc();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useApp();
  const { data } = useIngredients();
  const [supplier, setSupplier] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<{ ingredient_id: string; qty: string; unit: string; unit_cost: string }[]>([{ ingredient_id: '', qty: '', unit: '', unit_cost: '' }]);
  const [busy, setBusy] = useState(false);
  const ings = (data?.ingredients ?? []).filter((i) => i.active);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = lines.length > 0 && lines.every((l) => l.ingredient_id && Number(l.qty) > 0 && l.unit);
  const submit = async () => {
    setBusy(true);
    try {
      await call('rpc_inventory_receive', {
        p_supplier: supplier || null, p_reference: reference || null,
        p_lines: lines.map((l) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty), unit: l.unit, unit_cost: l.unit_cost ? Number(l.unit_cost) : null })),
      });
      toast('success', 'Recepción registrada');
      qc.invalidateQueries({ queryKey: ['stock'] });
      setLines([{ ingredient_id: '', qty: '', unit: '', unit_cost: '' }]); setReference('');
    } catch (e) { toast('error', errorText(asAppError(e))); } finally { setBusy(false); }
  };
  return (
    <Card className="p-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Proveedor"><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        <Field label="Factura / remisión"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => {
          const ing = ings.find((x) => x.id === l.ingredient_id);
          const opts = unitOptionsFor(ing, data?.units ?? [], data?.ingredientUnits ?? []);
          return (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <Select value={l.ingredient_id} onChange={(e) => set(i, { ingredient_id: e.target.value, unit: ings.find((x) => x.id === e.target.value)?.base_unit ?? '' })}>
                <option value="">Insumo…</option>{ings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              <Input inputMode="decimal" placeholder="Cantidad" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
              <Select value={l.unit} onChange={(e) => set(i, { unit: e.target.value })}>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              {can('inventory.view_cost') ? <Input inputMode="decimal" placeholder="Costo por unidad" value={l.unit_cost} onChange={(e) => set(i, { unit_cost: e.target.value })} /> : <span />}
              <Button variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setLines((ls) => [...ls, { ingredient_id: '', qty: '', unit: '', unit_cost: '' }])}>Agregar línea</Button>
        <Button disabled={!valid} loading={busy} onClick={() => void submit()} icon={<PackagePlus className="h-4 w-4" />}>Registrar recepción</Button>
      </div>
    </Card>
  );
}

function ProduceForm() {
  const enqueue = useEnqueue();
  const toast = useToast();
  const [ingredientId, setIngredientId] = useState('');
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const n = Number(qty.replace(',', '.'));
  return (
    <Card className="max-w-2xl p-5">
      <p className="mb-4 text-sm text-slate-600">Registra una tanda de un preparado (p. ej. salsa). Entra el preparado y salen sus insumos según su receta activa. Después puedes imprimir su etiqueta en <b>Etiquetas</b>.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <IngredientUnitPicker ingredientId={ingredientId} setIngredientId={setIngredientId} unit={unit} setUnit={setUnit} filter={(i) => i.kind === 'preparado'} />
        <Field label="Cantidad producida"><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Nota"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <Button className="mt-4" disabled={!(n > 0 && ingredientId && unit)} icon={<Factory className="h-4 w-4" />} onClick={async () => {
        await enqueue('rpc_inventory_produce', { p_ingredient_id: ingredientId, p_qty: n, p_unit: unit, p_note: note || null }, { label: 'Producción registrada' });
        toast('success', 'Producción registrada'); setQty(''); setNote('');
      }}>Registrar producción</Button>
    </Card>
  );
}

function AdjustForm() {
  const enqueue = useEnqueue();
  const toast = useToast();
  const requestOverride = useOverride();
  const { can } = useApp();
  const [ingredientId, setIngredientId] = useState('');
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');
  const [sign, setSign] = useState<1 | -1>(1);
  const [note, setNote] = useState('');
  const n = Number(qty.replace(',', '.'));
  return (
    <Card className="max-w-2xl p-5">
      <p className="mb-4 text-sm text-slate-600">Usa el ajuste manual solo para corregir errores de captura. Para diferencias de existencia, haz un <b>conteo físico</b>.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <IngredientUnitPicker ingredientId={ingredientId} setIngredientId={setIngredientId} unit={unit} setUnit={setUnit} />
        <Field label="Dirección">
          <div className="flex gap-2">
            <Button variant={sign === 1 ? 'primary' : 'secondary'} onClick={() => setSign(1)}>Sumar</Button>
            <Button variant={sign === -1 ? 'primary' : 'secondary'} onClick={() => setSign(-1)}>Restar</Button>
          </div>
        </Field>
        <Field label="Cantidad"><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Explicación (obligatoria)" className="sm:col-span-2"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <Button className="mt-4" disabled={!(n > 0 && ingredientId && unit && note.trim())} onClick={async () => {
        let ov: string | null = null;
        if (!can('inventory.adjust')) { ov = await requestOverride('inventory.adjust', 'Ajuste manual de inventario'); if (!ov) return; }
        await enqueue('rpc_inventory_record', { p_kind: 'ajuste_manual', p_ingredient_id: ingredientId, p_menu_item_id: null, p_qty: n * sign, p_unit: unit, p_reason: null, p_note: note, p_override: ov }, { label: 'Ajuste manual' });
        toast('success', 'Ajuste registrado'); setQty(''); setNote('');
      }}>Registrar ajuste</Button>
    </Card>
  );
}

// ---------------------------------------------------------------------
function CountsTab() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const call = useDirectRpc();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const { data: counts, isLoading } = useQuery({
    queryKey: ['counts', rid],
    queryFn: () => read<InventoryCount[]>(supabase.from('inventory_counts').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(50)),
  });
  if (open) return <CountSheet countId={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <div className="mb-3 flex justify-between">
        <p className="text-sm text-slate-600">El conteo físico fija la existencia real al momento del conteo. Al aprobarse, el sistema registra la diferencia como ajuste (no borra nada).</p>
        <Button icon={<ClipboardCheck className="h-4 w-4" />} onClick={async () => {
          try {
            const r = await call<{ count_id: string }>('rpc_count_create', { p_name: `Conteo ${new Date().toLocaleString()}`, p_as_of: null, p_category: null });
            qc.invalidateQueries({ queryKey: ['counts'] }); setOpen(r.count_id);
          } catch (e) { toast('error', errorText(asAppError(e))); }
        }}>Nuevo conteo</Button>
      </div>
      {isLoading ? <Spinner /> : (counts ?? []).length === 0 ? <EmptyState title="Aún no hay conteos" /> : (
        <Table>
          <thead><tr><Th>Conteo</Th><Th>Momento</Th><Th>Estado</Th><Th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {counts!.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>{formatDateTime(c.as_of, restaurant!.timezone)}</Td>
                <Td><Badge tone={c.status === 'aprobado' ? 'green' : c.status === 'enviado' ? 'blue' : c.status === 'cancelado' ? 'slate' : 'amber'}>{c.status}</Badge></Td>
                <Td><Button size="sm" variant="secondary" onClick={() => setOpen(c.id)}>Abrir</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function CountSheet({ countId, onBack }: { countId: string; onBack: () => void }) {
  const { restaurant, can } = useApp();
  const rid = restaurant!.id;
  const enqueue = useEnqueue();
  const call = useDirectRpc();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: ingData } = useIngredients();
  const [cat, setCat] = useState('');
  const { data, refetch } = useQuery({
    queryKey: ['counts', 'sheet', countId],
    queryFn: async () => {
      const [count, lines] = await Promise.all([
        read<InventoryCount[]>(supabase.from('inventory_counts').select('*').eq('id', countId)),
        read<InventoryCountLine[]>(supabase.from('inventory_count_lines').select('*').eq('count_id', countId)),
      ]);
      return { count: count[0], lines };
    },
  });
  const variance = useQuery({
    queryKey: ['counts', 'variance', countId, data?.count?.status],
    enabled: data?.count?.status === 'aprobado' || data?.count?.status === 'enviado',
    queryFn: () => rpc<{ lines: { ingredient_id: string; name: string; base_unit: string; counted: number; theoretical: number; variance: number; variance_pct: number | null; variance_value: number | null }[] }>(
      'report_count_variance', { p_restaurant_id: rid, p_count_id: countId }),
  });
  const ings = (ingData?.ingredients ?? []).filter((i) => i.active);
  const cats = [...new Set(ings.map((i) => i.category ?? 'Sin categoría'))];
  const lineFor = (id: string) => data?.lines.find((l) => l.ingredient_id === id);
  const editable = data?.count?.status === 'abierto';
  const [local, setLocal] = useState<Record<string, { qty: string; unit: string }>>({});

  const save = (ing: Ingredient) => {
    const v = local[ing.id];
    if (!v) return;
    const qty = v.qty.trim() === '' ? null : Number(v.qty.replace(',', '.'));
    if (qty !== null && (Number.isNaN(qty) || qty < 0)) { toast('warning', 'Cantidad no válida'); return; }
    void enqueue('rpc_count_set_line', { p_count_id: countId, p_ingredient_id: ing.id, p_counted_qty: qty, p_unit: v.unit || ing.base_unit, p_note: null },
      { label: `Conteo: ${ing.name}` }).then(() => setTimeout(() => void refetch(), 600));
  };

  const transition = async (action: string) => {
    try {
      await call('rpc_count_transition', { p_count_id: countId, p_action: action, p_note: null });
      toast('success', action === 'aprobar' ? 'Conteo aprobado: diferencias registradas' : 'Listo');
      qc.invalidateQueries({ queryKey: ['counts'] }); qc.invalidateQueries({ queryKey: ['stock'] });
    } catch (e) { toast('error', errorText(asAppError(e))); }
  };

  if (!data?.count) return <Spinner />;
  const shown = ings.filter((i) => !cat || (i.category ?? 'Sin categoría') === cat);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>← Conteos</Button>
        <h2 className="text-lg font-bold">{data.count.name}</h2>
        <Badge tone="amber">{data.count.status}</Badge>
        <span className="text-sm text-slate-500">Momento del conteo: {formatDateTime(data.count.as_of, restaurant!.timezone)}</span>
        <div className="ml-auto flex gap-2">
          {editable && <Button onClick={() => void transition('enviar')} disabled={data.lines.length === 0}>Enviar para aprobación</Button>}
          {data.count.status === 'enviado' && can('inventory.approve_count') && <>
            <Button variant="secondary" onClick={() => void transition('reabrir')}>Regresar a captura</Button>
            <Button variant="success" onClick={() => void transition('aprobar')}>Aprobar y ajustar</Button>
          </>}
          {(editable || data.count.status === 'enviado') && <Button variant="ghost" className="text-red-600" onClick={() => void transition('cancelar')}>Cancelar conteo</Button>}
        </div>
      </div>

      {variance.data && (
        <Card className="mb-4 p-4">
          <h3 className="mb-2 font-semibold">Diferencias (contado − teórico al momento del conteo)</h3>
          <Table>
            <thead><tr><Th>Insumo</Th><Th className="text-right">Teórico</Th><Th className="text-right">Contado</Th><Th className="text-right">Diferencia</Th><Th className="text-right">%</Th>{can('inventory.view_cost') && <Th className="text-right">Valor</Th>}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {variance.data.lines.map((l) => (
                <tr key={l.ingredient_id}>
                  <Td>{l.name}</Td>
                  <Td className="text-right font-mono">{formatQty(Number(l.theoretical), l.base_unit)}</Td>
                  <Td className="text-right font-mono">{formatQty(Number(l.counted), l.base_unit)}</Td>
                  <Td className={cx('text-right font-mono', Number(l.variance) < 0 ? 'text-red-600' : Number(l.variance) > 0 ? 'text-emerald-700' : '')}>{formatQty(Number(l.variance), l.base_unit)}</Td>
                  <Td className="text-right">{l.variance_pct != null ? `${l.variance_pct}%` : '—'}</Td>
                  {can('inventory.view_cost') && <Td className="text-right">{l.variance_value != null ? formatMoney(Number(l.variance_value), restaurant!.currency) : '—'}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={() => setCat('')} className={cx('rounded-full px-3 py-1 text-sm', !cat ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200')}>Todas</button>
        {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={cx('rounded-full px-3 py-1 text-sm', cat === c ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200')}>{c}</button>)}
      </div>
      <Table>
        <thead><tr><Th>Insumo</Th><Th>Contado</Th><Th>Unidad</Th><Th>Capturado</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((ing) => {
            const l = lineFor(ing.id);
            const opts = unitOptionsFor(ing, ingData?.units ?? [], ingData?.ingredientUnits ?? []);
            const v = local[ing.id] ?? { qty: l ? String(l.counted_qty) : '', unit: l?.unit ?? ing.base_unit };
            return (
              <tr key={ing.id}>
                <Td className="font-medium">{ing.name}</Td>
                <Td><Input disabled={!editable} inputMode="decimal" className="w-28" value={v.qty}
                  onChange={(e) => setLocal((s) => ({ ...s, [ing.id]: { ...v, qty: e.target.value } }))} onBlur={() => save(ing)} /></Td>
                <Td><Select disabled={!editable} className="w-40" value={v.unit} onChange={(e) => setLocal((s) => ({ ...s, [ing.id]: { ...v, unit: e.target.value } }))} onBlur={() => save(ing)}>
                  {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select></Td>
                <Td>{l ? <span className="text-sm text-emerald-700">{formatQty(Number(l.counted_base), ing.base_unit)}</span> : <span className="text-sm text-slate-400">—</span>}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------
function MovementsTab() {
  const { restaurant, can } = useApp();
  const [days, setDays] = useState(2);
  const { data, isLoading } = useQuery({
    queryKey: ['movements', restaurant!.id, days],
    queryFn: () => rpc<{ id: string; ingredient_name: string; base_unit: string; kind: string; qty_base: number; waste_reason: string | null; effective_at: string; note: string | null; staff_name: string | null; authorized_by_name: string | null; unit_cost: number | null; source_type: string }[]>(
      'inventory_movements_list', { p_restaurant_id: restaurant!.id, p_from: new Date(Date.now() - days * 86400_000).toISOString(), p_limit: 500 }),
  });
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-sm"><History className="h-4 w-4" />Últimos
        <Select className="w-28" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 2, 7, 30].map((d) => <option key={d} value={d}>{d} día(s)</option>)}</Select>
      </div>
      {isLoading ? <Spinner /> : (
        <Table>
          <thead><tr><Th>Momento</Th><Th>Insumo</Th><Th>Tipo</Th><Th className="text-right">Cantidad</Th><Th>Quién</Th><Th>Nota</Th>{can('inventory.view_cost') && <Th className="text-right">Valor</Th>}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(data ?? []).map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap">{formatDateTime(m.effective_at, restaurant!.timezone)}</Td>
                <Td>{m.ingredient_name}</Td>
                <Td>{MOVEMENT_LABELS[m.kind] ?? m.kind}{m.waste_reason && <span className="text-slate-500"> · {WASTE_REASONS.find((r) => r.value === m.waste_reason)?.label ?? m.waste_reason}</span>}</Td>
                <Td className={cx('text-right font-mono', Number(m.qty_base) < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatQty(Number(m.qty_base), m.base_unit)}</Td>
                <Td>{m.staff_name ?? '—'}{m.authorized_by_name && <span className="text-xs text-slate-500"> (autorizó {m.authorized_by_name})</span>}</Td>
                <Td className="max-w-xs truncate">{m.note}</Td>
                {can('inventory.view_cost') && <Td className="text-right">{m.unit_cost != null ? formatMoney(Math.abs(Number(m.qty_base) * Number(m.unit_cost)), restaurant!.currency) : '—'}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
export function RecipesViewer() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const { data: ingData } = useIngredients();
  const { data, isLoading } = useQuery({
    queryKey: ['recipes', rid, 'active'],
    queryFn: async () => {
      const [recipes, versions, lines] = await Promise.all([
        read<Recipe[]>(supabase.from('recipes').select('*').eq('restaurant_id', rid).order('name')),
        read<RecipeVersion[]>(supabase.from('recipe_versions').select('*').eq('restaurant_id', rid).eq('status', 'activa')),
        read<RecipeLine[]>(supabase.from('recipe_lines').select('*').eq('restaurant_id', rid).order('sort')),
      ]);
      return { recipes, versions, lines };
    },
  });
  const [open, setOpen] = useState<Recipe | null>(null);
  const [q, setQ] = useState('');
  const ingName = useMemo(() => new Map((ingData?.ingredients ?? []).map((i) => [i.id, i.name])), [ingData]);
  if (isLoading || !data) return <Spinner />;
  const list = data.recipes.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const version = open ? data.versions.find((v) => v.recipe_id === open.id) : null;
  return (
    <>
      <Input placeholder="Buscar receta…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 max-w-xs" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => {
          const v = data.versions.find((x) => x.recipe_id === r.id);
          return (
            <button key={r.id} onClick={() => setOpen(r)} className="text-left">
              <Card className="flex items-center gap-3 p-3 hover:border-brand-400">
                <BookOpen className="h-5 w-5 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.kind === 'prep' ? 'Preparado' : 'Platillo'} · {v ? `versión ${v.version}` : 'sin versión activa'}</div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} size="lg">
        {!version ? <p className="text-sm text-slate-500">Sin versión activa.</p> : (
          <>
            {version.yield_qty && <p className="mb-2 text-sm">Rinde: <b>{version.yield_qty} {version.yield_unit}</b></p>}
            <ul className="mb-4 divide-y rounded-lg border">
              {data.lines.filter((l) => l.version_id === version.id).map((l) => (
                <li key={l.id} className="flex justify-between px-3 py-2 text-sm"><span>{ingName.get(l.ingredient_id)}</span><span className="font-mono">{l.qty} {l.unit}</span></li>
              ))}
            </ul>
            {version.instructions && <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{version.instructions}</div>}
            <p className="mt-3 text-xs text-slate-400">Versión {version.version} · activa desde {version.activated_at ? new Date(version.activated_at).toLocaleDateString() : '—'}</p>
          </>
        )}
      </Modal>
    </>
  );
}
