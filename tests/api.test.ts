import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import worker from '../src/index.ts';

const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'test', modules: true, script: 'export default { fetch() { return new Response("test"); } }', d1Databases: ['DB'] }] }));
type Env = Parameters<typeof worker.fetch>[1];
let db: Env['DB'];
const calls: { model: string; input: any }[] = [];
let aiResponse: unknown = { response: 'Mock answer based on shipment data.' };
let aiFails = false;
const session = 'regression-session-0001';
before(async () => {
  db = await mf.getD1Database('DB') as unknown as Env['DB'];
  for (const migration of ['0001_init.sql', '0002_unique_open_followup.sql']) {
    const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
});
after(async () => mf.dispose());
async function request(path: string, method = 'GET', body?: unknown, extra: Partial<Env> = {}, headers: Record<string,string> = {}) {
  const env = { DB: db, AI: { run: async (model: string, input: any) => { calls.push({ model, input }); if (aiFails) throw new Error('simulated outage'); return aiResponse; } }, ASSETS: { fetch: async () => new Response('asset') }, ...extra } as Env;
  return worker.fetch(new Request(`http://localhost${path}`, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}
async function dashboard() { return (await request('/api/dashboard')).json() as Promise<any>; }

test('health, assets, unknown routes and unsupported methods', async () => {
  const health = await request('/api/health'); assert.equal(health.status, 200); assert.equal((await health.json() as any).ok, true);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(await (await request('/')).text(), 'asset');
  assert.equal((await request('/api/unknown')).status, 404);
  assert.equal((await request('/api/scan')).status, 404);
  assert.equal((await request('/api/scan', 'OPTIONS')).status, 405);
});
test('seed dashboard includes inventory, sorted risks and consistent KPIs', async () => {
  const data = await dashboard(); assert.equal(data.shipments.length, 12); assert.equal(data.inventory.length, 12);
  assert.equal(data.kpis.delivered, 2); assert.equal(data.kpis.active, 10);
  assert.ok(data.shipments.every((s: any, i: number, a: any[]) => !i || a[i-1].risk.score >= s.risk.score));
});
test('scan upserts, delivery resolves alerts, and delayed status reopens them', async () => {
  assert.equal((await request('/api/scan', 'POST')).status, 200);
  const first = await dashboard(); assert.ok(first.alerts.length > 0);
  await request('/api/scan', 'POST'); assert.equal((await dashboard()).alerts.length, first.alerts.length);
  for (const status of ['in_transit', 'at_hub', 'ordered', 'delivered']) assert.equal((await request('/api/shipments/SHP-2401/status', 'POST', { status })).status, 200);
  await request('/api/scan', 'POST');
  const delivered = await dashboard(); assert.equal(delivered.shipments.find((s: any) => s.id === 'SHP-2401').risk.score, 0);
  assert.equal(delivered.alerts.find((a: any) => a.shipment_id === 'SHP-2401').state, 'resolved');
  await request('/api/shipments/SHP-2401/status', 'POST', { status: 'delayed' }); await request('/api/scan', 'POST');
  assert.equal((await dashboard()).alerts.find((a: any) => a.shipment_id === 'SHP-2401').state, 'open');
  assert.equal((await request('/api/shipments/SHP-9999/status', 'POST', { status: 'delivered' })).status, 404);
  assert.equal((await request('/api/shipments/SHP-2401/status', 'POST', { status: 'invalid' })).status, 400);
});
test('follow-up create, conflict, completion and re-create', async () => {
  assert.equal((await request('/api/followups', 'POST', { shipmentId: 'bad' })).status, 400);
  assert.equal((await request('/api/followups', 'POST', { shipmentId: 'SHP-9999' })).status, 404);
  const created = await request('/api/followups', 'POST', { shipmentId: 'SHP-2401' }); assert.equal(created.status, 201);
  const { id } = await created.json() as any;
  assert.equal((await request('/api/followups', 'POST', { shipmentId: 'SHP-2401' })).status, 409);
  assert.equal((await request(`/api/followups/${id}/complete`, 'POST')).status, 200);
  assert.equal((await request(`/api/followups/${id}/complete`, 'POST')).status, 404);
  assert.equal((await request('/api/followups/99999/complete', 'POST')).status, 404);
  assert.equal((await request('/api/followups', 'POST', { shipmentId: 'SHP-2401' })).status, 201);
});
test('concurrent follow-ups create exactly one open task', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => request('/api/followups', 'POST', { shipmentId: 'SHP-2402' })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409, 409, 409, 409]);
});

