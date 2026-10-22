// Sesión: cuenta de Supabase, contextos (restaurantes donde participo o
// dispositivo vinculado) y, en dispositivos compartidos, el operador
// identificado por PIN.
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { rpc, RpcError } from '@/lib/rpc';
import type { DeviceContext, MyContexts, Permission, RestaurantSettings, StaffContext } from '@/lib/types';

export interface Operator {
  token: string;
  staff_id: string;
  display_name: string;
  roles: string[];
  permissions: Permission[];
  expires_at: string;
}

export interface ActiveRestaurant {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  settings: RestaurantSettings;
  is_demo: boolean;
}

export interface Actor {
  staffId: string;
  name: string;
  permissions: Permission[];
  token: string | null; // token de operador en dispositivos; null en cuenta personal
}

interface AppState {
  status: 'loading' | 'signed_out' | 'ready' | 'error';
  error: string | null;
  session: Session | null;
  contexts: MyContexts | null;
  refreshContexts: () => Promise<MyContexts | null>;
  restaurant: ActiveRestaurant | null;
  staff: StaffContext | null;
  device: DeviceContext | null;
  operator: Operator | null;
  setOperator: (op: Operator | null) => void;
  actor: Actor | null;
  can: (perm: Permission) => boolean;
  selectRestaurant: (id: string | null) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
const ACTIVE_KEY = 'prepiq-active-restaurant';
const OPERATOR_KEY = 'prepiq-operator';
const CONTEXTS_KEY = 'prepiq-contexts-cache';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AppState['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [contexts, setContexts] = useState<MyContexts | null>(null);
  const userRef = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => safeGet(ACTIVE_KEY));
  const [operator, setOperatorState] = useState<Operator | null>(() => {
    const raw = safeGet(OPERATOR_KEY);
    if (!raw) return null;
    try {
      const op = JSON.parse(raw) as Operator;
      return new Date(op.expires_at).getTime() > Date.now() ? op : null;
    } catch { return null; }
  });

  const refreshContexts = useCallback(async () => {
    try {
      const c = await rpc<MyContexts>('rpc_my_contexts');
      setContexts(c);
      setError(null);
      safeSet(CONTEXTS_KEY, JSON.stringify(c));
      return c;
    } catch (e) {
      // Sin conexión: se arranca con los últimos contextos conocidos de esta
      // cuenta para que cocina pueda seguir trabajando (el servidor valida todo).
      if (e instanceof RpcError && e.appError.kind === 'network') {
        const { data } = await supabase.auth.getSession();
        const raw = safeGet(CONTEXTS_KEY);
        const cached = raw ? (JSON.parse(raw) as MyContexts) : null;
        if (cached && cached.user_id === data.session?.user.id) {
          setContexts(cached);
          return cached;
        }
      }
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      userRef.current = data.session?.user.id ?? null;
      if (data.session) {
        const c = await refreshContexts();
        setStatus(c ? 'ready' : 'error');
      } else setStatus('signed_out');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT' || !s) {
        userRef.current = null;
        setContexts(null);
        setStatus('signed_out');
      } else if (event === 'SIGNED_IN' && userRef.current !== s.user.id) {
        // Supabase repite SIGNED_IN al volver a la pestaña: solo recargar si cambió la cuenta.
        userRef.current = s.user.id;
        setStatus('loading');
        void refreshContexts().then((c) => setStatus(c ? 'ready' : 'error'));
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [refreshContexts]);

  const setOperator = useCallback((op: Operator | null) => {
    setOperatorState(op);
    safeSet(OPERATOR_KEY, op ? JSON.stringify(op) : null);
  }, []);

  // Expira el operador al vencer su sesión.
  useEffect(() => {
    if (!operator) return;
    const ms = new Date(operator.expires_at).getTime() - Date.now();
    const t = setTimeout(() => setOperator(null), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [operator, setOperator]);

  const device = contexts?.device ?? null;
  const staff = useMemo(() => {
    if (!contexts || device) return null;
    const list = contexts.staff;
    return list.find((s) => s.restaurant_id === activeId) ?? (list.length === 1 ? list[0] : null);
  }, [contexts, device, activeId]);

  const restaurant: ActiveRestaurant | null = useMemo(() => {
    const src = device ?? staff;
    if (!src) return null;
    return {
      id: src.restaurant_id, name: src.restaurant_name, timezone: src.timezone, currency: src.currency,
      settings: src.settings ?? {}, is_demo: src.is_demo,
    };
  }, [device, staff]);

  const actor: Actor | null = useMemo(() => {
    if (device) {
      return operator ? { staffId: operator.staff_id, name: operator.display_name, permissions: operator.permissions, token: operator.token } : null;
    }
    if (staff) return { staffId: staff.staff_id, name: staff.display_name, permissions: staff.permissions, token: null };
    return null;
  }, [device, operator, staff]);

  const can = useCallback((perm: Permission) => Boolean(actor?.permissions.includes(perm)), [actor]);

  const selectRestaurant = useCallback((id: string | null) => {
    setActiveId(id);
    safeSet(ACTIVE_KEY, id);
  }, []);

  const signOut = useCallback(async () => {
    if (operator) {
      try { await rpc('rpc_device_logout', { p_token: operator.token }); } catch { /* sin red: expira solo */ }
    }
    setOperator(null);
    safeSet(CONTEXTS_KEY, null);
    try { localStorage.removeItem('prepiq-query-cache'); } catch { /* sin almacenamiento */ }
    await supabase.auth.signOut();
  }, [operator, setOperator]);

  const value: AppState = {
    status, error, session, contexts, refreshContexts, restaurant, staff, device, operator, setOperator, actor, can,
    selectRestaurant, signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fuera de SessionProvider');
  return v;
}

/** Restaurante activo (lanza si no hay; usar dentro de rutas protegidas). */
export function useRestaurant(): ActiveRestaurant {
  const { restaurant } = useApp();
  if (!restaurant) throw new Error('Sin restaurante activo');
  return restaurant;
}
