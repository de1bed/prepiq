import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Printer, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { read, asAppError } from '@/lib/rpc';
import { errorText } from '@/lib/errors';
import { formatDateTime, toDateStr, toTimeStr, zonedToUtc } from '@/lib/time';
import { useIngredients, useStaff } from '@/data/hooks';
import { useApp } from '@/state/session';
import { useDirectRpc } from '@/state/sync';
import { useOverride } from '@/components/Pin';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Th, useToast } from '@/components/ui';
import type { LabelPrint, LabelTemplate, ShelfLifeRule } from '@/lib/types';
import { LabelView, type LabelData } from './LabelView';

const STORAGE = [
  { value: 'refrigerado', label: 'Refrigerado' }, { value: 'congelado', label: 'Congelado' },
  { value: 'ambiente', label: 'Ambiente' }, { value: 'caliente', label: 'Caliente (mantenimiento)' },
];

function useLabelConfig() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  return useQuery({
    queryKey: ['labels', 'config', rid],
    queryFn: async () => {
      const [templates, rules] = await Promise.all([
        read<LabelTemplate[]>(supabase.from('label_templates').select('*').eq('restaurant_id', rid).eq('active', true).order('name')),
        read<ShelfLifeRule[]>(supabase.from('shelf_life_rules').select('*').eq('restaurant_id', rid).eq('active', true)),
      ]);
      return { templates, rules };
    },
  });
}

