import { AlertTriangle, Building2, CalendarCheck, CheckCircle2, Circle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Link } from 'react-router-dom';
import { useApp } from '@/state/session';
import { useIncidents, useMenu, useServiceDay, useStaff, useStations } from '@/data/hooks';
import { useNavItems } from '@/components/Shell';
import { Badge, Card, PageHeader } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/format';

const DESCRIPTIONS: Record<string, string> = {
  '/mesero': 'Capturar órdenes, modificadores y notas; ver avance y confirmar entrega.',
  '/cocina': 'Pantalla de cocina por estación: tickets, tiempos, listo, faltantes.',
  '/turno': 'Supervisar colas, incidencias, 86 y abrir/cerrar jornada.',
  '/inventario': 'Existencia teórica, recepciones, mermas, producción y conteos.',
  '/etiquetas': 'Imprimir etiquetas de preparación con lote y caducidad.',
  '/horarios': 'Programar turnos, publicar y aprobar cambios.',
  '/reportes': 'Tiempos de ciclo, reprocesos, anulaciones, mermas y diferencias.',
  '/admin': 'Restaurante, estaciones, menú, recetas, personal y dispositivos.',
  '/mi': 'Mis turnos, mi asistencia y mis solicitudes.',
};

export function HomePage() {
  const { contexts, restaurant, selectRestaurant, actor, staff, can } = useApp();
  const items = useNavItems().filter((n) => n.to !== '/');

  if (!restaurant && contexts) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Elige restaurante" />
        <div className="grid gap-3">
          {contexts.staff.map((s) => (
            <button key={s.restaurant_id} onClick={() => selectRestaurant(s.restaurant_id)}
              className="flex items-center gap-3 rounded-xl border bg-white p-4 text-left hover:border-brand-500">
              <Building2 className="h-6 w-6 text-brand-600" />
              <div>
                <div className="font-semibold">{s.restaurant_name}</div>
                <div className="text-sm text-slate-500">{s.roles.map((r) => ROLE_LABELS[r]).join(' · ')}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`Hola, ${actor?.name ?? ''}`} subtitle={staff?.roles.map((r) => ROLE_LABELS[r]).join(' · ')} />
      <StatusStrip />
      {can('config.manage') && <SetupChecklist />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((n) => (
          <Link key={n.to} to={n.to} className="group">
            <Card className="flex h-full gap-4 p-5 transition group-hover:border-brand-400 group-hover:shadow-md">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><n.icon className="h-6 w-6" /></span>
              <div>
                <div className="font-semibold text-slate-900">{n.label}</div>
                <div className="text-sm text-slate-500">{DESCRIPTIONS[n.to]}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusStrip() {
  const { data: day } = useServiceDay();
  const { data: incidents } = useIncidents(true);
  const open = incidents?.length ?? 0;
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <Badge tone={day?.status === 'abierta' ? 'green' : 'slate'}>
        <CalendarCheck className="h-3.5 w-3.5" />
        {day ? `Jornada ${day.business_date}: ${day.status}` : 'Sin jornada todavía (se abre con la primera orden)'}
      </Badge>
      {open > 0 && <Badge tone="amber"><AlertTriangle className="h-3.5 w-3.5" />{open} incidencia(s) abiertas</Badge>}
    </div>
  );
}

/** Lista de arranque para administración (onboarding). Se oculta al completarse. */
function SetupChecklist() {
  const { data: menu } = useMenu();
  const { data: stations } = useStations();
  const { data: staffList } = useStaff();
  const { restaurant } = useApp();
  const { data: extra } = useQuery({
    queryKey: ['setup', restaurant!.id],
    queryFn: async () => {
      const [devices, recipes, rules] = await Promise.all([
        supabase.from('devices').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant!.id),
        supabase.from('recipes').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant!.id),
        supabase.from('shelf_life_rules').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant!.id).eq('active', true),
      ]);
      return { devices: devices.count ?? 0, recipes: recipes.count ?? 0, rules: rules.count ?? 0 };
    },
  });
  if (!menu || !stations || !staffList || !extra) return null;
  const withoutRoute = menu.items.filter((i) => i.active && !menu.routes.some((r) => r.menu_item_id === i.id)).length;
  const steps = [
    { done: stations.filter((s) => s.active).length > 0, text: 'Crear estaciones de cocina', to: '/admin/estaciones' },
    { done: menu.items.length > 0, text: 'Cargar el menú (o importarlo desde CSV)', to: '/admin/importar' },
    { done: menu.items.length > 0 && withoutRoute === 0, text: withoutRoute ? `Asignar estación a ${withoutRoute} producto(s)` : 'Todos los productos tienen estación', to: '/admin/menu' },
    { done: staffList.length > 1, text: 'Agregar al equipo y sus roles', to: '/admin/personal' },
    { done: staffList.filter((s) => s.active).every((s) => s.pin_set_at), text: 'Asignar PIN a cada persona', to: '/admin/personal' },
    { done: extra.devices > 0, text: 'Vincular tabletas / reloj', to: '/admin/dispositivos' },
    { done: extra.recipes > 0, text: 'Recetas de los platillos más vendidos (inventario)', to: '/admin/recetas' },
    { done: extra.rules > 0, text: 'Reglas de vida útil validadas (etiquetas)', to: '/admin/etiquetas' },
  ];
  const pending = steps.filter((s) => !s.done);
  if (pending.length === 0) return null;
  return (
    <Card className="mb-5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Puesta en marcha</h2>
        <Badge tone="amber">{steps.length - pending.length}/{steps.length}</Badge>
      </div>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.text} className="flex items-center gap-2">
            {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
            {s.done ? <span className="text-slate-500 line-through">{s.text}</span> : <Link to={s.to} className="text-brand-700 hover:underline">{s.text}</Link>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
