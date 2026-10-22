import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMenu, useStations } from '@/data/hooks';
import { useApp } from '@/state/session';
import { validateMenuCsv } from '@/lib/menuImport';
import { formatMoney } from '@/lib/format';
import { Badge, Button, Card, Table, Td, Textarea, Th, useToast } from '@/components/ui';

const EXAMPLE = `categoria,nombre,precio,estacion,tiempo_min,complejidad,nombre_cocina
Tacos,Orden de tacos de suadero (3),80,Comal,6,1,Suadero (3)
Platos,Hamburguesa doble,180,Parrilla|Freidora,14,3,Doble`;

/** Importación controlada: vista previa con errores; solo se crean filas válidas y nuevas. */
export function ImportMenu() {
  const { restaurant } = useApp();
  const rid = restaurant!.id;
  const toast = useToast();
  const qc = useQueryClient();
  const { data: stations } = useStations();
  const { data: menu } = useMenu();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => text.trim() ? validateMenuCsv(text, (stations ?? []).map((s) => s.name), (menu?.items ?? []).map((i) => i.name)) : null, [text, stations, menu]);
  const valid = result?.rows.filter((r) => r.errors.length === 0 && !r.duplicate) ?? [];

  const run = async () => {
    if (!stations || !menu) return;
    setBusy(true);
    let created = 0;
    try {
      const cats = new Map(menu.categories.map((c) => [c.name.toLowerCase(), c.id]));
      for (const name of [...new Set(valid.map((r) => r.category).filter(Boolean))]) {
        if (cats.has(name.toLowerCase())) continue;
        const res = await supabase.from('menu_categories').insert({ restaurant_id: rid, name, sort: cats.size + 1 }).select('id').single();
        if (res.error) throw res.error;
        cats.set(name.toLowerCase(), res.data.id as string);
      }
      for (const r of valid) {
        const res = await supabase.from('menu_items').insert({
          restaurant_id: rid, name: r.name, price: r.price, prep_minutes: r.prep_minutes, complexity: r.complexity, kitchen_name: r.kitchen_name,
          category_id: r.category ? cats.get(r.category.toLowerCase()) : null,
        }).select('id').single();
        if (res.error) throw res.error;
        const routes = r.stations.map((s, i) => ({ restaurant_id: rid, menu_item_id: res.data.id, station_id: stations.find((x) => x.name === s)!.id, sort: i }));
        const rr = await supabase.from('menu_item_routes').insert(routes);
        if (rr.error) throw rr.error;
        created++;
      }
      toast('success', `${created} producto(s) importados`);
      setText('');
    } catch (e) {
      toast('error', `Se detuvo tras ${created} producto(s): ${(e as { message?: string }).message ?? e}`);
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['menu'] });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Importar productos desde CSV</h2>
        <p className="mb-2 text-sm text-slate-600">Columnas: <code>categoria, nombre, precio, estacion</code> (obligatorias: nombre, precio, estacion), <code>tiempo_min, complejidad, nombre_cocina</code> (opcionales). Varias estaciones se separan con <code>|</code>. Las estaciones deben existir. Los productos que ya existen se omiten (no se modifican).</p>
        <div className="mb-2 flex gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <FileUp className="h-4 w-4" /> Elegir archivo
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
          </label>
          <Button variant="ghost" onClick={() => setText(EXAMPLE)}>Ver ejemplo</Button>
        </div>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="O pega aquí el contenido CSV" className="font-mono text-xs" />
      </Card>
      {result?.headerError && <p className="text-sm font-semibold text-red-600">{result.headerError}</p>}
      {result && !result.headerError && (
        <>
          <div className="flex items-center gap-2">
            <Badge tone="green">{valid.length} válidos</Badge>
            <Badge tone="slate">{result.rows.filter((r) => r.duplicate).length} ya existen</Badge>
            <Badge tone="red">{result.rows.filter((r) => r.errors.length).length} con errores</Badge>
            <Button className="ml-auto" icon={<Upload className="h-4 w-4" />} disabled={!valid.length} loading={busy} onClick={() => void run()}>Importar {valid.length} producto(s)</Button>
          </div>
          <Table>
            <thead><tr><Th>Línea</Th><Th>Nombre</Th><Th>Categoría</Th><Th>Precio</Th><Th>Estaciones</Th><Th>Tiempo</Th><Th>Resultado</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((r) => (
                <tr key={r.line}>
                  <Td>{r.line}</Td><Td>{r.name}</Td><Td>{r.category}</Td><Td>{Number.isNaN(r.price) ? '—' : formatMoney(r.price, restaurant!.currency)}</Td>
                  <Td>{r.stations.join(', ')}</Td><Td>{r.prep_minutes} min</Td>
                  <Td>{r.errors.length ? <span className="text-xs text-red-600">{r.errors.join(' · ')}</span> : r.duplicate ? <Badge>Se omite (ya existe)</Badge> : <Badge tone="green">OK</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
