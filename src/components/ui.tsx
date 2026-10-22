import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';
import {
  createContext, forwardRef, useCallback, useContext, useEffect, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

export const cx = clsx;

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning' | 'dark';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
  warning: 'bg-amber-500 text-black hover:bg-amber-400 focus-visible:ring-amber-400',
  dark: 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-600 focus-visible:ring-slate-400',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  xl: 'h-16 px-6 text-lg gap-3',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...rest}>{children}</div>;
}

export function Badge({ tone = 'slate', className, children }: { tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'orange'; className?: string; children: ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

export function Spinner({ className, label = 'Cargando…' }: { className?: string; label?: string }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 p-6 text-slate-500', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-10 text-center', className)}>
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

const inputCls = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputCls, 'min-h-[80px]', className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cx(inputCls, 'pr-8', className)} {...rest}>{children}</select>;
});

export function Modal({ open, onClose, title, children, footer, size = 'md', dark }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; dark?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl', w,
          dark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={cx('flex items-center justify-between border-b px-5 py-3', dark ? 'border-slate-700' : 'border-slate-200')}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-black/10" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className={cx('flex flex-wrap justify-end gap-2 border-t px-5 py-3', dark ? 'border-slate-700' : 'border-slate-200')}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className, dark }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string; dark?: boolean;
}) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto rounded-xl p-1', dark ? 'bg-slate-800' : 'bg-slate-100', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === t.value ? 'bg-white text-slate-900 shadow-sm' : dark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto rounded-xl border border-slate-200 bg-white', className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cx('bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>{children}</th>
);
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cx('px-3 py-2 align-top text-slate-700', className)}>{children}</td>
);

// ---------------------------------------------------------------------
// Avisos (toasts)
// ---------------------------------------------------------------------
interface Toast { id: number; tone: 'info' | 'success' | 'error' | 'warning'; text: string }
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg', {
            'bg-slate-900 text-white': t.tone === 'info',
            'bg-emerald-600 text-white': t.tone === 'success',
            'bg-red-600 text-white': t.tone === 'error',
            'bg-amber-400 text-black': t.tone === 'warning',
          })}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Confirm({ open, title, children, confirmLabel = 'Confirmar', tone = 'primary', onConfirm, onClose, loading }: {
  open: boolean; title: string; children?: ReactNode; confirmLabel?: string; tone?: Variant; onConfirm: () => void; onClose: () => void; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant={tone} onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}>
      {children}
    </Modal>
  );
}
