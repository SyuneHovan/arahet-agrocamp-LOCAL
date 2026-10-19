const {test} = require('node:test');
const assert = require('node:assert/strict');
const seed = require('../tasks.json');
const {createHandler} = require('../api/tasks');

function simulator() {
  let data=structuredClone(seed), version=0, puts=0;
  const fetchImpl=async(url, options)=>{
    if(options.method==='GET') {const snapshot=structuredClone(data),sha=String(version);await new Promise(r=>setImmediate(r));return {ok:true,json:async()=>({sha,encoding:'base64',content:Buffer.from(JSON.stringify(snapshot)).toString('base64')})};}
    const body=JSON.parse(options.body);assert.equal(body.branch,'plan-data');puts++;
    if(body.sha!==String(version))return {ok:false,status:409};
    data=JSON.parse(Buffer.from(body.content,'base64'));version++;
    return {ok:true,json:async()=>({content:{sha:String(version)}})};
  };
  return {handler:createHandler({fetchImpl,token:()=> 'test-only',pause:async()=>{}}),get data(){return data;},get puts(){return puts;}};
}
async function call(handler,method='GET',body,headers={}) {
  let status,output;const res={setHeader(){},status(s){status=s;return this;},json(d){output=d;return this;}};
  await handler({method,body,headers:{host:'localhost:5177','content-type':'application/json',...headers}},res);
  return {status,data:output};
}
test('38 requested tasks across eight days, all initially pending',()=>{assert.equal(seed.tasks.length,38);assert.equal(new Set(seed.tasks.map(t=>t.date)).size,8);assert.ok(seed.tasks.every(t=>!t.done&&t.revision===0));});
test('missing token fails closed',async()=>{assert.equal((await call(createHandler({token:()=>''}))).status,503);});
test('two independent sessions see persisted state',async()=>{const s=simulator();const a=await call(s.handler);const b=await call(s.handler);assert.deepEqual(a,b);await call(s.handler,'PATCH',{id:seed.tasks[0].id,done:true,revision:0});assert.equal((await call(s.handler)).data.tasks[0].done,true);});
test('simultaneous edits to different tasks merge after SHA conflict',async()=>{const s=simulator();const r=await Promise.all([0,1].map(i=>call(s.handler,'PATCH',{id:seed.tasks[i].id,done:true,revision:0})));assert.ok(r.every(x=>x.status===200));assert.ok(s.data.tasks.slice(0,2).every(t=>t.done));assert.equal(s.puts,3);});
test('stale same-task change does not overwrite newer state',async()=>{const s=simulator(),id=seed.tasks[0].id;await call(s.handler,'PATCH',{id,done:true,revision:0});await call(s.handler,'PATCH',{id,done:false,revision:1});const r=await call(s.handler,'PATCH',{id,done:true,revision:0});assert.equal(r.status,409);assert.equal(s.data.tasks[0].done,false);});
test('retrying an already applied change creates no extra commit',async()=>{const s=simulator(),change={id:seed.tasks[0].id,done:true,revision:0};await call(s.handler,'PATCH',change);await call(s.handler,'PATCH',change);assert.equal(s.puts,1);});
test('unknown ids and arbitrary fields are rejected',async()=>{const s=simulator();assert.equal((await call(s.handler,'PATCH',{id:'oops',done:true,revision:0})).status,404);assert.equal((await call(s.handler,'PATCH',{id:seed.tasks[0].id,done:true,revision:0,path:'index.html'})).status,400);assert.equal(s.puts,0);});
test('non-JSON, unsupported methods, cross-origin, malformed JSON rejected',async()=>{const s=simulator();assert.equal((await call(s.handler,'DELETE')).status,405);assert.equal((await call(s.handler,'PATCH',{}, {'content-type':'text/plain'})).status,415);assert.equal((await call(s.handler,'PATCH',{}, {origin:'https://other.example'})).status,403);assert.equal((await call(s.handler,'PATCH','{')).status,400);});
test('GitHub outage never becomes successful save',async()=>{const handler=createHandler({token:()=> 'test',fetchImpl:async()=>({ok:false,status:403})});assert.equal((await call(handler)).status,503);});
test('corrupt JSON never overwritten',async()=>{let writes=0;const handler=createHandler({token:()=> 'test',fetchImpl:async(url,opts)=>{if(opts.method==='PUT')writes++;return {ok:true,json:async()=>({sha:'1',encoding:'base64',content:Buffer.from('{}').toString('base64')})};}});assert.equal((await call(handler,'PATCH',{id:seed.tasks[0].id,done:true,revision:0})).status,502);assert.equal(writes,0);});

