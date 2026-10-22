import { useQuery } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { read } from '@/lib/rpc';
import { useIngredients } from '@/data/hooks';
import { useApp } from '@/state/session';
import { Badge, Button, Card, Field, Input, Select, Spinner, Table, Td, Th } from '@/components/ui';
import type { LabelTemplate, ShelfLifeRule } from '@/lib/types';
import { LABEL_FIELDS, LabelView } from '../etiquetas/LabelView';
import { useConfigWrite } from './crud';

export function LabelsAdmin() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const w = useConfigWrite(['labels']);
  const { data: ingData } = useIngredients();
  const { data, isLoading } = useQuery({
    queryKey: ['labels', 'admin', rid],
    queryFn: async () => ({
      templates: await read<LabelTemplate[]>(supabase.from('label_templates').select('*').eq('restaurant_id', rid).order('name')),
      rules: await read<ShelfLifeRule[]>(supabase.from('shelf_life_rules').select('*').eq('restaurant_id', rid).order('created_at')),
    }),
  });
  const [rule, setRule] = useState({ ingredient_id: '', product_name: '', storage: 'refrigerado', hours: '', validated_by: '', validated_on: '', source_note: '' });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-lg font-bold">Formatos de etiqueta</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.templates.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="mb-3 grid grid-cols-3 gap-2">
                <Field label="Nombre" className="col-span-3"><Input defaultValue={t.name} onBlur={(e) => void w.update('label_templates', t.id, { name: e.target.value }, '')} /></Field>
                <Field label="Ancho (mm)"><Input type="number" defaultValue={t.width_mm} onBlur={(e) => void w.update('label_templates', t.id, { width_mm: Number(e.target.value) })} /></Field>
                <Field label="Alto (mm)"><Input type="number" defaultValue={t.height_mm} onBlur={(e) => void w.update('label_templates', t.id, { height_mm: Number(e.target.value) })} /></Field>
                <Field label="Tamaño letra"><Input type="number" step="0.1" defaultValue={t.font_scale} onBlur={(e) => void w.update('label_templates', t.id, { font_scale: Number(e.target.value) })} /></Field>
              </div>
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                {LABEL_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-1 rounded border px-2 py-0.5">
                    <input type="checkbox" checked={t.fields.includes(f.key)} onChange={(e) => void w.update('label_templates', t.id, { fields: e.target.checked ? [...t.fields, f.key] : t.fields.filter((x) => x !== f.key) }, '')} />{f.label}
                  </label>
                ))}
              </div>
              <div className="overflow-hidden rounded bg-slate-100 p-3">
                <LabelView template={t} tz={restaurant!.timezone} data={{ product_name: 'Pico de gallo', batch_code: '261022-007', prepared_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400_000).toISOString(), expiry_source: 'regla', storage: 'refrigerado', quantity_text: '2 kg', allergens: [], notes: null, responsible_name: 'Carla', reprint_of: null }} />
              </div>
              <div className="mt-2 flex gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="radio" checked={t.is_default} onChange={async () => {
                  for (const o of data.templates.filter((x) => x.is_default && x.id !== t.id)) await w.update('label_templates', o.id, { is_default: false }, '');
                  await w.update('label_templates', t.id, { is_default: true });
                }} />Predeterminado</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={t.active} onChange={(e) => void w.update('label_templates', t.id, { active: e.target.checked })} />Activo</label>
              </div>
            </Card>
          ))}
          <Card className="flex items-center justify-center p-4">
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => void w.insert('label_templates', { restaurant_id: rid, name: `Formato ${data.templates.length + 1}`, width_mm: 50, height_mm: 30 })}>Nuevo formato</Button>
          </Card>
        </div>
        <p className="mt-2 text-xs text-slate-500">Se imprime con el diálogo del navegador: instala tu impresora de etiquetas en el equipo y elige el tamaño de papel correspondiente. Prueba el formato antes del piloto.</p>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Reglas de vida útil</h2>
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          PrepIQ no define vidas útiles ni reglas sanitarias. Captura las de tu restaurante tal como las validó tu responsable de calidad o la normativa aplicable, e indica quién y cuándo.
        </p>
        <Table className="mb-3">
          <thead><tr><Th>Producto</Th><Th>Conservación</Th><Th>Duración</Th><Th>Validó</Th><Th>Fuente</Th><Th>Activa</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.rules.map((r) => (
              <tr key={r.id}>
                <Td>{r.ingredient_id ? ingData?.ingredients.find((i) => i.id === r.ingredient_id)?.name : r.product_name}</Td>
                <Td>{r.storage}</Td><Td>{Number(r.duration_hours)} h</Td>
                <Td>{r.validated_by} · {r.validated_on}{/ejemplo|demo/i.test(r.validated_by) && <Badge tone="red" className="ml-1">Sin validar</Badge>}</Td>
                <Td className="max-w-xs truncate">{r.source_note}</Td>
                <Td><input type="checkbox" defaultChecked={r.active} onChange={(e) => void w.update('shelf_life_rules', r.id, { active: e.target.checked })} aria-label="Activa" /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="Insumo"><Select value={rule.ingredient_id} onChange={(e) => setRule({ ...rule, ingredient_id: e.target.value })}><option value="">(otro producto)</option>{ingData?.ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
            {!rule.ingredient_id && <Field label="Producto"><Input value={rule.product_name} onChange={(e) => setRule({ ...rule, product_name: e.target.value })} /></Field>}
            <Field label="Conservación"><Select value={rule.storage} onChange={(e) => setRule({ ...rule, storage: e.target.value })}>{['refrigerado', 'congelado', 'ambiente', 'caliente'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Duración (horas)"><Input inputMode="decimal" value={rule.hours} onChange={(e) => setRule({ ...rule, hours: e.target.value })} /></Field>
            <Field label="Validado por"><Input value={rule.validated_by} onChange={(e) => setRule({ ...rule, validated_by: e.target.value })} placeholder="Nombre y cargo" /></Field>
            <Field label="Fecha de validación"><Input type="date" value={rule.validated_on} onChange={(e) => setRule({ ...rule, validated_on: e.target.value })} /></Field>
            <Field label="Fuente / política" className="sm:col-span-2"><Input value={rule.source_note} onChange={(e) => setRule({ ...rule, source_note: e.target.value })} /></Field>
          </div>
          <Button className="mt-3" disabled={!(Number(rule.hours) > 0) || !rule.validated_by.trim() || !rule.validated_on || (!rule.ingredient_id && !rule.product_name.trim())}
            onClick={async () => {
              if (await w.insert('shelf_life_rules', { restaurant_id: rid, ingredient_id: rule.ingredient_id || null, product_name: rule.ingredient_id ? null : rule.product_name.trim(),
                storage: rule.storage, duration_hours: Number(rule.hours), validated_by: rule.validated_by.trim(), validated_on: rule.validated_on, source_note: rule.source_note || null }))
                setRule({ ingredient_id: '', product_name: '', storage: 'refrigerado', hours: '', validated_by: '', validated_on: '', source_note: '' });
            }}>Agregar regla</Button>
        </Card>
      </section>
    </div>
  );
}
