import { Component, type ReactNode } from 'react';

/**
 * Si una pantalla falla, en lugar de quedar en blanco en plena operación se
 * ofrece recargar. La cola de operaciones vive en IndexedDB: no se pierde.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('PrepIQ: error de interfaz', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-white">
        <h1 className="text-2xl font-bold">Algo falló en esta pantalla</h1>
        <p className="max-w-md text-slate-300">
          Tus acciones pendientes están guardadas en este dispositivo y se enviarán al recargar.
        </p>
        <button className="rounded-xl bg-orange-600 px-6 py-3 text-lg font-bold" onClick={() => window.location.reload()}>
          Recargar
        </button>
        <code className="max-w-lg break-words text-xs text-slate-500">{this.state.error.message}</code>
      </div>
    );
  }
}
