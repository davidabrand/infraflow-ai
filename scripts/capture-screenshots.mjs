import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const origin = 'http://127.0.0.1:8787';
await mkdir(new URL('../docs/screenshots/', import.meta.url), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  // Screenshots capture the local dashboard only. Never send inference requests.
  await page.route('**/api/chat', route => route.abort());
  const response = await page.request.get(`${origin}/api/dashboard`);
  if (!response.ok()) throw new Error(`Local dashboard unavailable: HTTP ${response.status()}`);
  const initial = await response.json();
  if (!initial.scans.length) await page.request.post(`${origin}/api/scan`);
  await page.goto(origin);
  await page.locator('#stat-total').getByText('12', { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const [view, file] of [['overview', 'overview.png'], ['shipments', 'shipments.png'], ['intelligence', 'risk-intelligence.png'], ['tasks', 'followup-tasks.png']]) {
    await page.locator(`[data-nav="${view}"]`).click();
    await page.locator(`[data-view="${view}"]`).waitFor({ state: 'visible' });
    await page.screenshot({ path: new URL(`../docs/screenshots/${file}`, import.meta.url).pathname, fullPage: true, animations: 'disabled' });
    console.log(`Saved docs/screenshots/${file}`);
  }
} finally { await browser.close(); }
