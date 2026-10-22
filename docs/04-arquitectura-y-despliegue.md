# 4. Arquitectura, seguridad y despliegue en Supabase

## 4.1 Arquitectura (decidida después de entender el producto)

```mermaid
flowchart TB
  subgraph Dispositivos
    T1[Tableta cocina<br/>KDS por estación]
    T2[Pantalla pase]
    T3[Terminal meseros / celulares]
    T4[Reloj checador]
    T5[Navegador gerente / admin]
  end
  subgraph App["App web (SPA, PWA)"]
    UI[React + TypeScript]
    Q[Cola persistente idempotente<br/>IndexedDB]
    C[Caché de datos y sesión<br/>localStorage + service worker]
  end
  subgraph Supabase
    AUTH[Auth]
    API[PostgREST API]
    RT[Realtime]
    DB[(Postgres<br/>RLS + funciones RPC<br/>historial inmutable)]
  end
  Dispositivos --> UI
  UI --> Q --> API --> DB
  UI --> AUTH
  RT -- cambios --> UI
  UI -. sondeo de respaldo .-> API
```

| Decisión | Motivo |
|---|---|
| **SPA estática (Vite + React + TS)** en lugar de framework con servidor | Las tabletas necesitan abrir sin internet (PWA) y modo quiosco; no hay lógica que requiera servidor propio; se despliega gratis/barato en cualquier hosting estático. |
| **La lógica de negocio vive en Postgres (funciones RPC)** | Una sola fuente de verdad, transacciones atómicas (orden + tickets + inventario en un paso), imposible saltarse validaciones desde el cliente, y probada con pruebas SQL. |
| **RLS en todas las tablas; escritura operativa solo por RPC** | El rol `authenticated` no tiene INSERT/UPDATE/DELETE en tablas operativas; solo en configuración, protegida por permiso y auditada. |
| **Idempotencia por `op_id` + ids generados en el dispositivo** | Reintentos seguros con red inestable: "una orden no se pierde y el reintento no duplica". |
| **Historial inmutable** (eventos de ticket, movimientos de inventario, marcas de asistencia) | Las correcciones son registros nuevos; se puede explicar cualquier retraso o diferencia. |
| **Tiempo real + sondeo de respaldo** | Realtime da inmediatez; si el canal cae, cada pantalla consulta cada 8 s y al reconectar recarga todo. |
| **Dispositivos compartidos con PIN** | Así se trabaja en cocina; cada acción queda con persona y dispositivo. |
| **Impresión por el navegador** | Funciona con cualquier impresora instalada en el equipo sin integrar drivers. La persona confirma si salió bien (el navegador no lo informa). Integración directa (ESC/POS/ZPL) queda como fase futura. |

Estructura del repositorio:

```
supabase/migrations/   esquema, RLS, RPC (orden numerado)
supabase/seed.sql      restaurante DEMO ficticio (solo local)
supabase/tests/        pruebas SQL de criterios críticos
src/                   app web (features/ por módulo, lib/ lógica pura probada)
tests/e2e/             pruebas de punta a punta (Playwright)
dev/                   scripts locales (base de pruebas, pasarela tipo Supabase)
docs/                  este documento y los demás entregables
```

## 4.2 Seguridad

- **Llaves:** el frontend solo usa la *anon/publishable key* (pública por diseño). **Nunca** pongas la `service_role` en el frontend ni en el repositorio. PrepIQ no la necesita para operar.
- **RLS** habilitado en todas las tablas de `public` (lo hace la migración 0010). Ejecuta *Database → Advisors* en Supabase después de migrar.
- **PIN:** HMAC con secreto por restaurante; 5 fallos en 10 min bloquean la cuenta/dispositivo; PIN aleatorio recomendado; asignar uno nuevo cierra sesiones abiertas.
- **Autorizaciones de gerente:** pase de un solo uso, 10 min, por permiso.
- **Escalamiento de privilegios:** nadie cambia sus propios roles; vincular cuentas solo por solicitud aprobada.
- **Datos sensibles separados:** costos (`ingredient_costs`, movimientos), contactos (`staff_private`), asistencia ajena, auditoría — cada uno con su permiso.
- **Dispositivos compartidos:** al cerrar sesión se borra la caché local de datos.

