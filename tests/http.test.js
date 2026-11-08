import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {openDb, createStore} from '../server/db.mjs';
import {handleApi} from '../server/api.mjs';

// Runs the real HTTP handler on an ephemeral port against an in-memory database.
async function withServer(fn, callModel) {
  const store = createStore(openDb(':memory:'));
  const server = http.createServer((req, res) => handleApi(store, req, res, {callModel}).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
    const text = await res.text();
    const type = res.headers.get('content-type') || '';
    return {status: res.status, body: text && type.includes('json') ? JSON.parse(text) : null, type, text};
  };
  try { await fn(call, base); } finally { await new Promise(r => server.close(r)); }
}

const review = {vendor: 'Acme', start: '2026-10-01', end: '2026-10-31',
  metrics: [{row: 2, name: 'Quality', raw: '78', unit: 'percent', target: '85', direction: 'min', assess: true, unit_confirmed: true}],
  notes: ['Calls were late.']};

test('finding accept and dismiss work over HTTP and persist', async () => {
  await withServer(async call => {
    const r = (await call('POST', '/api/reviews', review)).body;
    const d = (await call('POST', `/api/reviews/${r.id}/draft`, {})).body;
    const id = d.findings[0].id;
    const acc = await call('PATCH', `/api/findings/${id}`, {state: 'accepted'});
    assert.equal(acc.status, 200); assert.equal(acc.body.state, 'accepted');
    assert.equal((await call('PATCH', `/api/findings/${id}`, {state: 'maybe'})).status, 400);
    assert.equal((await call('PATCH', '/api/findings/nope', {state: 'dismissed'})).status, 404);
    const again = (await call('POST', `/api/reviews/${r.id}/draft`, {})).body;
    assert.equal(again.findings.find(f => f.id === id).state, 'accepted');
  });
});

test('CSV parse endpoint returns rows, or a readable error for bad files', async () => {
  await withServer(async call => {
    const ok = await call('POST', '/api/parse/csv', {csv: 'metric_name,actual_value,unit\nQuality,78,percent\n'});
    assert.equal(ok.status, 200);
    assert.equal(ok.body.metrics[0].name, 'Quality');
    const bad = await call('POST', '/api/parse/csv', {csv: 'name,value,unit\na,1,%'});
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /exactly these columns/);
    assert.equal((await call('POST', '/api/parse/csv', {})).status, 400);
  });
});

test('notes parse endpoint splits lines and enforces limits', async () => {
  await withServer(async call => {
    const ok = await call('POST', '/api/parse/notes', {text: 'First note\n\n  Second note  \r\n'});
    assert.deepEqual(ok.body.notes, ['First note', 'Second note']);
    const long = await call('POST', '/api/parse/notes', {text: 'x'.repeat(2001)});
    assert.equal(long.status, 400);
  });
});

test('approved review export is served as Markdown download over HTTP', async () => {
  await withServer(async call => {
    const r = (await call('POST', '/api/reviews', review)).body;
    assert.equal((await call('GET', `/api/reviews/${r.id}/export`)).status, 409);
    await call('PUT', `/api/reviews/${r.id}`, {summary: 'Quality is below target.'});
    await call('POST', `/api/reviews/${r.id}/approve`);
    const md = await call('GET', `/api/reviews/${r.id}/export`);
    assert.equal(md.status, 200);
    assert.match(md.type, /text\/markdown/);
    assert.match(md.text, /Quality is below target/);
  });
});

test('editing an approved review over HTTP returns it to draft', async () => {
  await withServer(async call => {
    const r = (await call('POST', '/api/reviews', review)).body;
    await call('PUT', `/api/reviews/${r.id}`, {summary: 'Done.'});
    await call('POST', `/api/reviews/${r.id}/approve`);
    const edited = await call('PUT', `/api/reviews/${r.id}`, {summary: 'Changed.'});
    assert.equal(edited.body.status, 'draft');
  });
});

test('malformed JSON bodies are rejected with 400, not crashed on', async () => {
  await withServer(async (call, base) => {
    const res = await fetch(`${base}/api/reviews`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{not json'});
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /JSON object/);
  });
});
