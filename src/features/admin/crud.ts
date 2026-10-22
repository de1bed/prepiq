import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { asAppError } from '@/lib/rpc';
import { toAppError, errorText } from '@/lib/errors';
import { useToast } from '@/components/ui';

/** Escrituras de configuración (protegidas por RLS + auditoría en servidor). */
export function useConfigWrite(invalidate: string[]) {
  const qc = useQueryClient();
  const toast = useToast();
  const done = useCallback(() => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })), [qc, invalidate]);

  const run = useCallback(async (p: PromiseLike<{ error: unknown; status?: number }>, ok?: string): Promise<boolean> => {
    try {
      const res = await p;
      if (res.error) {
        const e = toAppError(res.error, res.status);
        const msg = (res.error as { code?: string }).code === '23505' ? 'Ya existe un registro con ese nombre.'
          : (res.error as { code?: string }).code === '23503' ? 'No se puede borrar: está en uso. Desactívalo en su lugar.'
          : (res.error as { code?: string }).code === '42501' ? 'No tienes permiso para este cambio.'
          : errorText(e);
        toast('error', msg);
        return false;
      }
      if (ok) toast('success', ok);
      done();
      return true;
    } catch (err) {
      toast('error', errorText(asAppError(err)));
      return false;
    }
  }, [toast, done]);

  return {
    insert: (table: string, row: Record<string, unknown> | Record<string, unknown>[], ok = 'Guardado') => run(supabase.from(table).insert(row), ok),
    update: (table: string, id: string, patch: Record<string, unknown>, ok = 'Guardado') => run(supabase.from(table).update(patch).eq('id', id), ok),
    remove: (table: string, id: string, ok = 'Eliminado') => run(supabase.from(table).delete().eq('id', id), ok),
    run,
  };
}