/** Imprime etiquetas con el diálogo del navegador (cualquier impresora instalada). */
function PrintPortal({ items, template, tz, onDone }: { items: LabelData[]; template: LabelTemplate; tz: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  // Imprime una sola vez al montar (aunque el padre se vuelva a renderizar).
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@page { size: ${template.width_mm}mm ${template.height_mm}mm; margin: 0; }`;
    document.head.appendChild(style);
    const t = setTimeout(() => {
      window.print();
      done.current();
    }, 150);
    return () => { clearTimeout(t); style.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div id="print-root">{items.map((d, i) => <LabelView key={i} data={d} template={template} tz={tz} />)}</div>,
    document.body,
  );
}

export function LabelsPage() {
  const [tab, setTab] = useState<'nueva' | 'historial'>('nueva');
  return (
    <div>
      <PageHeader title="Etiquetas" subtitle="Preparación, lote y caducidad con trazabilidad de impresión y reimpresión." />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'nueva', label: 'Nueva etiqueta' }, { value: 'historial', label: 'Historial' }]} />
      {tab === 'nueva' ? <NewLabel /> : <History />}
    </div>
  );
}

function NewLabel() {
  const { restaurant, actor } = useApp();
  const tz = restaurant!.timezone;
  const call = useDirectRpc();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: cfg } = useLabelConfig();
  const { data: ingData } = useIngredients();
  const { data: staff } = useStaff();
  const [mode, setMode] = useState<'insumo' | 'libre'>('insumo');
  const [ingredientId, setIngredientId] = useState('');
  const [productName, setProductName] = useState('');
  const [storage, setStorage] = useState('refrigerado');
  const [prepDate, setPrepDate] = useState(() => toDateStr(new Date(), tz));
  const [prepTime, setPrepTime] = useState(() => toTimeStr(new Date(), tz));
  const [expiryMode, setExpiryMode] = useState<'regla' | 'manual' | 'sin'>('regla');
  const [expDate, setExpDate] = useState('');
  const [expTime, setExpTime] = useState('23:59');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [copies, setCopies] = useState(1);
  const [responsible, setResponsible] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState<{ label: LabelPrint; template: LabelTemplate } | null>(null);
  const [confirmFor, setConfirmFor] = useState<LabelPrint | null>(null);

  const template = cfg?.templates.find((t) => t.id === templateId) ?? cfg?.templates.find((t) => t.is_default) ?? cfg?.templates[0];
  const ing = ingData?.ingredients.find((i) => i.id === ingredientId);
  const name = mode === 'insumo' ? ing?.name ?? '' : productName.trim();
  const rule = cfg?.rules.find((r) => r.storage === storage && (mode === 'insumo' ? r.ingredient_id === ingredientId : !r.ingredient_id && r.product_name?.toLowerCase() === name.toLowerCase()));
  const preparedAt = prepDate && prepTime ? zonedToUtc(prepDate, prepTime, tz) : new Date();
  const effectiveExpiryMode = expiryMode === 'regla' && !rule ? 'manual' : expiryMode;
  const expiresAt = effectiveExpiryMode === 'regla' && rule ? new Date(preparedAt.getTime() + Number(rule.duration_hours) * 3600_000)
    : effectiveExpiryMode === 'manual' && expDate ? zonedToUtc(expDate, expTime, tz) : null;
  const valid = !!name && !!template && (effectiveExpiryMode === 'sin' || !!expiresAt) && (!expiresAt || expiresAt > preparedAt);

  const preview: LabelData = {
    product_name: name || 'Producto', batch_code: 'AAMMDD-000', prepared_at: preparedAt.toISOString(), expires_at: expiresAt?.toISOString() ?? null,
    expiry_source: effectiveExpiryMode === 'regla' ? 'regla' : effectiveExpiryMode === 'manual' ? 'manual' : 'sin_caducidad',
    storage: STORAGE.find((s) => s.value === storage)?.label ?? storage, quantity_text: qty || null, allergens: ing?.allergens ?? [],
    notes: notes || null, responsible_name: staff?.find((s) => s.id === responsible)?.display_name ?? actor?.name ?? '', reprint_of: null,
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await call<{ label: LabelPrint }>('rpc_label_create', {
        p_label: {
          template_id: template!.id, ingredient_id: mode === 'insumo' ? ingredientId : null, product_name: mode === 'libre' ? name : null,
          prepared_at: preparedAt.toISOString(), storage, expires_at: effectiveExpiryMode === 'manual' ? expiresAt?.toISOString() : null,
          no_expiry: effectiveExpiryMode === 'sin', quantity_text: qty || null, notes: notes || null,
          responsible_staff: responsible || null, copies,
        },
      });
      setPrinting({ label: r.label, template: template! });
      qc.invalidateQueries({ queryKey: ['labels'] });
    } catch (e) {
      toast('error', errorText(asAppError(e)));
    } finally { setBusy(false); }
  };

  if (!cfg || !ingData) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="p-5">
        <Tabs value={mode} onChange={setMode} className="mb-4" tabs={[{ value: 'insumo', label: 'Insumo / preparado' }, { value: 'libre', label: 'Otro producto' }]} />
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === 'insumo' ? (
            <Field label="Producto">
              <Select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} data-testid="label-product">
                <option value="">Elige…</option>
                {ingData.ingredients.filter((i) => i.active).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'preparado' ? -1 : 1))
                  .map((i) => <option key={i.id} value={i.id}>{i.kind === 'preparado' ? '★ ' : ''}{i.name}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="Producto"><Input value={productName} onChange={(e) => setProductName(e.target.value)} /></Field>
          )}
          <Field label="Conservación"><Select value={storage} onChange={(e) => setStorage(e.target.value)}>{STORAGE.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
          <Field label="Preparado (fecha)"><Input type="date" value={prepDate} onChange={(e) => setPrepDate(e.target.value)} /></Field>
          <Field label="Preparado (hora)"><Input type="time" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} /></Field>
        </div>

        <div className="mt-4 rounded-xl border p-3">
          <div className="mb-2 text-sm font-semibold">Caducidad</div>
          {rule ? (
            <p className="mb-2 flex items-start gap-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Regla del restaurante: {Number(rule.duration_hours)} h ({storage}). Validó: {rule.validated_by} el {rule.validated_on}.
            </p>
          ) : (
            <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              No hay regla de vida útil validada para este producto y conservación. Captura la caducidad según la política de tu restaurante, o pide a administración que configure la regla.
            </p>
          )}
          <div className="mb-2 flex flex-wrap gap-2 text-sm">
            {rule && <label className="flex items-center gap-1"><input type="radio" checked={expiryMode === 'regla'} onChange={() => setExpiryMode('regla')} />Usar regla</label>}
            <label className="flex items-center gap-1"><input type="radio" checked={effectiveExpiryMode === 'manual'} onChange={() => setExpiryMode('manual')} />Capturar fecha</label>
            <label className="flex items-center gap-1"><input type="radio" checked={expiryMode === 'sin'} onChange={() => setExpiryMode('sin')} />Sin caducidad en la etiqueta</label>
          </div>
          {effectiveExpiryMode === 'manual' && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} aria-label="Fecha de caducidad" />
              <Input type="time" value={expTime} onChange={(e) => setExpTime(e.target.value)} aria-label="Hora de caducidad" />
            </div>
          )}
          {expiresAt && expiresAt <= preparedAt && <p className="mt-1 text-sm text-red-600">La caducidad debe ser posterior a la preparación.</p>}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Cantidad"><Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ej. 2 kg, 1 contenedor" /></Field>
          <Field label="Responsable">
            <Select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
              <option value="">{actor?.name} (yo)</option>
              {staff?.filter((s) => s.active && s.id !== actor?.staffId).map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </Select>
          </Field>
          <Field label="Notas"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Copias"><Input type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></Field>
            <Field label="Formato"><Select value={template?.id ?? ''} onChange={(e) => setTemplateId(e.target.value)}>{cfg.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          </div>
        </div>
        <Button className="mt-5" size="lg" disabled={!valid} loading={busy} onClick={() => void create()} icon={<Printer className="h-5 w-5" />} data-testid="label-print">
          Registrar e imprimir
        </Button>
        <p className="mt-2 text-xs text-slate-500">El lote se asigna al registrar. Requiere conexión.</p>
      </Card>

      <div>
        <div className="mb-2 text-sm font-semibold text-slate-600">Vista previa ({template?.width_mm}×{template?.height_mm} mm)</div>
        {template && <div className="overflow-hidden rounded-lg bg-slate-200 p-4"><LabelView data={preview} template={template} tz={tz} /></div>}
      </div>

      {printing && (
        <PrintPortal template={printing.template} tz={tz}
          items={Array.from({ length: printing.label.copies }, () => printing.label)}
          onDone={() => { setConfirmFor(printing.label); setPrinting(null); }} />
      )}
      <PrintConfirm label={confirmFor} onClose={() => setConfirmFor(null)} />
    </div>
  );
}

/** El navegador no informa si la impresora falló: se pregunta a la persona. */
function PrintConfirm({ label, onClose }: { label: LabelPrint | null; onClose: () => void }) {
  const call = useDirectRpc();
  const qc = useQueryClient();
  const toast = useToast();
  const [failing, setFailing] = useState(false);
  const act = async (action: string, args: Record<string, unknown> = {}) => {
    try {
      await call('rpc_label_action', { p_label_id: label!.id, p_action: action, p_args: args, p_override: null });
      qc.invalidateQueries({ queryKey: ['labels'] });
    } catch (e) { toast('error', errorText(asAppError(e))); }
  };
  return (
    <>
      <Modal open={!!label && !failing} onClose={onClose} title={`¿Se imprimió bien? · Lote ${label?.batch_code ?? ''}`} size="sm"
        footer={<>
          <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setFailing(true)}>No, falló</Button>
          <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={async () => { await act('confirmar'); toast('success', 'Etiqueta confirmada'); onClose(); }} data-testid="label-confirm">Sí, salió bien</Button>
        </>}>
        <p className="text-sm text-slate-600">Confírmalo para que quede registrado. Si falló, podrás reimprimir el mismo lote sin crear uno nuevo.</p>
      </Modal>
      <ReasonDialog open={failing} onClose={() => { setFailing(false); onClose(); }} title="¿Qué falló?" freeText tone="warning" confirmLabel="Registrar falla"
        reasons={[{ value: 'a', label: 'Sin papel/etiquetas' }, { value: 'b', label: 'Atasco' }, { value: 'c', label: 'Impresora desconectada' }, { value: 'd', label: 'Salió ilegible' }]}
        onSubmit={async (reason) => { await act('fallida', { reason }); setFailing(false); onClose(); toast('warning', 'Falla registrada. Puedes reimprimir desde Historial.'); }} />
    </>
  );
}

function History() {
  const { restaurant, can } = useApp();
  const rid = restaurant!.id;
  const tz = restaurant!.timezone;
  const call = useDirectRpc();
  const requestOverride = useOverride();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: cfg } = useLabelConfig();
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['labels', 'history', rid],
    queryFn: () => read<LabelPrint[]>(supabase.from('label_prints').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(200)),
  });
  const [action, setAction] = useState<{ label: LabelPrint; kind: 'reimprimir' | 'anular' } | null>(null);
  const [printing, setPrinting] = useState<LabelPrint | null>(null);
  const [confirmFor, setConfirmFor] = useState<LabelPrint | null>(null);
  const rows = useMemo(() => (data ?? []).filter((l) => !q || l.product_name.toLowerCase().includes(q.toLowerCase()) || l.batch_code.includes(q)), [data, q]);
  const tpl = (l: LabelPrint) => cfg?.templates.find((t) => t.id === l.template_id) ?? cfg?.templates.find((t) => t.is_default) ?? cfg?.templates[0];

  const run = async (l: LabelPrint, kind: 'reimprimir' | 'anular', reason: string) => {
    const perm = kind === 'reimprimir' && l.status === 'fallida' ? 'labels.print' : 'labels.reprint';
    let ov: string | null = null;
    if (!can(perm)) { ov = await requestOverride(perm, kind === 'reimprimir' ? 'Reimprimir una etiqueta ya impresa' : 'Anular una etiqueta'); if (!ov) return; }
    try {
      const r = await call<{ label: LabelPrint }>('rpc_label_action', { p_label_id: l.id, p_action: kind, p_args: { reason }, p_override: ov });
      qc.invalidateQueries({ queryKey: ['labels'] });
      if (kind === 'reimprimir') setPrinting(r.label); else toast('info', 'Etiqueta anulada');
    } catch (e) { toast('error', errorText(asAppError(e))); }
  };

  if (isLoading) return <Spinner />;
  return (
    <>
      <Input placeholder="Buscar por producto o lote…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 max-w-sm" />
      <Table>
        <thead><tr><Th>Lote</Th><Th>Producto</Th><Th>Preparado</Th><Th>Caduca</Th><Th>Responsable</Th><Th>Estado</Th><Th /></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => (
            <tr key={l.id}>
              <Td className="font-mono">{l.batch_code}{l.reprint_of && <Badge tone="violet" className="ml-1">Reimpresión</Badge>}{l.corrects_id && <Badge tone="blue" className="ml-1">Corrección</Badge>}</Td>
              <Td>{l.product_name}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(l.prepared_at, tz)}</Td>
              <Td className="whitespace-nowrap">{l.expires_at ? formatDateTime(l.expires_at, tz) : '—'} <span className="text-xs text-slate-400">({l.expiry_source})</span></Td>
              <Td>{l.responsible_name}</Td>
              <Td><Badge tone={l.status === 'impresa' ? 'green' : l.status === 'fallida' ? 'red' : l.status === 'anulada' ? 'slate' : 'amber'}>{l.status}</Badge>
                {l.void_reason && <div className="text-xs text-slate-500">{l.void_reason}</div>}{l.reprint_reason && <div className="text-xs text-slate-500">{l.reprint_reason}</div>}</Td>
              <Td className="whitespace-nowrap">
                {l.status !== 'anulada' && <>
                  <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setAction({ label: l, kind: 'reimprimir' })}>Reimprimir</Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setAction({ label: l, kind: 'anular' })}>Anular</Button>
                </>}
                {l.status === 'pendiente' && <Button size="sm" variant="ghost" onClick={() => setConfirmFor(l)}>Confirmar</Button>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ReasonDialog open={!!action} onClose={() => setAction(null)} title={action?.kind === 'reimprimir' ? 'Motivo de la reimpresión' : 'Motivo de la anulación'} freeText
        tone={action?.kind === 'anular' ? 'danger' : 'primary'} confirmLabel={action?.kind === 'reimprimir' ? 'Reimprimir' : 'Anular'}
        reasons={action?.kind === 'reimprimir' ? [{ value: '1', label: 'Falló la impresión' }, { value: '2', label: 'Etiqueta dañada' }, { value: '3', label: 'Se dividió el contenedor' }]
          : [{ value: '1', label: 'Datos incorrectos' }, { value: '2', label: 'Producto desechado' }]}
        onSubmit={(reason) => { const a = action!; setAction(null); void run(a.label, a.kind, reason); }} />
      {printing && tpl(printing) && (
        <PrintPortal template={tpl(printing)!} tz={tz} items={Array.from({ length: printing.copies }, () => printing)}
          onDone={() => { setConfirmFor(printing); setPrinting(null); }} />
      )}
      <PrintConfirm label={confirmFor} onClose={() => setConfirmFor(null)} />
    </>
  );
}
