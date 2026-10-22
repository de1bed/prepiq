# 13. Próxima acción para David y preguntas imprescindibles

## Próxima acción concreta (esta semana)

1. **Abrir la demo y probarla 30 min** (local o desplegada):
   - Ventana 1: `elena@demo.prepiq.test` → *Meseros* → crea una orden.
   - Ventana 2: `kds-comal@demo.prepiq.test` → PIN `3333` → márcala lista.
   - Ventana 1: entrégala. Luego prueba *Turno*, *Inventario*, *Etiquetas* con `ana@` (admin).
   - Contraseña de todas: `demo-prepiq-2026` (solo demo).
2. **Elegir el restaurante piloto** y agendar la observación de un servicio completo.
3. **Responder las preguntas de abajo** (aunque sea en notas de voz) — desbloquean la configuración.
4. **Crear el proyecto de Supabase** (producción y staging) y conectar el hosting siguiendo `04-arquitectura-y-despliegue.md` §4.3. No compartas llaves por chat.

## Preguntas imprescindibles

**Lenguaje y flujo**
1. ¿Qué significa exactamente **"vender ticket"** en tu cocina? ¿Es entregar al cliente, sacar al pase, o marcar listo?
2. ¿Qué es **"on sale"**? ¿Un estado (p. ej. "en el pase esperando mesero") o una acción?
3. ¿Quién entrega físicamente: el mesero, un corredor o el pase? ¿Quién debe tocar "Entregar"?
4. ¿Los cocineros pueden marcar **86** y **reabrir** solos, o solo el responsable de turno?

**Piloto**
5. ¿Qué restaurante será el piloto? ¿Cuántas estaciones, pantallas y cubiertos por servicio?
6. ¿Tiene **POS/caja**? ¿Cuál? ¿PrepIQ debe cobrar o solo complementar? (Hoy: no cobra.)
7. ¿Qué **impresoras** hay (comandas y etiquetas)? Marca, modelo, tamaño del rollo, conexión (USB/red/Bluetooth).
8. ¿Cómo es el **Wi‑Fi** en la cocina? ¿Se cae seguido?

**Inventario, etiquetas, personal**
9. ¿Qué 10–20 insumos importan más para controlar (costo o faltantes)?
10. ¿Quién valida las **vidas útiles** de las etiquetas y existe una política escrita?
11. ¿Descontar inventario **al enviar** (propuesto) o **al marcar listo**?
12. ¿Quieren reloj checador en el piloto o ya usan otra herramienta obligatoria?

**Negocio**
13. ¿Venta directa primero o con distribuidor? ¿Hay un distribuidor con quien hablar (además de Foodstock como opción)?
14. ¿Multisitio en el corto plazo (varias sucursales del mismo dueño)?

## Bloqueos registrados
| Bloqueo | Qué se hizo mientras | Qué falta |
|---|---|---|
| Significado de "vender"/"on sale" | Estados internos estables + etiquetas configurables | Respuesta 1–2 |
| Restaurante piloto | Demo ficticia completa | Respuesta 5 |
| POS/cobro | "Cerrar orden" sin cobro | Respuesta 6 |
| Impresoras | Impresión por navegador con formatos en mm | Respuesta 7 y prueba física |
| Vida útil | Reglas configurables con "validó/fecha/fuente" | Respuesta 10 |
