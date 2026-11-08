import {HttpError} from './db.mjs';
import {draftReview} from './ai.mjs';
import {parseMetricsCsv, parseNotes} from './parse.mjs';

const json = (res, status, body) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 2 * 1024 * 1024) throw new HttpError(413, 'Request too large.');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { const b = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (b && typeof b === 'object' && !Array.isArray(b)) return b; }
  catch { /* fall through */ }
  throw new HttpError(400, 'Body must be a JSON object.');
}

// Returns true if the request was handled (i.e. it was an /api route).
export async function handleApi(store, req, res, {callModel} = {}) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const m = req.method;
  try {
    if (parts[0] === 'reviews') {
      const [, id, sub] = parts;
      if (!id) {
        if (m === 'GET') return json(res, 200, store.listReviews()), true;
        if (m === 'POST') return json(res, 201, store.createReview(await readBody(req))), true;
      } else if (!sub) {
        if (m === 'GET') return json(res, 200, store.getReview(id)), true;
        if (m === 'PUT') return json(res, 200, store.updateReview(id, await readBody(req))), true;
      } else if (sub === 'approve' && m === 'POST') return json(res, 200, store.approveReview(id)), true;
      else if (sub === 'draft' && m === 'POST') return json(res, 200, await draftReview(store, id, {callModel})), true;
      else if (sub === 'export' && m === 'GET') {
        const md = store.exportMarkdown(id);
        res.writeHead(200, {'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="review.md"', 'X-Content-Type-Options': 'nosniff'});
        return res.end(md), true;
      } else if (sub === 'actions' && m === 'POST') return json(res, 201, store.createAction(id, await readBody(req))), true;
    } else if (parts[0] === 'parse' && m === 'POST') {
      const b = await readBody(req);
      if (parts[1] === 'csv') return json(res, 200, {metrics: parseMetricsCsv(b.csv)}), true;
      if (parts[1] === 'notes') return json(res, 200, {notes: parseNotes(b.text)}), true;
    } else if (parts[0] === 'findings' && parts[1] && m === 'PATCH') {
      const b = await readBody(req);
      return json(res, 200, store.setFindingState(parts[1], b.state)), true;
    } else if (parts[0] === 'actions') {
      const id = parts[1];
      if (!id && m === 'GET') {
        const q = Object.fromEntries(url.searchParams);
        return json(res, 200, store.listActions({vendor: q.vendor, status: q.status, owner: q.owner})), true;
      }
      if (id && m === 'GET') return json(res, 200, store.getAction(id)), true;
      if (id && m === 'PATCH') return json(res, 200, store.updateAction(id, await readBody(req))), true;
    }
    throw new HttpError(404, 'Not found.');
  } catch (e) {
    if (e instanceof HttpError) json(res, e.status, {error: e.message});
    else { console.error(e); json(res, 500, {error: 'Unexpected server error.'}); }
    return true;
  }
}
