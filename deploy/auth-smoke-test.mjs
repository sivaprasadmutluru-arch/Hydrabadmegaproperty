import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5174';
const access=JSON.parse(readFileSync(process.env.TEST_ACCESS_FILE || 0,'utf8'));
let cookie='',checks=0;
const expect=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
async function req(path,{method='GET',body,session=false,origin=base,headers={}}={}){
 const r=await fetch(base+path,{method,redirect:'manual',headers:{...(method==='POST'?{'Origin':origin,'Content-Type':'application/json'}:{}),...(session?{Cookie:cookie}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return r;
}
for(const path of ['/admin','/admin.html','/x/..%2fadmin.html','/%61dmin.html']){const r=await req(path);expect(r.status,303,'Login redirect '+path);expect(r.headers.get('location'),'/admin/login','Login destination');expect(r.headers.has('www-authenticate'),false,'No browser prompt');}
expect((await req('/admin/login')).status,200,'Login UI');
expect((await req('/api/expo')).status,401,'Anonymous API rejected');
expect((await req('/api/expo',{headers:{Cookie:'hmp_admin_session='+'a'.repeat(64)}})).status,401,'Forged cookie rejected');
expect((await req('/api/expo',{headers:{Authorization:'Basic '+Buffer.from(access.username+':'+access.password).toString('base64')}})).status,401,'Basic auth does not bypass session');
expect((await req('/api/admin/login',{method:'POST',body:access,origin:'https://untrusted.example'})).status,403,'Cross-origin login rejected');
expect((await req('/api/admin/login',{method:'POST',body:{username:access.username,password:'incorrect-test-password'}})).status,401,'Incorrect password rejected');
let login=await req('/api/admin/login',{method:'POST',body:access});expect(login.status,200,'Valid login');
let setCookie=login.headers.get('set-cookie');expect(!!setCookie,true,'Cookie issued');expect(setCookie.includes('HttpOnly'),true,'HttpOnly');expect(setCookie.includes('SameSite=Strict'),true,'SameSite');expect(setCookie.includes('Secure'),base.startsWith('https:'),'Secure cookie on HTTPS');
cookie=setCookie.split(';')[0];
expect((await req('/admin',{session:true})).status,200,'Authenticated dashboard');
expect((await req('/admin.html',{session:true})).status,307,'Authenticated HTML alias');
expect((await req('/api/expo',{session:true})).status,200,'Authenticated organizer list');
expect((await req('/admin/login',{session:true})).status,303,'Signed-in login redirects');
expect((await req('/api/expo',{method:'POST',session:true,origin:'https://untrusted.example',body:{action:'settings',value:{}}})).status,403,'Cross-origin management rejected');
expect((await req('/api/expo',{method:'POST',session:true,body:{action:'update',id:'HMPE27-VIS-00000000',status:'Approved',payment:'Paid',amount:0}})).status,404,'Authorized request reaches validation');
expect((await req('/api/public/expo')).status,200,'Public settings remain open');
expect((await req('/api/public/expo',{method:'POST',body:{action:'checkin',id:'test'}})).status,403,'Public management blocked');
const logout=await req('/api/admin/logout',{method:'POST',session:true});expect(logout.status,200,'Logout');expect(logout.headers.get('set-cookie').includes('Max-Age=0'),true,'Cookie expired');
expect((await req('/api/expo',{session:true})).status,401,'Logged-out cookie invalidated');
if(process.env.TEST_DATABASE_PATH){
 const {DatabaseSync}=await import('node:sqlite');
 login=await req('/api/admin/login',{method:'POST',body:access});expect(login.status,200,'Second login');cookie=login.headers.get('set-cookie').split(';')[0];
 const db=new DatabaseSync(process.env.TEST_DATABASE_PATH);const hash=createHash('sha256').update(cookie.split('=')[1]).digest('hex');
 db.prepare('UPDATE admin_sessions SET expires_at=? WHERE token_hash=?').run(Date.now()-1,hash);db.close();
 expect((await req('/api/expo',{session:true})).status,401,'Expired session blocked');
 for(let i=0;i<8;i++)expect((await req('/api/admin/login',{method:'POST',body:{username:access.username,password:'wrong'}})).status,401,'Failed attempt '+i);
 expect((await req('/api/admin/login',{method:'POST',body:access})).status,429,'Login attempts throttled');
}
console.log(`PASS ${checks} login/session/access assertions`);
