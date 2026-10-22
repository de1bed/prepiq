import { describe, expect, it } from 'vitest';
import { addDaysStr, clock, toDateStr, toTimeStr, weekStartStr, zonedToUtc } from './time';

describe('zonas horarias', () => {
  it('convierte hora local de Ciudad de México a UTC', () => {
    // CDMX es UTC−6 todo el año (sin horario de verano desde 2022).
    expect(zonedToUtc('2026-10-22', '18:00', 'America/Mexico_City').toISOString()).toBe('2026-10-23T00:00:00.000Z');
  });
  it('maneja cambio de horario en EE. UU.', () => {
    // 1 nov 2026: Los Ángeles pasa de PDT (−7) a PST (−8).
    expect(zonedToUtc('2026-10-31', '12:00', 'America/Los_Angeles').toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(zonedToUtc('2026-11-02', '12:00', 'America/Los_Angeles').toISOString()).toBe('2026-11-02T20:00:00.000Z');
  });
  it('un turno que cruza medianoche conserva su día de inicio', () => {
    const start = zonedToUtc('2026-10-22', '17:00', 'America/Mexico_City');
    const end = new Date(start.getTime() + 8 * 3600_000);
    expect(toDateStr(start, 'America/Mexico_City')).toBe('2026-10-22');
    expect(toDateStr(end, 'America/Mexico_City')).toBe('2026-10-23');
    expect(toTimeStr(end, 'America/Mexico_City')).toBe('01:00');
  });
  it('lunes de la semana', () => {
    expect(weekStartStr(new Date('2026-10-22T18:00:00Z'), 'America/Mexico_City')).toBe('2026-10-19');
    expect(weekStartStr(new Date('2026-10-26T03:00:00Z'), 'America/Mexico_City')).toBe('2026-10-19'); // domingo 25 local
  });
  it('suma días', () => {
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('cronómetro', () => {
    expect(clock(65)).toBe('1:05');
    expect(clock(3725)).toBe('1:02:05');
  });
});
