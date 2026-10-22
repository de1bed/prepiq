import {
  BarChart3, CalendarDays, ChefHat, Home, LogOut, Menu, Package, Printer, Settings, ShieldCheck, UserRound, UtensilsCrossed, X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '@/state/session';
import { SyncIndicator } from './SyncIndicator';
import { cx } from './ui';

export const NAV = [
  { to: '/', label: 'Inicio', icon: Home, perm: null },
  { to: '/mesero', label: 'Meseros', icon: UtensilsCrossed, perm: 'orders.create' },
  { to: '/cocina', label: 'Cocina (KDS)', icon: ChefHat, perm: 'kds.view' },
  { to: '/turno', label: 'Turno', icon: ShieldCheck, perm: 'service.open_close' },
  { to: '/inventario', label: 'Inventario', icon: Package, perm: 'inventory.view' },
  { to: '/etiquetas', label: 'Etiquetas', icon: Printer, perm: 'labels.print' },
  { to: '/horarios', label: 'Horarios', icon: CalendarDays, perm: 'schedule.manage' },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, perm: 'reports.view' },
  { to: '/admin', label: 'Administración', icon: Settings, perm: 'admin' },
  { to: '/mi', label: 'Mi espacio', icon: UserRound, perm: null },
] as const;

export function useNavItems() {
  const { can } = useApp();
  return NAV.filter((n) => {
    if (n.perm === null) return true;
    if (n.perm === 'admin') return ['config.manage', 'menu.manage', 'staff.manage', 'inventory.manage', 'labels.manage'].some(can);
    return can(n.perm);
  });
}

export function Shell({ children }: { children: ReactNode }) {
  const { restaurant, actor, signOut, contexts, selectRestaurant } = useApp();
  const items = useNavItems();
  const [open, setOpen] = useState(false);
  const many = (contexts?.staff.length ?? 0) > 1;
  return (
    <div className="min-h-screen">
      {restaurant?.is_demo && (
        <div className="bg-violet-600 px-4 py-1 text-center text-xs font-semibold text-white">
          Restaurante de demostración · datos ficticios
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menú"><Menu className="h-5 w-5" /></button>
          <NavLink to="/" className="flex items-center gap-2 font-black tracking-tight text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><ChefHat className="h-5 w-5" /></span>
            PrepIQ
          </NavLink>
          {restaurant && (
            <span className="hidden truncate text-sm text-slate-500 sm:inline">· {restaurant.name}</span>
          )}
          {many && (
            <button className="text-xs text-brand-700 underline" onClick={() => selectRestaurant(null)}>cambiar</button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <SyncIndicator />
            {actor && <span className="hidden text-sm font-medium text-slate-700 md:inline">{actor.name}</span>}
            <button onClick={() => void signOut()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl">
        <nav className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-slate-200 p-3 lg:block">
          <NavList items={items} />
        </nav>
        {open && (
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
            <nav className="h-full w-64 bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex justify-end"><button onClick={() => setOpen(false)} className="p-2" aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
              <NavList items={items} onClick={() => setOpen(false)} />
            </nav>
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function NavList({ items, onClick }: { items: ReturnType<typeof useNavItems>; onClick?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((n) => (
        <li key={n.to}>
          <NavLink
            to={n.to}
            end={n.to === '/'}
            onClick={onClick}
            className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')}
          >
            <n.icon className="h-4 w-4" aria-hidden /> {n.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
