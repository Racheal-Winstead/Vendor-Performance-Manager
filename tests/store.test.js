import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDb, createStore} from '../server/db.mjs';

const mk = () => createStore(openDb(':memory:'));
const base = {vendor: 'Acme', start: '2026-10-01', end: '2026-10-31',
  metrics: [{row: 2, name: 'Quality', raw: '78', unit: 'percent', target: '85', direction: 'min', assess: true},
            {row: 3, name: 'Missing', raw: '', unit: 'percent', target: '85', direction: 'min', assess: true}],
  notes: ['Calls were late.']};

test('create review runs deterministic checks and numbers notes', () => {
  const r = mk().createReview(base);
  assert.equal(r.status, 'draft');
  assert.deepEqual(r.metrics.map(m => m.status), ['missed', 'unassessed']);
  assert.equal(r.metrics[0].gap, -7);
  assert.equal(r.notes[0].ref, 'N1');
});

test('rejects bad dates and blank vendor', () => {
  const s = mk();
  assert.throws(() => s.createReview({...base, end: '2026-09-01'}), /valid start and end/);
  assert.throws(() => s.createReview({...base, vendor: '  '}), /Vendor is required/);
});

test('approval needs a summary; export blocked until approved; edit reverts to draft', () => {
  const s = mk(), r = s.createReview(base);
  assert.throws(() => s.approveReview(r.id), /summary/);
  s.updateReview(r.id, {summary: 'Quality missed target.'});
  assert.throws(() => s.exportMarkdown(r.id), /approved/);
  assert.equal(s.approveReview(r.id).status, 'approved');
  assert.match(s.exportMarkdown(r.id), /Quality missed target/);
  const edited = s.updateReview(r.id, {summary: 'Changed.'});
  assert.equal(edited.status, 'draft');
  assert.equal(edited.approved_at, null);
});

test('actions: create, update status, overdue flag, filters', () => {
  const s = mk(), r = s.createReview(base);
  const a = s.createAction(r.id, {description: 'Retrain', owner: 'Sam', due_date: '2020-01-01'});
  assert.equal(a.status, 'Open'); assert.equal(a.overdue, true);
  assert.equal(s.updateAction(a.id, {status: 'Done'}).overdue, false);
  assert.throws(() => s.updateAction(a.id, {status: 'Blocked'}), /Status must be/);
  assert.throws(() => s.createAction(r.id, {description: 'x', owner: 'y', due_date: 'tomorrow'}), /YYYY-MM-DD/);
  assert.equal(s.listActions({vendor: 'Acme', status: 'Done'}).length, 1);
  assert.equal(s.listActions({vendor: 'Other'}).length, 0);
});

test('data survives reopening the database file', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'vpm-')), file = join(dir, 't.sqlite');
  try {
    const id = createStore(openDb(file)).createReview(base).id;
    const a = createStore(openDb(file));
    a.createAction(id, {description: 'd', owner: 'o', due_date: '2030-01-01', status: 'In progress'});
    const again = createStore(openDb(file)).getReview(id);
    assert.equal(again.actions[0].status, 'In progress');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
