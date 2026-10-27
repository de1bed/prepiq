import { BookOpen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRecipeBook, useStations, type RecipeBookEntry } from '@/data/hooks';
import { EmptyState, Modal, Spinner, cx } from '@/components/ui';

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

/** Detalle de una receta (versión activa): ingredientes, rendimiento y pasos. */
export function RecipeView({ recipe }: { recipe: RecipeBookEntry }) {
  return (
    <div data-testid="recipe-view">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-2xl font-black">{recipe.name}</h2>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
          {recipe.kind === 'menu' ? 'Platillo' : 'Preparación'} · versión {recipe.version}
        </span>
        {recipe.yield_qty && <span className="text-sm text-slate-400">Rinde {fmtQty(recipe.yield_qty)} {recipe.yield_unit}</span>}
      </div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Ingredientes</h3>
      {recipe.lines.length === 0 ? <p className="text-slate-500">Sin ingredientes registrados.</p> : (
        <ul className="mb-4 divide-y divide-slate-800 rounded-lg bg-slate-900">
          {recipe.lines.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-lg">
              <span className="font-semibold">{l.name}{l.notes && <span className="ml-2 text-sm font-normal text-amber-300">{l.notes}</span>}</span>
              <span className="whitespace-nowrap font-mono tabular-nums text-brand-500">{fmtQty(l.qty)} {l.unit}</span>
            </li>
          ))}
        </ul>
      )}
      {recipe.instructions && (
        <>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Preparación</h3>
          <p className="mb-4 whitespace-pre-line text-lg leading-relaxed">{recipe.instructions}</p>
        </>
      )}
      {recipe.notes && <p className="rounded-lg bg-amber-500/10 p-3 text-amber-200">{recipe.notes}</p>}
    </div>
  );
}

/** Pestaña "Recetas": todas las recetas activas con búsqueda. */
export function RecipeBook({ stationId }: { stationId?: string }) {
  const { data, isLoading } = useRecipeBook();
  const { data: stations } = useStations();
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((r) => (!term || r.name.toLowerCase().includes(term) || (r.category ?? '').toLowerCase().includes(term)
      || r.lines.some((l) => l.name.toLowerCase().includes(term)))
      && (!onlyMine || !stationId || r.stations.includes(stationId)));
  }, [data, q, onlyMine, stationId]);
  const current = list.find((r) => r.id === sel) ?? (data ?? []).find((r) => r.id === sel);
  const stationName = stations?.find((s) => s.id === stationId)?.name;

  if (isLoading) return <Spinner className="text-slate-400" />;
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col border-r border-kds-line">
        <div className="space-y-2 p-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar receta o ingrediente…"
              className="h-11 w-full bg-transparent text-white outline-none" data-testid="recipe-search" />
          </label>
          {stationId && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Solo platillos de {stationName ?? 'esta estación'}
            </label>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {list.length === 0 && <li className="p-3 text-sm text-slate-500">Sin resultados.</li>}
          {list.map((r) => (
            <li key={r.id}>
              <button onClick={() => setSel(r.id)} data-testid={`recipe-${r.name}`}
                className={cx('mb-1 w-full rounded-lg px-3 py-2 text-left', sel === r.id ? 'bg-white text-slate-900' : 'hover:bg-white/5')}>
                <div className="font-semibold">{r.name}</div>
                <div className={cx('text-xs', sel === r.id ? 'text-slate-600' : 'text-slate-400')}>
                  {r.kind === 'menu' ? r.category ?? 'Platillo' : 'Preparación'} · {r.lines.length} ingredientes
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-h-0 flex-1 overflow-y-auto p-5">
        {current ? <RecipeView recipe={current} /> : (
          <EmptyState className="mt-10 border-slate-700" icon={<BookOpen className="h-10 w-10" />} title="Elige una receta">
            <span className="text-slate-400">{(data ?? []).length} recetas activas. Solo se muestran ingredientes y pasos; nunca costos.</span>
          </EmptyState>
        )}
      </section>
    </div>
  );
}

/** Receta del platillo de un ticket (botón "Receta" del renglón). */
export function RecipeModal({ menuItemId, name, onClose }: { menuItemId: string | null | undefined; name: string; onClose: () => void }) {
  const open = menuItemId !== undefined;
  const { data, isLoading } = useRecipeBook(open);
  const recipe = data?.find((r) => r.menu_item_id && r.menu_item_id === menuItemId);
  return (
    <Modal open={open} onClose={onClose} title={`Receta · ${name}`} dark size="lg">
      {isLoading ? <Spinner /> : recipe ? <RecipeView recipe={recipe} /> : (
        <p className="text-slate-400" data-testid="recipe-missing">Este platillo no tiene una receta activa registrada. Pide a gerencia que la capture en Inventario → Recetas.</p>
      )}
    </Modal>
  );
}
