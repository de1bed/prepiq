import { expect, test, type Browser } from '@playwright/test';
import { newPage, q } from './helpers';

async function blankTablet(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'es-MX', timezoneId: 'America/Mexico_City', viewport: { width: 1280, height: 800 } });
  return { ctx, page: await ctx.newPage() };
}

test('vincular una tableta con QR: sin crear cuentas, abre directo en su estación (cocina sin PIN)', async ({ browser }) => {
  const name = `Tableta E2E ${Date.now()}`;
  const { ctx: adminCtx, page: admin } = await newPage(browser, 'ana@demo.prepiq.test');
  await admin.goto('/admin/dispositivos');
  await admin.getByTestId('add-device').click();
  await admin.getByTestId('pairing-name').fill(name);
  await admin.getByTestId('pairing-mode').selectOption('kds');
  await admin.getByTestId('pairing-station').selectOption({ label: 'Comal' });
  await admin.getByTestId('pairing-generate').click();
  const code = (await admin.getByTestId('pairing-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(admin.getByRole('img', { name: 'Código QR para vincular' }).locator('svg')).toBeVisible();

  // La tableta "escanea" el QR: abre el enlace con el código.
  const tablet = await blankTablet(browser);
  await tablet.page.goto(`/vincular#${code.replace('-', '')}`);
  await expect(tablet.page.getByTestId('pair-device-name')).toHaveText(name);
  await tablet.page.getByTestId('pair-confirm').click();
  await expect(tablet.page.getByTestId('kds-station')).toHaveText('Comal', { timeout: 20_000 });
  await expect(tablet.page.getByTestId('pin-submit')).toHaveCount(0);

  // Administración ve que quedó vinculado.
  await expect(admin.getByTestId('pairing-done')).toBeVisible({ timeout: 15_000 });
  const [dev] = await q<{ mode: string; email: string }>(
    `select d.mode, u.email from public.devices d join auth.users u on u.id = d.user_id where d.name = $1`, [name]);
  expect(dev.mode).toBe('kds');
  expect(dev.email).toMatch(/@dispositivos\.prepiq\.invalid$/);

  // El mismo código ya no sirve en otro equipo.
  const other = await blankTablet(browser);
  await other.page.goto(`/vincular#${code}`);
  await expect(other.page.getByRole('alert')).toContainText('ya se usó');
  await Promise.all([adminCtx.close(), tablet.ctx.close(), other.ctx.close()]);
});

test('vincular tecleando el código desde la pantalla de inicio (reloj checador)', async ({ browser }) => {
  const name = `Reloj E2E ${Date.now()}`;
  const { ctx: adminCtx, page: admin } = await newPage(browser, 'ana@demo.prepiq.test');
  await admin.goto('/admin/dispositivos');
  await admin.getByTestId('add-device').click();
  await admin.getByTestId('pairing-name').fill(name);
  await admin.getByTestId('pairing-mode').selectOption('kiosko');
  await admin.getByTestId('pairing-generate').click();
  const code = (await admin.getByTestId('pairing-code').textContent())!.trim();

  const tablet = await blankTablet(browser);
  await tablet.page.goto('/');
  await tablet.page.getByTestId('go-pair').click();
  await tablet.page.getByTestId('pair-code').fill(code.toLowerCase());
  await tablet.page.getByRole('button', { name: 'Continuar' }).click();
  await expect(tablet.page.getByTestId('pair-device-name')).toHaveText(name);
  await tablet.page.getByTestId('pair-confirm').click();
  await expect(tablet.page.getByText('Reloj checador').first()).toBeVisible({ timeout: 20_000 });
  await Promise.all([adminCtx.close(), tablet.ctx.close()]);
});
