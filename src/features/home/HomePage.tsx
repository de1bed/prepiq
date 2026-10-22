import { AlertTriangle, Building2, CalendarCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '@/state/session';
import { useIncidents, useServiceDay } from '@/data/hooks';
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
  const { contexts, restaurant, selectRestaurant, actor, staff } = useApp();
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
