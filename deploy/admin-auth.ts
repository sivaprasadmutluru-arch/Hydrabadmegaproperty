import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sqlite } from './node-db';

const derive = promisify(scrypt);
const config = JSON.parse(readFileSync(process.env.ADMIN_AUTH_FILE || '/run/secrets/admin-auth.json','utf8'));
if (typeof config.username !== 'string' || !/^[a-f0-9]{128}$/.test(config.passwordHash) || !/^[a-f0-9]{32}$/.test(config.salt)) throw Error('Invalid administrator authentication configuration');
const cookieName = 'hmp_admin_session';
const lifetime = 8*60*60;
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const credentialVersion = digest(config.username+config.salt+config.passwordHash);
sqlite.exec('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, credential_version TEXT NOT NULL)');
const failures = new Map<string,{count:number,until:number}>();

function token(req: IncomingMessage) {
  const value = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1) || '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}
export function signedIn(req: IncomingMessage) {
  const value=token(req);
  return !!value && !!sqlite.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>? AND credential_version=?').get(digest(value),Date.now(),credentialVersion);
}
function cookie(value: string, maxAge: number, origin: string) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(origin).protocol==='https:'?'; Secure':''}`;
}
const json = (res: ServerResponse,status:number,data:unknown) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
export function sameOrigin(req: IncomingMessage, origin: string) {
  return req.headers.origin === origin && req.headers['sec-fetch-site'] !== 'cross-site';
}
export async function authRoute(req: IncomingMessage,res: ServerResponse,path: string,origin: string) {
  if(path!=='/api/admin/login' && path!=='/api/admin/logout') return false;
  if(req.method!=='POST'){res.writeHead(405,{'Allow':'POST'});res.end();return true;}
  if(!sameOrigin(req,origin)){json(res,403,{error:'Please sign in from this website.'});return true;}
  if(path==='/api/admin/logout'){
    const value=token(req); if(value)sqlite.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(digest(value));
    res.setHeader('Set-Cookie',cookie('',0,origin));json(res,200,{ok:true});return true;
  }
  const ip=String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown');
  const now=Date.now();
  const attempt=failures.get(ip);
  if(attempt && attempt.until>now && attempt.count>=8){res.setHeader('Retry-After',String(Math.ceil((attempt.until-now)/1000)));json(res,429,{error:'Too many attempts. Please try again in a few minutes.'});return true;}
  // Record before awaiting the password hash so parallel attempts cannot bypass the limit.
  failures.set(ip,{count:attempt && attempt.until>now?attempt.count+1:1,until:attempt && attempt.until>now?attempt.until:now+15*60*1000});
  if(failures.size>10000)for(const [key,value] of failures)if(value.until<now)failures.delete(key);
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req){size+=chunk.length;if(size>8192){json(res,413,{error:'Sign-in request is too large.'});return true;}chunks.push(chunk);}
  let body;
  try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{json(res,400,{error:'Enter your username and password.'});return true;}
  if(!body || typeof body.username!=='string' || typeof body.password!=='string' || body.username.length>100 || body.password.length>512){json(res,400,{error:'Enter your username and password.'});return true;}
  const hash=await derive(body.password,config.salt,64) as Buffer;
  const userMatches=timingSafeEqual(Buffer.from(digest(body.username.trim())),Buffer.from(digest(config.username)));
  if(!timingSafeEqual(hash,Buffer.from(config.passwordHash,'hex')) || !userMatches){json(res,401,{error:'The username or password is incorrect.'});return true;}
  failures.delete(ip);
  sqlite.prepare('DELETE FROM admin_sessions WHERE expires_at<=? OR credential_version<>?').run(now,credentialVersion);
  const value=randomBytes(32).toString('hex');
  sqlite.prepare('INSERT INTO admin_sessions VALUES (?,?,?)').run(digest(value),now+lifetime*1000,credentialVersion);
  res.setHeader('Set-Cookie',cookie(value,lifetime,origin));json(res,200,{ok:true,redirect:'/admin'});return true;
}
