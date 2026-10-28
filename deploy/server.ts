import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep, posix } from 'node:path';
import { Readable } from 'node:stream';
import { GET, POST } from '../app/api/expo/route';
import { GET as publicGet, POST as publicPost } from '../app/api/public/expo/route';
import { GET as getQr } from '../app/api/qr/route';
import { sqlite, ensurePassCode } from './node-db';
import { signedIn, sameOrigin, authRoute } from './admin-auth';
import { accountRoutes, attendeeRegistration, ownedPass, notifyAdminChange, passView } from './attendee-accounts';

const port = Number(process.env.PORT || 3000);
const publicRoot = resolve(process.env.PUBLIC_DIR || 'public');
const origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
const types: Record<string,string> = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.ico':'image/x-icon', '.webp':'image/webp' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  try {
    const url = new URL(req.url || '/', origin);
    // Normalize decoded aliases before authorization, including encoded slashes.
    const pathname = posix.normalize(decodeURIComponent(url.pathname));
    url.pathname = pathname;
    if(await authRoute(req,res,pathname,origin)) return;
    if(await accountRoutes(req,res,pathname,origin)) return;
    if(pathname==='/admin/login' && signedIn(req)) {res.writeHead(303,{'Location':'/admin','Cache-Control':'no-store'});return res.end();}
    if(pathname==='/admin' || pathname==='/admin.html' || pathname==='/api/expo') {
      res.setHeader('Cache-Control','no-store');
      if(!signedIn(req)) {
        if(pathname==='/api/expo'){res.writeHead(401,{'Content-Type':'application/json'});return res.end('{"error":"Please sign in again.","loginUrl":"/admin/login"}');}
        res.writeHead(303,{'Location':'/admin/login'});return res.end();
      }
      if(req.method==='POST' && !sameOrigin(req,origin)){res.writeHead(403,{'Content-Type':'application/json'});return res.end('{"error":"Request origin is not allowed"}');}
    }
    if (url.pathname === '/healthz' && ['GET','HEAD'].includes(req.method || '')) {
      sqlite.prepare('SELECT 1').get();
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(req.method === 'HEAD' ? undefined : '{"status":"ok"}');
    }
    if (url.pathname === '/api/expo' || url.pathname === '/api/public/expo' || url.pathname === '/api/qr') {
      res.setHeader('Cache-Control', 'no-store');
      if (!['GET','HEAD','POST'].includes(req.method || '') || (url.pathname === '/api/qr' && req.method === 'POST')) {
        res.writeHead(405, {'Allow':url.pathname === '/api/qr' ? 'GET, HEAD' : 'GET, HEAD, POST'});
        return res.end();
      }
      let body: Uint8Array | undefined;
      if (req.method === 'POST') {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) { res.writeHead(413); return res.end('Request too large'); }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      if(pathname==='/api/public/expo'&&req.method==='POST'){
        let input;try{input=JSON.parse(Buffer.from(body||[]).toString())}catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end('{"error":"Invalid request data"}');}
        return attendeeRegistration(req,res,input,origin);
      }
      if(pathname==='/api/public/expo'&&url.searchParams.get('id')){
        const access=ownedPass(req,url.searchParams.get('id')!);
        if(!access.allowed){res.writeHead(access.status!,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:access.error}));}
        const pass=sqlite.prepare('SELECT * FROM registrations WHERE id=?').get(url.searchParams.get('id')!);res.writeHead(pass?200:404,{'Content-Type':'application/json'});return res.end(JSON.stringify(pass?passView(pass):{error:'Pass not found'}));
      }
      let mutation:any, before:any;
      if(pathname==='/api/expo'&&req.method==='POST'){
        try{mutation=JSON.parse(Buffer.from(body||[]).toString());if(mutation.id)before=sqlite.prepare('SELECT * FROM registrations WHERE id=?').get(mutation.id);}catch{}
      }
      // The configured public origin makes generated QR links independent of proxy headers.
      const request = new Request(new URL(url.pathname + url.search, origin), {
        method:req.method === 'HEAD' ? 'GET' : req.method,
        headers: {'Content-Type':String(req.headers['content-type'] || 'application/json')},
        ...(body ? {body} : {}),
      });
      const result = await (url.pathname === '/api/qr' ? getQr(request) : url.pathname === '/api/public/expo' ? req.method === 'POST' ? publicPost(request) : publicGet(request) : req.method === 'POST' ? POST(request) : GET(request));
      if(result.ok&&mutation?.id&&['update','checkin'].includes(mutation.action))notifyAdminChange(before,sqlite.prepare('SELECT * FROM registrations WHERE id=?').get(mutation.id));
      if(pathname==='/api/expo'&&result.ok){
        const data=await result.json();
        if(data.records)for(const row of data.records)row.shortCode=ensurePassCode(row.id);
        else if(data.id)data.shortCode=ensurePassCode(data.id);
        res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(req.method==='HEAD'?undefined:JSON.stringify(data));
      }
      res.writeHead(result.status, Object.fromEntries(result.headers));
      if (req.method === 'HEAD') return res.end();
      return result.body ? Readable.fromWeb(result.body as never).pipe(res) : res.end();
    }
    if (!['GET','HEAD'].includes(req.method || '')) {res.writeHead(405, {'Allow':'GET, HEAD'});return res.end();}
    if (url.pathname === '/expo.html' || url.pathname === '/admin.html') {
      res.writeHead(307, {'Location':url.pathname.replace('.html','')+url.search});return res.end();
    }
    const path = url.pathname === '/' || url.pathname === '/expo' ? '/expo.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname === '/admin/login' ? '/admin-login.html' : url.pathname;
    if (path.split('/').some(part => part.startsWith('.'))) {res.writeHead(404);return res.end('Not found');}
    const file = resolve(publicRoot, '.'+path);
    if (!file.startsWith(publicRoot+sep)) {res.writeHead(404);return res.end('Not found');}
    const info = await stat(file);
    if (!info.isFile()) {res.writeHead(404);return res.end('Not found');}
    res.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream','Content-Length':info.size,'Cache-Control':extname(file) === '.html' ? 'no-store' : 'public, max-age=300'});
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch (error) {
    if (res.headersSent) return res.destroy();
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {res.writeHead(404);return res.end('Not found');}
    if (error instanceof URIError) {res.writeHead(400);return res.end('Invalid URL');}
    console.error('Request failed:', error instanceof Error ? error.message : 'unknown error');
    res.writeHead(500, {'Content-Type':'application/json'});res.end('{"error":"Unable to process request"}');
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(port, '0.0.0.0', () => console.log(`HMP Expo2027 listening on port ${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
  server.close(()=>{sqlite.close();process.exit(0);});
  setTimeout(()=>process.exit(1),10000).unref();
});
