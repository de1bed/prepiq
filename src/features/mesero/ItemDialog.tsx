import { Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MenuData } from '@/data/hooks';
import type { MenuItem, Modifier } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { uuid } from '@/lib/ids';
import { Button, Field, Input, Modal, cx } from '@/components/ui';
import { lineTotal, type DraftLine } from './drafts';

/** Agregar o editar un producto: modificadores (con mínimos/máximos), cantidad, notas, tiempo y asiento. */
export function ItemDialog({ open, onClose, item, menu, currency, initial, onSave, maxCourse = 3 }: {
  open: boolean; onClose: () => void; item: MenuItem | null; menu: MenuData; currency: string;
  initial?: DraftLine | null; onSave: (line: DraftLine) => void; maxCourse?: number;
}) {
  const groups = useMemo(() => {
    if (!item) return [];
    const links = menu.itemGroups.filter((g) => g.menu_item_id === item.id).sort((a, b) => a.sort - b.sort);
    return links.map((l) => {
      const g = menu.groups.find((x) => x.id === l.group_id)!;
      return { group: g, modifiers: menu.modifiers.filter((m) => m.group_id === g.id && m.active).sort((a, b) => a.sort - b.sort) };
    }).filter((x) => x.group && x.group.active);
  }, [item, menu]);

  const [selected, setSelected] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [course, setCourse] = useState(1);
  const [seat, setSeat] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const sel: Record<string, number> = {};
    initial?.modifiers.forEach((m) => { sel[m.modifier_id] = m.qty; });
    setSelected(sel);
    setQty(initial?.qty ?? 1);
    setNotes(initial?.notes ?? '');
    setCourse(initial?.course ?? 1);
    setSeat(initial?.seat ? String(initial.seat) : '');
  }, [open, initial]);

  if (!item) return null;

  const countIn = (groupId: string) => groups.find((g) => g.group.id === groupId)?.modifiers.reduce((s, m) => s + (selected[m.id] ?? 0), 0) ?? 0;
  const toggle = (m: Modifier, max: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[m.id]) { delete next[m.id]; return next; }
      if (max === 1) {
        groups.find((g) => g.group.id === m.group_id)?.modifiers.forEach((x) => delete next[x.id]);
      } else if (countIn(m.group_id) >= max) return prev;
      next[m.id] = 1;
      return next;
    });
  };

  const problems = groups.filter((g) => countIn(g.group.id) < g.group.min_select).map((g) => g.group.name);
  const mods = groups.flatMap((g) => g.modifiers.filter((m) => selected[m.id]).map((m) => ({
    modifier_id: m.id, name: m.name, kitchen_label: m.kitchen_label || m.name, price_delta: Number(m.price_delta), qty: selected[m.id],
  })));
  const line: DraftLine = {
    id: initial?.id ?? uuid(), menu_item_id: item.id, name: item.name, unit_price: Number(item.price), qty, modifiers: mods,
    notes: notes.trim(), course, seat: seat ? Number(seat) : null, replaces_item_id: initial?.replaces_item_id ?? null,
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={item.name}
      footer={<>
        <span className="mr-auto self-center text-lg font-bold">{formatMoney(lineTotal(line), currency)}</span>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={problems.length > 0} onClick={() => onSave(line)} data-testid="item-save">{initial ? 'Guardar cambios' : 'Agregar'}</Button>
      </>}>
      {groups.map(({ group, modifiers }) => (
        <section key={group.id} className="mb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-semibold">{group.name}</h3>
            <span className={cx('text-xs', countIn(group.id) < group.min_select ? 'font-bold text-red-600' : 'text-slate-500')}>
              {group.min_select > 0 ? `Obligatorio · ` : ''}{group.max_select === 1 ? 'elige 1' : `hasta ${group.max_select}`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {modifiers.map((m) => (
              <button key={m.id} type="button" disabled={!m.available} onClick={() => toggle(m, group.max_select)}
                className={cx('rounded-xl border-2 p-3 text-left text-sm font-semibold transition disabled:opacity-40',
                  selected[m.id] ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-400')}>
                {m.name}
                {Number(m.price_delta) !== 0 && <span className="block text-xs font-normal text-slate-500">+{formatMoney(Number(m.price_delta), currency)}</span>}
                {!m.available && <span className="block text-xs font-normal text-red-600">Agotado</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cantidad">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos"><Minus className="h-4 w-4" /></Button>
            <span className="w-10 text-center text-xl font-bold" data-testid="item-qty">{qty}</span>
            <Button variant="secondary" size="lg" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Más"><Plus className="h-4 w-4" /></Button>
          </div>
        </Field>
        <Field label="Tiempo" hint="Los tiempos posteriores pueden quedar en espera.">
          <div className="flex gap-1">
            {Array.from({ length: maxCourse }, (_, i) => i + 1).map((c) => (
              <button key={c} type="button" onClick={() => setCourse(c)}
                className={cx('h-10 flex-1 rounded-lg border-2 font-bold', course === c ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>{c}</button>
            ))}
          </div>
        </Field>
        <Field label="Asiento (opcional)"><Input inputMode="numeric" value={seat} onChange={(e) => setSeat(e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
      </div>
      <Field label="Nota para cocina" className="mt-3">
        <Input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. bien dorado, alergia a nuez" />
      </Field>
      {item.allergens.length > 0 && <p className="mt-2 text-xs text-amber-700">Alérgenos declarados: {item.allergens.join(', ')}</p>}
    </Modal>
  );
}
