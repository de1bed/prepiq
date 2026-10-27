export const DEVICE_MODE_LABELS: Record<string, string> = {
  kds: 'Pantalla de cocina',
  expo: 'Pase',
  pos: 'Terminal de meseros',
  kiosko: 'Reloj checador',
};

/** Deja solo letras y números en mayúsculas, máximo 8 (el guion es opcional). */
export function normalizePairingCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Enlace que abre el equipo al escanear el QR. El código va en el fragmento (#), que no se envía al servidor. */
export function pairingUrl(origin: string, code: string): string {
  return `${origin}/vincular#${code}`;
}
