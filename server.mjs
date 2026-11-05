import http from 'node:http';
import {readFile} from 'node:fs/promises';
const publicFiles = new Map([['/','index.html'],['/src/style.css','src/style.css'],['/src/app.js','src/app.js'],['/src/metrics.js','src/metrics.js'],['/samples/sample-vendor-metrics.csv','samples/sample-vendor-metrics.csv']]);
const types={html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',csv:'text/csv'};
const port=Number(process.env.PORT||4175);
http.createServer(async(req,res)=>{
 const file=publicFiles.get(new URL(req.url,'http://localhost').pathname);
 if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);return res.end('Not found');}
 try{const bytes=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(500);res.end('Unable to load file');}
}).listen(port,'127.0.0.1',()=>console.log(`Vendor Performance Manager: http://127.0.0.1:${port}`));
