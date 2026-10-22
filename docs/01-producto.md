# 1. Producto: objetivo, usuarios y alcance

> Convención de este documento:
> **[H] Hecho confirmado** (lo dijo David o está en el piloto anterior) ·
> **[D] Decisión propuesta** (la tomé para poder construir; se puede cambiar) ·
> **[P] Pregunta pendiente** (bloquea o condiciona algo; ver `13-proxima-accion.md`).

## 1.1 Objetivo

Unificar en una sola experiencia la operación de cocina de un restaurante: **comandas del mesero → pantallas de cocina (KDS) → entrega**, con **roles separados**, **historial que no se pierde**, **inventario teórico por receta**, **etiquetas trazables** y **turnos/asistencia**, funcionando en hora pico y con cortes de internet.

- [H] Producto 3 del ecosistema de David Rocha, inspirado en experiencia real de cocina. Reconstrucción desde cero; el repositorio anterior (`main` de `de1bed/prepiq`, hecho en Lovable) se usó **solo como referencia de intención**.
- [H] Del piloto anterior se conservaron las ideas: estaciones (parrilla, freidora, etc.), jornada diaria, menú del día/disponibilidad, recetas con sub‑recetas (prep), reloj checador por número/PIN, vista de cocina por estación, captura del mesero.
- [D] No se reutilizó código del piloto. Motivos observados: datos simulados mezclados con datos reales (`mockData`), permisos sin RLS fino, órdenes sin idempotencia, sin historial de transiciones.

## 1.2 Personas (usuarios) y qué hace cada una

| Persona | Qué hace en PrepIQ | Qué **no** debe ver/hacer |
|---|---|---|
| **Mesero** | Captura órdenes (cantidad, modificadores, notas, tiempo, asiento, mesa o referencia), envía a cocina, ve el avance por estación, entrega, cierra. Puede anular lo **no enviado**. | Costos, inventario, reportes, asistencia ajena, contactos, configuración. No anula lo ya enviado sin autorización de gerente. |
| **Cocinero** | Ve tickets de su estación, inicia, marca listo (todo o por renglón), reporta faltante, reabre con motivo, marca 86, registra mermas, producción y conteos, imprime etiquetas, consulta recetas. | Costos, reportes, configuración, datos personales ajenos. No aprueba conteos ni da prioridad sin gerente. |
| **Responsable de turno (gerente)** | Supervisa colas por estación, incidencias, 86, abre/cierra jornada, autoriza anulaciones/prioridades con su PIN, aprueba conteos, horarios, ausencias, cambios de turno y correcciones de asistencia, ve reportes. | Configuración del restaurante, menú, personal y dispositivos (eso es de administración). No se aprueba a sí mismo. |
| **Administrador** | Todo lo anterior + restaurante, estaciones, menú, importación, insumos, recetas versionadas, personal y PIN, dispositivos, etiquetas y vida útil, auditoría. | No puede cambiar sus propios roles (solo el propietario de la organización). |
| **Dispositivo compartido** (tableta de cocina, pase, terminal de meseros, reloj) | Cuenta propia vinculada al restaurante; cada persona se identifica con **PIN** y queda registrada como actor. | Sin PIN no puede operar. |

- [D] **Una persona puede tener varios roles** (p. ej. Fer: mesero y cocinero). Los permisos son la unión de sus roles.
- [D] Quien solo usa dispositivos compartidos **no necesita cuenta**: basta su PIN.
- [D] El **propietario** (quien crea la organización) es administrador de todos sus restaurantes.

## 1.3 Compradores y canal (ver `12-comercializacion.md`)

Usuario ≠ comprador ≠ decisor ≠ distribuidor. En un restaurante independiente suelen coincidir dueño (comprador y decisor) y gerente (usuario intensivo). En cadenas, el decisor puede ser operaciones/TI. **Foodstock es una opción de canal, no un socio ni un cliente** [H].

## 1.4 Alcance — estado actual (lo que ya está construido y probado)

| Módulo | Estado | Notas |
|---|---|---|
| Multi‑restaurante con aislamiento de datos | ✅ | RLS por restaurante; probado (otro restaurante no ve nada). |
| Personas, roles, permisos, PIN, autorización de gerente | ✅ | PIN cifrado (HMAC), 5 intentos / 10 min, autorización de un solo uso. |
| Dispositivos compartidos y solicitudes con código | ✅ | Alta sin llaves de servicio: código del restaurante + aprobación. |
| Mesero: órdenes, modificadores (mín./máx.), notas, tiempos, asientos, cambios, anulaciones | ✅ | Borrador guardado en el dispositivo; envío idempotente. |
| KDS por estación + pase (expo) | ✅ | Estados con texto, cronómetro activo vs. bloqueado, parcial por renglón, recientes/reabrir, 86, faltantes, prioridad autorizada, bump‑bar (teclas 1–9, Enter). |
| Sin conexión y reconexión | ✅ | Cola persistente idempotente, optimista en KDS, aviso permanente, sondeo de respaldo, app abre sin internet (service worker). |
| Inventario teórico por receta | ✅ | Unidades y conversiones, recetas versionadas, modificadores con efecto, consumo al enviar, reverso/merma al anular, reproceso al reabrir, recepción, merma, producción, conteo físico y conciliación. |
| Etiquetas | ✅ | Formatos, reglas de vida útil **validadas por el restaurante**, lote, confirmación de impresión, falla de impresora, reimpresión y corrección trazables. |
| Horarios y asistencia | ✅ | Semana, borrador/publicado, copiar semana, turnos que cruzan medianoche, ausencias, cambios entre compañeros, reloj con PIN, correcciones con aprobación. Sin nómina. |
| Reportes | ✅ | Ciclo, espera, a tiempo vs. objetivo, reaperturas y anulaciones con motivo, faltantes, mermas, cobertura de recetas, diferencias de conteo. |
| Auditoría | ✅ | Cambios de configuración (antes/después, quién, cuándo); historial de tickets y movimientos inmutable. |
| Importación controlada de menú (CSV) | ✅ | Vista previa con errores; no sobrescribe existentes. |

## 1.5 Visión futura (no construido; requiere evidencia del piloto)

- Integración con POS/caja y cobro [P: ¿qué POS usa el piloto? ¿se necesita cobrar dentro de PrepIQ?].
- Impresión directa a impresoras térmicas de comandas/etiquetas (ESC/POS, ZPL) vía agente local. Hoy: impresión por navegador [D].
- Pedidos de plataformas de delivery.
- Pronóstico de producción (prep) por ventas históricas.
- Nómina / exportación a nómina (fuera de alcance explícito) [H].
- Multisitio avanzado (inventario central, transferencias entre sucursales) [P: alcance multisitio definitivo].
- App nativa / modo quiosco gestionado (MDM).

## 1.6 Condiciones que el producto respeta

- [H] No vender el inventario teórico como conteo físico exacto → la interfaz siempre dice **"teórico"** y el conteo es la referencia.
- [H] Gamificación sin incentivar errores ni competencia injusta → **metas de equipo** (% a tiempo vs. meta configurable), puntos de **complejidad**, reprocesos visibles; **no hay ranking individual**.
- [H] No inventar reglas sanitarias ni vidas útiles → el restaurante las captura con "validó / fecha / fuente".
- [H] No declarar integraciones POS, pagos o impresoras no validadas.
- [D] Datos de demostración claramente marcados ("Restaurante de demostración · datos ficticios").
