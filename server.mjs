import http from 'node:http';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {openDb, createStore} from './server/db.mjs';
import {handleApi} from './server/api.mjs';

const dbPath = process.env.DATABASE_PATH || './data/vendor-performance.sqlite';
mkdirSync(dirname(dbPath), {recursive: true});
const store = createStore(openDb(dbPath));
const port = Number(process.env.PORT || 4175);

http.createServer(async (req, res) => {
  if (await handleApi(store, req, res)) return;
  // Static front end is added once Racheal's UI is merged.
  res.writeHead(404); res.end('Not found');
}).listen(port, '127.0.0.1', () => console.log(`Vendor Performance Manager API: http://127.0.0.1:${port}/api/reviews`));
