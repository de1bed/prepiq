import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from '@/state/session';
import { cx } from '@/components/ui';
import { RestaurantSettings } from './RestaurantSettings';
import { StationsAdmin } from './StationsAdmin';
import { MenuAdmin } from './MenuAdmin';
import { IngredientsAdmin } from './IngredientsAdmin';
import { RecipesAdmin } from './RecipesAdmin';
import { StaffAdmin } from './StaffAdmin';
import { DevicesAdmin } from './DevicesAdmin';
import { LabelsAdmin } from './LabelsAdmin';
import { AuditAdmin } from './AuditAdmin';
import { ImportMenu } from './ImportMenu';

const SECTIONS = [
  { to: 'restaurante', label: 'Restaurante', perm: 'config.manage', el: <RestaurantSettings /> },
  { to: 'estaciones', label: 'Estaciones', perm: 'config.manage', el: <StationsAdmin /> },
  { to: 'menu', label: 'Menú', perm: 'menu.manage', el: <MenuAdmin /> },
  { to: 'importar', label: 'Importar menú', perm: 'menu.manage', el: <ImportMenu /> },
  { to: 'insumos', label: 'Insumos', perm: 'inventory.manage', el: <IngredientsAdmin /> },
  { to: 'recetas', label: 'Recetas', perm: 'inventory.manage', el: <RecipesAdmin /> },
  { to: 'personal', label: 'Personal', perm: 'staff.manage', el: <StaffAdmin /> },
  { to: 'dispositivos', label: 'Dispositivos', perm: 'devices.manage', el: <DevicesAdmin /> },
  { to: 'etiquetas', label: 'Etiquetas', perm: 'labels.manage', el: <LabelsAdmin /> },
  { to: 'auditoria', label: 'Auditoría', perm: 'audit.view', el: <AuditAdmin /> },
];

export function AdminPage() {
  const { can } = useApp();
  const allowed = SECTIONS.filter((s) => can(s.perm));
  return (
    <div>
      <h1 className="mb-3 text-2xl font-bold">Administración</h1>
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {allowed.map((s) => (
          <NavLink key={s.to} to={`/admin/${s.to}`} className={({ isActive }) => cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold',
            isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>{s.label}</NavLink>
        ))}
      </nav>
      <Routes>
        {allowed.map((s) => <Route key={s.to} path={s.to} element={s.el} />)}
        <Route path="*" element={<Navigate to={allowed[0] ? `/admin/${allowed[0].to}` : '/'} replace />} />
      </Routes>
    </div>
  );
}