## 4.3 Puesta en marcha con Supabase (paso a paso)

> Requisitos: cuenta de Supabase, Node 20+, [Supabase CLI](https://supabase.com/docs/guides/cli).

1. **Crear el proyecto** en Supabase (región cercana al restaurante). Guarda la contraseña de la base en tu gestor de contraseñas (no en el chat ni en el repo).
2. **Aplicar el esquema:**
   ```bash
   supabase login
   supabase link --project-ref <TU_REF>
   supabase db push        # aplica supabase/migrations/* en orden
   ```
   Alternativa sin CLI: abrir *SQL Editor* y ejecutar cada archivo de `supabase/migrations/` en orden numérico.
   **No** ejecutes `seed.sql` en producción (cuentas y PIN de demostración son públicos).
3. **Auth** (*Authentication → Providers / URL Configuration*):
   - Email habilitado; **confirmación de correo activada** en producción.
   - *Site URL* = dominio donde publiques la app; agrega el mismo a *Redirect URLs*.
   - Contraseña mínima 8 caracteres (recomendado).
4. **Realtime:** la migración 0010 agrega las tablas necesarias a la publicación `supabase_realtime`. Verifica en *Database → Publications*.
5. **Mantenimiento diario** (opcional, recomendado): habilita la extensión `pg_cron` y programa
   ```sql
   select cron.schedule('prepiq-housekeeping', '15 4 * * *', $$select app.housekeeping()$$);
   ```
6. **Variables del frontend:** *Project Settings → API* → copia *Project URL* y *anon/publishable key* a `.env.local` (local) o a las variables del hosting:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
7. **Publicar la app** (cualquiera de estos):
   - **Vercel**: importar el repo; framework *Vite*; ya incluye `vercel.json` (rutas SPA y caché del service worker).
   - **Netlify**: incluye `netlify.toml`.
   - **Cloudflare Pages**: build `npm run build`, salida `dist`, y regla SPA a `/index.html`.
8. **Primer administrador:** abre la app → *Crear cuenta* → *Crear mi restaurante*. Quedas como propietario/administrador.
9. **Configurar:** Administración → Restaurante (zona horaria, hora de corte, lenguaje de cocina) → Estaciones → Menú (o Importar CSV) → Insumos → Recetas → Personal (PIN) → Etiquetas (formatos y reglas validadas).
10. **Dispositivos:** para cada tableta/terminal/reloj crea una cuenta (correo del equipo), inicia sesión en el dispositivo, *Unirme con código → Es un dispositivo*, y apruébalo en *Administración → Dispositivos* eligiendo su modo y estación. Recomendado: modo quiosco/pantalla completa del sistema y "Agregar a pantalla de inicio" (PWA).

### 4.3.1 Estado del proyecto `ptbqyymhwmfotfxupvzk` (22 oct 2026)

- **App publicada:** https://prepiq-xi.vercel.app (Vercel, proyecto `prepiq`, rama `prepiq-v2`, variables `VITE_SUPABASE_*` configuradas). La rama de producción de Vercel por defecto es `main` (piloto anterior): cambiarla a `prepiq-v2` en *Settings → Environments → Production → Branch Tracking* para que cada push publique la versión nueva.

- Esquema completo instalado con el conector de Supabase (Postgres 17.11): 54 tablas, RLS en todas las de `public`, 70 políticas, 91 triggers, Realtime en 9 tablas. **Sin datos demo** (no se ejecutó `seed.sql`).
- Prueba de humo en el proyecto real, dentro de una transacción revertida: alta de restaurante → PIN → orden → ticket → iniciar/listo/entregar → reintento con el mismo `op_id` (marcado como repetido, sin duplicar). Resultado: 1 orden, 1 ticket, 4 eventos, auditoría registrada. No quedó ningún dato.
- Privilegios verificados: `anon` no lee tablas ni ejecuta funciones; `authenticated` no inserta órdenes ni edita historiales directamente.
- `rpc_staff_clear_pin` y `app.housekeeping` (contienen `DELETE` y el conector exige confirmación manual) se aplicaron pegando [`supabase/pendiente-sql-editor.sql`](../supabase/pendiente-sql-editor.sql) en *SQL Editor* y se verificaron (anon sin acceso; `housekeeping` solo para el servidor). **El esquema está completo.**
- El historial de migraciones del proyecto usa nombres propios (p. ej. `ordenes_kds_1_tablas`) y fechas de aplicación, no los archivos de `supabase/migrations/`. Antes de usar `supabase db push` en este proyecto, revisar `supabase migration list` y alinear con `supabase migration repair`; si no, la CLI intentará aplicar todo otra vez.
- Asesor de seguridad: solo avisa que usuarios con sesión pueden ejecutar funciones `security definer`. Es intencional: son las RPC y cada una valida permiso y restaurante. Asesor de rendimiento: avisos informativos (índices sin uso porque no hay datos; 5 políticas que podrían envolver `auth.uid()` en `select`), sin impacto con el volumen de un piloto.

## 4.4 Copias de seguridad y recuperación

- Supabase hace copias diarias en planes de pago; **PITR** (recuperación a un punto en el tiempo) es opcional. [P] Elegir plan según el piloto.
- Adicional y verificable: exportar periódicamente
  ```bash
  supabase db dump --data-only -f respaldo-$(date +%F).sql   # datos
  supabase db dump -f esquema-$(date +%F).sql                  # esquema
  ```
  y guardar fuera de Supabase (almacenamiento del negocio).
- **Prueba de restauración antes del piloto:** restaurar el respaldo en un proyecto de *staging* y correr `supabase/tests/criticos.sql` contra una copia con semilla (o una verificación de conteos) — ver `08-aceptacion-pruebas-y-riesgos.md`.
- Recuperación de operación: si Supabase no responde, las pantallas siguen funcionando con la cola local; nada se pierde mientras el dispositivo no borre sus datos. Evitar "borrar datos del navegador" en tabletas.

## 4.5 Desarrollo local

Dos opciones:

**A. Supabase CLI (recomendado si tienes Docker):**
```bash
supabase start          # usa supabase/config.toml, aplica migraciones y seed.sql
npm install
cp .env.example .env.local   # pon la URL y anon key que imprime `supabase start`
npm run dev
```

**B. Sin Docker de Supabase (lo que usan las pruebas automáticas):** Postgres local + PostgREST + pasarela con auth simulado:
```bash
npm run stack:up        # recrea base "prepiq_e2e" con semilla y escribe .env.local
npm run dev
```

Cuentas demo (contraseña `demo-prepiq-2026`): `ana@` (admin), `beto@` (gerente), `carla@` (cocinera), `elena@` (mesera) `…@demo.prepiq.test`; dispositivos `kds-parrilla@`, `kds-comal@`, `pase@`, `meseros@`, `reloj@`. PIN: Ana 1111, Beto 2222, Carla 3333, Diego 4444, Elena 5555, Fer 6666. **Solo demostración.**

## 4.6 Pruebas

```bash
npm run typecheck   # TypeScript estricto
npm test            # pruebas unitarias (cola offline, KDS, zonas horarias, importación)
npm run test:db     # migraciones + 88 verificaciones SQL de criterios críticos
npm run test:e2e    # navegador real: pedido→cocina→entrega, reintentos, sin conexión, roles…
dev/validate-supabase-image.sh   # migraciones + semilla + pruebas sobre la imagen OFICIAL de Postgres de Supabase, como rol postgres
WITH_REALTIME=1 dev/real-auth-stack.sh up   # Postgres + Auth (GoTrue) + Realtime oficiales de Supabase + PostgREST
E2E_REALTIME=1 E2E_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54330/postgres npx playwright test
```
La integración continua (`.github/workflows/ci.yml`) corre tipos, unitarias, SQL y build en cada push.
