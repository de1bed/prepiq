# 11. Plan de piloto

**Objetivo:** demostrar en un restaurante real que el flujo pedido → cocina → entrega funciona en hora pico y con cortes de red, que el equipo lo adopta, y obtener datos reales para decidir inventario, etiquetas y horarios.

[P] Restaurante piloto: **por definir** (ver `13-proxima-accion.md`). Criterios sugeridos para elegirlo: 2–4 estaciones, 40–150 cubiertos por servicio, gerente dispuesto a dar retroalimentación diaria, Wi‑Fi en cocina, sin un KDS que no se pueda apagar.

## Fase A — Preparación (semana 0)
| Tarea | Responsable | Evidencia |
|---|---|---|
| Observar 1 servicio completo (pico y valle) y documentar roles y lenguaje | David | Notas + fotos de comandas actuales |
| Responder preguntas imprescindibles (`13`) | David + gerente | Respuestas escritas |
| Crear proyecto Supabase prod + staging, hosting, dominio | David | URL funcionando |
| Cargar estaciones, menú (CSV), modificadores, personal y PIN | Admin piloto (con apoyo) | Menú visible para meseros |
| Instalar tabletas por estación, pase, terminal/celulares, reloj | Restaurante | Cada dispositivo aprobado y probado |
| Capacitación de 20 min por rol con las guías de `10` | David | Lista de asistencia |
| Prueba en seco: 30 órdenes ficticias con todo el equipo | Todos | Sin tickets perdidos; dudas registradas |

## Fase B — Operación en paralelo (semana 1)
- PrepIQ **junto** al proceso actual (comanda en papel/POS existente), en 2–3 servicios.
- Medir: tickets capturados en PrepIQ vs. comandas reales (deben coincidir), tiempo de aparición en KDS, errores de captura.
- Prueba de **reconexión** (apagar Wi‑Fi 5 min) en un servicio tranquilo.
- Ajustar lenguaje de cocina, tiempos objetivo y modificadores.

## Fase C — Operación principal (semanas 2–3)
- PrepIQ como sistema de cocina principal (con plan B en papel impreso a la mano).
- Activar **inventario** para 10–20 insumos críticos: recetas reales, conteo inicial, mermas diarias, conteo semanal.
- Activar **etiquetas** si la impresora quedó validada.
- Activar **horarios y reloj** si el gerente lo decide.

## Fase D — Revisión (fin de semana 3)
- Reunión con gerente y 2–3 personas del equipo.
- Revisar indicadores (abajo) y lista priorizada de cambios.
- Decisión: continuar, ajustar o detener.

## Indicadores (medidos con PrepIQ; sin cifras inventadas)
| Indicador | Fuente | Para qué |
|---|---|---|
| Tiempo de ciclo por estación (mediana y P90) | Reportes → Cocina | Detectar cuellos de botella |
| % a tiempo vs. objetivo | Reportes / KDS | Meta de equipo |
| Reaperturas por motivo | Reportes | Calidad / errores de captura |
| Anulaciones después de enviar, por motivo | Reportes | Errores de mesero vs. cambios de cliente |
| Faltantes reportados y minutos bloqueados | Reportes / Turno | Prep insuficiente |
| Diferencia teórico vs. contado (insumos críticos) | Inventario → Conteos | Confiabilidad de recetas y mermas |
| Mermas por motivo | Reportes → Mermas | Costo evitable |
| Incidencias de sincronización (operaciones con error) | Panel de sincronización | Calidad de red / errores |
| Adopción: % de órdenes capturadas en PrepIQ | Comparación con comandas | Uso real |

La **línea base** (cómo están hoy) se registra en la semana 0 por observación, no se estima.

## Criterios de salida (piloto aceptado)
1. **0 tickets perdidos** y **0 duplicados** en 3 servicios consecutivos (verificado contra comandas).
2. Reconexión probada en servicio real sin pérdida.
3. El gerente puede explicar cualquier retraso con el historial del ticket.
4. Meseros y cocineros operan sin ayuda tras la semana 1 (observación + encuesta corta).
5. Ningún mesero pudo cambiar configuración (revisión de auditoría).
6. Si se activó inventario: al menos 2 conteos aprobados con diferencias explicadas.
7. El gerente firma la lista de ajustes pendientes y su prioridad.

## Plan B (si algo falla en servicio)
- Si Supabase o internet caen: seguir en PrepIQ (cola local). Si una tableta falla: usar otra tableta o el pase con la estación filtrada.
- Si todo falla: comanda en papel; al restablecer, capturar solo lo pendiente (no recapturar lo ya entregado) y anotar el incidente.