const operation=(type,id,rest={})=>({type,id,opId:require('node:crypto').randomUUID(),...rest});
test('member role claims only unassigned tasks; creating editing deleting task persists',async()=>{
 const s=simulator();const member=operation('member.add','member-one',{member:{name:'Անի',role:'Ա'}});
 let r=await call(s.handler,'PATCH',{operations:[member]});assert.equal(r.status,200);assert.ok(r.data.tasks.filter(t=>t.role==='Ա').every(t=>t.assigneeId==='member-one'));
 r=await call(s.handler,'PATCH',{operations:[operation('member.add','member-two',{member:{name:'Արամ',role:'Ա'}})]});assert.ok(r.data.tasks.filter(t=>t.role==='Ա').every(t=>t.assigneeId==='member-one'));
 const create=operation('task.create','custom-task',{task:{title:'Նոր քայլ',date:'2026-10-25',assigneeId:'member-one',description:'Նկարագրություն'}});
 r=await call(s.handler,'PATCH',{operations:[create]});assert.equal(r.status,200);
 r=await call(s.handler,'PATCH',{operations:[operation('task.update','custom-task',{base:{description:'Նկարագրություն'},patch:{description:'Փոխված'}})]});assert.equal(r.data.tasks.find(t=>t.id==='custom-task').description,'Փոխված');
 r=await call(s.handler,'PATCH',{operations:[operation('task.delete','custom-task',{revision:1})]});assert.equal(r.data.tasks.find(t=>t.id==='custom-task').deleted,true);
});
test('batch retries are idempotent even after later opposite toggle',async()=>{
 const s=simulator(),id=seed.tasks[0].id;const op=operation('task.update',id,{base:{done:false},patch:{done:true}});
 await call(s.handler,'PATCH',{operations:[op]});await call(s.handler,'PATCH',{operations:[operation('task.update',id,{base:{done:true},patch:{done:false}})]});
 await call(s.handler,'PATCH',{operations:[op]});assert.equal(s.data.tasks[0].done,false);assert.equal(s.puts,2);
});
test('parallel edits to different fields of same task both survive',async()=>{
 const s=simulator(),id=seed.tasks[0].id;const r=await Promise.all([
 operation('task.update',id,{base:{description:''},patch:{description:'Details'}}),
 operation('task.update',id,{base:{done:false},patch:{done:true}})
 ].map(op=>call(s.handler,'PATCH',{operations:[op]})));assert.ok(r.every(x=>x.status===200));assert.equal(s.data.tasks[0].done,true);assert.equal(s.data.tasks[0].description,'Details');
});
test('same-field conflict does not partially commit a batch',async()=>{
 const s=simulator(),id=seed.tasks[0].id;await call(s.handler,'PATCH',{operations:[operation('task.update',id,{base:{description:''},patch:{description:'Other'}})]});
 const r=await call(s.handler,'PATCH',{operations:[operation('member.add','new-person',{member:{name:'Սոնա'}}),operation('task.update',id,{base:{description:''},patch:{description:'Mine'}})]});assert.equal(r.status,409);assert.equal(s.data.members.length,0);assert.equal(r.data.data.members.length,0);
});
test('stale deleted tasks cannot be resurrected by editing',async()=>{
 const s=simulator(),id=seed.tasks[0].id;await call(s.handler,'PATCH',{operations:[operation('task.delete',id,{revision:0})]});const r=await call(s.handler,'PATCH',{operations:[operation('task.update',id,{base:{done:false},patch:{done:true}})]});assert.equal(r.status,409);
});
test('unknown assignments, duplicate names and oversized fields rejected',async()=>{
 const s=simulator(),id=seed.tasks[0].id;assert.equal((await call(s.handler,'PATCH',{operations:[operation('task.update',id,{base:{assigneeId:''},patch:{assigneeId:'missing'}})]})).status,400);
 await call(s.handler,'PATCH',{operations:[operation('member.add','person-one',{member:{name:'Անի'}})]});assert.equal((await call(s.handler,'PATCH',{operations:[operation('member.add','person-two',{member:{name:'Անի'}})]})).status,409);
 assert.equal((await call(s.handler,'PATCH',{operations:[operation('task.update',id,{base:{description:''},patch:{description:'a'.repeat(6001)}})]})).status,400);
});
