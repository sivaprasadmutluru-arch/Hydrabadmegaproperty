import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5174';
const prefix = `deployment-qa-${Date.now()}`;
const access=JSON.parse(readFileSync(process.env.TEST_ACCESS_FILE || 0,'utf8'));
const signIn=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(access)});
assert.equal(signIn.status,200,'Administrator test login');
const cookie=signIn.headers.get('set-cookie').split(';')[0];
const authenticatedFetch=(url,options={})=>fetch(url,{...options,headers:{Origin:base,Cookie:cookie,...options.headers}});

async function api(body, path='/api/expo') {
  const r = await authenticatedFetch(base+path, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  return {status:r.status,data:await r.json()};
}
for (const path of ['/','/expo','/admin','/reference.css','/reference.js','/examples.js','/sample-data.json','/hmp-expo-2027-logo.jpeg','/healthz']) assert.equal((await authenticatedFetch(base+path)).status,200,path);
for (const category of ['visitor','delegate','exhibitor','sponsor']) {
  const body={category,data:{name:`DEPLOYMENT QA ${category}`,email:`${prefix}-${category}@example.com`,phone:'9999999999',company:'QA',city:'Hyderabad',interest:'QA',designation:'QA',category:'QA',stall:'Standard Stall',sponsor:'QA'}};
  const created=await api(body); assert.equal(created.status,201);
  const r=created.data; assert.match(r.id,/^HMPE27-/);
  assert.equal(r.status,category==='visitor'?'Approved':'Pending');
  assert.equal((await api(body)).data.id,r.id);
  assert.equal((await api(undefined,'/api/expo?id='+r.id)).data.id,r.id);
  const qr=await authenticatedFetch(base+'/api/qr?id='+r.id);assert.equal(qr.status,200);assert.match(await qr.text(),/<svg/);
  if(category!=='visitor')assert.equal((await api({action:'checkin',id:r.id})).status,400);
  assert.equal((await api({action:'update',id:r.id,status:'Approved',payment:'Paid',amount:400,reference:'DEPLOYMENT QA ONLY'})).status,200);
  const attempts=await Promise.all(Array.from({length:5},()=>api({action:'checkin',id:r.id})));
  assert.equal(attempts.filter(r=>r.status===200).length,1);
  assert.equal(attempts.filter(r=>r.status===409).length,4);
  console.log(`PASS ${category}: register, persist, duplicate, lookup, QR, approval/payment, concurrent check-in`);
}
assert.equal((await api({category:'visitor',data:{name:12}})).status,400);
assert.equal((await api({action:'update',id:'HMPE27-VIS-00000000',status:'Approved',payment:'Paid',amount:0})).status,404);
assert.equal((await api({action:'settings',value:{paymentUrl:'http://example.com'}})).status,400);
assert.equal((await api(undefined,'/api/expo?id=HMPE27-VIS-00000000')).status,404);
assert.equal((await authenticatedFetch(base+'/api/qr?id=invalid')).status,400);
assert.equal((await authenticatedFetch(base+'/.env')).status,404);
console.log('PASS pages/assets, invalid input, missing records, unsafe links, and hidden files');
console.log(`Test record prefix: ${prefix}`);

assert.equal((await authenticatedFetch(base+'/api/admin/logout',{method:'POST'})).status,200);
