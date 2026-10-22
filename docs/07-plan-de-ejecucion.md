# 7. Plan de ejecución por etapas

Cada etapa tiene **entregable verificable**, dependencias y responsable propuesto. El orden puede cambiar con evidencia del piloto.

Responsables propuestos: **David** (producto, relación con restaurante, validación en cocina) · **Claude Code** (construcción, pruebas, documentación) · **Restaurante piloto** (gerente y equipo).

| # | Etapa | Estado | Entregable verificable | Depende de | Responsable |
|---|---|---|---|---|---|
| 0 | Definición y prototipo | ✅ Hecho (esta entrega) | Documentos 01–13; app funcional con demo; pruebas automáticas | — | Claude Code |
| 1 | Validar escenarios con un servicio real | ⏳ Siguiente | Notas de observación de 1 servicio (pico y valle), lista de estaciones reales, menú, lenguaje ("vender", "on sale"), respuestas a preguntas de `13` | Restaurante piloto elegido | David |
| 2 | Pedidos, KDS y roles | ✅ Construido · ⏳ validar | Demo con el menú real; prueba de hora pico simulada (≥ 60 tickets/h); prueba de reconexión; aceptación del equipo | 1 | Claude Code + David |
| 3 | Inventario y recetas | ✅ Construido · ⏳ cargar datos reales | Recetas de los 10–20 platillos más vendidos; conteo inicial; 2 semanas de diferencias teórico vs. contado | 2 en operación | Gerente piloto + David |
| 4 | Etiquetas | ✅ Construido · ⏳ validar impresora | Formato probado en la impresora real; reglas de vida útil validadas por el restaurante | Impresora definida | Gerente piloto |
| 5 | Horarios y asistencia | ✅ Construido · ⏳ validar | 2 semanas de horarios publicados y reloj en uso; correcciones aprobadas | 2 | Gerente piloto |
| 6 | Piloto y endurecimiento | ⏳ | Plan `11-plan-piloto.md` ejecutado; criterios de salida cumplidos; lista de ajustes priorizada | 2–5 | David + Claude Code |
| 7 | Integraciones (fase) | Pendiente de evidencia | POS/cobro, impresión directa, delivery — solo las que el piloto justifique | 6 | Por definir |

## Instrucciones por etapa (demo, casos críticos, límites)

**Etapa 2 — Pedidos/KDS**
- Demo: `npm run stack:up && npm run dev` → entrar como `elena@` (mesera) en una ventana y `kds-comal@` (PIN 3333) en otra.
- Casos críticos: orden sin conexión, respuesta perdida, dos cocineros en el mismo ticket, anulación con autorización, reabrir con motivo, cambio después de enviar, tiempos retenidos, faltante.
- Límites conocidos: sin cobro; impresión de comandas en papel no incluida (el KDS la reemplaza); notificación sonora requiere que alguien toque la pantalla una vez (política del navegador).

**Etapa 3 — Inventario**
- Demo: Inventario → Existencias / Registrar / Conteos; Administración → Recetas.
- Casos críticos: anular ya preparado (merma), reproceso, unidades propias, conteo y aprobación, receta nueva versión.
- Límites: teórico depende de recetas; sin órdenes de compra ni proveedores formales; costo por última recepción (no promedio ponderado).

**Etapa 4 — Etiquetas**
- Demo: Etiquetas → Pico de gallo (tiene regla de ejemplo) y un producto sin regla.
- Casos críticos: falla de impresora, reimpresión, corrección.
- Límites: impresión vía navegador; sin códigos QR/barras todavía.

**Etapa 5 — Personal**
- Demo: Horarios (gerente), Mi espacio (cualquier persona), reloj `reloj@` con PIN.
- Casos críticos: turno que cruza medianoche, marca sin conexión, olvido de salida, ausencia, cambio de turno.
- Límites: sin nómina, sin geolocalización, sin notificaciones push.

## Guía rápida de cambios de secuencia

- Si el piloto **ya tiene POS con KDS**, priorizar Etapas 3–5 y tratar PrepIQ como back‑of‑house.
- Si el piloto **no imprime etiquetas** hoy, mover Etapa 4 al final.
- Si **la asistencia ya se lleva en otra herramienta** obligatoria, dejar Etapa 5 como opcional.
