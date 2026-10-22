import type { LabelPrint, LabelTemplate } from '@/lib/types';
import { formatDateTime } from '@/lib/time';

export const LABEL_FIELDS: { key: string; label: string }[] = [
  { key: 'producto', label: 'Producto' },
  { key: 'lote', label: 'Lote' },
  { key: 'preparado', label: 'Fecha de preparación' },
  { key: 'caduca', label: 'Caducidad' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'cantidad', label: 'Cantidad' },
  { key: 'almacenamiento', label: 'Almacenamiento' },
  { key: 'alergenos', label: 'Alérgenos' },
  { key: 'notas', label: 'Notas' },
];

export type LabelData = Pick<LabelPrint, 'product_name' | 'batch_code' | 'prepared_at' | 'expires_at' | 'expiry_source' | 'storage' | 'quantity_text' | 'allergens' | 'notes' | 'responsible_name' | 'reprint_of'>;

/** Etiqueta a escala real (mm). Se usa para vista previa y para imprimir. */
export function LabelView({ data, template, tz, scale = 1 }: { data: LabelData; template: LabelTemplate; tz: string; scale?: number }) {
  const f = new Set(template.fields);
  const fs = template.font_scale;
  const line = (label: string, value: string | null | undefined, strong = false) => value ? (
    <div style={{ fontSize: `${2.6 * fs}mm`, lineHeight: 1.15 }}><span style={{ opacity: 0.7 }}>{label}: </span><span style={{ fontWeight: strong ? 800 : 600 }}>{value}</span></div>
  ) : null;
  return (
    <div
      className="label-page overflow-hidden bg-white text-black"
      style={{
        width: `${template.width_mm}mm`, height: `${template.height_mm}mm`, padding: '1.5mm', boxSizing: 'border-box',
        fontFamily: 'Inter, Arial, sans-serif', transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left',
        border: scale !== 1 ? '1px dashed #94a3b8' : undefined,
      }}
    >
      {f.has('producto') && <div style={{ fontSize: `${4 * fs}mm`, fontWeight: 900, lineHeight: 1.05, marginBottom: '0.8mm' }}>{data.product_name}</div>}
      {f.has('preparado') && line('Prep', formatDateTime(data.prepared_at, tz))}
      {f.has('caduca') && line('Caduca', data.expires_at ? formatDateTime(data.expires_at, tz) : 'Sin caducidad indicada', true)}
      {f.has('responsable') && line('Resp', data.responsible_name)}
      {f.has('cantidad') && line('Cant', data.quantity_text)}
      {f.has('almacenamiento') && line('Conservar', data.storage)}
      {f.has('alergenos') && data.allergens.length > 0 && line('Alérgenos', data.allergens.join(', '))}
      {f.has('notas') && line('Nota', data.notes)}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: `${2.4 * fs}mm`, marginTop: '0.5mm' }}>
        {f.has('lote') && <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>Lote {data.batch_code}</span>}
        {data.reprint_of && <span style={{ fontWeight: 800 }}>REIMPRESIÓN</span>}
      </div>
    </div>
  );
}
