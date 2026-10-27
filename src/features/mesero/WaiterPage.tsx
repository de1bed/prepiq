import {
  ArrowLeft, Ban, Bell, ChefHat, Clock, CloudOff, Flame, Home, LogOut, Minus, Pencil, Plus, Replace, Send, ShoppingBag, Star, Trash2, UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useLiveTables, useMenu, useOrder, useOrders, useStaff, useStations, type MenuData, type OrderWithItems } from '@/data/hooks';
import { useApp } from '@/state/session';
import { useEnqueue, useSync } from '@/state/sync';
import { useOverride } from '@/components/Pin';
import { ReasonDialog } from '@/components/ReasonDialog';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner, Tabs, cx, useToast } from '@/components/ui';
import { formatMoney, ORDER_TYPE_LABELS, VOID_REASONS } from '@/lib/format';
import { formatTime } from '@/lib/time';
import { uuid } from '@/lib/ids';
import type { MenuItem, OrderItem, OrderType, Station } from '@/lib/types';
import { getDraft, lineTotal, putDraft, removeDraft, useDrafts, type DraftLine, type OrderDraft } from './drafts';
import { ItemDialog } from './ItemDialog';

/** Pantalla dedicada de meseros (sin el menú lateral de la app). */
export function WaiterPage() {
  useLiveTables('mesero', ['orders', 'order_items', 'kitchen_tickets', 'menu_items'], [['orders'], ['menu']]);
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <WaiterTopBar />
      <div className="flex-1 p-3 sm:p-4">
        <Routes>
          <Route index element={<OrderList />} />
          <Route path="orden/:orderId" element={<OrderEditor />} />
        </Routes>
      </div>
    </div>
  );
}

function WaiterTopBar() {
  const { restaurant, device, operator, setOperator, actor } = useApp();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-white px-3 py-2 shadow-sm">
      {!device && <Link to="/" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Inicio" title="Inicio"><Home className="h-5 w-5" /></Link>}
      <span className="text-lg font-black">Meseros</span>
      <span className="hidden text-sm text-slate-500 sm:inline">· {restaurant?.name}</span>
      <div className="ml-auto flex items-center gap-2">
        <SyncIndicator />
        {actor && (
          <span className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm" data-testid="operator-name">
            <UserRound className="h-4 w-4" /><b>{actor.name}</b>
            {device && operator ? (
              // Solo se cierra en este equipo; lo que esté en la cola se envía con su sesión.
              <button onClick={() => setOperator(null)} className="ml-1 flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold ring-1 ring-slate-200 hover:bg-slate-50" data-testid="switch-operator">
                <LogOut className="h-3.5 w-3.5" />Cambiar
              </button>
            ) : <span className="pr-2" />}
          </span>
        )}
      </div>
    </header>
  );
}

type MiniTicket = OrderWithItems['tickets'][number];

/** Estado de cocina por estación y tiempo (los tickets son por unidad). */
function kitchenGroups(tickets: MiniTicket[], stations: Station[] | undefined) {
  const m = new Map<string, { key: string; station: string; course: number; total: number; ready: number; cooking: number; queued: number; held: number; blocked: number; priority: boolean }>();
  for (const t of tickets) {
    if (t.status === 'anulado') continue;
    const key = `${t.station_id}|${t.course}`;
    const g = m.get(key) ?? { key, station: stations?.find((s) => s.id === t.station_id)?.name ?? '', course: t.course, total: 0, ready: 0, cooking: 0, queued: 0, held: 0, blocked: 0, priority: false };
    g.total += 1;
    if (t.status === 'listo' || t.status === 'entregado') g.ready += 1;
    else if (t.status === 'en_preparacion') g.cooking += 1;
    else if (t.status === 'nuevo') g.queued += 1;
    else if (t.status === 'en_espera') g.held += 1;
    if (t.blocked) g.blocked += 1;
    if (t.priority) g.priority = true;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => a.course - b.course || a.station.localeCompare(b.station));
}

