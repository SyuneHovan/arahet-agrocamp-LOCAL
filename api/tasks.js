const API_URL = 'https://api.github.com/repos/SyuneHovan/arahet-agrocamp-internal/contents/tasks.json';
const BRANCH = 'plan-data';
class StoreError extends Error {
  constructor(status, code, data) { super(code); Object.assign(this,{status,code,data}); }
}
const bad = () => { throw new StoreError(400,'invalid_change'); };
const text = (x,max) => typeof x==='string' && x.length<=max;
const validId = x => typeof x==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
const fields = {category:x=>text(x,100)&&['Տարածում','Տուն','Գոյք · Գիշերակաց','Գոյք · Խոհանոց','Գոյք · Տնտեսական','Տրանսպորտ'].includes(x),title:x=>text(x,240)&&!!x.trim(),description:x=>text(x,6000),target:x=>text(x,500),date:x=>/^20\d\d-\d\d-\d\d$/.test(x)&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x,role:x=>['','Ա','Բ','Գ','Դ'].includes(x),assigneeId:x=>x===''||validId(x),done:x=>typeof x==='boolean'};
function normalize(data) {
  if(data?.schemaVersion!==1||!Array.isArray(data.tasks)||data.tasks.length>5000||
    new Set(data.tasks.map(t=>t.id)).size!==data.tasks.length||
    data.tasks.some(t=>!validId(t.id)||!text(t.title,240)||typeof t.done!=='boolean'||!Number.isSafeInteger(t.revision)))
    throw new StoreError(502,'invalid_store');
  data.members ??= []; data.appliedOps ??= [];
  if(!Array.isArray(data.members)||!Array.isArray(data.appliedOps))throw new StoreError(502,'invalid_store');
  for(const t of data.tasks){t.description??='';t.category??='Տարածում';t.assigneeId??='';t.deleted??=false;t.completions??={};if(t.assigneeId==='all')t.done=data.members.length>0&&data.members.every(m=>t.completions[m.id]===true);}
  return data;
}
function apply(data,operations) {
  let changed=false;
  for(const op of operations) {
    if(!op||!validId(op.opId)||!validId(op.id))bad();
    if(data.appliedOps.includes(op.opId))continue;
    if(op.type==='member.add'){
      const m=op.member;
      if(!m||!text(m.name,80)||!m.name.trim()||!fields.role(m.role||''))bad();
      const existing=data.members.find(x=>x.id===op.id);
      if(!existing){
        if(data.members.length>=100)bad();
        if(data.members.some(x=>x.name.trim().toLocaleLowerCase()===m.name.trim().toLocaleLowerCase()))throw new StoreError(409,'duplicate_member');
        data.members.push({id:op.id,name:m.name.trim(),role:m.role||''});
        for(const t of data.tasks)if(m.role && t.role===m.role&&!t.assigneeId&&!t.deleted){t.assigneeId=op.id;t.revision++;}
      }
    }else if(op.type==='task.create'){
      if(data.tasks.some(x=>x.id===op.id))throw new StoreError(409,'task_changed');
      if(data.tasks.filter(t=>!t.deleted).length>=500)bad();
      const t=op.task;
      if(!t||Object.keys(t).some(k=>!Object.hasOwn(fields,k))||!fields.title(t.title)||!fields.date(t.date))bad();
      for(const [k,v] of Object.entries(t))if(!fields[k](v))bad();
      if(t.assigneeId&&t.assigneeId!=='all'&&!data.members.some(m=>m.id===t.assigneeId))bad();
      data.tasks.push({description:'',target:'',role:'',assigneeId:'',done:false,...t,...(t.assigneeId==='all'?{done:false}:{}),completions:{},id:op.id,revision:0,deleted:false});
    }else {
      const t=data.tasks.find(t=>t.id===op.id);
      if(!t)throw new StoreError(404,'unknown_task');
      if(op.type==='task.delete'){
        if(!t.deleted&&t.revision!==op.revision)throw new StoreError(409,'task_changed');
        t.deleted=true;t.revision++;
      }else if(op.type==='task.complete'){
        if(t.deleted)throw new StoreError(409,'task_deleted');
        if(t.assigneeId!=='all')throw new StoreError(409,'task_changed');
        if(!data.members.some(m=>m.id===op.memberId)||typeof op.done!=='boolean'||typeof op.base!=='boolean')bad();
        const current=t.completions[op.memberId]===true;
        if(current!==op.base&&current!==op.done)throw new StoreError(409,'task_changed');
        t.completions[op.memberId]=op.done;t.revision++;
      }else if(op.type==='task.update'){
        if(t.deleted)throw new StoreError(409,'task_deleted');
        if(!op.patch||!op.base||!Object.keys(op.patch).length||Object.keys(op.patch).some(k=>!Object.hasOwn(fields,k)))bad();
        for(const [k,v] of Object.entries(op.patch)){
          if(!fields[k](v)||!Object.hasOwn(op.base,k))bad();
          if(t[k]!==op.base[k]&&t[k]!==v)throw new StoreError(409,'task_changed');
        }
        if(t.assigneeId==='all'&&Object.hasOwn(op.patch,'done'))bad();
        if(op.patch.assigneeId&&op.patch.assigneeId!=='all'&&!data.members.some(m=>m.id===op.patch.assigneeId))bad();
        if(Object.hasOwn(op.patch,'assigneeId')&&op.patch.assigneeId!==t.assigneeId&&(t.assigneeId==='all'||op.patch.assigneeId==='all'))t.done=false;
        Object.assign(t,op.patch);t.revision++;
      }else bad();
      t.updatedAt=new Date().toISOString();
    }
    data.appliedOps.push(op.opId);changed=true;
  }
  data.appliedOps=data.appliedOps.slice(-1500);
  normalize(data);
  return changed;
}
function createHandler({fetchImpl=globalThis.fetch,token=()=>process.env.ARAHET_GITHUB_TOKEN,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  async function github(method,payload){
    const r=await fetchImpl(API_URL+(method==='GET'?'?ref='+BRANCH:''),{method,cache:'no-store',signal:AbortSignal.timeout(7000),
      headers:{Authorization:'Bearer '+token(),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'Arahet-Plan'},
      ...(payload?{body:JSON.stringify(payload)}:{})});
    if(!r.ok)throw new StoreError(r.status===409?409:503,r.status===409?'write_conflict':'github_unavailable');
    return r.json();
  }
  async function read(){
    const f=await github('GET');
    if(f.encoding!=='base64'||!f.sha||typeof f.content!=='string')throw new StoreError(502,'invalid_store');
    return {sha:f.sha,data:normalize(JSON.parse(Buffer.from(f.content,'base64').toString('utf8')))};
  }
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','PATCH'].includes(req.method)){res.setHeader('Allow','GET, PATCH');return res.status(405).json({error:'method_not_allowed'});}
    if(!token())return res.status(503).json({error:'storage_not_configured'});
    try{
      if(req.method==='GET')return res.status(200).json((await read()).data);
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'json_required'});
      if(req.headers.origin&&new URL(req.headers.origin).host!==new URL('https://'+req.headers.host).host)return res.status(403).json({error:'origin_rejected'});
      let body=req.body;
      if(typeof body==='string'){if(Buffer.byteLength(body)>100000)bad();try{body=JSON.parse(body);}catch{bad();}}
      if(!body||Buffer.byteLength(JSON.stringify(body))>100000)bad();
      const legacy=!body.operations;
      if(legacy&&(Object.keys(body).sort().join(',')!=='done,id,revision'||!validId(body.id)||typeof body.done!=='boolean'||!Number.isSafeInteger(body.revision)))bad();
      if(!legacy&&(!Array.isArray(body.operations)||body.operations.length<1||body.operations.length>40))bad();
      for(let attempt=0;attempt<3;attempt++){
        const {sha,data}=await read();
        const original=structuredClone(data);
        try{
          if(legacy){
            const t=data.tasks.find(t=>t.id===body.id&&!t.deleted);
            if(!t)throw new StoreError(404,'unknown_task');
            if(t.assigneeId==='all')bad();
            if(t.done===body.done)return res.status(200).json(data);
            if(t.revision!==body.revision)throw new StoreError(409,'task_changed');
            t.done=body.done;t.revision++;
          }else if(!apply(data,body.operations))return res.status(200).json(data);
        }catch(e){e.data=original;throw e;}
        try{
          await github('PUT',{branch:BRANCH,sha,message:'Update team plan',content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64')});
          return res.status(200).json(data);
        }catch(e){if(e.code!=='write_conflict'||attempt===2)throw e;await pause(100*(attempt+1));}
      }
    }catch(e){return res.status(e.status||502).json({error:e.code||'storage_unavailable',...(e.data?{data:e.data}:{})});}
  };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.apply=apply;
module.exports.normalize=normalize;