test('chat validation returns JSON errors instead of rejecting fetch', async () => {
  for (const body of [null, [], { session: 'bad', message: 'hello' }, { session, message: ' ' }, { session, message: 'a'.repeat(801) }]) {
    const response = await request('/api/chat', 'POST', body); assert.equal(response.status, 400); assert.ok((await response.json() as any).error);
  }
  assert.equal((await request('/api/chat', 'POST')).status, 415);
  const malformed = await worker.fetch(new Request('http://localhost/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), { DB: db } as Env);
  assert.equal(malformed.status, 400);
  assert.equal((await request('/api/chat/history?session=bad')).status, 400);
  assert.equal((await request('/api/chat/history')).status, 400);
  assert.equal((await request('/api/chat', 'POST', { session, message: 'hello' }, { DEMO_ACCESS_CODE: 'private' })).status, 401);
});
test('mocked Llama model, grounded prompt, memory, isolation, history limit and failures', async () => {
  calls.length = 0;
  for (let i = 0; i < 7; i++) assert.equal((await request('/api/chat', 'POST', { session, message: `question ${i}` }, { DEMO_ACCESS_CODE: 'private' }, { 'x-demo-access-code': 'private' })).status, 200);
  assert.equal(calls[0].model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.ok(calls[0].input.messages[0].content.includes('SHP-2401'));
  assert.equal(calls[1].input.messages[1].content, 'question 0');
  const history = await (await request(`/api/chat/history?session=${session}`)).json() as any;
  assert.equal(history.messages.length, 12); assert.equal(history.messages[0].content, 'question 1');
  assert.deepEqual(await (await request('/api/chat/history?session=another-session-0001')).json(), { messages: [] });
  for (const failure of ['throw', 'empty']) {
    aiFails = failure === 'throw'; aiResponse = { response: '' };
    assert.equal((await request('/api/chat', 'POST', { session, message: 'failure' })).status, 503);
  }
  aiFails = false; aiResponse = { response: 'recovered' };
  assert.deepEqual(await (await request(`/api/chat/history?session=${session}`)).json(), history);
});
test('alternate AI response format and database failures return structured responses', async () => {
  aiResponse = { choices: [{ message: { content: 'Alternate response' } }] };
  const success = await request('/api/chat', 'POST', { session, message: 'alternate' });
  assert.equal(success.status, 200); assert.equal((await success.json() as any).answer, 'Alternate response');
  const broken = { prepare() { throw new Error('simulated database outage'); } } as unknown as Env['DB'];
  for (const path of ['/api/dashboard', '/api/chat']) {
    const response = await request(path, path === '/api/chat' ? 'POST' : 'GET', path === '/api/chat' ? { session, message: 'database failure' } : undefined, { DB: broken });
    assert.equal(response.status, 500); assert.ok((await response.json() as any).error);
  }
});

test('open tasks stay ahead of completed tasks and total is independent of page limit', async () => {
  await db.prepare('DELETE FROM followups').run();
  await request('/api/followups', 'POST', { shipmentId: 'SHP-2401' });
  const statements = Array.from({ length: 105 }, (_, i) => db.prepare("INSERT INTO followups(shipment_id,title,status) VALUES ('SHP-2401',?,'done')").bind(`Task ${i}`));
  await db.batch(statements);
  await request('/api/followups', 'POST', { shipmentId: 'SHP-2401' });
  const data = await dashboard(); assert.equal(data.followups.length, 100); assert.equal(data.kpis.openFollowups, 1);
  assert.equal(data.followups[0].status, 'open');
});

test('open follow-up KPI counts tasks beyond the 100-row display limit', async () => {
  await db.batch(Array.from({ length: 101 }, (_, i) => db.prepare(`
    INSERT INTO shipments(id,origin,destination,item,sku,units,carrier,eta,status,priority)
    SELECT ?,origin,destination,item,sku,units,carrier,eta,status,priority FROM shipments WHERE id='SHP-2401'
  `).bind(`SHP-${3000 + i}`)));
  await db.batch(Array.from({ length: 101 }, (_, i) => db.prepare("INSERT INTO followups(shipment_id,title) VALUES (?, 'Count regression')").bind(`SHP-${3000 + i}`)));
  const data = await dashboard(); assert.equal(data.followups.length, 100); assert.equal(data.kpis.openFollowups, 102);
});
