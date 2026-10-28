import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { z } from 'zod';
import { sqlite, ensurePassCode } from './node-db';
import { sameOrigin,signedIn } from './admin-auth';
const derive=promisify(scrypt),cookieName='hmp_attendee_session',lifetime=30*24*60*60;
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const now=()=>new Date().toISOString();
const duplicateAccount='An account already exists with this phone number or email address. Please sign in.';
const phone=z.string().trim().regex(/^[0-9+ ()-]{8,18}$/).refine(v=>{const n=v.replace(/[^0-9]/g,'').length;return n>=8&&n<=15},'Enter a valid phone number.');
const email=z.string().trim().toLowerCase().email().max(254);
const signup=z.object({name:z.string().trim().min(1).max(150),email,phone,password:z.string().min(10).max(128),emailUpdates:z.boolean().default(false)}).strict();
const login=z.union([
 z.object({identifier:z.string().trim().min(1).max(254),password:z.string().min(1).max(128)}).strict(),
 z.object({email,password:z.string().min(1).max(128)}).strict().transform(b=>({identifier:b.email,password:b.password}))
]);
function loginUser(identifier:string):any{
 if(identifier.includes('@'))return sqlite.prepare('SELECT * FROM attendee_users WHERE email=?').get(identifier.toLowerCase());
 if(!/^[0-9+ ()-]{8,18}$/.test(identifier))return null;
 const digits=identifier.replace(/[^0-9]/g,''),local=/^91[6-9][0-9]{9}$/.test(digits)?digits.slice(2):digits;
 const variants=/^[6-9][0-9]{9}$/.test(local)?[local,'91'+local]:[digits,digits];
 const matches=sqlite.prepare("SELECT * FROM attendee_users WHERE replace(replace(replace(replace(replace(phone,' ',''),'+',''),'(',''),')',''),'-','') IN (?,?) LIMIT 2").all(...variants);
 // A shared phone must never select an arbitrary attendee's account.
 return matches.length===1?matches[0]:null;
}
const profile=z.object({name:z.string().trim().min(1).max(150),phone,emailUpdates:z.boolean()}).strict();
const failures=new Map<string,{count:number,until:number}>();
function limited(req:IncomingMessage,key:string,max:number,ms=900000){
 const id=key+':'+String(req.headers['x-real-ip']||req.socket.remoteAddress),time=Date.now(),old=failures.get(id);
 if(old&&old.until>time&&old.count>=max)return true;
 failures.set(id,{count:old&&old.until>time?old.count+1:1,until:old&&old.until>time?old.until:time+ms});
 if(failures.size>10000)for(const [k,v]of failures)if(v.until<time)failures.delete(k);
 return false;
}
function clearFailures(req:IncomingMessage,key:string){failures.delete(key+':'+String(req.headers['x-real-ip']||req.socket.remoteAddress));}
function token(req:IncomingMessage){const s=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';return /^[a-f0-9]{64}$/.test(s)?s:'';}
export function attendee(req:IncomingMessage):any{
 const t=token(req);return t?sqlite.prepare('SELECT u.* FROM attendee_users u JOIN attendee_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(sha(t),Date.now()):null;
}
function view(u:any){return{id:u.id,name:u.name,email:u.email,phone:u.phone,emailUpdates:!!u.email_updates,createdAt:u.created_at};}
export function passView(r:any){return{id:r.id,shortCode:r.short_code||ensurePassCode(r.id),name:r.name,category:r.category,status:r.status,payment:r.payment,amount:r.amount,checkedIn:r.checked_in,createdAt:r.created_at};}
const json=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const cookie=(value:string,age:number,origin:string)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${origin.startsWith('https:')?'; Secure':''}`;
function session(res:ServerResponse,id:string,origin:string){const t=randomBytes(32).toString('hex');sqlite.prepare('DELETE FROM attendee_sessions WHERE expires_at<=?').run(Date.now());sqlite.prepare('INSERT INTO attendee_sessions VALUES (?,?,?)').run(sha(t),id,Date.now()+lifetime*1000);res.setHeader('Set-Cookie',cookie(t,lifetime,origin));}
function transaction<T>(fn:()=>T):T{sqlite.exec('BEGIN IMMEDIATE');try{const result=fn();sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
function notify(userId:string,title:string,body:string,registrationId:string|null=null){sqlite.prepare('INSERT INTO attendee_notifications VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(),userId,registrationId,title,body,now());}
async function body(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('BODY_TOO_LARGE');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
function unread(id:string){return Number((sqlite.prepare('SELECT count(*) AS n FROM attendee_notifications WHERE user_id=? AND read_at IS NULL').get(id) as any).n);}

export async function accountRoutes(req:IncomingMessage,res:ServerResponse,path:string,origin:string){
 if(!path.startsWith('/api/account/')&&path!=='/api/admin/accounts')return false;
 try{
  if(!['GET','POST'].includes(req.method||'')){res.writeHead(405,{'Allow':'GET, POST'});res.end();return true;}
  if(req.method==='POST'&&!sameOrigin(req,origin)){json(res,403,{error:'Please use this website to continue.'});return true;}
  if(path==='/api/admin/accounts'){
   if(!signedIn(req)){json(res,401,{error:'Please sign in again.'});return true;}
   if(req.method==='GET'){
    const users=sqlite.prepare('SELECT u.id,u.name,u.email,u.phone,u.email_updates,u.created_at,(SELECT count(*) FROM registrations r WHERE r.user_id=u.id) AS pass_count FROM attendee_users u ORDER BY u.created_at DESC').all();
    json(res,200,{users});return true;
   }
   const b=z.object({action:z.literal('notify'),userId:z.string().min(1).max(60),title:z.string().trim().min(1).max(120),message:z.string().trim().min(1).max(2000)}).strict().parse(await body(req));
   const users=b.userId==='all'?sqlite.prepare('SELECT id FROM attendee_users').all():sqlite.prepare('SELECT id FROM attendee_users WHERE id=?').all(b.userId);
   if(!users.length){json(res,404,{error:'No attendee accounts found.'});return true;}
   transaction(()=>{for(const u of users as any[])notify(u.id,b.title,b.message);});json(res,200,{ok:true,count:users.length});return true;
  }
  if(path==='/api/account/session'&&req.method==='GET'){const u=attendee(req);json(res,200,{user:u?view(u):null,unreadCount:u?unread(u.id):0});return true;}
  if((path==='/api/account/signup'||path==='/api/account/login')&&req.method==='POST'){
   const isSignup=path.endsWith('/signup');
   if(limited(req,isSignup?'signup':'login',isSignup?8:10,isSignup?3600000:900000)){json(res,429,{error:'Too many attempts. Please try again later.'});return true;}
   const b=(isSignup?signup:login).parse(await body(req));
   let u:any=isSignup?sqlite.prepare('SELECT * FROM attendee_users WHERE email=?').get((b as z.infer<typeof signup>).email):loginUser((b as z.infer<typeof login>).identifier);
   if(isSignup){
    if(u||loginUser((b as z.infer<typeof signup>).phone)){json(res,409,{error:duplicateAccount});return true;}
    const s=b as z.infer<typeof signup>,salt=randomBytes(16).toString('hex'),hash=(await derive(s.password,salt,64) as Buffer).toString('hex'),id=randomUUID(),time=now();
    try{transaction(()=>{sqlite.prepare('INSERT INTO attendee_users VALUES (?,?,?,?,?,?,?,?,?)').run(id,s.name,s.email,s.phone,hash,salt,s.emailUpdates?1:0,time,time);notify(id,'Welcome to HMP Expo2027','Your account is ready. Complete a registration and find your saved QR pass in My passes.');});}catch(e){if(String(e).includes('UNIQUE')){json(res,409,{error:duplicateAccount});return true;}throw e;}
    u=sqlite.prepare('SELECT * FROM attendee_users WHERE id=?').get(id);
   }else{
    const hash=await derive(b.password,u?.salt||'hmp-account-invalid-user-salt',64) as Buffer;
    if(!u||!timingSafeEqual(hash,Buffer.from(u.password_hash,'hex'))){json(res,401,{error:'The email address, phone number or password is incorrect.'});return true;}
   }
   if(!isSignup)clearFailures(req,'login');session(res,u.id,origin);json(res,isSignup?201:200,{user:view(u),unreadCount:unread(u.id)});return true;
  }
  if(path==='/api/account/logout'&&req.method==='POST'){const t=token(req);if(t)sqlite.prepare('DELETE FROM attendee_sessions WHERE token_hash=?').run(sha(t));res.setHeader('Set-Cookie',cookie('',0,origin));json(res,200,{ok:true});return true;}
  const u=attendee(req);if(!u){json(res,401,{error:'Please sign in to your attendee account.'});return true;}
  if(path==='/api/account/profile'&&req.method==='POST'){
   const b=profile.parse(await body(req));
   const existingPhone=loginUser(b.phone);if(existingPhone&&existingPhone.id!==u.id){json(res,409,{error:'An account already exists with this phone number. Use a different number.'});return true;}
   transaction(()=>{sqlite.prepare('UPDATE attendee_users SET name=?,phone=?,email_updates=?,updated_at=? WHERE id=?').run(b.name,b.phone,b.emailUpdates?1:0,now(),u.id);for(const r of sqlite.prepare('SELECT id,details FROM registrations WHERE user_id=?').all(u.id) as any[]){let details={};try{details=JSON.parse(r.details);}catch{}sqlite.prepare('UPDATE registrations SET name=?,phone=?,details=? WHERE id=? AND user_id=?').run(b.name,b.phone,JSON.stringify({...details,name:b.name,phone:b.phone}),r.id,u.id);}});
   json(res,200,{user:view(sqlite.prepare('SELECT * FROM attendee_users WHERE id=?').get(u.id))});return true;
  }
  if(path==='/api/account/passes'&&req.method==='GET'){json(res,200,{passes:(sqlite.prepare('SELECT * FROM registrations WHERE user_id=? ORDER BY created_at DESC').all(u.id) as any[]).map(passView)});return true;}
  if(path==='/api/account/claim-pass'&&req.method==='POST'){
   if(limited(req,'claim',8)){json(res,429,{error:'Too many attempts. Please try again later.'});return true;}
   const b=z.object({id:z.string().trim().toUpperCase().regex(/^(?:[A-F0-9]{8}|HMPE27-[A-Z]{3}-(?:[A-F0-9]{8}|[A-F0-9]{24}))$/)}).strict().parse(await body(req));
   const result=transaction(()=>{const r:any=sqlite.prepare('SELECT * FROM registrations WHERE (id=? OR short_code=?) AND lower(trim(email))=?').get(b.id,b.id,u.email);if(!r||(r.user_id&&r.user_id!==u.id))return null;if(!r.user_id){const other=sqlite.prepare('SELECT id FROM registrations WHERE user_id=? AND category=?').get(u.id,r.category);if(other)return {conflict:true};sqlite.prepare('UPDATE registrations SET user_id=? WHERE id=? AND user_id IS NULL').run(u.id,r.id);notify(u.id,'Pass added to your account','Your existing '+r.category+' pass is now available in My passes.',r.id);}return r;});
   if(!result){json(res,404,{error:'Pass not found for your account email. Check the ID or contact the organizer.'});return true;}if('conflict'in result){json(res,409,{error:'Your account already has a pass in this category. Please contact the organizer.'});return true;}json(res,200,{pass:passView(result)});return true;
  }
  if(path==='/api/account/notifications'&&req.method==='GET'){json(res,200,{notifications:sqlite.prepare('SELECT id,title,body,registration_id AS registrationId,created_at AS createdAt,read_at AS readAt FROM attendee_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(u.id),unreadCount:unread(u.id)});return true;}
  if(path==='/api/account/read-notifications'&&req.method==='POST'){sqlite.prepare('UPDATE attendee_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(),u.id);json(res,200,{ok:true,unreadCount:0});return true;}
  json(res,404,{error:'Account action not found.'});return true;
 }catch(e){if(e instanceof z.ZodError){json(res,400,{error:e.issues[0]?.message||'Check the details and try again.'});}else if(String(e).includes('UNIQUE constraint failed: index \'attendee_users_phone_unique\'')||String(e).includes('UNIQUE constraint failed: attendee_users.email')){json(res,409,{error:duplicateAccount});}else if(e instanceof SyntaxError){json(res,400,{error:'Invalid request data.'});}else if(e instanceof Error&&e.message==='BODY_TOO_LARGE'){json(res,413,{error:'Request is too large.'});}else{console.error('Account request failed:',e instanceof Error?e.message:'unknown error');json(res,500,{error:'Unable to continue. Please try again.'});}return true;}
}

export function attendeeRegistration(req:IncomingMessage,res:ServerResponse,input:unknown,origin:string){
 if(!sameOrigin(req,origin)){json(res,403,{error:'Please register from this website.'});return;}
 const u=attendee(req);if(!u){json(res,401,{error:'Please sign in before registering.'});return;}
 try{
  if(input&&typeof input==='object'&&Object.hasOwn(input,'action')){json(res,403,{error:'Organizer actions require administrator access'});return;}
  const b=z.object({category:z.enum(['visitor','delegate','exhibitor','sponsor']),data:z.record(z.string().max(2000)).refine(d=>Object.keys(d).length<=25)}).strict().parse(input);
  if(b.data.email&&b.data.email.trim().toLowerCase()!==u.email){json(res,400,{error:'Use the email linked to your account.'});return;}
  const required={visitor:['city','interest'],delegate:['company','designation','category'],exhibitor:['company','designation','stall'],sponsor:['company','sponsor']}[b.category];
  if(required.some(k=>!b.data[k]?.trim())){json(res,400,{error:'Complete all required registration details.'});return;}
  const result=transaction(()=>{
   const own:any=sqlite.prepare('SELECT * FROM registrations WHERE user_id=? AND category=?').get(u.id,b.category);if(own)return{alreadyRegistered:true};
   const old=sqlite.prepare('SELECT id FROM registrations WHERE lower(trim(email))=? AND category=?').get(u.email,b.category);if(old)return{conflict:true};
   const id='HMPE27-'+b.category.slice(0,3).toUpperCase()+'-'+randomBytes(12).toString('hex').toUpperCase(),status=b.category==='visitor'?'Approved':'Pending',payment=b.category==='visitor'?'Not required':'Awaiting quotation',data={...b.data,name:u.name,email:u.email,phone:u.phone};
   sqlite.prepare('INSERT INTO registrations (id,name,email,phone,category,details,status,payment,amount,reference,checked_in,created_at,user_id) VALUES (?,?,?,?,?,?,?,?,0,\'\',NULL,?,?)').run(id,u.name,u.email,u.phone,b.category,JSON.stringify(data),status,payment,now(),u.id);
   notify(u.id,b.category==='visitor'?'Your visitor pass is ready':'Application received','Your '+b.category+' registration is saved in My passes. '+(b.category==='visitor'?'Your visit is free.':'The organizer will review your application and quotation.'),id);
   return{row:sqlite.prepare('SELECT * FROM registrations WHERE id=?').get(id),status:201};
  });
  if('alreadyRegistered'in result){json(res,409,{code:'ALREADY_REGISTERED',error:'You are already registered as a '+b.category+' for this event. Open My passes to view your existing pass.'});return;}
  if('conflict'in result){json(res,409,{error:'A registration already exists for this email. Add it using its original pass ID in My passes, or contact the organizer.'});return;}
  json(res,result.status,{...passView(result.row),savedToAccount:true});
 }catch(e){if(e instanceof z.ZodError){json(res,400,{error:'Check your registration details and try again.'});}else{console.error('Registration failed:',e instanceof Error?e.message:'unknown error');json(res,500,{error:'Unable to save your registration. Please try again.'});}}
}
export function ownedPass(req:IncomingMessage,id:string){const u=attendee(req);if(signedIn(req))return{allowed:true};if(!u)return{allowed:false,status:401,error:'Sign in to view your saved pass.'};const r=sqlite.prepare('SELECT id FROM registrations WHERE id=? AND user_id=?').get(id,u.id);return r?{allowed:true}:{allowed:false,status:404,error:'Pass not found in your account.'};}
export function notifyAdminChange(before:any,after:any){
 if(!after?.user_id)return;
 if(before?.checked_in!==after.checked_in&&after.checked_in){notify(after.user_id,'You are checked in','Your '+after.category+' pass was checked in at the expo.',after.id);return;}
 if(before?.status!==after.status||before?.payment!==after.payment||before?.amount!==after.amount)notify(after.user_id,'Your '+after.category+' pass was updated','Approval: '+after.status+' · Payment: '+after.payment+' · Quotation: ₹'+after.amount,after.id);
}
