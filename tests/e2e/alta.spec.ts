import { expect, test } from '@playwright/test';

async function signup(browser: import('@playwright/test').Browser, email: string) {
  const ctx = await browser.newContext({ locale: 'es-MX', timezoneId: 'America/Mexico_City', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('una-clave-segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  return { ctx, page };
}

test('alta: crear restaurante, unirse con código y aprobar con roles', async ({ browser }) => {
  const stamp = Date.now();
  // Dueña crea su restaurante.
  const owner = await signup(browser, `duena-${stamp}@prueba.test`);
  const o = owner.page;
  await expect(o.getByText('Bienvenido a PrepIQ')).toBeVisible();
  await o.getByRole('tab', { name: 'Crear mi restaurante' }).click();
  await o.getByLabel('Nombre del restaurante').fill(`Fonda ${stamp}`);
  await o.getByLabel('Tu nombre').fill('Rosa');
  await o.getByRole('button', { name: 'Crear restaurante' }).click();
  await expect(o.getByText('Hola, Rosa')).toBeVisible();
  await expect(o.getByText('Puesta en marcha')).toBeVisible();

  // Código para unirse.
  await o.goto('/admin/restaurante');
  const code = (await o.getByTestId('join-code').textContent())!.trim();
  expect(code).toMatch(/^[0-9A-F]{8}$/);

  // Una persona nueva pide unirse.
  const cook = await signup(browser, `cocinero-${stamp}@prueba.test`);
  const c = cook.page;
  await c.getByLabel('Código del restaurante').fill(code);
  await c.getByLabel('Tu nombre (como te conocen en cocina)').fill('Toño');
  await c.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(c.getByText('Esperando aprobación')).toBeVisible();

  // La dueña aprueba como cocinero.
  await o.goto('/admin/personal');
  await expect(o.getByText('Solicitudes pendientes')).toBeVisible();
  await o.getByRole('button', { name: 'Aprobar' }).click();
  await expect(o.getByRole('cell', { name: 'Toño' })).toBeVisible();

  // La persona entra con su rol: ve Cocina y no Administración.
  await c.getByRole('button', { name: 'Ya me aprobaron, actualizar' }).click();
  await expect(c.getByText('Hola, Toño')).toBeVisible();
  await expect(c.getByRole('link', { name: 'Cocina (KDS)' }).first()).toBeVisible();
  await expect(c.getByRole('link', { name: 'Administración' })).toHaveCount(0);

  await owner.ctx.close();
  await cook.ctx.close();
});
