import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import worker from '../src/index.ts';

test('successful chat history survives a D1 runtime restart', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'infraflow-persistence-'));
  const options = convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("test"); } }',
    d1Databases: ['DB'],
    // Miniflare 5 uses this shared persistence root; d1Persist is not converted.
    resourcePersistencePath: storage,
  });
  let mf = new Miniflare(options);
  type Env = Parameters<typeof worker.fetch>[1];
  const session = 'persistent-chat-session-001';
  const answer = 'Mock answer: SHP-2401 is going to Toronto, CA.';
  try {
    let db = await mf.getD1Database('DB');
    const sql = await readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
    const env = { DB: db, AI: { run: async () => ({ response: answer }) } } as unknown as Env;
    const response = await worker.fetch(new Request('http://localhost/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, message: 'Where is SHP-2401 going?' }),
    }), env);
    assert.equal(response.status, 200);
    await mf.dispose();
    mf = new Miniflare(options);
    db = await mf.getD1Database('DB');
    const history = await worker.fetch(new Request(`http://localhost/api/chat/history?session=${session}`), { DB: db } as unknown as Env);
    assert.equal(history.status, 200);
    assert.deepEqual(await history.json(), { messages: [
      { role: 'user', content: 'Where is SHP-2401 going?' },
      { role: 'assistant', content: answer },
    ] });
  } finally {
    await mf.dispose();
    await rm(storage, { recursive: true, force: true });
  }
});
