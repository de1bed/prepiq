# 10. Guías por rol

Guías cortas para imprimir y pegar junto a cada equipo.

---

## 🍽️ Mesero

**Entrar:** con tu cuenta en tu celular, o en la terminal de meseros con tu **PIN**.

**Tomar una orden**
1. *Meseros → Nueva orden*. Elige **Mesa / Para llevar / Barra / Domicilio** y escribe la mesa o el nombre.
2. Toca los productos. Si tiene opciones obligatorias (p. ej. tortilla), elige antes de **Agregar**. Puedes poner cantidad, nota para cocina, **tiempo** (1, 2, 3) y asiento.
3. Revisa la lista *Sin enviar* y toca **Enviar a cocina**.
   - ¿Hay entradas y platos fuertes? **Enviar tiempo 1 y retener el resto**; cuando la mesa esté lista: **Marchar siguiente tiempo**.
4. Lo que capturas se guarda en el teléfono aunque se vaya la señal. Si no hay internet verás **"Por sincronizar"**: se enviará solo.

**Seguir la orden:** cada estación muestra *En cola → Preparando → Listo*. Cuando esté **Listo**, toca **Entregar**.

**Cambios**
- Antes de enviar: edita o quita libremente.
- Ya enviado: **Cambiar** (se anula y se manda de nuevo marcado *CAMBIO*) o **Anular** con motivo. Ambos piden **autorización de un gerente** (su PIN).
- **Cerrar** cuando la mesa terminó (el cobro se hace en caja).

**Si algo sale mal:** toca el indicador de arriba (verde/rojo) para ver qué está pendiente o con error.

---

## 👩‍🍳 Cocinero (pantalla de cocina)

**Entrar:** escribe tu **PIN** en la tableta de tu estación. Al irte, toca el ícono de salida junto a tu nombre.

**Leer un ticket**
- Arriba: **#número**, mesa y **cronómetro**. El color y el texto avisan: *A tiempo* → *Atención* → *Tarde*.
- Etiquetas: **PRIORIDAD**, **Tiempo 2**, **Reabierto**, **Faltante**, **CAMBIO**. Los "SIN …" salen en rojo; las notas en amarillo.

**Trabajar**
- **Iniciar** cuando empiezas (opcional, mide la espera).
- Toca un renglón cuando esa parte esté lista (parcial).
- **Listo** cuando todo el ticket esté terminado. Desaparece de tu cola.
- Con teclado/bump‑bar: `1–9` elige, `Enter` = listo, `I` = iniciar, `R` = recientes.

**Problemas**
- Falta algo → **⋯ → Reportar faltante** (escribe qué falta). El cronómetro deja de contar ese tiempo y el gerente recibe la incidencia. Cuando llegue: **Ya llegó lo que faltaba**.
- Se acabó un producto → **86** y márcalo. Los meseros ya no podrán pedirlo.
- Marcaste listo por error o hay que rehacer → **Recientes → Reabrir**, elige el motivo y si **se vuelve a preparar**.
- Equipo descompuesto, impresora, etc. → **Incidencia**.

**Sin internet:** sigue trabajando. Verás "Sincronizando" en los tickets que tocaste; al volver la red se envía todo una sola vez.

**Inventario y etiquetas (si tu rol lo permite):** registra mermas ("se quemó", "se cayó"), producción de preparados y conteos en *Inventario*; imprime etiquetas en *Etiquetas* y confirma si salieron bien.

**Metas:** el encabezado muestra el **% del equipo a tiempo** vs. la meta. Es del equipo, no individual.

---

## 🧑‍💼 Responsable de turno (gerente)

**Al abrir:** *Turno* → revisa jornada (se abre sola con la primera orden si así está configurado), incidencias abiertas y existencias por revisar.

**Durante el servicio**
- *Turno*: colas por estación (en cola, preparando, listos, tarde, faltantes, carga). Toca una estación para ver su pantalla.
- **Autorizar** con tu PIN cuando un mesero o cocinero lo pida (anular enviado, prioridad, reimpresión, ajustes). Queda registrado que tú autorizaste.
- **86**: desde *Turno → Disponibilidad*.
- **Incidencias**: *Atender* y *Resolver* (escribe cómo se resolvió).
- **Pase**: despacha órdenes completas cuando todas sus estaciones están listas.

**Al cerrar**
- Revisa que no queden tickets/órdenes abiertas; **Cerrar jornada** (si quedan pendientes, escribe una nota).
- Registra mermas del día. Una vez por semana: **conteo físico** de insumos críticos y **aprobar** (genera los ajustes y el reporte de diferencias).

**Personal:** *Horarios* → arma la semana (o copia la anterior), **Publicar**; atiende *Solicitudes* (ausencias, cambios, correcciones). *Asistencia* → revisa marcas "sin conexión" o sin salida.

**Reportes:** ciclo, a tiempo, reaperturas y anulaciones con motivo, faltantes, mermas, cobertura de recetas.

---

## 🛠️ Administrador

**Primera configuración (en este orden)**
1. *Administración → Restaurante*: zona horaria, hora de corte del día, moneda, meta del equipo, umbrales del KDS, **lenguaje de cocina**, código para unirse.
2. *Estaciones*.
3. *Menú* (o *Importar menú* desde CSV con vista previa): productos, a qué estación(es) van, tiempo objetivo, complejidad, modificadores.
4. *Insumos*: unidad base (g/ml/pza), unidades propias (caja, paquete…), nivel de referencia, costo.
5. *Recetas*: una por platillo y por preparado; **Activar** la versión. Para cambiar: **Nueva versión**. *Efecto de modificadores* ("extra queso" suma, "sin cebolla" resta).
6. *Personal*: agrega personas y roles; genera **PIN** (se muestra una sola vez; entrégalo en persona). Aprueba solicitudes de cuentas.
7. *Dispositivos*: aprueba cada tableta/terminal/reloj y elige modo y estación.
8. *Etiquetas*: formatos (mm y campos) y **reglas de vida útil validadas** (quién y cuándo).

**Control:** *Auditoría* muestra quién cambió qué y cuándo (antes/después).

**Buenas prácticas:** desactiva en lugar de borrar; rota el código de unión si se filtró; quita el PIN a quien deja el restaurante y desactívalo.

---

## 📟 Dispositivos (instalación)
1. Crea un correo para el equipo (p. ej. `cocina-parrilla@turestaurante.com`).
2. En la tableta abre la app, crea la cuenta y elige **Unirme con código → Es un dispositivo**.
3. El administrador lo aprueba y elige modo (Cocina/Pase/Meseros/Reloj) y estación.
4. "Agregar a pantalla de inicio" y modo pantalla completa/quiosco. Brillo alto, sin bloqueo automático de pantalla durante el servicio.
5. No borres los datos del navegador de la tableta (ahí vive la cola sin conexión).
