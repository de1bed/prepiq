const money = new Map<string, Intl.NumberFormat>();

export function formatMoney(n: number, currency = 'MXN'): string {
  let f = money.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2 });
    money.set(currency, f);
  }
  return f.format(n);
}

/** Muestra una cantidad en unidad base de forma legible (g→kg, ml→l). */
export function formatQty(qty: number, baseUnit: string): string {
  const abs = Math.abs(qty);
  const nf = (v: number, d = 2) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: d }).format(v);
  if (baseUnit === 'g' && abs >= 1000) return `${nf(qty / 1000)} kg`;
  if (baseUnit === 'ml' && abs >= 1000) return `${nf(qty / 1000)} l`;
  return `${nf(qty, baseUnit === 'pza' ? 1 : 0)} ${baseUnit}`;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administración', gerente: 'Gerente / responsable de turno', cocinero: 'Cocina', mesero: 'Servicio (mesero)',
};

export const ORDER_TYPE_LABELS: Record<string, string> = {
  mesa: 'Mesa', llevar: 'Para llevar', barra: 'Barra', domicilio: 'Domicilio',
};

export const REOPEN_REASONS: { value: string; label: string }[] = [
  { value: 'error_preparacion', label: 'Error de preparación' },
  { value: 'cliente_devolvio', label: 'El cliente lo devolvió' },
  { value: 'falto_producto', label: 'Faltó un producto' },
  { value: 'marcado_por_error', label: 'Se marcó listo por error' },
  { value: 'cambio_cliente', label: 'Cambio del cliente' },
  { value: 'otro', label: 'Otro' },
];

export const VOID_REASONS: { value: string; label: string }[] = [
  { value: 'error_captura', label: 'Error de captura' },
  { value: 'cliente_cancelo', label: 'El cliente canceló' },
  { value: 'producto_agotado', label: 'Producto agotado' },
  { value: 'demora', label: 'Demora' },
  { value: 'cambio_cliente', label: 'Cambio del cliente' },
  { value: 'cortesia', label: 'Cortesía' },
  { value: 'otro', label: 'Otro' },
];

export const WASTE_REASONS: { value: string; label: string }[] = [
  { value: 'desperdicio', label: 'Desperdicio' },
  { value: 'quemado', label: 'Se quemó' },
  { value: 'caida', label: 'Se cayó' },
  { value: 'caducado', label: 'Caducó' },
  { value: 'devolucion', label: 'Devolución' },
  { value: 'otro', label: 'Otro' },
];

export const MOVEMENT_LABELS: Record<string, string> = {
  inicial: 'Inicial', recepcion: 'Recepción', consumo_venta: 'Consumo por venta', reverso_venta: 'Reverso por anulación',
  merma: 'Merma', reproceso: 'Reproceso', consumo_interno: 'Consumo interno', produccion_entrada: 'Producción (entrada)',
  produccion_consumo: 'Producción (insumos)', ajuste_conteo: 'Ajuste por conteo', ajuste_manual: 'Ajuste manual',
};
