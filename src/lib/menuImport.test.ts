import { describe, expect, it } from 'vitest';
import { parseCsv, validateMenuCsv } from './menuImport';

describe('parseCsv', () => {
  it('maneja comillas, comas internas y punto y coma', () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([['a', 'b'], ['x, y', '2']]);
    expect(parseCsv('a;b\r\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\n"di ""hola"""')).toEqual([['a'], ['di "hola"']]);
  });
});

describe('validateMenuCsv', () => {
  const csv = `categoria,nombre,precio,estacion,tiempo_min
Tacos,Pastor,75,Comal,6
Tacos,Hamburguesa,"145,50",Parrilla|Freidora,12
,Sin precio,,Comal,
Bebidas,Agua,30,Cocina fría,2
Tacos,Pastor,75,Comal,6`;
  const { rows, headerError } = validateMenuCsv(csv, ['Comal', 'Parrilla', 'Freidora'], ['Agua']);
  it('valida filas y estaciones', () => {
    expect(headerError).toBeNull();
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].stations).toEqual(['Parrilla', 'Freidora']);
    expect(rows[1].price).toBe(145.5);
    expect(rows[2].errors).toContain('Precio no válido');
    expect(rows[3].errors).toContain('Estación "Cocina fría" no existe');
    expect(rows[3].duplicate).toBe(true);
    expect(rows[4].errors).toContain('Repetido en el archivo');
  });
  it('exige columnas obligatorias', () => {
    expect(validateMenuCsv('nombre,precio\nA,1', [], []).headerError).toMatch(/estacion/);
  });
});
