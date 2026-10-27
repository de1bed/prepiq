import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './state/session';
import { supabaseConfigured } from './lib/supabase';
import { Spinner } from './components/ui';
import { Shell } from './components/Shell';
import { LoginPage } from './features/auth/LoginPage';
import { OnboardingPage } from './features/auth/OnboardingPage';
import { SetupMissing } from './features/auth/SetupMissing';
import { PairPage } from './features/auth/PairPage';
import { HomePage } from './features/home/HomePage';
import { WaiterPage } from './features/mesero/WaiterPage';
import { KdsPage, KdsStationPicker } from './features/kds/KdsPage';
import { ExpoPage } from './features/kds/ExpoPage';
import { KioskPage } from './features/reloj/KioskPage';
import { OperatorGate } from './components/Pin';
import { lazy, Suspense, type ReactNode } from 'react';
const AdminPage = lazy(() => import('./features/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const ReportsPage = lazy(() => import('./features/reportes/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const MyPage = lazy(() => import('./features/mi/MyPage').then((m) => ({ default: m.MyPage })));
const SchedulePage = lazy(() => import('./features/horarios/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const LabelsPage = lazy(() => import('./features/etiquetas/LabelsPage').then((m) => ({ default: m.LabelsPage })));
const InventoryPage = lazy(() => import('./features/inventario/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ShiftLeadPage = lazy(() => import('./features/turno/ShiftLeadPage').then((m) => ({ default: m.ShiftLeadPage })));

function RequirePerm({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { can, device } = useApp();
  const perms = Array.isArray(perm) ? perm : [perm];
  if (device) return <>{children}</>; // en dispositivo, el operador se valida dentro (OperatorGate) y en el servidor
  if (!perms.some((p) => can(p))) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const { status, contexts, device, restaurant, error, signOut } = useApp();
  const location = useLocation();

  if (!supabaseConfigured) return <SetupMissing />;
  // Vincular un equipo funciona con o sin sesión (QR de Administración → Dispositivos).
  if (location.pathname === '/vincular') return <PairPage />;
  if (status === 'loading') return <Spinner className="min-h-screen" />;
  if (status === 'signed_out') {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (status === 'error' || !contexts) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-semibold">No se pudo cargar tu cuenta.</p>
        <p className="text-sm text-slate-500">{error}</p>
        <button className="underline" onClick={() => window.location.reload()}>Reintentar</button>
        <button className="text-sm text-slate-500 underline" onClick={() => void signOut()}>Cerrar sesión</button>
      </div>
    );
  }

  // Dispositivo compartido: abre directo en su modo.
  if (device) {
    return (
      <Routes>
        {device.mode === 'kds' && (
          <>
            {/* Cocina sin PIN: quién está en cada estación sale del horario. */}
            <Route path="/cocina/:stationId" element={<KdsPage />} />
            <Route path="/cocina" element={<KdsStationPicker />} />
            <Route path="*" element={<Navigate to={device.station_id ? `/cocina/${device.station_id}` : '/cocina'} replace />} />
          </>
        )}
        {device.mode === 'expo' && (
          <>
            <Route path="/pase" element={<ExpoPage />} />
            <Route path="/cocina/:stationId" element={<KdsPage />} />
            <Route path="*" element={<Navigate to="/pase" replace />} />
          </>
        )}
        {device.mode === 'pos' && (
          <>
            <Route path="/mesero/*" element={<OperatorGate title="Meseros" dark={false}><WaiterPage /></OperatorGate>} />
            <Route path="*" element={<Navigate to="/mesero" replace />} />
          </>
        )}
        {device.mode === 'kiosko' && <Route path="*" element={<KioskPage />} />}
      </Routes>
    );
  }

  // Cuenta personal sin restaurante: alta o unión.
  if (!restaurant) {
    if (contexts.staff.length > 1) return <Shell><HomePage /></Shell>;
    return <OnboardingPage />;
  }

  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
    <Routes>
      <Route path="/cocina/:stationId" element={<RequirePerm perm="kds.view"><KdsPage /></RequirePerm>} />
      <Route path="/cocina" element={<RequirePerm perm="kds.view"><Shell><KdsStationPicker /></Shell></RequirePerm>} />
      <Route path="/pase" element={<RequirePerm perm="kds.view"><ExpoPage /></RequirePerm>} />
      <Route path="/mesero/*" element={<RequirePerm perm="orders.create"><WaiterPage /></RequirePerm>} />
      <Route path="/turno" element={<RequirePerm perm="service.open_close"><Shell><ShiftLeadPage /></Shell></RequirePerm>} />
      <Route path="/inventario/*" element={<RequirePerm perm="inventory.view"><Shell><InventoryPage /></Shell></RequirePerm>} />
      <Route path="/etiquetas" element={<RequirePerm perm={['labels.print', 'labels.manage']}><Shell><LabelsPage /></Shell></RequirePerm>} />
      <Route path="/horarios" element={<RequirePerm perm="schedule.manage"><Shell><SchedulePage /></Shell></RequirePerm>} />
      <Route path="/reportes" element={<RequirePerm perm="reports.view"><Shell><ReportsPage /></Shell></RequirePerm>} />
      <Route path="/admin/*" element={<RequirePerm perm={['config.manage', 'menu.manage', 'staff.manage', 'inventory.manage', 'labels.manage']}><Shell><AdminPage /></Shell></RequirePerm>} />
      <Route path="/mi" element={<Shell><MyPage /></Shell>} />
      <Route path="/reloj" element={<KioskPage />} />
      <Route path="/" element={<Shell><HomePage /></Shell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
