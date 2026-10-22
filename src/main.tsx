import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { App } from './App';
import { SessionProvider } from './state/session';
import { SyncProvider } from './state/sync';
import { ToastProvider } from './components/ui';
import { OverrideProvider } from './components/Pin';
import { RpcError } from './lib/rpc';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Sin conexión se conservan los datos ya cargados (la cocina sigue viendo sus tickets).
      networkMode: 'always',
      retry: (count, err) => (err instanceof RpcError && err.appError.kind === 'business' ? false : count < 2),
      refetchOnWindowFocus: true,
      staleTime: 5_000,
    },
  },
});

// Los datos de servicio se guardan en el dispositivo: si la tableta se
// reinicia sin internet, vuelve a mostrar lo último que sabía.
const PERSISTED = new Set(['menu', 'stations', 'tickets', 'orders', 'staff', 'ingredients', 'service-day', 'team-stats', 'incidents']);
const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'prepiq-query-cache',
  throttleTime: 2000,
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PersistQueryClientProvider client={queryClient} persistOptions={{
        persister, maxAge: 24 * 3600_000, buster: 'v1',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])) },
      }}>
        <ToastProvider>
          <SessionProvider>
            <SyncProvider>
              <OverrideProvider>
                <App />
              </OverrideProvider>
            </SyncProvider>
          </SessionProvider>
        </ToastProvider>
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
