// Genera las capturas del tutorial del KDS (pestaña Ayuda) con recuadros rojos.
// Uso (entorno local con semilla):
//   npm run stack:up && psql -d prepiq_e2e -f dev/ayuda-escenario.sql
//   npx vite --port 5173 &  node dev/ayuda-kds.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../public/ayuda/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
const page = await ctx.newPage();
await page.goto(BASE);
await page.getByLabel('Correo').fill('kds-parrilla@demo.prepiq.test');
await page.getByLabel('Contraseña').fill('demo-prepiq-2026');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.getByTestId('kds-station').waitFor();
await page.locator('[data-ticket-id]').first().waitFor();
await page.waitForTimeout(1500);

async function shot(name, selectors) {
  await page.evaluate((sels) => {
    document.querySelectorAll('[data-ayuda]').forEach((e) => { e.style.outline = ''; e.removeAttribute('data-ayuda'); });
    for (const s of sels) for (const e of document.querySelectorAll(s)) {
      e.setAttribute('data-ayuda', '1');
      e.style.outline = '5px solid #ef4444';
      e.style.outlineOffset = '3px';
    }
  }, selectors);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

await shot('kds-1-lista', ['[data-testid="kds-list"]']);

const second = page.locator('[data-ticket-id]').nth(1);
await second.click();
const id = await second.getAttribute('data-ticket-id');
await shot('kds-2-abrir', [`[data-ticket-id="${id}"]`, '[data-testid="kds-open"]']);

await page.getByTestId('kds-open').click();
const row = page.locator(`[data-ticket-id="${id}"]`);
await row.getByTestId('ticket-bump').waitFor();
await page.waitForTimeout(800);
await shot('kds-3-listo', [`[data-ticket-id="${id}"] [data-testid="ticket-recipe"]`, `[data-ticket-id="${id}"] [data-testid="ticket-menu"]`, `[data-ticket-id="${id}"] [data-testid="ticket-bump"]`]);

await page.getByTestId('kds-summary').click();
await page.getByTestId('kds-summary-view').waitFor();
await shot('kds-4-resumen', ['[data-testid="kds-summary"]', '[data-testid="kds-summary-view"]']);
await page.getByTestId('kds-summary').click();

await shot('kds-5-flechas', ['[data-testid="kds-up"]', '[data-testid="kds-down"]']);

await row.getByTestId('ticket-bump').click();
await page.waitForTimeout(1500);
await page.getByTestId('kds-recent').click();
await page.getByTestId('kds-history').waitFor();
await shot('kds-6-historial', ['[data-testid="kds-history"] [data-testid="ticket-reopen"]']);
await page.keyboard.press('Escape');

await shot('kds-7-arriba', ['[data-testid="other-stations"]', '[data-testid="station-crew"]']);
await browser.close();
console.log('Capturas en', OUT);
