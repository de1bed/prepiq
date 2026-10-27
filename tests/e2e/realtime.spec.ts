import { expect, test } from '@playwright/test';
import { newPage, q } from './helpers';

// Requiere un Supabase completo (`supabase start`) con Realtime.
// Se omite con el entorno ligero (dev/local-stack), que no tiene Realtime.
test.skip(!process.env.E2E_REALTIME, 'Solo con Supabase completo (E2E_REALTIME=1)');

test('tiempo real: el ticket aparece en cocina sin esperar el sondeo', async ({ browser }) => {
  const kds = await newPage(browser, 'kds-comal@demo.prepiq.test');
  await expect(kds.page.getByTestId('sync-indicator')).toHaveAccessibleName(/tiempo real/, { timeout: 20_000 });
  // El canal queda SUBSCRIBED antes de que el servidor termine de registrar
  // la suscripción a cambios de Postgres: margen breve antes de crear la orden.
  await kds.page.waitForTimeout(2_000);

  const mesero = await newPage(browser, 'elena@demo.prepiq.test');
  const m = mesero.page;
  await m.goto('/mesero');
  await m.getByTestId('new-order').click();
  await m.getByTestId('table-input').fill('33');
  await m.getByTestId('menu-item-Quesadilla').click();
  await m.getByRole('button', { name: 'Maíz' }).click();
  await m.getByTestId('item-save').click();
  await m.getByTestId('send-order').click();

  await expect.poll(async () => (await q(`select number from orders where table_label = '33'`)).length, { timeout: 15_000 }).toBe(1);
  const [o] = await q<{ number: number }>(`select number from orders where table_label = '33'`);
  // Con tiempo real el sondeo es cada 30 s: aparecer en < 5 s demuestra el canal en vivo.
  await expect(kds.page.getByTestId(`ticket-${o.number}`)).toBeVisible({ timeout: 5_000 });
  await kds.ctx.close(); await mesero.ctx.close();
});
