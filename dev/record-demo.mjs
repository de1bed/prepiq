// Graba videos de demostración de la app funcionando contra el entorno local.
//   WITH_REALTIME=1 dev/real-auth-stack.sh up && npx vite --port 5173 &
//   node dev/record-demo.mjs <carpeta-de-salida>
// Produce: servicio (mesero + cocina lado a lado) y recorrido de gerencia.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'demo-videos';
const BASE = process.env.DEMO_URL ?? 'http://localhost:5173';
const PASSWORD = 'demo-prepiq-2026';
const SIZE = { width: 960, height: 600 };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ slowMo: 120 });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function context(name, size = SIZE) {
  const ctx = await browser.newContext({
    viewport: size, locale: 'es-MX', timezoneId: 'America/Mexico_City',
    recordVideo: { dir: `${OUT}/${name}`, size },
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.print = () => undefined; });
  return { ctx, page };
}

async function login(page, email) {
  await page.goto(BASE);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForFunction(() => !!localStorage.getItem('prepiq-auth'));
}

async function pin(page, digits) {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByTestId('pin-submit').click();
}

// ---------------------------------------------------------------------
// 1) Servicio en vivo: mesera (izquierda) y tableta de cocina (derecha)
// ---------------------------------------------------------------------
const mesero = await context('mesero');
const cocina = await context('cocina');

await Promise.all([login(mesero.page, 'elena@demo.prepiq.test'), login(cocina.page, 'kds-comal@demo.prepiq.test')]);
await pin(cocina.page, '3333');
await cocina.page.getByTestId('kds-station').waitFor();
await pause(2500);

const m = mesero.page;
await m.goto(`${BASE}/mesero`);
await pause(1200);
await m.getByTestId('new-order').click();
await m.getByTestId('table-input').fill('7');
await pause(600);
await m.getByTestId('menu-item-Orden de tacos al pastor (3)').click();
await pause(900);
await m.getByRole('button', { name: 'Maíz' }).click();
await m.getByRole('button', { name: 'Sin cebolla' }).click();
await m.getByPlaceholder('Ej. bien dorado, alergia a nuez').fill('Bien dorados');
await pause(800);
await m.getByTestId('item-save').click();
await pause(600);
await m.getByTestId('menu-item-Quesadilla').click();
await m.getByRole('button', { name: 'Harina' }).click();
await m.getByTestId('item-save').click();
await pause(1200);
await m.getByTestId('send-order').click();
await pause(3500); // el ticket aparece en cocina por tiempo real

const k = cocina.page;
const card = k.locator('article').filter({ hasText: 'Mesa 7' }).first();
await card.waitFor();
await pause(1500);
await card.getByTestId('ticket-start').click();
await pause(2500);
await card.getByTestId('ticket-bump').click();
await pause(2500);

await m.locator('[data-testid^="order-card-"]').filter({ hasText: 'Mesa 7' }).first().click();
await m.getByTestId('deliver-ticket').first().waitFor({ timeout: 20000 });
await pause(2000);
await m.getByTestId('deliver-ticket').first().click();
await pause(2500);

await k.getByTestId('kds-recent').click();
await pause(2500);
await mesero.ctx.close();
await cocina.ctx.close();

// ---------------------------------------------------------------------
// 2) Recorrido de gerencia / administración
// ---------------------------------------------------------------------
const tour = await context('gerencia', { width: 1280, height: 720 });
const t = tour.page;
await login(t, 'ana@demo.prepiq.test');
await pause(2000);
for (const path of ['/turno', '/pase', '/inventario', '/etiquetas', '/horarios', '/reportes', '/admin/menu', '/admin/recetas', '/admin/personal']) {
  await t.goto(`${BASE}${path}`);
  await pause(path === '/etiquetas' ? 1000 : 2600);
  if (path === '/etiquetas') {
    await t.getByTestId('label-product').selectOption({ label: '★ Pico de gallo' });
    await pause(2500);
  }
  if (path === '/admin/recetas') {
    await t.getByText('Hamburguesa').first().click();
    await pause(2500);
  }
}
await tour.ctx.close();
await browser.close();
console.log('Videos en', OUT);
