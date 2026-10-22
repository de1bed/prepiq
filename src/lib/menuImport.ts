// Importación controlada de menú desde CSV: se valida todo antes de escribir.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  const delim = (src.split('\n')[0].match(/;/g)?.length ?? 0) > (src.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

export interface ImportRow {
  line: number;
  category: string;
  name: string;
  price: number;
  stations: string[];
  prep_minutes: number;
  complexity: number;
  kitchen_name: string | null;
  errors: string[];
  duplicate: boolean;
}

const HEADERS: Record<string, keyof ImportRow | 'estacion'> = {
  categoria: 'category', 'categoría': 'category', nombre: 'name', producto: 'name', precio: 'price',
  estacion: 'estacion', 'estación': 'estacion', estaciones: 'estacion', tiempo_min: 'prep_minutes', tiempo: 'prep_minutes',
  complejidad: 'complexity', nombre_cocina: 'kitchen_name',
};

export function validateMenuCsv(text: string, stationNames: string[], existingNames: string[]): { rows: ImportRow[]; headerError: string | null } {
  const data = parseCsv(text);
  if (data.length < 2) return { rows: [], headerError: 'El archivo necesita encabezados y al menos una fila.' };
  const header = data[0].map((h) => HEADERS[h.toLowerCase().replace(/\s+/g, '_')] ?? null);
  for (const req of ['name', 'price', 'estacion']) {
    if (!header.includes(req as never)) return { rows: [], headerError: `Falta la columna obligatoria "${req === 'name' ? 'nombre' : req === 'price' ? 'precio' : 'estacion'}".` };
  }
  const stationsLower = new Map(stationNames.map((s) => [s.toLowerCase(), s]));
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const rows = data.slice(1).map((cells, idx) => {
    const get = (k: string) => { const i = header.indexOf(k as never); return i >= 0 ? cells[i] ?? '' : ''; };
    const errors: string[] = [];
    const name = get('name');
    const priceRaw = get('price').replace(/[$\s]/g, '').replace(',', '.');
    const price = Number(priceRaw);
    const stationsRaw = get('estacion').split(/[|/]/).map((s) => s.trim()).filter(Boolean);
    const stations = stationsRaw.map((s) => stationsLower.get(s.toLowerCase()) ?? s);
    const prep = get('prep_minutes') ? Number(get('prep_minutes')) : 10;
    const complexity = get('complexity') ? Number(get('complexity')) : 1;
    if (!name) errors.push('Sin nombre');
    if (name.length > 80) errors.push('Nombre muy largo (máx. 80)');
    if (!priceRaw || Number.isNaN(price) || price < 0) errors.push('Precio no válido');
    if (stations.length === 0) errors.push('Sin estación');
    stationsRaw.forEach((s) => { if (!stationsLower.has(s.toLowerCase())) errors.push(`Estación "${s}" no existe`); });
    if (!Number.isInteger(prep) || prep < 1 || prep > 240) errors.push('Tiempo debe ser 1–240 min');
    if (!Number.isInteger(complexity) || complexity < 1 || complexity > 5) errors.push('Complejidad debe ser 1–5');
    const key = name.toLowerCase();
    if (seen.has(key)) errors.push('Repetido en el archivo');
    seen.add(key);
    return {
      line: idx + 2, category: get('category'), name, price, stations, prep_minutes: prep, complexity,
      kitchen_name: get('kitchen_name') || null, errors, duplicate: existing.has(key),
    };
  });
  return { rows, headerError: null };
}