function groupText(g: ReturnType<typeof kitchenGroups>[number]): string {
  if (g.blocked) return 'faltante';
  if (g.ready === g.total) return 'listo';
  if (g.held === g.total) return 'en espera';
  return `${g.ready}/${g.total} listos`;
}
function groupTone(g: ReturnType<typeof kitchenGroups>[number]) {
  if (g.blocked) return 'red' as const;
  if (g.ready === g.total) return 'green' as const;
  if (g.held === g.total) return 'violet' as const;
  return g.cooking ? 'amber' as const : 'blue' as const;
}

/** Órdenes de la cola local que aún no llegan al servidor. */
function usePendingOrders() {
  const { ops } = useSync();
  return useMemo(() => ops.filter((o) => o.rpc === 'rpc_order_submit' || o.rpc === 'rpc_order_submit_v2'), [ops]);
}

function OrderList() {
  const { restaurant, actor } = useApp();
  const nav = useNavigate();
  const [scope, setScope] = useState<'mias' | 'todas'>('mias');
  const { data: orders, isLoading } = useOrders({ status: 'abierta' });
  const { data: staff } = useStaff();
  const { data: stations } = useStations();
  const drafts = useDrafts(restaurant!.id);
  const pending = usePendingOrders();
  const names = new Map(staff?.map((s) => [s.id, s.display_name]));

  const serverIds = new Set(orders?.map((o) => o.id));
  const localOnly = [
    ...pending.filter((op) => !serverIds.has(String((op.args.p_order as { id: string }).id))).map((op) => ({
      id: String((op.args.p_order as { id: string }).id), op,
    })),
  ];
  const draftOnly = drafts.filter((d) => d.isNew && !serverIds.has(d.id) && !localOnly.some((l) => l.id === d.id));
  const visible = (orders ?? []).filter((o) => scope === 'todas' || o.server_staff_id === actor?.staffId);

  const newOrder = () => {
    const id = uuid();
    putDraft({ id, isNew: true, order_type: 'mesa', table_label: '', guest_count: null, customer_name: '', notes: '', lines: [], updatedAt: Date.now(), restaurantId: restaurant!.id });
    nav(`/mesero/orden/${id}`);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Órdenes abiertas</h1>
        <div className="flex items-center gap-2">
          <Tabs value={scope} onChange={setScope} tabs={[{ value: 'mias', label: 'Mías' }, { value: 'todas', label: 'Todas' }]} />
          <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={newOrder} data-testid="new-order">Nueva orden</Button>
        </div>
      </div>

      {(draftOnly.length > 0 || localOnly.length > 0) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {draftOnly.map((d) => (
            <button key={d.id} onClick={() => nav(`/mesero/orden/${d.id}`)} className="text-left">
              <Card className="border-dashed p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{d.order_type === 'mesa' ? `Mesa ${d.table_label || '—'}` : ORDER_TYPE_LABELS[d.order_type]}</span>
                  <Badge tone="slate"><Pencil className="h-3 w-3" />Borrador</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">{d.lines.length} producto(s) sin enviar</p>
              </Card>
            </button>
          ))}
          {localOnly.map(({ id, op }) => {
            const o = op.args.p_order as { order_type: OrderType; table_label?: string; customer_name?: string; items?: unknown[] };
            return (
              <Card key={id} className="border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{o.order_type === 'mesa' ? `Mesa ${o.table_label}` : o.customer_name || ORDER_TYPE_LABELS[o.order_type]}</span>
                  <Badge tone={op.status === 'failed' ? 'red' : 'amber'}><CloudOff className="h-3 w-3" />{op.status === 'failed' ? 'Error al enviar' : 'Por sincronizar'}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{o.items?.length ?? 0} producto(s). Se enviará en cuanto haya conexión.</p>
              </Card>
            );
          })}
        </div>
      )}

      {isLoading ? <Spinner /> : visible.length === 0 && draftOnly.length === 0 && localOnly.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="h-10 w-10" />} title="No hay órdenes abiertas">
          Toca <b>Nueva orden</b> para empezar.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((o) => <OrderCard key={o.id} order={o} serverName={names.get(o.server_staff_id ?? '')} stations={stations} onOpen={() => nav(`/mesero/orden/${o.id}`)} tz={restaurant!.timezone} />)}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, serverName, onOpen, tz, stations }: { order: OrderWithItems; serverName?: string; onOpen: () => void; tz: string; stations?: Station[] }) {
  const groups = kitchenGroups(order.tickets, stations);
  const ready = order.tickets.filter((t) => t.status === 'listo').length;
  const pendingLines = order.items.filter((i) => i.status === 'pendiente').length;
  return (
    <button onClick={onOpen} className="text-left" data-testid={`order-card-${order.number}`}>
      <Card className={cx('p-4 transition hover:shadow-md', ready > 0 && 'border-emerald-400 ring-2 ring-emerald-300')}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-bold">#{order.number} · {order.order_type === 'mesa' ? `Mesa ${order.table_label}` : order.customer_name || ORDER_TYPE_LABELS[order.order_type]}</div>
            <div className="text-xs text-slate-500">{serverName ?? '—'} · {formatTime(order.created_at, tz)}{order.guest_count ? ` · ${order.guest_count} pers.` : ''}</div>
          </div>
          {ready > 0 && <Badge tone="green"><Bell className="h-3 w-3" />{ready} listo(s)</Badge>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {groups.map((g) => <Badge key={g.key} tone={groupTone(g)}>{g.station}: {groupText(g)}{g.course > 1 ? ` · T${g.course}` : ''}</Badge>)}
          {pendingLines > 0 && <Badge tone="slate">{pendingLines} sin enviar</Badge>}
        </div>
      </Card>
    </button>
  );
}

// ---------------------------------------------------------------------
// Editor de orden
// ---------------------------------------------------------------------
function OrderEditor() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { restaurant, actor, can, device, setOperator } = useApp();
  const enqueue = useEnqueue();
  const requestOverride = useOverride();
  const { ops } = useSync();
  const { data: menu, isLoading: menuLoading } = useMenu();
  const { data: server, isLoading: orderLoading } = useOrder(orderId);
  const { data: stations } = useStations();

  const [draft, setDraft] = useState<OrderDraft | null>(() => (orderId ? getDraft(orderId) : null));
  // Al abrir una orden existente sin borrador local, el borrador parte de lo pendiente en el servidor.
  useEffect(() => {
    if (draft || !server) return;
    setDraft({
      id: server.id, isNew: false, order_type: server.order_type, table_label: server.table_label ?? '', guest_count: server.guest_count,
      customer_name: server.customer_name ?? '', notes: server.notes ?? '', restaurantId: server.restaurant_id, updatedAt: Date.now(),
      lines: server.items.filter((i) => i.status === 'pendiente').map((i) => ({
        id: i.id, menu_item_id: i.menu_item_id, name: i.name, unit_price: Number(i.unit_price), qty: i.qty,
        modifiers: i.modifiers.map((m) => ({ modifier_id: m.modifier_id, name: m.name, kitchen_label: m.kitchen_label, price_delta: Number(m.price_delta), qty: m.qty })),
        notes: i.notes ?? '', course: i.course, seat: i.seat,
      })),
    });
  }, [server, draft]);

  const update = (patch: Partial<OrderDraft>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      putDraft(next);
      return next;
    });
  };

  const [cat, setCat] = useState<string>('');
  const [dialog, setDialog] = useState<{ item: MenuItem; initial: DraftLine | null } | null>(null);
  const [voiding, setVoiding] = useState<OrderItem | null>(null);
  const [replacing, setReplacing] = useState<OrderItem | null>(null);
  const [closing, setClosing] = useState<'close' | 'void' | null>(null);
  const [search, setSearch] = useState('');

  const pendingOps = ops.filter((o) => (o.args.p_order as { id?: string } | undefined)?.id === orderId || o.args.p_order_id === orderId);
  const syncingLines = pendingOps.filter((o) => o.rpc === 'rpc_order_submit' || o.rpc === 'rpc_order_submit_v2')
    .flatMap((o) => ((o.args.p_order as { items?: DraftLine[] }).items ?? []))
    .filter((l) => !server?.items.some((i) => i.id === l.id));

  if (menuLoading || !menu || (orderLoading && !draft)) return <Spinner />;
  if (!draft && !server) {
    return <EmptyState title="Orden no encontrada"><Button className="mt-2" onClick={() => nav('/mesero')}>Volver</Button></EmptyState>;
  }
  const d = draft!;
  if (!d) return <Spinner />;
  const closed = server && server.status !== 'abierta';

  const categories = menu.categories.filter((c) => c.active);
  const activeCat = cat || categories[0]?.id || '';
  const items = menu.items.filter((i) => i.active && (search ? i.name.toLowerCase().includes(search.toLowerCase()) : i.category_id === activeCat));

  const addItem = (item: MenuItem) => {
    const hasGroups = menu.itemGroups.some((g) => g.menu_item_id === item.id);
    if (hasGroups) { setDialog({ item, initial: null }); return; }
    update({ lines: [...d.lines, { id: uuid(), menu_item_id: item.id, name: item.name, unit_price: Number(item.price), qty: 1, modifiers: [], notes: '', course: 1, seat: null }] });
  };

  const headerValid = d.order_type !== 'mesa' || d.table_label.trim().length > 0;
  const courses = [...new Set(d.lines.map((l) => l.course))].sort();

  const submit = async (send: 'todo' | 'ninguno' | string) => {
    if (!headerValid) { toast('warning', 'Indica el número de mesa.'); return; }
    const label = `${d.order_type === 'mesa' ? `Mesa ${d.table_label}` : d.customer_name || ORDER_TYPE_LABELS[d.order_type]}: ${send === 'ninguno' ? 'guardar' : 'enviar a cocina'}`;
    await enqueue('rpc_order_submit_v2', {
      p_order: {
        id: d.id, order_type: d.order_type, table_label: d.table_label || null, guest_count: d.guest_count, customer_name: d.customer_name || null,
        notes: d.notes || null, client_created_at: new Date().toISOString(),
        items: d.lines.map((l) => ({ id: l.id, menu_item_id: l.menu_item_id, qty: l.qty, modifiers: l.modifiers.map((m) => ({ modifier_id: m.modifier_id, qty: m.qty })), notes: l.notes || null, course: l.course, seat: l.seat, replaces_item_id: l.replaces_item_id ?? null, extra_station_ids: l.extra_station_ids ?? [] })),
      },
      p_send: send,
    }, { label, meta: { orderId: d.id } });
    removeDraft(d.id);
    setDraft({ ...d, isNew: false, lines: send === 'ninguno' ? d.lines : [] });
    toast('success', send === 'ninguno' ? 'Orden guardada' : 'Enviado a cocina');
    if (send !== 'ninguno' && d.isNew) nav('/mesero');
    // Terminal compartida: tras enviar, el siguiente mesero se identifica con su PIN.
    if (send !== 'ninguno' && device) setOperator(null);
  };

  const authorize = async (perm: string, why: string): Promise<string | null | false> => {
    if (can(perm)) return null;
    const ov = await requestOverride(perm, why);
    return ov ?? false;
  };

  const doVoid = async (item: OrderItem, reason: string, note: string, prepared: boolean | null) => {
    const ov = item.status === 'enviado' ? await authorize('orders.void_sent', `Anular "${item.name}" ya enviado a cocina.`) : null;
    if (ov === false) return;
    await enqueue('rpc_order_item_void', {
      p_order_item_id: item.id, p_reason: reason, p_note: note || null, p_was_prepared: prepared, p_override: ov,
    }, { label: `Anular ${item.name}`, meta: { orderId: d.id } });
    toast('info', `Anulado: ${item.name}`);
  };

  const liveTickets = (server?.tickets ?? []).filter((t) => t.status !== 'anulado');
  const groups = kitchenGroups(liveTickets, stations);
  const cooking = liveTickets.filter((t) => t.status === 'nuevo' || t.status === 'en_preparacion');
  const total = [...(server?.items.filter((i) => i.status === 'enviado') ?? []).map((i) => lineTotal({ unit_price: Number(i.unit_price), qty: i.qty, modifiers: i.modifiers.map((m) => ({ ...m, price_delta: Number(m.price_delta) })) })),
    ...d.lines.map(lineTotal)].reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* Menú */}
      <section className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav('/mesero')}>Órdenes</Button>
        </div>
        {!closed && (
          <>
            <Input placeholder="Buscar en el menú…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
            {!search && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {categories.map((c) => (
                  <button key={c.id} onClick={() => setCat(c.id)}
                    className={cx('whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold', activeCat === c.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200')}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((i) => (
                <button key={i.id} disabled={!i.available} onClick={() => addItem(i)} data-testid={`menu-item-${i.name}`}
                  className="flex min-h-[88px] flex-col justify-between rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                  <span className="font-semibold leading-tight">{i.name}</span>
                  <span className="mt-1 flex items-center justify-between text-sm text-slate-500">
                    {formatMoney(Number(i.price), restaurant!.currency)}
                    {!i.available && <Badge tone="red">86 · Agotado</Badge>}
                  </span>
                </button>
              ))}
              {items.length === 0 && <p className="col-span-full p-6 text-center text-sm text-slate-500">Sin productos en esta categoría.</p>}
            </div>
          </>
        )}
      </section>

      {/* Orden */}
      <aside className="lg:sticky lg:top-16 lg:self-start">
        <Card className="flex max-h-[calc(100vh-5.5rem)] flex-col">
          <div className="border-b p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold" data-testid="order-title">{server ? `Orden #${server.number}` : 'Nueva orden'}</h2>
              {closed && <Badge tone="slate">{server!.status}</Badge>}
            </div>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {(['mesa', 'llevar', 'barra', 'domicilio'] as OrderType[]).map((t) => (
                <button key={t} disabled={!!server || !!closed} onClick={() => update({ order_type: t })}
                  className={cx('rounded-lg border px-1 py-1.5 text-xs font-semibold disabled:opacity-60', d.order_type === t ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200')}>
                  {ORDER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {d.order_type === 'mesa' ? (
                <Field label="Mesa" className="col-span-2"><Input value={d.table_label} disabled={!!closed} onChange={(e) => update({ table_label: e.target.value.slice(0, 20) })} data-testid="table-input" placeholder="Ej. 4" /></Field>
              ) : (
                <Field label="Nombre / referencia" className="col-span-2"><Input value={d.customer_name} disabled={!!closed} onChange={(e) => update({ customer_name: e.target.value.slice(0, 60) })} /></Field>
              )}
              <Field label="Personas"><Input inputMode="numeric" value={d.guest_count ?? ''} disabled={!!closed} onChange={(e) => update({ guest_count: e.target.value ? Math.min(99, Number(e.target.value.replace(/\D/g, ''))) || null : null })} /></Field>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Estado de cocina (por estación; cada platillo es un ticket) */}
            {groups.length > 0 && (
              <div className="mb-3 space-y-1.5" data-testid="kitchen-status">
                {groups.map((g) => (
                  <div key={g.key} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2"><ChefHat className="h-4 w-4 text-slate-400" />{g.station}{g.course > 1 && ` · tiempo ${g.course}`}
                      {g.priority && <Star className="h-3.5 w-3.5 text-fuchsia-600" aria-label="Con prioridad" />}</span>
                    <Badge tone={groupTone(g)}>{groupText(g)}</Badge>
                  </div>
                ))}
                <div className="flex gap-2">
                  {cooking.length > 0 && (
                    <Button size="sm" variant="secondary" className="flex-1" icon={<Star className="h-4 w-4 text-fuchsia-600" />} onClick={async () => {
                      const ov = await authorize('orders.priority', 'Dar prioridad en cocina a toda esta orden.');
                      if (ov === false) return;
                      await enqueue('rpc_order_priority', { p_order_id: d.id, p_override: ov }, { label: `Prioridad orden #${server?.number}` });
                      toast('info', 'Prioridad enviada a cocina');
                    }}>Pedir prioridad</Button>
                  )}
                  {liveTickets.some((t) => t.status === 'en_espera') && (
                    <Button size="sm" variant="secondary" className="flex-1" icon={<Flame className="h-4 w-4" />}
                      onClick={() => {
                        const next = Math.min(...liveTickets.filter((t) => t.status === 'en_espera').map((t) => t.course));
                        void enqueue('rpc_order_fire_course', { p_order_id: d.id, p_course: next }, { label: `Marchar tiempo ${next}` });
                      }} data-testid="fire-course">
                      Marchar siguiente tiempo
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Líneas enviadas */}
            {server?.items.filter((i) => i.status !== 'pendiente').map((i) => (
              <div key={i.id} className={cx('flex items-start gap-2 border-b py-2 text-sm last:border-0', i.status === 'anulado' && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className={cx('font-semibold', i.status === 'anulado' && 'line-through')}>{i.qty}× {i.name}{i.course > 1 && <span className="ml-1 text-xs text-violet-700">T{i.course}</span>}</div>
                  {i.modifiers.length > 0 && <div className="text-xs text-slate-500">{i.modifiers.map((m) => m.name).join(', ')}</div>}
                  {i.notes && <div className="text-xs italic text-slate-500">“{i.notes}”</div>}
                  {i.status === 'anulado' && <div className="text-xs text-red-600">Anulado{i.void_reason ? ` · ${VOID_REASONS.find((r) => r.value === i.void_reason)?.label}` : ''}</div>}
                </div>
                {i.status === 'enviado' && !closed && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" title="Cambiar" aria-label={`Cambiar ${i.name}`} onClick={() => setReplacing(i)}><Replace className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Anular" aria-label={`Anular ${i.name}`} onClick={() => setVoiding(i)}><Ban className="h-4 w-4 text-red-600" /></Button>
                  </div>
                )}
              </div>
            ))}

            {syncingLines.map((l) => (
              <div key={l.id} className="flex items-center gap-2 border-b py-2 text-sm text-amber-800">
                <CloudOff className="h-4 w-4" /> {l.qty}× {l.name} <span className="text-xs">(sincronizando)</span>
              </div>
            ))}

            {/* Borrador */}
            {d.lines.length > 0 && <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Sin enviar</div>}
            {d.lines.map((l, idx) => (
              <div key={l.id} className="flex items-start gap-2 border-b py-2 text-sm last:border-0" data-testid="draft-line">
                <div className="min-w-0 flex-1">
                  <button className="text-left font-semibold hover:underline" onClick={() => setDialog({ item: menu.items.find((x) => x.id === l.menu_item_id)!, initial: l })}>
                    {l.name}{l.replaces_item_id && <Badge tone="violet" className="ml-1">Cambio</Badge>}{l.course > 1 && <span className="ml-1 text-xs text-violet-700">T{l.course}</span>}
                  </button>
                  {l.modifiers.length > 0 && <div className="text-xs text-slate-500">{l.modifiers.map((m) => m.name).join(', ')}</div>}
                  {l.notes && <div className="text-xs italic text-slate-500">“{l.notes}”</div>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" aria-label="Menos" onClick={() => update({ lines: l.qty > 1 ? d.lines.map((x, j) => j === idx ? { ...x, qty: x.qty - 1 } : x) : d.lines.filter((_, j) => j !== idx) })}>
                    {l.qty > 1 ? <Minus className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                  <span className="w-6 text-center font-bold">{l.qty}</span>
                  <Button size="sm" variant="secondary" aria-label="Más" onClick={() => update({ lines: d.lines.map((x, j) => j === idx ? { ...x, qty: Math.min(99, x.qty + 1) } : x) })}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
            {d.lines.length === 0 && !server?.items.length && <p className="py-6 text-center text-sm text-slate-400">Toca productos del menú para agregarlos.</p>}
          </div>

          <div className="space-y-2 border-t p-4">
            <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Total de referencia</span><span className="text-lg font-bold">{formatMoney(total, restaurant!.currency)}</span></div>
            {!closed && (
              <>
                <Button size="xl" className="w-full" icon={<Send className="h-5 w-5" />} disabled={d.lines.length === 0 || !headerValid} onClick={() => void submit('todo')} data-testid="send-order">
                  Enviar a cocina
                </Button>
                {courses.length > 1 && (
                  <Button variant="secondary" className="w-full" icon={<Clock className="h-4 w-4" />} disabled={!headerValid} onClick={() => void submit(`tiempo:${courses[0]}`)}>
                    Enviar tiempo {courses[0]} y retener el resto
                  </Button>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="secondary" size="sm" disabled={!headerValid || d.lines.length === 0} onClick={() => void submit('ninguno')}>Guardar</Button>
                  <Button variant="secondary" size="sm" disabled={!server} onClick={() => setClosing('close')}>Cerrar</Button>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                    if (!server) { removeDraft(d.id); nav('/mesero'); } else setClosing('void');
                  }}>{server ? 'Anular' : 'Descartar'}</Button>
                </div>
              </>
            )}
            {actor && <p className="text-center text-xs text-slate-400"><UserRound className="mr-1 inline h-3 w-3" />Atiende: {actor.name}</p>}
          </div>
        </Card>
      </aside>

      <ItemDialog open={!!dialog} item={dialog?.item ?? null} initial={dialog?.initial ?? null} menu={menu as MenuData} currency={restaurant!.currency} stations={stations}
        onClose={() => setDialog(null)}
        onSave={(line) => {
          const exists = d.lines.some((l) => l.id === line.id);
          update({ lines: exists ? d.lines.map((l) => (l.id === line.id ? line : l)) : [...d.lines, line] });
          setDialog(null);
        }} />

      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} title={`Anular: ${voiding?.name ?? ''}`} reasons={VOID_REASONS}
        extra={<PreparedPicker />}
        onSubmit={(reason, note) => {
          const prepared = (document.querySelector('input[name="prepared"]:checked') as HTMLInputElement | null)?.value;
          const item = voiding!;
          setVoiding(null);
          void doVoid(item, reason, note, prepared === 'si' ? true : prepared === 'no' ? false : null);
        }} />

      <ReplaceDialog item={replacing} menu={menu} onClose={() => setReplacing(null)} onConfirm={async (reason) => {
        const item = replacing!;
        setReplacing(null);
        const ov = await authorize('orders.void_sent', `Cambiar "${item.name}" ya enviado: se anula y se manda de nuevo.`);
        if (ov === false) return;
        await enqueue('rpc_order_item_void', { p_order_item_id: item.id, p_reason: reason, p_note: 'Cambio', p_was_prepared: null, p_override: ov },
          { label: `Cambio: anular ${item.name}` });
        const mi = menu.items.find((x) => x.id === item.menu_item_id);
        if (mi) {
          setDialog({ item: mi, initial: {
            id: uuid(), menu_item_id: mi.id, name: mi.name, unit_price: Number(mi.price), qty: item.qty, course: item.course, seat: item.seat,
            notes: item.notes ?? '', replaces_item_id: item.id,
            modifiers: item.modifiers.map((m) => ({ modifier_id: m.modifier_id, name: m.name, kitchen_label: m.kitchen_label, price_delta: Number(m.price_delta), qty: m.qty })),
          } });
        }
      }} />

      <CloseDialog mode={closing} onClose={() => setClosing(null)} hasActive={liveTickets.some((t) => t.status === 'en_espera' || t.status === 'nuevo' || t.status === 'en_preparacion')}
        onConfirm={async (reason) => {
          const mode = closing;
          setClosing(null);
          if (mode === 'void') {
            const needs = server?.items.some((i) => i.status === 'enviado');
            const ov = needs ? await authorize('orders.void_sent', 'Anular una orden con productos enviados.') : null;
            if (ov === false) return;
            await enqueue('rpc_order_close', { p_order_id: d.id, p_void: true, p_reason: reason, p_override: ov }, { label: `Anular orden #${server?.number}` });
          } else {
            await enqueue('rpc_order_close', { p_order_id: d.id, p_void: false, p_reason: reason || null }, { label: `Cerrar orden #${server?.number}` });
          }
          removeDraft(d.id);
          nav('/mesero');
        }} />
    </div>
  );
}

function PreparedPicker() {
  return (
    <fieldset className="mb-3 rounded-xl border p-3 text-sm">
      <legend className="px-1 font-semibold">¿Cocina ya lo preparó?</legend>
      <p className="mb-2 text-xs text-slate-500">Si ya se preparó, el inventario lo registra como merma (no regresa a existencia).</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1"><input type="radio" name="prepared" value="auto" defaultChecked /> Según cocina</label>
        <label className="flex items-center gap-1"><input type="radio" name="prepared" value="si" /> Sí, ya estaba hecho</label>
        <label className="flex items-center gap-1"><input type="radio" name="prepared" value="no" /> No se preparó</label>
      </div>
    </fieldset>
  );
}

function ReplaceDialog({ item, onClose, onConfirm }: { item: OrderItem | null; menu: MenuData; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('cambio_cliente');
  return (
    <Modal open={!!item} onClose={onClose} title={`Cambiar: ${item?.name ?? ''}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => onConfirm(reason)}>Continuar</Button></>}>
      <p className="mb-3 text-sm text-slate-600">La línea enviada se anula (queda en el historial) y se agrega una nueva marcada como <b>Cambio</b> para que cocina la vea claramente.</p>
      <div className="grid gap-2">
        {[{ v: 'cambio_cliente', l: 'Cambio del cliente' }, { v: 'error_captura', l: 'Error de captura' }].map((r) => (
          <label key={r.v} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="radio" checked={reason === r.v} onChange={() => setReason(r.v)} />{r.l}</label>
        ))}
      </div>
    </Modal>
  );
}

function CloseDialog({ mode, onClose, onConfirm, hasActive }: { mode: 'close' | 'void' | null; onClose: () => void; onConfirm: (reason: string) => void; hasActive: boolean }) {
  const [reason, setReason] = useState('');
  useEffect(() => { setReason(''); }, [mode]);
  if (mode === 'void') {
    return <ReasonDialog open onClose={onClose} title="Anular orden completa" reasons={VOID_REASONS} confirmLabel="Anular orden" onSubmit={(r) => onConfirm(r)} />;
  }
  return (
    <Modal open={mode === 'close'} onClose={onClose} title="Cerrar orden" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => onConfirm(hasActive && reason === 'forzar' ? 'forzar' : '')} disabled={hasActive && reason !== 'forzar'}>Cerrar orden</Button></>}>
      <p className="text-sm text-slate-600">Cerrar marca la orden como terminada. El cobro se realiza en tu sistema de caja (PrepIQ no cobra).</p>
      {hasActive && (
        <label className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" checked={reason === 'forzar'} onChange={(e) => setReason(e.target.checked ? 'forzar' : '')} />
          Cocina todavía no termina algunos platillos. Cerrar de todos modos.
        </label>
      )}
    </Modal>
  );
}
