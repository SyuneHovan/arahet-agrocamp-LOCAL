(() => {
  const $=id=>document.getElementById(id), key='arahet-plan-outbox-v2', personKey='arahet-plan-person';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>crypto.randomUUID();
  let server={schemaVersion:1,tasks:[],members:[],appliedOps:[]}, outbox=[], person='', scope='mine', connected=false;
  let sending=false, loading=false, error='', timer, version=0, editing=null, draftBase=null, welcomed=false, lastSaved=0;
  try{person=localStorage.getItem(personKey)||'';const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))outbox=saved;}catch{}
  function normalize(d){d.members??=[];d.appliedOps??=[];d.tasks.forEach(t=>{t.description??='';t.assigneeId??='';t.deleted??=false;});return d;}
  function optimistic(d,op){
    if(op.type==='member.add'){
      if(!d.members.some(m=>m.id===op.id))d.members.push({id:op.id,...op.member});
      d.tasks.forEach(t=>{if(op.member.role&&t.role===op.member.role&&!t.assigneeId&&!t.deleted){t.assigneeId=op.id;t.revision++;}});
    }else if(op.type==='task.create'){if(!d.tasks.some(t=>t.id===op.id))d.tasks.push({...op.task,id:op.id,revision:0,deleted:false});}
    else {const t=d.tasks.find(t=>t.id===op.id);if(t){if(op.type==='task.delete')t.deleted=true;else Object.assign(t,op.patch);t.revision++;}}
  }
  function view(){const d=structuredClone(server);outbox.forEach(op=>{if(!d.appliedOps.includes(op.opId))optimistic(d,op);});return d;}
  function persist(){try{localStorage.setItem(key,JSON.stringify(outbox));}catch{$('notice').hidden=false;$('notice').textContent='Այս սարքում սևագիրը չի պահպանվում։ Մի փակեք էջը մինչև ընդհանուր պահպանումն ավարտվի։';}}
  function enqueue(op){op.opId=uid();outbox.push(op);version++;persist();render();clearTimeout(timer);if(!error)timer=setTimeout(flush,400);}
  const dayLabel=d=>Number(d.slice(8))+' '+['հունվարի','փետրվարի','մարտի','ապրիլի','մայիսի','հունիսի','հուլիսի','օգոստոսի','սեպտեմբերի','հոկտեմբերի','նոյեմբերի','դեկտեմբերի'][Number(d.slice(5,7))-1];
  function options(select,html){const value=select.value;select.innerHTML=html;select.value=value;if(select.selectedIndex<0)select.selectedIndex=0;}
  function render(){
    const d=view(), active=document.activeElement?.id, me=d.members.find(m=>m.id===person);
    $('personName').textContent=me?.name||'Իմ անունը';
    $('mine').setAttribute('aria-pressed',String(scope==='mine'));$('all').setAttribute('aria-pressed',String(scope==='all'));
    $('assignee').hidden=scope==='mine';
    options($('day'),'<option value="">Բոլոր օրերը</option>'+[...new Set(d.tasks.filter(t=>!t.deleted).map(t=>t.date))].sort().map(date=>'<option value="'+esc(date)+'">'+dayLabel(date)+'</option>').join(''));
    options($('assignee'),'<option value="">Ամբողջ թիմը</option><option value="unassigned">Չհանձնարարված</option>'+d.members.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join(''));
    const subset=d.tasks.filter(t=>!t.deleted&&(scope==='all'||(person&&t.assigneeId===person))&&(!$('day').value||t.date===$('day').value)&&(scope==='mine'||!$('assignee').value||($('assignee').value==='unassigned'?!t.assigneeId:t.assigneeId===$('assignee').value)));
    const done=subset.filter(t=>t.done).length;
    $('progressLabel').textContent=done+' / '+subset.length+' կատարված';$('progress').max=subset.length||1;$('progress').value=done;
    const visible=subset.filter(t=>!$('state').value||t.done===($('state').value==='done'));
    $('tasks').innerHTML=[...new Set(visible.map(t=>t.date))].sort().map(date=>'<section><div class="day-heading"><h2>'+dayLabel(date)+'</h2><span>'+visible.filter(t=>t.date===date).length+'</span></div>'+visible.filter(t=>t.date===date).map(t=>{
      const m=d.members.find(m=>m.id===t.assigneeId),pending=outbox.some(o=>o.id===t.id);
      return '<article class="task '+(t.done?'done':'')+'"><input type="checkbox" id="check-'+esc(t.id)+'" data-id="'+esc(t.id)+'" aria-label="'+esc(t.title)+'" '+(t.done?'checked':'')+' '+(!connected?'disabled':'')+'><button class="task-main" data-edit="'+esc(t.id)+'" aria-label="Խմբագրել՝ '+esc(t.title)+'"><span class="task-title">'+esc(t.title)+'</span>'+(t.description||t.target?'<span class="task-note">'+esc(t.description||t.target)+'</span>':'')+'</button><div class="task-end"><span class="task-status" title="'+(pending?(error?'Չպահպանված':'Պահպանվում է'):'')+'">'+(pending?(error?'!':'◷'):'')+'</span><span class="avatar" title="'+esc(m?.name||('Դեր՝ '+(t.role||'չհանձնարարված')))+'" aria-label="'+esc(m?.name||t.role||'Չհանձնարարված')+'">'+esc(m?Array.from(m.name)[0]:t.role||'–')+'</span></div></article>';
    }).join('')+'</section>').join('')||'<div class="empty">'+(scope==='mine'&&!me?'Ընտրիր անունդ վերևում։':scope==='mine'?'Քեզ հանձնարարված առաջադրանք դեռ չկա։':'Այս ֆիլտրերով առաջադրանք չկա։')+'</div>';
    $('newTask').disabled=!connected;$('memberForm').querySelector('button[type=submit]').disabled=!connected;
    $('sync').textContent=error?'! Չպահպանված':sending||outbox.length?'◷ '+outbox.length+' փոփոխություն':connected?'✓ Պահպանված է':'Միանում ենք…';
    $('retry').hidden=!error;$('discard').hidden=!error||!outbox.length;
    if(error){$('notice').hidden=false;$('notice').textContent=error;}
    else{$('notice').hidden=true;}
    if(active&&active.startsWith('check-'))$(active)?.focus({preventScroll:true});
    if($('teamDialog').open)renderMembers();
  }
  async function request(method='GET',body){
    const r=await fetch('/api/tasks',{method,cache:'no-store',signal:AbortSignal.timeout(50000),...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await r.json();
    if(!r.ok){const e=new Error(data.error||'storage_unavailable');e.data=data.data;throw e;}
    return normalize(data);
  }
  function message(e){return {storage_not_configured:'Ընդհանուր պահպանումը դեռ միացված չէ։',task_changed:'Մեկ ուրիշը փոխել է նույն դաշտը։ Քո սևագիրը մնացել է․ «Կրկին»-ը կկիրառի քո տարբերակը, ×-ը՝ ընդհանուր տարբերակը։',task_deleted:'Այս առաջադրանքն արդեն ջնջվել է։ ×-ով հրաժարվիր չպահպանված սևագրից։',duplicate_member:'Այս անունով անդամ արդեն կա։ ×-ով հրաժարվիր կրկնվող սևագրից և ընտրիր եղած անունը։'}[e.message]||'Պահպանումը չի հաստատվել։ Փոփոխությունն այստեղ է․ սեղմիր «Կրկին»։';}
  async function flush(){
    if(sending||!outbox.length||!connected||error)return;
    sending=true;const batch=outbox.slice(0,40);render();
    try{
      server=await request('PATCH',{operations:batch});
      const ids=new Set(batch.map(o=>o.opId));outbox=outbox.filter(o=>!ids.has(o.opId));version++;persist();lastSaved=Date.now();
    }catch(e){if(e.data)server=normalize(e.data);error=message(e);}
    finally{sending=false;render();if(outbox.length&&!error)timer=setTimeout(flush,100);}
  }
  async function refresh(){
    if(loading||sending||document.hidden)return;
    loading=true;const before=version;
    try{const data=await request();if(!sending&&version===before){server=data;connected=true;outbox=outbox.filter(o=>!server.appliedOps.includes(o.opId));persist();if(!outbox.length)error='';render();if(!welcomed){welcomed=true;if(!server.members.some(m=>m.id===person))openTeam();}if(!error&&outbox.length)flush();}}
    catch(e){if(!connected){error=message(e);try{const r=await fetch('/tasks.json');if(r.ok)server=normalize(await r.json());}catch{}render();}}
    finally{loading=false;}
  }
  function renderMembers(){
    const d=view();$('members').innerHTML=d.members.map(m=>'<button class="member" data-person="'+esc(m.id)+'"><span class="avatar">'+esc(Array.from(m.name)[0])+'</span><span>'+esc(m.name)+'</span><small>'+esc(m.role)+'</small></button>').join('')||'<p class="sub">Ավելացրու առաջին թիմակցին։</p>';
  }
  function openTeam(){renderMembers();if(!$('teamDialog').open)$('teamDialog').showModal();}
  function choose(id){person=id;scope='mine';try{localStorage.setItem(personKey,id);}catch{}$('teamDialog').close();render();}
  function openTask(id){
    const d=view(), t=d.tasks.find(t=>t.id===id&&!t.deleted);
    editing=t?.id||null;draftBase=t?structuredClone(t):null;
    $('taskHeading').textContent=t?'Առաջադրանք':'Նոր առաջադրանք';$('taskTitle').value=t?.title||'';$('taskDescription').value=t?.description||'';$('taskTarget').value=t?.target||'';
    $('taskDate').value=t?.date||$('day').value||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yerevan',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    $('taskAssignee').innerHTML='<option value="">Չհանձնարարված</option>'+d.members.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join('');
    $('taskAssignee').value=t?t.assigneeId:(d.members.some(m=>m.id===person)?person:'');
    $('deleteTask').hidden=!t;$('taskForm').querySelector('[type=submit]').disabled=!connected;$('deleteTask').disabled=!connected;
    $('taskDialog').showModal();$('taskTitle').focus();
  }
  $('tasks').addEventListener('change',e=>{
    if(!e.target.matches('[data-id]'))return;
    const t=view().tasks.find(t=>t.id===e.target.dataset.id);
    enqueue({type:'task.update',id:t.id,patch:{done:e.target.checked},base:{done:t.done}});
  });
  $('tasks').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)openTask(b.dataset.edit);});
  $('taskForm').onsubmit=e=>{
    e.preventDefault();if(!connected)return;
    const vals={title:$('taskTitle').value.trim(),description:$('taskDescription').value,target:$('taskTarget').value,date:$('taskDate').value,assigneeId:$('taskAssignee').value};
    if(!vals.title)return;
    if(editing){
      const patch={},base={};for(const [k,v]of Object.entries(vals))if(v!==draftBase[k]){patch[k]=v;base[k]=draftBase[k];}
      if(Object.keys(patch).length)enqueue({type:'task.update',id:editing,patch,base});
    }else enqueue({type:'task.create',id:uid(),task:{...vals,role:'',done:false}});
    $('taskDialog').close();
  };
  $('deleteTask').onclick=()=>{
    if(!editing)return;
    ask('Ջնջե՞լ այս առաջադրանքը։',()=>{enqueue({type:'task.delete',id:editing,revision:draftBase.revision});$('taskDialog').close();});
  };
  $('memberForm').onsubmit=e=>{
    e.preventDefault();if(!connected)return;
    const name=$('memberName').value.trim();if(!name)return;
    const existing=view().members.find(m=>m.name.toLocaleLowerCase()===name.toLocaleLowerCase());
    if(existing){choose(existing.id);return;}
    const id=uid();enqueue({type:'member.add',id,member:{name,role:$('memberRole').value}});$('memberForm').reset();choose(id);
  };
  $('members').onclick=e=>{const b=e.target.closest('[data-person]');if(b)choose(b.dataset.person);};
  $('viewAll').onclick=()=>{scope='all';$('teamDialog').close();render();};
  $('team').onclick=$('identity').onclick=openTeam;$('newTask').onclick=()=>openTask();
  $('mine').onclick=()=>{scope='mine';if(!person)openTeam();render();};$('all').onclick=()=>{scope='all';render();};
  ['day','state','assignee'].forEach(id=>$(id).onchange=render);
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('refresh').onclick=refresh;
  $('retry').onclick=async()=>{
    if(sending||loading)return;
    try{
      server=await request();connected=true;outbox=outbox.filter(o=>!server.appliedOps.includes(o.opId));
      const d=structuredClone(server);
      for(const op of outbox){
        const t=d.tasks.find(t=>t.id===op.id);
        if(op.type==='task.update'&&t)for(const k of Object.keys(op.patch))op.base[k]=t[k];
        if(op.type==='task.delete'&&t)op.revision=t.revision;
        optimistic(d,op);
      }
      error='';persist();render();flush();
    }catch(e){error=message(e);render();}
  };
  let confirmAction;
  function ask(text,action){confirmAction=action;$('confirmText').textContent=text;$('confirmDialog').showModal();}
  $('confirmYes').onclick=()=>{$('confirmDialog').close();confirmAction?.();confirmAction=null;};
  $('confirmNo').onclick=()=>{$('confirmDialog').close();confirmAction=null;};
  $('discard').onclick=()=>ask('Հրաժարվե՞լ այս սարքի բոլոր չպահպանված փոփոխություններից։',()=>{outbox=[];error='';persist();render();refresh();});
  window.addEventListener('beforeunload',e=>{if(outbox.length){e.preventDefault();e.returnValue='';}});
  window.addEventListener('online',()=>{if(!error)flush();refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(()=>{if(!outbox.length)refresh();},30000);
  render();refresh();
})();
