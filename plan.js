(() => {
  const $=id=>document.getElementById(id), key='arahet-plan-outbox-v2', personKey='arahet-plan-person';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>crypto.randomUUID();
  let server={schemaVersion:1,tasks:[],members:[],appliedOps:[]}, outbox=[], person='', scope='mine', connected=false;
  let sending=false, loading=false, error='', timer, version=0, editing=null, draftBase=null, welcomed=false, lastSaved=0, pickerTask=null;
  try{person=localStorage.getItem(personKey)||'';const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))outbox=saved;}catch{}
  function normalize(d){d.members??=[];d.appliedOps??=[];d.tasks.forEach(t=>{t.description??='';t.assigneeId??='';t.deleted??=false;t.completions??={};if(t.assigneeId==='all')t.done=d.members.length>0&&d.members.every(m=>t.completions[m.id]===true);});return d;}
  function optimistic(d,op){
    if(op.type==='member.add'){
      if(!d.members.some(m=>m.id===op.id))d.members.push({id:op.id,...op.member});
      d.tasks.forEach(t=>{if(op.member.role&&t.role===op.member.role&&!t.assigneeId&&!t.deleted){t.assigneeId=op.id;t.revision++;}});
    }else if(op.type==='task.create'){if(!d.tasks.some(t=>t.id===op.id))d.tasks.push({...op.task,id:op.id,revision:0,deleted:false});}
    else {const t=d.tasks.find(t=>t.id===op.id);if(t){if(op.type==='task.delete')t.deleted=true;else if(op.type==='task.complete'){t.completions??={};t.completions[op.memberId]=op.done;}else {if(op.patch.assigneeId!==undefined&&op.patch.assigneeId!==t.assigneeId&&(t.assigneeId==='all'||op.patch.assigneeId==='all'))t.done=false;Object.assign(t,op.patch);}t.revision++;}}
  }
  function view(){const d=structuredClone(server);outbox.forEach(op=>{if(!d.appliedOps.includes(op.opId))optimistic(d,op);});return normalize(d);}
  const personalDone=t=>t.assigneeId==='all'?t.completions?.[person]===true:t.done;
  const displayedDone=t=>scope==='mine'?personalDone(t):t.done;
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
    options($('assignee'),'<option value="">Ամբողջ թիմը</option><option value="unassigned">Չհանձնարարված</option><option value="all">Բոլորի համար</option>'+d.members.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join(''));
    const subset=d.tasks.filter(t=>!t.deleted&&(scope==='all'||(me&&(t.assigneeId===person||t.assigneeId==='all')))&&(!$('day').value||t.date===$('day').value)&&(scope==='mine'||!$('assignee').value||($('assignee').value==='unassigned'?!t.assigneeId:(t.assigneeId===$('assignee').value||(t.assigneeId==='all'&&d.members.some(m=>m.id===$('assignee').value))))));
    const done=subset.filter(displayedDone).length;
    $('progressLabel').textContent=done+' / '+subset.length+' կատարված';$('progress').max=subset.length||1;$('progress').value=done;
    const visible=subset.filter(t=>!$('state').value||displayedDone(t)===($('state').value==='done'));
    const category=t=>t.category||'Տարածում';
    const categoryOrder=['Տարածում','Տուն','Գոյք · Գիշերակաց','Գոյք · Խոհանոց','Գոյք · Տնտեսական','Տրանսպորտ'];
    $('tasks').innerHTML=[...new Set(visible.map(category))].sort((a,b)=>(categoryOrder.indexOf(a)<0?99:categoryOrder.indexOf(a))-(categoryOrder.indexOf(b)<0?99:categoryOrder.indexOf(b))).map(cat=>'<section><div class="day-heading"><h2>'+esc(cat)+'</h2><span>'+visible.filter(t=>category(t)===cat).length+'</span></div>'+visible.filter(t=>category(t)===cat).sort((a,b)=>a.date.localeCompare(b.date)).map(t=>{
      const m=d.members.find(m=>m.id===t.assigneeId),pending=outbox.some(o=>o.id===t.id);
      return '<article class="task '+(displayedDone(t)?'done':'')+'"><input type="checkbox" id="check-'+esc(t.id)+'" data-id="'+esc(t.id)+'" aria-label="'+esc(t.title)+'" '+(personalDone(t)?'checked':'')+' '+(!connected||(t.assigneeId==='all'&&!me)?'disabled':'')+'><button class="task-main" data-edit="'+esc(t.id)+'" aria-label="Խմբագրել՝ '+esc(t.title)+'"><span class="task-title">'+esc(t.title)+'</span>'+(t.description||t.target?'<span class="task-note">'+esc(t.description||t.target)+'</span>':'')+'</button><div class="task-end"><span class="task-status" title="'+(pending?(error?'Չպահպանված':'Պահպանվում է'):'')+'">'+(pending?(error?'!':'◷'):'')+'</span>'+(t.assigneeId==='all'?'<button class="completion-count" data-edit="'+esc(t.id)+'" title="Կատարած թիմակիցները">'+d.members.filter(m=>t.completions[m.id]===true).length+'/'+d.members.length+'</button>':'')+'<button type="button" class="avatar avatar-button" data-assign="'+esc(t.id)+'" title="Փոխել պատասխանատուին՝ '+esc(t.assigneeId==='all'?'Բոլորի համար':m?.name||'Չհանձնարարված')+'" aria-label="Փոխել պատասխանատուին՝ '+esc(t.title)+'">'+esc(t.assigneeId==='all'?'∀':m?Array.from(m.name)[0]:t.role||'–')+'</button></div></article>';
    }).join('')+'</section>').join('')||'<div class="empty">'+(scope==='mine'&&!me?'Ընտրիր անունդ վերևում։':scope==='mine'?'Քեզ հանձնարարված առաջադրանք դեռ չկա։':'Այս ֆիլտրերով առաջադրանք չկա։')+'</div>';
    $('newTask').disabled=!connected;$('memberForm').querySelector('button[type=submit]').disabled=!connected;
    $('sync').textContent=error?'! Չպահպանված':sending||outbox.length?'◷ '+outbox.length+' փոփոխություն':connected?'✓ Պահպանված է':'Միանում ենք…';
    $('retry').hidden=!error;$('discard').hidden=!error||!outbox.length;
    if(error){$('notice').hidden=false;$('notice').textContent=error;}
    else{$('notice').hidden=true;}
    if(active&&active.startsWith('check-'))$(active)?.focus({preventScroll:true});
    if($('teamDialog').open)renderMembers();if($('taskDialog').open)renderCompletions();
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
  function renderCompletions(){
    const d=view(),t=d.tasks.find(t=>t.id===editing),el=$('taskCompletions');
    el.hidden=$('taskAssignee').value!=='all';
    if(el.hidden)return;
    const count=d.members.filter(m=>t?.completions?.[m.id]===true).length;
    el.innerHTML='<p class="sub">Կատարել են '+count+' / '+d.members.length+'</p>'+d.members.map(m=>'<div class="completion-member"><span>'+esc(m.name)+'</span><span>'+(t?.completions?.[m.id]===true?'✓ Կատարված':'○ Սպասվում է')+'</span></div>').join('')+(d.members.length?'':'<p class="sub">Ավելացրու թիմի անդամներին։</p>');
  }
  $('taskAssignee').onchange=renderCompletions;
  function openTask(id){
    const d=view(), t=d.tasks.find(t=>t.id===id&&!t.deleted);
    editing=t?.id||null;draftBase=t?structuredClone(t):null;
    $('taskHeading').textContent=t?'Առաջադրանք':'Նոր առաջադրանք';$('taskTitle').value=t?.title||'';$('taskDescription').value=t?.description||'';$('taskTarget').value=t?.target||'';
    $('taskDate').value=t?.date||$('day').value||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yerevan',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    $('taskAssignee').innerHTML='<option value="">Չհանձնարարված</option><option value="all">Բոլորի համար</option>'+d.members.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join('');
    $('taskAssignee').value=t?t.assigneeId:(d.members.some(m=>m.id===person)?person:'');
    $('taskCategory').innerHTML=['Տարածում','Տուն','Գոյք · Գիշերակաց','Գոյք · Խոհանոց','Գոյք · Տնտեսական','Տրանսպորտ'].map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');$('taskCategory').value=t?.category||'Տարածում';
    $('deleteTask').hidden=!t;$('taskForm').querySelector('[type=submit]').disabled=!connected;$('deleteTask').disabled=!connected;
    renderCompletions();$('taskDialog').showModal();$('taskTitle').focus();
  }
  $('tasks').addEventListener('change',e=>{
    if(!e.target.matches('[data-id]'))return;
    const t=view().tasks.find(t=>t.id===e.target.dataset.id);
    if(t.assigneeId==='all'){if(!view().members.some(m=>m.id===person))return;enqueue({type:'task.complete',id:t.id,memberId:person,done:e.target.checked,base:t.completions[person]===true});}else enqueue({type:'task.update',id:t.id,patch:{done:e.target.checked},base:{done:t.done}});
  });
  $('tasks').addEventListener('click',e=>{const a=e.target.closest('[data-assign]');if(a){openPicker(a.dataset.assign,a);return;}const b=e.target.closest('[data-edit]');if(b)openTask(b.dataset.edit);});
  function openPicker(id,anchor){
    if(!connected)return;
    pickerTask=id;const d=view(),t=d.tasks.find(x=>x.id===id&&!x.deleted);if(!t)return;
    const menu=$('assignPicker');menu.innerHTML='<p class="picker-label">Պատասխանատու</p>'+[{id:'',name:'Չհանձնարարված'},{id:'all',name:'Բոլորի համար'},...d.members].map(m=>'<button type="button" data-pick="'+esc(m.id)+'" class="picker-option" '+(t.assigneeId===m.id?'aria-current="true"':'')+'><span class="avatar">'+esc(m.id?Array.from(m.name)[0]:'–')+'</span>'+esc(m.name)+(t.assigneeId===m.id?' ✓':'')+'</button>').join('');
    const rect=anchor.getBoundingClientRect();menu.style.top=Math.min(window.innerHeight-20,rect.bottom+6)+'px';menu.style.left=Math.max(8,Math.min(window.innerWidth-218,rect.right-208))+'px';menu.hidden=false;
  }
  $('assignPicker').onclick=e=>{const b=e.target.closest('[data-pick]');if(!b||!pickerTask)return;const t=view().tasks.find(x=>x.id===pickerTask);if(t&&t.assigneeId!==b.dataset.pick)enqueue({type:'task.update',id:t.id,patch:{assigneeId:b.dataset.pick},base:{assigneeId:t.assigneeId}});$('assignPicker').hidden=true;pickerTask=null;};
  document.addEventListener('click',e=>{if(!e.target.closest('#assignPicker')&&!e.target.closest('[data-assign]')){$('assignPicker').hidden=true;pickerTask=null;}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('assignPicker').hidden=true;pickerTask=null;}});
  $('taskForm').onsubmit=e=>{
    e.preventDefault();if(!connected)return;
    const vals={title:$('taskTitle').value.trim(),description:$('taskDescription').value,target:$('taskTarget').value,date:$('taskDate').value,assigneeId:$('taskAssignee').value,category:$('taskCategory').value};
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
        if(op.type==='task.complete'&&t)op.base=t.completions?.[op.memberId]===true;
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
