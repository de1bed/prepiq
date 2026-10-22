// Clasificación y traducción de errores.
// * Errores de negocio (código P0001 con mensaje = código estable): no se
//   reintentan; se muestran al usuario.
// * Errores de red o del servidor (sin respuesta, 5xx, 408, 429): se
//   reintentan automáticamente desde la cola.

export interface AppError {
  kind: 'business' | 'network' | 'auth';
  code: string;
  message: string;
  detail?: string;
  hint?: string;
}

const MESSAGES: Record<string, string> = {
  no_autenticado: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  sin_acceso_restaurante: 'No tienes acceso a este restaurante.',
  operador_requerido: 'Identifícate con tu PIN en este dispositivo.',
  sesion_operador_expirada: 'Tu sesión en este dispositivo terminó. Ingresa tu PIN otra vez.',
  permiso_denegado: 'No tienes permiso para esta acción.',
  autorizacion_invalida: 'La autorización expiró o ya se usó.',
  pin_invalido: 'El PIN debe tener de 4 a 6 dígitos.',
  pin_incorrecto: 'PIN incorrecto.',
  pin_bloqueado: 'Demasiados intentos de PIN. Espera 10 minutos.',
  pin_no_disponible: 'Ese PIN no está disponible.',
  op_id_reutilizado: 'Operación duplicada con datos distintos.',
  jornada_cerrada: 'La jornada está cerrada.',
  sin_jornada_abierta: 'No hay jornada abierta.',
  jornada_con_pendientes: 'Hay pendientes en la jornada.',
  orden_no_encontrada: 'No se encontró la orden.',
  orden_no_abierta: 'La orden ya no está abierta.',
  orden_de_otro_mesero: 'La orden es de otro mesero.',
  orden_con_lineas_sin_enviar: 'Hay productos sin enviar a cocina.',
  orden_con_tickets_activos: 'Hay platillos sin entregar.',
  producto_no_existe: 'El producto ya no existe en el menú.',
  producto_agotado: 'Producto agotado (86).',
  producto_sin_estacion: 'El producto no tiene estación asignada.',
  modificador_invalido: 'Modificador no válido para este producto.',
  modificador_agotado: 'Modificador agotado.',
  modificadores_fuera_de_rango: 'Revisa las opciones obligatorias del producto.',
  ticket_no_encontrado: 'No se encontró el ticket.',
  ticket_anulado: 'El ticket fue anulado.',
  ticket_en_espera: 'El ticket está en espera; primero hay que marcharlo.',
  ticket_no_listo: 'Solo se entrega un ticket listo.',
  ticket_no_reabrible: 'Ese ticket no se puede reabrir.',
  ticket_no_bloqueable: 'Ese ticket no se puede marcar con faltante.',
  ticket_no_editable: 'El ticket ya no se puede modificar.',
  motivo_requerido: 'Indica el motivo.',
  nota_requerida: 'Agrega una nota.',
  linea_no_encontrada: 'No se encontró la línea.',
  unidad_incompatible: 'La unidad no es compatible con el insumo.',
  unidad_desconocida: 'Unidad desconocida para este insumo.',
  unidad_base_bloqueada: 'La unidad base no se puede cambiar: el insumo ya tiene movimientos.',
  version_no_editable: 'Esa versión de receta ya no se puede editar. Crea una nueva versión.',
  receta_vacia: 'La receta no tiene insumos.',
  receta_sin_rendimiento: 'Indica cuánto rinde la receta.',
  receta_circular: 'Un preparado no puede ser insumo de sí mismo.',
  cantidad_invalida: 'Cantidad no válida.',
  conteo_cerrado: 'El conteo ya no está abierto.',
  conteo_vacio: 'El conteo no tiene líneas.',
  transicion_invalida: 'Esa acción no aplica en el estado actual.',
  no_es_preparado: 'Ese insumo no es un preparado.',
  producto_sin_receta: 'El producto no tiene receta activa.',
  caducidad_requerida: 'No hay regla de vida útil validada: captura la caducidad.',
  etiqueta_anulada: 'La etiqueta está anulada.',
  ya_hay_entrada: 'Ya tienes una entrada registrada.',
  secuencia_invalida: 'Esa marca no corresponde a tu estado actual.',
  marcar_solo_en_kiosko: 'Registra tu asistencia en el reloj del restaurante.',
  hora_fuera_de_rango: 'La hora del dispositivo está fuera de rango.',
  autoaprobacion_no_permitida: 'Otra persona debe aprobar tu solicitud.',
  turno_empalmado: 'La persona ya tiene un turno en ese horario.',
  codigo_invalido: 'Código de restaurante no válido.',
  ya_vinculado: 'Esta cuenta ya está vinculada.',
  restaurante_inconsistente: 'Datos de otro restaurante.',
  no_puedes_cambiar_tus_roles: 'No puedes cambiar tus propios roles.',
  vinculacion_por_solicitud: 'Las cuentas se vinculan aprobando una solicitud de unión.',
  zona_horaria_invalida: 'Zona horaria no válida.',
  falta_aceptacion: 'Un compañero debe aceptar el cambio primero.',
  solicitud_ya_resuelta: 'La solicitud ya fue resuelta.',
};

const NETWORK_PATTERNS = [/failed to fetch/i, /networkerror/i, /network request failed/i, /load failed/i, /fetch failed/i, /timeout/i, /aborted/i];

interface RawError { message?: string; code?: string; details?: string; hint?: string; status?: number }

export function toAppError(err: unknown, status?: number): AppError {
  const e = (err ?? {}) as RawError;
  const message = String(e.message ?? err ?? 'Error desconocido');
  if (NETWORK_PATTERNS.some((p) => p.test(message)) || (status !== undefined && (status === 0 || status >= 500 || status === 408 || status === 429))) {
    return { kind: 'network', code: 'red', message: 'Sin conexión con el servidor.' };
  }
  if (e.code === 'PGRST301' || /jwt expired/i.test(message) || status === 401) {
    return { kind: 'auth', code: 'no_autenticado', message: MESSAGES.no_autenticado };
  }
  const code = e.code === 'P0001' ? message : (e.code ?? 'error');
  const human = MESSAGES[code] ?? (e.code === 'P0001' ? code.replace(/_/g, ' ') : message);
  return {
    kind: 'business',
    code,
    message: human,
    detail: e.details || undefined,
    hint: e.hint || undefined,
  };
}

export function errorText(e: AppError): string {
  return [e.message, e.hint, e.detail && e.detail !== e.hint ? `(${e.detail})` : ''].filter(Boolean).join(' ');
}

export function messageForCode(code: string): string {
  return MESSAGES[code] ?? code.replace(/_/g, ' ');
}
