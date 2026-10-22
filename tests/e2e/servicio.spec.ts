import { expect, test } from '@playwright/test';
import { closeDb, enterPin, expectSynced, newPage, q } from './helpers';

test.afterAll(async () => { await closeDb(); });

test('pedido → cocina → entrega, con actor y consumo registrados', async ({ browser }) => {
  // Mesera captura en su cuenta personal.
  const mesero = await newPage(browser, 'elena@demo.prepiq.test');
  const m = mesero.page;
  await m.getByRole('link', { name: 'Meseros' }).first().click();
  await m.getByTestId('new-order').click();
  await m.getByTestId('table-input').fill('9');
  await m.getByTestId('menu-item-Orden de tacos al pastor (3)').click();
  // Tortilla es obligatoria: el botón Agregar está deshabilitado hasta elegir.
  await expect(m.getByTestId('item-save')).toBeDisabled();
  await m.getByRole('button', { name: 'Maíz' }).click();
  await m.getByRole('button', { name: 'Sin cebolla' }).click();
  await m.getByTestId('item-save').click();
  await expect(m.getByTestId('draft-line')).toHaveCount(1);
  await m.getByTestId('send-order').click();
  await expectSynced(m);
  await expect(m.getByText('Mesa 9')).toBeVisible();

  await expect.poll(async () => (await q(`select id from orders where table_label = '9'`)).length, { timeout: 20_000 }).toBe(1);
  const [order] = await q<{ id: string; number: number }>(`select id, number from orders where table_label = '9'`);

  // Tableta de cocina (dispositivo compartido) con PIN de Carla.
  const kds = await newPage(browser, 'kds-comal@demo.prepiq.test');
  const k = kds.page;
  await enterPin(k, '3333');
  await expect(k.getByTestId('kds-station')).toHaveText('Comal');
  await expect(k.getByTestId('operator-name')).toHaveText('Carla');
  const card = k.getByTestId(`ticket-${order.number}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Pastor (3)');
  await expect(card).toContainText('SIN CEBOLLA');
  await card.getByTestId('ticket-bump').click();
  await expect(card).toHaveCount(0);
  await expectSynced(k);

  // La mesera ve "Listo" y entrega.
  await m.getByTestId(`order-card-${order.number}`).click();
  await expect(m.getByTestId('deliver-ticket')).toBeVisible({ timeout: 20_000 });
  await m.getByTestId('deliver-ticket').click();
  await expect.poll(async () => (await q(`select e.id from ticket_events e join kitchen_tickets t on t.id = e.ticket_id
    where t.order_id = $1 and e.action = 'entregar'`, [order.id])).length).toBe(1);

  const events = await q<{ action: string; staff: string; device: string | null }>(`
    select e.action, s.display_name as staff, d.name as device from ticket_events e
    join kitchen_tickets t on t.id = e.ticket_id left join staff s on s.id = e.staff_id left join devices d on d.id = e.device_id
    where t.order_id = $1 order by e.at`, [order.id]);
  expect(events.map((e) => e.action)).toEqual(['crear', 'listo', 'entregar']);
  expect(events[1]).toMatchObject({ staff: 'Carla', device: 'Tableta Comal' });
  expect(events[2]).toMatchObject({ staff: 'Elena' });
  const mov = await q<{ n: string; cebolla: string }>(`
    select count(*) as n, count(*) filter (where i.name = 'Cebolla blanca') as cebolla
    from inventory_movements m join order_items oi on oi.id = m.source_id join ingredients i on i.id = m.ingredient_id
    where oi.order_id = $1 and m.kind = 'consumo_venta'`, [order.id]);
  expect(Number(mov[0].n)).toBe(3);        // tortilla, pastor, cilantro
  expect(Number(mov[0].cebolla)).toBe(0);  // "sin cebolla" anuló la cebolla de la receta
  await mesero.ctx.close(); await kds.ctx.close();
});

test('si se pierde la respuesta del servidor, el reintento no duplica la orden', async ({ browser }) => {
  const { ctx, page } = await newPage(browser, 'elena@demo.prepiq.test');
  let dropped = false;
  await page.route('**/rest/v1/rpc/rpc_order_submit', async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();            // el servidor SÍ procesa…
      await route.abort('failed');    // …pero el dispositivo no recibe respuesta
      return;
    }
    await route.continue();
  });
  await page.goto('/mesero');
  await page.getByTestId('new-order').click();
  await page.getByTestId('table-input').fill('12');
  await page.getByRole('button', { name: 'Bebidas' }).click();
  await page.getByTestId('menu-item-Refresco').click();
  await page.getByTestId('send-order').click();
  // Primero falla "por red" (el servidor sí la aplicó); la cola reintenta sola.
  await expect.poll(() => dropped).toBe(true);
  await expect.poll(async () => (await q(`select k.id from kitchen_tickets k join orders o on o.id = k.order_id where o.table_label = '12'`)).length, { timeout: 20_000 }).toBe(1);
  await expectSynced(page);
  const orders = await q<{ id: string }>(`select id from orders where table_label = '12'`);
  expect(orders).toHaveLength(1);
  const tickets = await q(`select id from kitchen_tickets where order_id = $1`, [orders[0].id]);
  expect(tickets).toHaveLength(1);
  const items = await q(`select id from order_items where order_id = $1`, [orders[0].id]);
  expect(items).toHaveLength(1);
  await ctx.close();
});

test('cocina sin conexión: la acción se guarda, se muestra y se sincroniza una sola vez', async ({ browser }) => {
  const { ctx, page } = await newPage(browser, 'kds-parrilla@demo.prepiq.test');
  await enterPin(page, '4444');
  await expect(page.getByTestId('kds-station')).toHaveText('Parrilla');
  const [t] = await q<{ id: string; order_number: number }>(`
    select k.id, k.order_number from kitchen_tickets k join stations s on s.id = k.station_id
    where s.name = 'Parrilla' and k.status in ('nuevo','en_preparacion') order by k.created_at limit 1`);
  const card = page.getByTestId(`ticket-${t.order_number}`);
  await expect(card).toBeVisible();

  await ctx.setOffline(true);
  await card.getByTestId('ticket-bump').click();
  await expect(card).toHaveCount(0);                          // optimista
  await expect(page.getByTestId('sync-indicator')).toContainText('Sin conexión');
  await expect(page.getByRole('alert')).toContainText('Tus acciones se guardan');
  const before = await q<{ status: string }>(`select status from kitchen_tickets where id = $1`, [t.id]);
  expect(before[0].status).not.toBe('listo');                 // aún no llegó al servidor

  await ctx.setOffline(false);
  await expectSynced(page);
  const after = await q<{ status: string }>(`select status from kitchen_tickets where id = $1`, [t.id]);
  expect(after[0].status).toBe('listo');
  const ev = await q(`select id from ticket_events where ticket_id = $1 and action = 'listo'`, [t.id]);
  expect(ev).toHaveLength(1);
  await ctx.close();
});

test('roles: el mesero no entra a administración ni ve reportes', async ({ browser }) => {
  const { ctx, page } = await newPage(browser, 'elena@demo.prepiq.test');
  await expect(page.getByRole('link', { name: 'Meseros' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0);
  await page.goto('/admin/menu');
  await expect(page).toHaveURL(/\/$/);
  await ctx.close();
});

test('cocina: reabrir exige motivo y conserva el historial', async ({ browser }) => {
  const { ctx, page } = await newPage(browser, 'kds-parrilla@demo.prepiq.test');
  await enterPin(page, '4444');
  await expect(page.getByTestId('kds-station')).toHaveText('Parrilla');
  // Autosuficiente: si no hay un ticket terminado reciente, se marca uno listo.
  const ready = await q(`select k.id from kitchen_tickets k join stations s on s.id = k.station_id
    where s.name = 'Parrilla' and k.status in ('listo','entregado')`);
  if (ready.length === 0) {
    await page.getByTestId('ticket-bump').first().click();
    await expect.poll(async () => (await q(`select k.id from kitchen_tickets k join stations s on s.id = k.station_id
      where s.name = 'Parrilla' and k.status = 'listo'`)).length).toBeGreaterThan(0);
  }
  const before = await q(`select id from ticket_events where action = 'reabrir'`);
  await page.getByTestId('kds-recent').click();
  await page.getByRole('dialog').getByTestId('ticket-reopen').first().click();
  const reasonDialog = page.getByRole('dialog');
  await expect(reasonDialog.getByTestId('reason-confirm')).toBeDisabled();
  await reasonDialog.getByRole('button', { name: 'Error de preparación' }).click();
  await reasonDialog.getByTestId('reason-confirm').click();
  await expect.poll(async () => (await q(`select id from ticket_events where action = 'reabrir'`)).length).toBe(before.length + 1);
  const ev = await q<{ reason: string; staff: string }>(`select e.reason, s.display_name as staff from ticket_events e
    join staff s on s.id = e.staff_id where e.action = 'reabrir' order by e.at desc limit 1`);
  expect(ev[0]).toMatchObject({ reason: 'error_preparacion', staff: 'Diego' });
  const remake = await q(`select id from inventory_movements where kind = 'reproceso'`);
  expect(remake.length).toBeGreaterThan(0);
  await ctx.close();
});

test('etiqueta: regla validada, impresión confirmada y lote asignado', async ({ browser }) => {
  const { ctx, page } = await newPage(browser, 'carla@demo.prepiq.test', { stubPrint: true });
  await page.goto('/etiquetas');
  await page.getByTestId('label-product').selectOption({ label: '★ Pico de gallo' });
  await expect(page.getByText(/Regla del restaurante: 24 h/)).toBeVisible();
  await page.getByTestId('label-print').click();
  await page.getByTestId('label-confirm').click();
  await expect.poll(async () => (await q<{ status: string }>(`select status from label_prints order by created_at desc limit 1`))[0]?.status).toBe('impresa');
  const rows = await q<{ status: string; batch_code: string; expiry_source: string }>(`select status, batch_code, expiry_source from label_prints order by created_at desc limit 1`);
  expect(rows[0]).toMatchObject({ status: 'impresa', expiry_source: 'regla' });
  expect(rows[0].batch_code).toMatch(/^\d{6}-\d{3}$/);
  await ctx.close();
});

test('reloj checador: PIN y marca de entrada', async ({ browser }) => {
  const { ctx, page } = await newPage(browser, 'reloj@demo.prepiq.test');
  await enterPin(page, '6666');
  await expect(page.getByTestId('kiosk-name')).toContainText('Fer');
  await page.getByTestId('punch-entrada').click();
  await expect(page.getByTestId('punch-done')).toContainText('Entrada registrada');
  await expectSynced(page);
  const p = await q(`select tp.id from time_punches tp join staff s on s.id = tp.staff_id where s.display_name = 'Fer' and tp.kind = 'entrada'`);
  expect(p).toHaveLength(1);
  await ctx.close();
});
