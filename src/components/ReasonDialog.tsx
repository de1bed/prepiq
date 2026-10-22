import { useEffect, useState, type ReactNode } from 'react';
import { Button, Field, Modal, Textarea, cx } from './ui';

/** Selección de motivo (obligatoria) con nota opcional, botones grandes. */
export function ReasonDialog({ open, onClose, title, reasons, onSubmit, confirmLabel = 'Confirmar', tone = 'danger', extra, noteRequired, dark, freeText }: {
  open: boolean;
  onClose: () => void;
  title: string;
  reasons: { value: string; label: string }[];
  onSubmit: (reason: string, note: string) => void;
  confirmLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
  extra?: ReactNode;
  noteRequired?: boolean;
  dark?: boolean;
  /** Si es true, el "motivo" es texto libre (p. ej. qué falta). */
  freeText?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setReason(''); setNote(''); } }, [open]);
  const valid = (freeText ? note.trim().length > 0 : !!reason) && (!noteRequired || note.trim().length > 0);
  return (
    <Modal open={open} onClose={onClose} title={title} dark={dark}
      footer={<>
        <Button variant={dark ? 'dark' : 'secondary'} onClick={onClose}>Cancelar</Button>
        <Button variant={tone} disabled={!valid} onClick={() => onSubmit(freeText ? note.trim() : reason, note.trim())} data-testid="reason-confirm">{confirmLabel}</Button>
      </>}>
      {!freeText && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {reasons.map((r) => (
            <button key={r.value} type="button" onClick={() => setReason(r.value)}
              className={cx('rounded-xl border-2 p-3 text-left text-sm font-semibold transition',
                reason === r.value ? 'border-brand-500 bg-brand-500/10' : dark ? 'border-slate-700 hover:border-slate-500' : 'border-slate-200 hover:border-slate-400')}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {freeText && reasons.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button key={r.value} type="button" onClick={() => setNote(r.label)}
              className={cx('rounded-full border px-3 py-1 text-sm', dark ? 'border-slate-600 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100')}>{r.label}</button>
          ))}
        </div>
      )}
      {extra}
      <Field label={freeText ? '¿Qué pasa?' : noteRequired ? 'Nota (obligatoria)' : 'Nota (opcional)'}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} className={dark ? 'border-slate-600 bg-slate-800 text-white' : ''} maxLength={300} />
      </Field>
    </Modal>
  );
}
