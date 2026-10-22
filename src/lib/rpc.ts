import { supabase } from './supabase';
import { toAppError, type AppError } from './errors';

export class RpcError extends Error {
  constructor(public readonly appError: AppError) {
    super(appError.message);
  }
}

/** Llama una RPC y lanza RpcError (con clasificación) si falla. */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  let res;
  try {
    res = await supabase.rpc(name, args);
  } catch (err) {
    throw new RpcError(toAppError(err, 0));
  }
  if (res.error) throw new RpcError(toAppError(res.error, res.status));
  return res.data as T;
}

export function asAppError(err: unknown): AppError {
  if (err instanceof RpcError) return err.appError;
  return toAppError(err);
}

/** Lectura con manejo de error uniforme. */
export async function read<T>(query: PromiseLike<{ data: T | null; error: unknown; status?: number }>): Promise<T> {
  let res;
  try {
    res = await query;
  } catch (err) {
    throw new RpcError(toAppError(err, 0));
  }
  if (res.error) throw new RpcError(toAppError(res.error, res.status));
  return (res.data ?? ([] as unknown)) as T;
}
