import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5174',prefix='phone-qa-'+Date.now(),password='Local-Phone-QA-2027';let checks=0;
async function call(path,body){const r=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
function eq(a,b){assert.deepEqual(a,b);checks++}
const email=prefix+'@example.com';const created=await call('/api/account/signup',{name:'Phone QA',email,phone:'+91 9876543210',password});eq(created.status,201);
for(const identifier of [email,email.toUpperCase(),'9876543210','+91 9876543210','91-9876543210','(987) 654-3210']){const r=await call('/api/account/login',{identifier,password});eq(r.status,200);eq(r.data.user.id,created.data.user.id)}
eq((await call('/api/account/login',{email,password})).status,200);
for(const identifier of ['9876543210',email])eq((await call('/api/account/login',{identifier,password:'Wrong-password'})).status,401);
eq((await call('/api/account/login',{identifier:'1234567890',password})).status,401);
const second=await call('/api/account/signup',{name:'Shared phone QA',email:prefix+'-shared@example.com',phone:'9876543210',password});eq(second.status,409);
eq((await call('/api/account/login',{identifier:'9876543210',password})).status,200);
eq((await call('/api/account/login',{identifier:email,password})).status,200);
console.log('PASS '+checks+' email/phone login assertions');console.log('Test email prefix: '+prefix);
