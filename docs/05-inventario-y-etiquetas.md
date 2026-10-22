# 5. Inventario por receta y etiquetas

## 5.1 Principio: teórico ≠ contado

- **Existencia teórica** = suma de movimientos (recepciones − consumos por receta − mermas ± ajustes). Es una **estimación** que depende de que las recetas y los registros sean correctos.
- **Existencia contada** = conteo físico. Es la referencia real.
- PrepIQ **nunca** presenta el teórico como exacto: la interfaz dice "teórico", los niveles bajos dicen "Revisar" y los reportes muestran la **diferencia** entre teórico y contado.

## 5.2 Cuándo se descuenta, cuándo se revierte

| Evento | Movimiento | Clave de no‑duplicado |
|---|---|---|
| Línea **enviada a cocina** | `consumo_venta` por insumo de la receta activa (× cantidad) ± efectos de modificadores; nunca negativo por insumo | (línea, insumo) |
| Anulada **antes de preparar** | `reverso_venta` (+) | (línea, insumo) |
| Anulada **ya preparada** | `reverso_venta` (+) y `merma` por "anulación preparada" (−) → neto: se consumió | (línea, insumo, tipo) |
| **Reabrir con "se vuelve a preparar"** | `reproceso` (−) | (evento de reapertura, línea, insumo) |
| Reabrir "marcado por error" | Ninguno | — |
| Merma manual (desperdicio, quemado, caída, caducado, devolución, otro) | `merma` con motivo, por insumo o por platillo (expande receta) | operación |
| Consumo interno (comida de personal) | `consumo_interno` | operación |
| Recepción | `recepcion` (+), actualiza costo si se informa | (recepción, línea) |
| Producción de preparado | `produccion_entrada` (+) del preparado; `produccion_consumo` (−) de sus insumos escalados por rendimiento | (lote, insumo) |
| Conteo aprobado | `ajuste_conteo` = contado − teórico **al momento del conteo** | (conteo, insumo) |
| Ajuste manual | `ajuste_manual` ± con nota obligatoria y permiso | operación |

[D] **Decisión propuesta:** descontar al **enviar** (no al marcar listo) porque es cuando la comida queda comprometida; las anulaciones lo corrigen con trazabilidad. No hay "reservas": la disponibilidad se maneja con **86** manual y avisos de nivel teórico. [P] Validar con el piloto si prefieren descontar al marcar listo.

*Probado:* SQL §1, §4, §7, §9 y E2E "pedido → cocina → entrega" (un pastor sin cebolla descuenta tortilla, pastor y cilantro; no cebolla).

## 5.3 Unidades y conversiones

- Unidad base por insumo: **g**, **ml** o **pza**. Se fija al crearlo; no cambia si ya tiene movimientos.
- Unidades estándar convertibles dentro de su dimensión (kg, lb, oz, l, galón, taza, cucharada, docena…).
- **Unidades propias** para cruzar dimensiones o presentaciones: "caja = 24 pza", "paquete = 100 pza", "tortilla = 30 g", "pieza de aguacate = 170 g".
- Se rechazan conversiones incompatibles ("ml" para un insumo en gramos sin unidad propia) y unidades desconocidas. Las fracciones están permitidas; los conteos no pueden ser negativos; los platillos se registran en enteros.

## 5.4 Recetas versionadas

- Cada platillo o preparado tiene una receta con versiones. **Solo una activa**.
- Una versión activa o retirada no se edita: se crea una **nueva versión** (copia), se ajusta y se **activa**. La anterior queda retirada.
- Cada movimiento guarda la versión usada: cambiar una receta **no** reescribe el pasado.
- Preparados (salsas, aguas) exigen **rendimiento** ("rinde 1 kg").
- Reporte de **cobertura**: qué productos se venden sin receta (no descuentan nada).

## 5.5 Conteo físico y conciliación

1. Crear conteo (registra el **momento** del conteo).
2. Capturar por insumo en la unidad que convenga (funciona sin conexión; se envía al reconectar).
3. Enviar → un gerente **aprueba**: el sistema fija el teórico al momento del conteo, calcula diferencia (y su valor si hay costo) y genera un ajuste por insumo. Aprobar dos veces no duplica.
4. Reporte de diferencias por conteo (cantidad, %, valor).

Indicador recomendado para el piloto: **diferencia teórico vs. contado** por insumo crítico (tortilla, proteína) semana a semana. Si es grande y constante → revisar receta (porción real), mermas no registradas o recepciones faltantes.

## 5.6 Etiquetas

**Campos** (configurables por formato): producto, lote, fecha de preparación, caducidad, responsable, cantidad, conservación, alérgenos, notas, marca de **REIMPRESIÓN**.

**Reglas de vida útil:** las define el restaurante por producto y conservación (refrigerado/congelado/ambiente/caliente) con **quién validó, fecha y fuente**. Sin regla, la etiqueta exige caducidad manual u "sin caducidad" explícito. PrepIQ no trae reglas sanitarias; la de la demo dice "EJEMPLO DEMO — sin validar". [P] Política real del restaurante piloto.

**Flujo de impresión:**
1. Registrar → el servidor asigna **lote `AAMMDD-NNN`** (consecutivo por día de negocio).
2. Se abre el diálogo de impresión del navegador con el tamaño del formato (p. ej. 50×30 mm).
3. La persona confirma **"Salió bien"** o **"Falló"** (motivo). Una falla crea incidencia de impresora.
4. **Reimprimir** conserva el mismo lote, enlaza al original y marca "REIMPRESIÓN"; reintentar una fallida no requiere permiso extra; duplicar una ya impresa sí (`labels.reprint`).
5. **Anular / corregir**: la original queda anulada con motivo; la corrección es una etiqueta nueva enlazada.

[P] Impresoras: marca/modelo y tamaño de etiqueta del piloto. Configurar la impresora en el sistema operativo con ese tamaño de papel y probar los formatos antes de abrir.
