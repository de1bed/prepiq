# PrepIQ

Operación de cocina para restaurantes: **meseros → pantallas de cocina (KDS) → entrega**, con roles separados, historial que no se pierde, funcionamiento sin conexión, **inventario teórico por receta**, **etiquetas trazables** y **horarios/asistencia**. Construido sobre **Supabase** (Postgres + Auth + Realtime) y una app web (React + TypeScript) instalable en tabletas.

> Rama `prepiq-v2`: reconstrucción desde cero. El piloto anterior (rama `main`, Lovable) se usó solo como referencia de producto.

## Qué incluye

| Para | Pantallas |
|---|---|
| Meseros | Órdenes por mesa/llevar/barra, modificadores con reglas, notas, tiempos y asientos, cambios y anulaciones con autorización, avance por estación, entrega |
| Cocina | KDS por estación legible a distancia, cronómetro activo vs. bloqueado, parcial por renglón, faltantes, 86, recientes/reabrir con motivo, bump‑bar, metas de equipo |
| Pase | Órdenes completas por estación, despacho |
| Responsable de turno | Colas, incidencias, 86, jornada, autorizaciones con PIN, conteos, horarios, reportes |
| Administración | Restaurante y lenguaje de cocina, estaciones, menú e importación CSV, insumos y unidades, recetas versionadas, personal y PIN, dispositivos, etiquetas y vida útil, auditoría |
| Todos | Reloj checador con PIN, *Mi espacio* (turnos, asistencia, ausencias, cambios) |

Garantías probadas: una orden no se pierde, el reintento no duplica, la reapertura conserva la historia, un mesero no modifica configuración, un conteo físico reconcilia diferencias, unidades y recetas coherentes, aislamiento entre restaurantes.

## Empezar

```bash
npm install
# Opción A: Supabase CLI (con Docker)
supabase start && cp .env.example .env.local   # pega URL y anon key que imprime
# Opción B: entorno local ligero (Postgres local + PostgREST en Docker)
npm run stack:up
npm run dev
```
Cuentas de demostración (contraseña `demo-prepiq-2026`, **solo local**): `ana@`, `beto@`, `carla@`, `elena@` y dispositivos `kds-parrilla@`, `kds-comal@`, `pase@`, `meseros@`, `reloj@` — dominio `demo.prepiq.test`. PIN: Ana 1111 · Beto 2222 · Carla 3333 · Diego 4444 · Elena 5555 · Fer 6666.

Producción en Supabase: ver [docs/04-arquitectura-y-despliegue.md](docs/04-arquitectura-y-despliegue.md).

## Pruebas

```bash
npm run typecheck   # TypeScript estricto
npm test            # unitarias (cola sin conexión, KDS, zonas horarias, importación)
npm run test:db     # migraciones + 85 verificaciones SQL de criterios críticos
npm run test:e2e    # navegador real (Playwright): 7 flujos de punta a punta
```

## Documentación

1. [Producto: objetivo, usuarios y alcance](docs/01-producto.md) — estado actual vs. visión futura
2. [Flujos, permisos y excepciones](docs/02-flujos-y-permisos.md)
3. [Modelo de datos](docs/03-modelo-de-datos.md)
4. [Arquitectura, seguridad y despliegue](docs/04-arquitectura-y-despliegue.md)
5. [Inventario por receta y etiquetas](docs/05-inventario-y-etiquetas.md)
6. [Personal, horarios y asistencia](docs/06-personal-y-horarios.md)
7. [Plan de ejecución por etapas](docs/07-plan-de-ejecucion.md)
8. [Aceptación, pruebas y riesgos](docs/08-aceptacion-pruebas-y-riesgos.md)
9. [Datos y accesos requeridos](docs/09-datos-y-accesos-requeridos.md)
10. [Guías por rol](docs/10-guias-por-rol.md)
11. [Plan de piloto](docs/11-plan-piloto.md)
12. [Comercialización](docs/12-comercializacion.md)
13. [Próxima acción y preguntas imprescindibles](docs/13-proxima-accion.md)

## Estructura

```
supabase/migrations/   esquema, RLS y funciones (lógica de negocio transaccional e idempotente)
supabase/seed.sql      restaurante DEMO con datos ficticios (solo local)
supabase/tests/        pruebas SQL de criterios críticos
src/                   app web — features/ por módulo, lib/ lógica pura con pruebas
tests/e2e/             pruebas de punta a punta
dev/                   scripts para base local y pasarela tipo Supabase
docs/                  entregables de producto y operación
```
