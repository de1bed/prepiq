import { expect, type Browser, type Page } from '@playwright/test';
import pg from 'pg';

export const PASSWORD = 'demo-prepiq-2026';
const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL ?? 'postgres://root@/prepiq_e2e?host=/var/run/postgresql' });

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

export async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Esperar a que la sesión quede guardada antes de navegar.
  await page.waitForFunction(() => !!localStorage.getItem('prepiq-auth'), undefined, { timeout: 15_000 });
}

export async function newPage(browser: Browser, email: string, opts: { stubPrint?: boolean } = {}) {
  const ctx = await browser.newContext({ locale: 'es-MX', timezoneId: 'America/Mexico_City', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  if (opts.stubPrint) await page.addInitScript(() => { window.print = () => undefined; });
  await login(page, email);
  return { ctx, page };
}

export async function enterPin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByTestId('pin-submit').click();
}

export async function expectSynced(page: Page) {
  await expect(page.getByTestId('sync-indicator')).toContainText('En línea', { timeout: 20_000 });
}
