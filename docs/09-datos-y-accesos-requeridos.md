# 9. Datos y accesos requeridos (sin secretos en el chat)

> **Nunca** compartas contraseñas, llaves `service_role`, contraseñas de base de datos ni tokens por chat o correo. Usa el gestor de contraseñas del negocio y las variables de entorno del hosting.

## Accesos (los configura David directamente)
| Qué | Para qué | Quién lo crea | Dónde se guarda |
|---|---|---|---|
| Proyecto de Supabase (producción) y otro de *staging* | Base, auth, tiempo real | David | Panel de Supabase |
| URL del proyecto y **anon/publishable key** | Variables del frontend | David | Variables del hosting (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) |
| Contraseña de la base | Migraciones con CLI | David | Gestor de contraseñas (no en el repo) |
| Hosting (Vercel/Netlify/Cloudflare) conectado al repo | Publicar la app | David | Panel del hosting |
| Dominio (opcional) | URL estable para tabletas | David | DNS |
| Cuentas de correo para cada dispositivo | Login de tabletas/reloj | Restaurante | Gestor de contraseñas del restaurante |

## Datos del restaurante piloto (los entrega el restaurante)
1. Nombre, zona horaria, hora en que termina el "día" de servicio (corte).
2. Estaciones reales y qué se prepara en cada una (incluye componentes: ¿las papas de la hamburguesa salen de freidora?).
3. Menú: categoría, nombre, precio, estación, tiempo objetivo razonable por platillo, nombre corto para cocina. (Formato CSV de `Administración → Importar menú`.)
4. Modificadores y reglas (obligatorios, máximos, textos que cocina entiende).
5. Lenguaje de cocina: cómo llaman a "listo", "entregar", "vender", "on sale", "86".
6. Personal: nombre, roles, número de empleado (los PIN los genera el sistema y se entregan en persona).
7. Para inventario: 10–20 insumos críticos con unidad de compra y equivalencias (caja = N piezas), porciones reales de los platillos más vendidos, conteo inicial.
8. Para etiquetas: política interna de vida útil **validada** (quién la valida), formato de etiqueta, marca/modelo de impresora y tamaño del rollo.
9. Para horarios: horario típico de la semana y cómo se piden hoy los cambios/ausencias.
10. Equipos: cuántas pantallas/tabletas, dónde van, si hay bump‑bar, calidad del Wi‑Fi en cocina.
11. POS/caja actual y si se necesita que PrepIQ cobre o solo complemente.

## Datos que NO se piden
- Nómina, salarios, datos bancarios, CURP/RFC del personal.
- Datos de clientes finales más allá de un nombre de referencia para pedidos para llevar.
