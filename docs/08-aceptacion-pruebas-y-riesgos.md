# 8. Criterios de aceptación, pruebas y riesgos pendientes

## 8.1 Criterios críticos → cómo se prueban

| Criterio | Prueba automática | Resultado actual |
|---|---|---|
| **Una orden no se pierde** | E2E "cocina sin conexión"; unitarias de la cola (persistencia tras reinicio, FIFO, reintento); E2E "respuesta perdida" | ✅ |
| **El reintento no duplica** | SQL §1 (mismo `op_id` y `op_id` distinto con mismos ids); E2E "si se pierde la respuesta del servidor…" (el servidor procesa, el dispositivo no recibe respuesta, la cola reintenta: 1 orden, 1 ticket, 1 línea) | ✅ |
| **Tickets no se pierden ni duplican en cocina** | SQL §3 (dos "listo" → un evento); E2E offline (1 evento al reconectar) | ✅ |
| **La reapertura conserva historia** | SQL §4 (motivo obligatorio, actor, contador, eventos completos, borrar historial falla); E2E "reabrir" | ✅ |
| **Historial conserva anulaciones** | SQL §7 (anulación con autorizador, renglón anulado visible, reverso/merma) | ✅ |
| **Un mesero no modifica configuración administrativa** | SQL §6 (insert/update rechazados por RLS, no ve costos/movimientos/contactos, no se sube de rol); E2E "roles" | ✅ |
| **Un conteo físico reconcilia diferencias** | SQL §9 (teórico = contado tras aprobar; aprobar dos veces no duplica; diferencia registrada; cocinera no aprueba) | ✅ |
| **Unidades y recetas coherentes** | SQL §8 (kg→g, unidad propia, taza→ml, incompatibles rechazadas, receta activa no editable); E2E (sin cebolla no descuenta cebolla) | ✅ |
| **Roles separados** | SQL §6, §10 (aislamiento entre restaurantes), §11 (PIN, token, bloqueo) | ✅ |
| Etiquetas trazables | SQL §12; E2E "etiqueta" | ✅ |
| Asistencia confiable | SQL §13 (secuencia, sin conexión dentro de sesión, autoaprobación prohibida, marcas inmutables) | ✅ |
| Horarios sin empalmes / cruce de medianoche | SQL §14; unitarias de zona horaria (CDMX, cambio de horario EE. UU.) | ✅ |
| **Piloto aceptado** | Manual: criterios de salida de `11-plan-piloto.md` | ⏳ |

### Cómo correrlas
```bash
npm run typecheck && npm test && npm run test:db && npm run test:e2e
```
Última ejecución: tipos ✅ · 24 unitarias ✅ · 88 verificaciones SQL ✅ (en Postgres local **y** en las imágenes oficiales `supabase/postgres` 15 y **17** ejecutando como el rol `postgres`, igual que `supabase db push`) · 8 E2E en Chromium ✅ (entorno ligero) / 9 con Realtime.

Además, **9 E2E pasan contra un stack con los servicios reales de Supabase**: imagen oficial de Postgres (con su configuración, WAL lógico), **Auth (GoTrue v2.177)**, **Realtime (v2.57)** y PostgREST — incluida la prueba de tiempo real (el ticket aparece en cocina en ~1–2 s, respetando RLS). Cómo repetirlo:
```bash
WITH_REALTIME=1 dev/real-auth-stack.sh up
E2E_REALTIME=1 E2E_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54330/postgres npx playwright test
dev/real-auth-stack.sh down
```
(En la máquina de construcción no hay IPv6; el script monta una configuración IPv4 para Realtime. En Supabase en la nube no aplica.)

> Lo que aún **no** se ha probado: un proyecto real en la nube (red, límites del plan) y el hardware del restaurante (tabletas, impresora). Ver §8.2.

## 8.2 Pruebas manuales recomendadas antes del piloto

1. **Hora pico simulada:** 3 personas capturando a la vez en 3 dispositivos durante 20 min (≥ 60 tickets/h). Verificar: tiempo de aparición en KDS (< 2 s con tiempo real; < 10 s con sondeo), sin tickets faltantes (comparar órdenes vs. tickets en *Reportes*).
2. **Reconexión:** apagar el Wi‑Fi del router 5 min en pleno servicio; seguir capturando y marcando; encender; verificar que todo llegue una sola vez (panel de sincronización vacío, conteo de tickets coincide).
3. **Reinicio sin internet:** reiniciar una tableta de cocina sin red; debe abrir y mostrar sus últimos tickets.
4. **Reimpresión controlada:** imprimir, declarar falla, reimprimir; intentar duplicar sin permiso (debe pedir gerente).
5. **Restauración de respaldo** en un proyecto de staging (ver `04` §4.4).
6. **Legibilidad a distancia:** ver el KDS a 2–3 m con la luz real de la cocina; ajustar tamaño de pantalla/zoom.

## 8.3 Riesgos pendientes

| Riesgo | Impacto | Mitigación actual | Pendiente |
|---|---|---|---|
| Wi‑Fi de cocina inestable | Retrasos de sincronización | Cola idempotente, optimista, sondeo de respaldo, PWA | Medir en el piloto; evaluar red dedicada/AP para tabletas |
| Recetas imprecisas → teórico inútil | Decisiones erróneas | Etiquetado "teórico", conteos y reporte de diferencias | Cargar porciones reales con el chef; empezar con 10–20 platillos |
| Equipo no registra mermas | Diferencias inexplicables | Registro rápido por platillo ("se cayó un plato") | Rutina de cierre con merma; revisar semanalmente |
| Lenguaje de cocina distinto ("vender", "on sale") | Confusión | Etiquetas configurables | Confirmar con David [P] |
| Impresora de etiquetas no compatible con impresión por navegador | Sin etiquetas | Formatos en mm configurables | Probar la impresora real; si no, fase de impresión directa |
| Tabletas compartidas sin bloqueo | Uso indebido | PIN por persona, sesiones que expiran, auditoría | Modo quiosco del sistema operativo / MDM |
| PIN de 4 dígitos | Adivinación | Límite de intentos y bloqueo, PIN aleatorio, 6 dígitos opcional | Política del restaurante |
| Dependencia de un solo proveedor (Supabase) | Disponibilidad | Postgres estándar; migraciones portables; respaldos externos | Plan con respaldo diario verificado |
| Gamificación mal recibida | Clima laboral | Solo metas de equipo; complejidad; sin ranking | Validar con el equipo en el piloto |
| Cobro/POS no resuelto | Doble captura (POS + PrepIQ) | Cerrar orden sin cobro | Definir flujo [P] |
| Volumen alto (cadena) | Rendimiento | Índices por restaurante/estado; consultas acotadas | Prueba de carga antes de vender a cadenas |
