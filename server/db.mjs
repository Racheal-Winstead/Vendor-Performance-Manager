import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {assessMetric} from '../src/metrics.js';

export const ACTION_STATUSES = ['Open', 'In progress', 'Done'];
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function openDb(path = process.env.DATABASE_PATH || './data/vendor-performance.sqlite') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, vendor TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
      summary TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT);
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      row INTEGER NOT NULL, name TEXT NOT NULL, raw TEXT NOT NULL, unit TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '', direction TEXT NOT NULL DEFAULT 'min' CHECK (direction IN ('min','max')),
      assess INTEGER NOT NULL DEFAULT 1, unit_confirmed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      ref TEXT NOT NULL, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, text TEXT NOT NULL, source_refs TEXT NOT NULL DEFAULT '[]',
      state TEXT NOT NULL DEFAULT 'suggested' CHECK (state IN ('suggested','accepted','dismissed')));
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL,
      description TEXT NOT NULL, owner TEXT NOT NULL, due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In progress','Done')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);
  // Databases created before unit confirmation existed get the column added.
  if (!db.prepare('PRAGMA table_info(metrics)').all().some(c => c.name === 'unit_confirmed')) {
    db.exec('ALTER TABLE metrics ADD COLUMN unit_confirmed INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

const req = (v, label) => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${label} is required.`);
  return v.trim();
};
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const validAction = b => {
  const description = req(b.description, 'Description'), owner = req(b.owner, 'Owner');
  if (!isDate(b.due_date)) throw new HttpError(400, 'Due date must be YYYY-MM-DD.');
  const status = b.status ?? 'Open';
  if (!ACTION_STATUSES.includes(status)) throw new HttpError(400, `Status must be one of: ${ACTION_STATUSES.join(', ')}.`);
  return {description, owner, due_date: b.due_date, status};
};

export function createStore(db) {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);

  function getReviewRow(id) {
    const r = one('SELECT * FROM reviews WHERE id = ?', id);
    if (!r) throw new HttpError(404, 'Review not found.');
    return r;
  }
  const withOverdue = a => ({...a, overdue: a.status !== 'Done' && a.due_date < today()});

  function replaceChildren(id, {metrics, notes}) {
    if (metrics) {
      run('DELETE FROM metrics WHERE review_id = ?', id);
      for (const m of metrics) {
        const name = req(m.name, 'Metric name'), unit = req(m.unit, 'Metric unit');
        const assess = m.assess === false ? 0 : 1, confirmed = m.unit_confirmed === true ? 1 : 0;
        // PRD P0: the manager must confirm the target uses the metric's unit before it is assessed.
        if (assess && !confirmed) throw new HttpError(400, `Confirm that the target for “${name}” uses ${unit}, or uncheck Assess.`);
        run('INSERT INTO metrics (review_id,row,name,raw,unit,target,direction,assess,unit_confirmed) VALUES (?,?,?,?,?,?,?,?,?)',
          id, m.row, name, String(m.raw ?? ''), unit, String(m.target ?? ''), m.direction === 'max' ? 'max' : 'min', assess, confirmed);
      }
    }
    if (notes) {
      run('DELETE FROM notes WHERE review_id = ?', id);
      notes.forEach((text, i) => run('INSERT INTO notes (review_id,ref,text) VALUES (?,?,?)', id, `N${i + 1}`, req(text, 'Note text')));
    }
  }

  return {
    createReview(body) {
      const vendor = req(body.vendor, 'Vendor');
      if (!isDate(body.start) || !isDate(body.end) || body.end < body.start) throw new HttpError(400, 'Choose a valid start and end date; the end must not be before the start.');
      const id = randomUUID(), t = now();
      db.exec('BEGIN');
      try {
        run('INSERT INTO reviews (id,vendor,start_date,end_date,created_at,updated_at) VALUES (?,?,?,?,?,?)', id, vendor, body.start, body.end, t, t);
        replaceChildren(id, body);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return this.getReview(id);
    },

    listReviews() {
      return all('SELECT id,vendor,start_date,end_date,status,created_at,updated_at,approved_at FROM reviews ORDER BY updated_at DESC');
    },

    getReview(id) {
      const review = getReviewRow(id);
      const metrics = all('SELECT * FROM metrics WHERE review_id = ? ORDER BY row', id).map(m => {
        const m2 = {...m, assess: !!m.assess, unit_confirmed: !!m.unit_confirmed};
        return {...m2, ...assessMetric(m2)};
      });
      return {
        ...review, metrics,
        notes: all('SELECT ref,text FROM notes WHERE review_id = ? ORDER BY id', id),
        findings: all('SELECT * FROM findings WHERE review_id = ?', id).map(f => ({...f, source_refs: JSON.parse(f.source_refs)})),
        actions: all('SELECT * FROM actions WHERE review_id = ? ORDER BY due_date', id).map(withOverdue),
      };
    },

    // Any content edit to an approved review sends it back to draft (PRD P0).
    updateReview(id, body) {
      const cur = getReviewRow(id);
      const vendor = body.vendor === undefined ? cur.vendor : req(body.vendor, 'Vendor');
      const start = body.start ?? cur.start_date, end = body.end ?? cur.end_date;
      if (!isDate(start) || !isDate(end) || end < start) throw new HttpError(400, 'Choose a valid start and end date; the end must not be before the start.');
      const summary = body.summary === undefined ? cur.summary : String(body.summary);
      db.exec('BEGIN');
      try {
        run(`UPDATE reviews SET vendor=?,start_date=?,end_date=?,summary=?,status='draft',approved_at=NULL,updated_at=? WHERE id=?`,
          vendor, start, end, summary, now(), id);
        replaceChildren(id, body);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return this.getReview(id);
    },

    // Approval is always an explicit call; nothing else sets status to approved.
    approveReview(id) {
      const r = this.getReview(id);
      if (!r.summary.trim()) throw new HttpError(409, 'Write or accept a summary before approving.');
      const t = now();
      run(`UPDATE reviews SET status='approved',approved_at=?,updated_at=? WHERE id=?`, t, t, id);
      return this.getReview(id);
    },

    exportMarkdown(id) {
      const r = this.getReview(id);
      if (r.status !== 'approved') throw new HttpError(409, 'Only approved reviews can be exported.');
      const gap = m => (m.gap === null ? '—' : String(Math.round(m.gap * 1e6) / 1e6));
      const L = [`# ${r.vendor} — performance review`, `Period: ${r.start_date} to ${r.end_date}`, `Approved: ${r.approved_at}`, '', '## Summary', r.summary, '',
        '## Metrics', '| Metric | Actual | Target | Gap | Status |', '|---|---|---|---|---|'];
      for (const m of r.metrics) L.push(`| ${m.name} (CSV row ${m.row}) | ${m.raw || 'unavailable'} ${m.unit} | ${m.status === 'unassessed' ? '—' : `${m.direction === 'min' ? '≥' : '≤'} ${m.target}`} | ${gap(m)} | ${m.status} |`);
      L.push('', '## Notes');
      for (const n of r.notes) L.push(`- ${n.ref}: ${n.text}`);
      L.push('', '## Actions', '| Action | Owner | Due | Status |', '|---|---|---|---|');
      for (const a of r.actions) L.push(`| ${a.description} | ${a.owner} | ${a.due_date} | ${a.status}${a.overdue ? ' (overdue)' : ''} |`);
      return L.join('\n') + '\n';
    },

    // Replaces only unreviewed suggestions; accepted/dismissed decisions are kept.
    replaceSuggestedFindings(reviewId, findings) {
      getReviewRow(reviewId);
      db.exec('BEGIN');
      try {
        run(`DELETE FROM findings WHERE review_id = ? AND state = 'suggested'`, reviewId);
        for (const f of findings) {
          run('INSERT INTO findings (id,review_id,kind,text,source_refs,state) VALUES (?,?,?,?,?,?)',
            randomUUID(), reviewId, f.kind, f.text, JSON.stringify(f.source_refs), 'suggested');
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return all('SELECT * FROM findings WHERE review_id = ?', reviewId).map(f => ({...f, source_refs: JSON.parse(f.source_refs)}));
    },

    setFindingState(findingId, state) {
      if (!['suggested', 'accepted', 'dismissed'].includes(state)) throw new HttpError(400, 'State must be suggested, accepted or dismissed.');
      const f = one('SELECT * FROM findings WHERE id = ?', findingId);
      if (!f) throw new HttpError(404, 'Finding not found.');
      run('UPDATE findings SET state = ? WHERE id = ?', state, findingId);
      return {...f, state, source_refs: JSON.parse(f.source_refs)};
    },

    createAction(reviewId, body) {
      getReviewRow(reviewId);
      const a = validAction(body);
      if (body.finding_id && !one('SELECT 1 FROM findings WHERE id=? AND review_id=?', body.finding_id, reviewId)) throw new HttpError(400, 'Finding does not belong to this review.');
      const id = randomUUID(), t = now();
      run('INSERT INTO actions (id,review_id,finding_id,description,owner,due_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id, reviewId, body.finding_id ?? null, a.description, a.owner, a.due_date, a.status, t, t);
      return this.getAction(id);
    },

    getAction(id) {
      const a = one('SELECT * FROM actions WHERE id = ?', id);
      if (!a) throw new HttpError(404, 'Action not found.');
      return withOverdue(a);
    },

    updateAction(id, body) {
      const cur = this.getAction(id);
      const a = validAction({...cur, ...body});
      run('UPDATE actions SET description=?,owner=?,due_date=?,status=?,updated_at=? WHERE id=?', a.description, a.owner, a.due_date, a.status, now(), id);
      return this.getAction(id);
    },

    listActions({vendor, status, owner} = {}) {
      const where = [], p = [];
      if (vendor) { where.push('r.vendor = ?'); p.push(vendor); }
      if (status) { where.push('a.status = ?'); p.push(status); }
      if (owner) { where.push('a.owner = ?'); p.push(owner); }
      return all(`SELECT a.*, r.vendor, r.start_date AS review_start, r.end_date AS review_end FROM actions a JOIN reviews r ON r.id = a.review_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.due_date`, ...p).map(withOverdue);
    },


  };
}
