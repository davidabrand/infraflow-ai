import { test, expect } from '@playwright/test';

test('local API validation and error responses never invoke AI', async ({ request }) => {
  for (const path of ['/api/health', '/api/dashboard']) expect((await request.get(path)).status()).toBe(200);
  expect((await request.get('/api/no-such-endpoint')).status()).toBe(404);
  expect((await request.fetch('/api/scan', { method: 'OPTIONS' })).status()).toBe(405);
  expect((await request.post('/api/chat', { data: {} })).status()).toBe(400);
  expect((await request.post('/api/chat', { data: '{', headers: { 'content-type': 'application/json' } })).status()).toBe(400);
  expect((await request.post('/api/followups', { data: [] })).status()).toBe(400);
  expect((await request.post('/api/followups', { data: { shipmentId: 'SHP-9999' } })).status()).toBe(404);
  expect((await request.post('/api/shipments/SHP-9999/status', { data: { status: 'delivered' } })).status()).toBe(404);
  expect((await request.post('/api/shipments/SHP-2401/status', { data: { status: 'bad' } })).status()).toBe(400);
  expect((await request.get('/api/chat/history?session=bad')).status()).toBe(400);
  expect((await request.get('/api/chat/history?session=browser-isolated-session')).status()).toBe(200);
});

test('dashboard navigation, search, filters, details, status, scan and tasks persist', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const initial = await (await request.get('/api/dashboard')).json();
  const shipment = initial.shipments.find((s: any) => s.id === 'SHP-2401');
  // Make repeated runs independent of prior task state.
  for (const task of initial.followups.filter((t: any) => t.shipment_id === shipment.id && t.status === 'open')) await request.post(`/api/followups/${task.id}/complete`);
  await page.goto('/');
  await expect(page.locator('#stat-total')).toHaveText('12');
  await expect(page.locator('#overview-rows tr')).toHaveCount(6);
  await page.locator('[data-nav="shipments"]').click();
  await expect(page.locator('#all-shipment-rows tr')).toHaveCount(12);
  await page.locator('#shipment-search').fill('no-match'); await expect(page.locator('#shipment-results-count')).toHaveText('Showing 0 of 12 shipments');
  await page.locator('#shipment-search').fill('SHP-2401'); await expect(page.locator('#shipment-results-count')).toHaveText('Showing 1 of 12 shipments');
  await page.locator('#shipment-search').fill('');
  await page.locator('#status-filter').selectOption('delivered'); await expect(page.locator('#shipment-results-count')).toHaveText(`Showing ${initial.kpis.delivered} of 12 shipments`);
  await page.locator('#status-filter').selectOption('all'); await page.locator('#risk-filter').selectOption('critical');
  await expect(page.locator('#shipment-results-count')).toHaveText(`Showing ${initial.shipments.filter((s: any) => s.risk.severity === 'critical').length} of 12 shipments`);
  await page.locator('#risk-filter').selectOption('all');
  await page.locator('#all-shipment-rows [data-shipment="SHP-2401"]').click(); await expect(page.locator('#modal-title')).toContainText('SHP-2401');
  await page.keyboard.press('Escape'); await expect(page.locator('#modal-backdrop')).toBeHidden();
  await page.locator('#all-shipment-rows [data-shipment="SHP-2401"]').click();
  await page.locator('#detail-followup').click(); await expect(page.locator('#modal-backdrop')).toBeHidden();
  await page.locator('[data-nav="tasks"]').click(); await expect(page.locator('[data-complete]')).toHaveCount(initial.followups.filter((t: any) => t.shipment_id !== shipment.id && t.status === 'open').length + 1);
  const current = await (await request.get('/api/dashboard')).json(); const created = current.followups.find((t: any) => t.shipment_id === shipment.id && t.status === 'open');
  await page.locator(`[data-complete="${created.id}"]`).click(); await expect(page.locator(`[data-complete="${created.id}"]`)).toHaveCount(0);
  await page.locator('[data-nav="shipments"]').click(); await page.locator('#all-shipment-rows [data-shipment="SHP-2401"]').click();
  await page.locator('#detail-status').selectOption('delivered'); await page.locator('#detail-save').click(); await expect(page.locator('#modal-backdrop')).toBeHidden();
  await page.locator('[data-nav="intelligence"]').click(); await page.locator('#scan-button-alt').click(); await expect(page.locator('#scan-button-alt')).toBeEnabled();
  await expect(page.locator('#scan-history')).toContainText('12 shipments evaluated'); await expect(page.locator('#inventory-grid .inventory-card')).toHaveCount(12);
  await page.reload(); await expect(page.locator('#stat-total')).toHaveText('12');
  const updated = await (await request.get('/api/dashboard')).json();
  expect(updated.shipments.find((s: any) => s.id === shipment.id).status).toBe('delivered');
  expect(updated.alerts.find((a: any) => a.shipment_id === shipment.id)?.state ?? 'resolved').toBe('resolved');
  expect(updated.followups.find((t: any) => t.id === created.id).status).toBe('done');
  await request.post(`/api/shipments/${shipment.id}/status`, { data: { status: shipment.status } }); await request.post('/api/scan');
  expect(errors).toEqual([]);
});

test('chat rendering, suggestions, access code, failures and reload history (mocked AI)', async ({ page }) => {
  const history: { role: string; content: string }[] = [];
  await page.route('**/api/chat/history?*', route => route.fulfill({ json: { messages: history } }));
  let failure = false;
  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON();
    if (failure) return route.fulfill({ status: 503, json: { error: 'Workers AI is unavailable (simulated).' } });
    history.push({ role: 'user', content: body.message }, { role: 'assistant', content: '<script>Mock response</script>' });
    await route.fulfill({ json: { answer: history.at(-1)!.content } });
  });
  await page.goto('/'); await expect(page.locator('#stat-total')).toHaveText('12');
  page.once('dialog', dialog => dialog.accept('browser-test-code')); await page.locator('#set-access-code').click();
  expect(await page.evaluate(() => (globalThis as any).sessionStorage.getItem('infraflow_demo_code'))).toBe('browser-test-code');
  await page.locator('[data-prompt]').first().click(); await expect(page.locator('#chat-history .assistant')).toHaveText('<script>Mock response</script>');
  await expect(page.locator('#chat-history script')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#chat-history .chat-bubble')).toHaveCount(2);
  await expect(page.locator('#chat-suggestions')).toBeHidden();
  failure = true; await page.locator('#chat-input').fill('Another question'); await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-history .error')).toContainText('unavailable'); await expect(page.locator('#chat-send')).toBeEnabled();
});

test('mobile dashboard navigation and modal remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('#stat-total')).toHaveText('12');
  await page.locator('[data-nav="shipments"]').click(); await page.locator('#shipment-search').fill('SHP-2401');
  await page.locator('#all-shipment-rows [data-shipment]').click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#close-modal').click(); await expect(page.getByRole('dialog')).toBeHidden();
});
