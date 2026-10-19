(() => {
  const $ = id => document.getElementById(id);
  let tasks = [], connected = false, busy = false, saving = false, timer;
  const pending = new Set(), feedback = new Map();
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayLabel = date => `${Number(date.slice(-2))} հոկտեմբերի`;
  const errors = {
    storage_not_configured:'Ընդհանուր պահպանումը դեռ միացված չէ։ Նշումները հասանելի կլինեն կարգավորումից հետո։',
    task_changed:'Այս առաջադրանքը փոխվել է ուրիշ սարքից։ Ցուցադրված է վերջին վիճակը․ ստուգեք և կրկին նշեք։'
  };
  function render() {
    const done = tasks.filter(t => t.done).length;
    $('progressLabel').textContent = `${done} / ${tasks.length} կատարված`;
    $('progress').max = tasks.length || 38; $('progress').value = done;
    $('percent').textContent = `${tasks.length ? Math.round(done/tasks.length*100) : 0}%`;
    const filtered = tasks.filter(t => (!$('day').value || t.date === $('day').value) && (!$('role').value || t.role === $('role').value) && (!$('state').value || t.done === ($('state').value === 'done')));
    const active = document.activeElement?.id;
    $('tasks').innerHTML = [...new Set(filtered.map(t => t.date))].map(date => {
      const all = tasks.filter(t => t.date === date);
      return `<section><div class="day-heading"><h2>${dayLabel(date)}</h2><span>${all.filter(t=>t.done).length} / ${all.length} կատարված</span></div>${filtered.filter(t=>t.date===date).map(t => `<article class="task ${t.done?'done':''}"><input type="checkbox" id="${escape(t.id)}" ${t.done?'checked':''} ${!connected||pending.has(t.id)?'disabled':''} aria-describedby="status-${escape(t.id)}"><div><label for="${escape(t.id)}">${escape(t.title)}</label><p class="target">Նպատակ՝ ${escape(t.target)}</p><div class="meta"><span>Պատասխանատու՝ ${escape(t.role)}</span><span>Վերջնաժամկետ՝ ${dayLabel(t.date)}</span></div><div class="feedback" id="status-${escape(t.id)}" role="status">${escape(feedback.get(t.id)||'')}</div></div></article>`).join('')}</section>`;
    }).join('') || '<p>Այս ֆիլտրերով առաջադրանք չկա։</p>';
    if (active) document.getElementById(active)?.focus({preventScroll:true});
  }
  function merge(data) {
    if (!Array.isArray(data.tasks)) throw new Error('invalid_response');
    tasks = data.tasks;
    const selected = $('day').value;
    $('day').innerHTML = '<option value="">Բոլոր օրերը</option>' + [...new Set(tasks.map(t=>t.date))].map(d=>`<option value="${escape(d)}">${dayLabel(d)}</option>`).join('');
    $('day').value = selected;
  }
  async function request(options) {
    const response = await fetch('/api/tasks', {...options,cache:'no-store',signal:AbortSignal.timeout(55000)});
    const data = await response.json();
    if (!response.ok) {const error = new Error(data.error || 'save_failed'); error.data = data.data; throw error;}
    return data;
  }
  function schedule() {clearTimeout(timer);timer=setTimeout(()=>refresh(),60000);}
  async function refresh() {
    if (busy || saving || document.hidden) {schedule();return;}
    busy=true; $('refresh').disabled=true;
    try {const data=await request();if(!saving){merge(data); connected=true; $('sync').textContent='Համաժամացված է · ստուգվում է ամեն 60 վայրկյանը մեկ։';}}
    catch(error) {connected=false; $('sync').textContent=errors[error.message]||'Կապը չի հաստատվել։ Ցուցադրված տվյալները կարող են հնացած լինել։ Փորձեք թարմացնել։';
      if (!tasks.length) {try {const r=await fetch('/tasks.json');if(!r.ok)throw new Error();merge(await r.json());}catch{$('sync').textContent='Պլանը չի բեռնվել։ Փորձեք թարմացնել։';}}
    } finally {busy=false;$('refresh').disabled=false;render();schedule();}
  }
  let queue = Promise.resolve();
  $('tasks').addEventListener('change', event => {
    if (!event.target.matches('input[type=checkbox]')) return;
    const id=event.target.id, done=event.target.checked, task=tasks.find(t=>t.id===id);
    const revision=task.revision;
    pending.add(id);feedback.set(id,'Պահպանվում է…');saving=true;render();
    queue=queue.then(async()=>{
      try {merge(await request({method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,done,revision})}));feedback.set(id,'✓ Պահպանված է');connected=true;}
      catch(error) {if(error.data)merge(error.data);feedback.set(id,errors[error.message]||'Պահպանումը չի հաստատվել։ Թարմացրեք էջը՝ վիճակը ստուգելու համար։');$('sync').textContent='Փոփոխության պահպանումը չի հաստատվել։';}
      finally {pending.delete(id);saving=pending.size>0;render();if(!saving)schedule();}
    });
  });
  ['day','role','state'].forEach(id=>$(id).addEventListener('change',render));
  $('refresh').onclick=refresh;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('online',refresh);
  refresh();
})();
