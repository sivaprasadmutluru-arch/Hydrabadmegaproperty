import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5174';
const prefix = `public-qa-${Date.now()}`;
let checks=0;
async function request(body,query='') {
  if(process.env.TEST_DELAY_MS) await new Promise(r=>setTimeout(r,Number(process.env.TEST_DELAY_MS)));
  const r=await fetch(base+'/api/public/expo'+query,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
const expect=(actual,want,label)=>{assert.deepEqual(actual,want,label);checks++;};
const settings=await request();expect(settings.status,200,'Public settings');expect(Object.keys(settings.data),['settings'],'No attendee list');
for(const category of ['visitor','delegate','exhibitor','sponsor']) {
 const body={category,data:{name:'PUBLIC QA '+category,email:prefix+'-'+category+'@example.com',phone:'9999999999',company:'QA',designation:'QA',city:'Hyderabad',interest:'QA',stall:'Standard Stall',sponsor:'QA'}};
 const created=await request(body);expect(created.status,201,'Register '+category);
 expect(created.data.status,category==='visitor'?'Approved':'Pending','Default approval');
 for(const field of ['email','phone','details','reference','records'])expect(field in created.data,false,'No private field '+field);
 expect((await request(body)).data.id,created.data.id,'Duplicate '+category);
 expect((await request(undefined,'?id='+created.data.id)).data,created.data,'Lookup '+category);
 expect((await fetch(base+'/api/qr?id='+created.data.id)).status,200,'Public QR '+category);
 console.log('PASS public registration, restricted pass data, duplicate, lookup, QR:',category);
}
for(const action of ['settings','update','checkin'])expect((await request({action,category:'visitor',data:{},id:'test',value:{}})).status,403,'Block public action '+action);
expect((await request({category:'visitor',data:{},status:'Approved',payment:'Paid'})).status,400,'Reject injected management fields');
expect((await request({category:'visitor',data:{name:12}})).status,400,'Invalid data');
expect((await request(undefined,'?id=HMPE27-VIS-00000000')).status,404,'Unknown pass');
console.log(`PASS ${checks} public API assertions`);
console.log('Test record prefix:',prefix);
