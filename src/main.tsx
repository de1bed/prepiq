import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SessionProvider>
            <SyncProvider>
              <OverrideProvider>
                <App />
              </OverrideProvider>
            </SyncProvider>
          </SessionProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
