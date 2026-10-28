import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5174',prefix='account-qa-'+Date.now(),admin=JSON.parse(readFileSync(process.env.TEST_ACCESS_FILE||0,'utf8'));
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
async function call(path,{body,cookie='',origin=base,headers={}}={}){
 if(process.env.TEST_DELAY_MS)await new Promise(r=>setTimeout(r,Number(process.env.TEST_DELAY_MS)));
 const r=await fetch(base+path,{redirect:'manual',headers:{...(body!==undefined?{Origin:origin,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
 let data;try{data=await r.json()}catch{data={}}return{status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')};
}
const guest=await call('/api/account/session');eq(guest.data.user,null,'Guest has no account');
eq((await call('/api/account/passes')).status,401,'Guest passes blocked');
eq((await call('/api/public/expo',{body:{category:'visitor',data:{}}})).status,401,'Guest registration blocked');
eq((await call('/api/account/signup',{origin:'https://untrusted.example',body:{}})).status,403,'Cross-origin signup blocked');
eq((await call('/api/account/signup',{body:{name:'QA',email:'not-email',phone:'9999999999',password:'weak'}})).status,400,'Invalid signup rejected');
const users=[];
for(const suffix of ['a','b']){
 const value={name:'ACCOUNT QA '+suffix,email:prefix+'-'+suffix+'@example.com',phone:suffix==='a'?'9999999991':'9999999992',password:'Account-QA-Only-2027',emailUpdates:suffix==='a'};
 const r=await call('/api/account/signup',{body:value});eq(r.status,201,'Account created '+suffix);eq(r.data.user.email,value.email,'Canonical email');eq(r.setCookie.includes('HttpOnly'),true,'HttpOnly session');eq(r.setCookie.includes('SameSite=Strict'),true,'SameSite session');eq(r.setCookie.includes('Secure'),base.startsWith('https:'),'Secure production session');
 for(const k of ['password','password_hash','passwordHash','salt'])eq(k in r.data.user,false,'No credential field '+k);
 users.push({...value,id:r.data.user.id,cookie:r.cookie});
}
const [a,b]=users;
eq((await call('/api/account/signup',{body:{name:a.name,email:a.email.toUpperCase(),phone:a.phone,password:a.password,emailUpdates:true}})).status,409,'Duplicate email blocked');
eq((await call('/api/account/login',{body:{email:a.email,password:'incorrect-password'}})).status,401,'Wrong password blocked');
const signIn=await call('/api/account/login',{body:{email:a.email.toUpperCase(),password:a.password}});eq(signIn.status,200,'Email login is case-insensitive');a.cookie=signIn.cookie;
const passes=[];
for(const category of ['visitor','delegate','exhibitor','sponsor']){
 const payload={category,data:{name:a.name,email:a.email,phone:a.phone,city:'Hyderabad',interest:'QA',company:'QA',designation:'QA',category:'QA',stall:'Standard Stall',sponsor:'QA'}};
 const r=await call('/api/public/expo',{cookie:a.cookie,body:payload});eq(r.status,201,'Saved '+category);eq(r.data.status,category==='visitor'?'Approved':'Pending','Approval default');eq(r.data.payment,category==='visitor'?'Not required':'Awaiting quotation','Payment default');eq(r.data.savedToAccount,true,'Saved to account');assert.match(r.data.id,/^HMPE27-[A-Z]{3}-[A-F0-9]{24}$/);checks++;
 eq((await call('/api/public/expo',{cookie:a.cookie,body:payload})).data.code,'ALREADY_REGISTERED','Duplicate category is rejected with existing pass notice');
 eq((await call('/api/public/expo?id='+r.data.id,{cookie:a.cookie})).status,200,'Owner pass lookup');
 eq((await call('/api/public/expo?id='+r.data.id,{cookie:b.cookie})).status,404,'Other account pass blocked');
 eq((await call('/api/public/expo?id='+r.data.id)).status,401,'Guest pass lookup blocked');
 eq((await fetch(base+'/api/qr?id='+r.data.id)).status,200,'QR supports longer pass ID');
 passes.push(r.data);
}
eq((await call('/api/account/passes',{cookie:a.cookie})).data.passes.length,4,'Four saved passes');
eq((await call('/api/account/passes',{cookie:b.cookie})).data.passes.length,0,'Account isolation');
eq((await call('/api/public/expo',{cookie:a.cookie,body:{category:'visitor',data:{email:b.email,city:'QA',interest:'QA'}}})).status,400,'Cannot register as another email');
eq((await call('/api/public/expo',{cookie:a.cookie,body:{action:'update',id:passes[0].id}})).status,403,'Attendee cannot manage approvals');
eq((await call('/api/admin/accounts',{cookie:a.cookie})).status,401,'Attendee cannot list admin accounts');
eq((await call('/api/expo',{cookie:a.cookie})).status,401,'Attendee cannot read organizer list');
eq((await call('/api/account/profile',{cookie:a.cookie,body:{name:'ACCOUNT QA Updated',phone:'8888888888',emailUpdates:false}})).status,200,'Profile saved');
eq((await call('/api/account/session',{cookie:a.cookie})).data.user.emailUpdates,false,'Preference saved');
eq((await call('/api/account/passes',{cookie:a.cookie})).data.passes[0].name,'ACCOUNT QA Updated','Profile name updates owned pass');
eq((await call('/api/account/profile',{cookie:a.cookie,body:{name:'QA',phone:a.phone,emailUpdates:false,email:b.email}})).status,400,'Sign-in email cannot be changed through profile');
const adminLogin=await call('/api/admin/login',{body:admin});eq(adminLogin.status,200,'Admin login');const adminCookie=adminLogin.cookie;
const list=await call('/api/admin/accounts',{cookie:adminCookie});eq(list.status,200,'Admin account list');eq(list.data.users.some(u=>u.id===a.id&&u.pass_count===4),true,'Admin sees saved account/pass count');eq(list.data.users.every(u=>!('password_hash'in u)&&!('salt'in u)),true,'Admin response excludes password hashes');
const target=passes.find(p=>p.category==='exhibitor');
eq((await call('/api/expo',{cookie:adminCookie,body:{action:'update',id:target.id,status:'Approved',payment:'Paid',amount:400,reference:'QA ONLY'}})).status,200,'Admin updates owned pass');
eq((await call('/api/public/expo?id='+target.id,{cookie:a.cookie})).data.amount,400,'Owner sees quotation update');
const notifications=await call('/api/account/notifications',{cookie:a.cookie});eq(notifications.data.notifications.some(n=>n.registrationId===target.id&&n.title.includes('updated')),true,'Pass change notification saved');
eq((await call('/api/admin/accounts',{cookie:adminCookie,body:{action:'notify',userId:b.id,title:'QA update',message:'A private message for test account B.'}})).status,200,'Targeted in-app message');
eq((await call('/api/account/notifications',{cookie:b.cookie})).data.notifications.some(n=>n.title==='QA update'),true,'Recipient receives message');
eq((await call('/api/account/notifications',{cookie:a.cookie})).data.notifications.some(n=>n.title==='QA update'),false,'Other user does not receive targeted message');
const aUnread=(await call('/api/account/session',{cookie:a.cookie})).data.unreadCount;eq(aUnread>0,true,'Unread count available');
eq((await call('/api/account/read-notifications',{cookie:b.cookie,body:{}})).status,200,'Recipient marks notifications read');eq((await call('/api/account/session',{cookie:b.cookie})).data.unreadCount,0,'Recipient badge cleared');eq((await call('/api/account/session',{cookie:a.cookie})).data.unreadCount,aUnread,'Other user unread count unchanged');
if(process.env.TEST_DATABASE_PATH){
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(process.env.TEST_DATABASE_PATH);
 const legacyId='HMPE27-VIS-'+Math.random().toString(16).slice(2,10).padEnd(8,'0').toUpperCase();
 db.prepare('INSERT INTO registrations (id,name,email,phone,category,details,status,payment,amount,reference,created_at) VALUES (?,?,?,?,?,?,\'Approved\',\'Not required\',0,\'\',?)').run(legacyId,b.name,b.email,b.phone,'visitor','{}',new Date().toISOString());
 eq((await call('/api/account/passes',{cookie:b.cookie})).data.passes.length,0,'Legacy pass not auto-claimed by email');
 eq((await call('/api/account/claim-pass',{cookie:a.cookie,body:{id:legacyId}})).status,404,'Claim with wrong account email rejected');
 eq((await call('/api/account/claim-pass',{cookie:b.cookie,body:{id:legacyId}})).status,200,'Legacy pass ID and matching email link pass');
 eq((await call('/api/account/passes',{cookie:b.cookie})).data.passes.length,1,'Claimed pass appears in My passes');db.close();
}
eq((await call('/api/account/logout',{cookie:a.cookie,body:{}})).status,200,'Attendee sign-out');eq((await call('/api/account/passes',{cookie:a.cookie})).status,401,'Logged-out session invalidated');eq((await call('/api/account/session',{cookie:b.cookie})).data.user.id,b.id,'Other account session unaffected');
eq((await call('/api/admin/logout',{cookie:adminCookie,body:{}})).status,200,'Admin sign-out');
console.log(`PASS ${checks} attendee account, ownership, notification and admin assertions`);console.log('Test email prefix:',prefix);
