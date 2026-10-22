// Utilidades de fecha/hora en la zona horaria del restaurante (sin
// dependencias): se apoyan en Intl.DateTimeFormat.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('es-MX', { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

interface Parts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

export function zonedParts(date: Date, tz: string): Parts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')) % 24, minute: Number(get('minute')), second: Number(get('second')), weekday: wd,
  };
}

/** Desfase (minutos) de la zona respecto a UTC en un instante. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Convierte fecha y hora "de pared" en la zona del restaurante a un instante UTC. */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Dos pasadas para cubrir cambios de horario.
  let off = tzOffsetMinutes(new Date(guess), tz);
  let ts = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(ts), tz);
  if (off2 !== off) { off = off2; ts = guess - off * 60000; }
  return new Date(ts);
}

export function toDateStr(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function toTimeStr(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Lunes de la semana (YYYY-MM-DD) que contiene la fecha dada, en la zona. */
export function weekStartStr(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  const today = toDateStr(date, tz);
  const delta = (p.weekday + 6) % 7; // lunes = 0
  return addDaysStr(today, -delta);
}

export const formatTime = (iso: string | Date, tz: string) =>
  fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export const formatDateTime = (iso: string | Date, tz: string) =>
  fmt(tz, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export const formatDate = (iso: string | Date, tz: string) =>
  fmt(tz, { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(iso));

export const formatDayLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })
    .format(new Date(Date.UTC(y, m - 1, d)));
};

/** "mm:ss" o "h:mm:ss" a partir de segundos. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}

export function minutesBetween(a: string | Date, b: string | Date): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}
