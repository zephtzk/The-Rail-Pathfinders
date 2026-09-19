import {loadIncidentLog,saveIncident,updateIncident,resolveIncident,clearIncidentLog,createIncidentDraft,DEMO_INCIDENTS_KEY} from './demo-incidents.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels={planned:'Planned track works',disruption:'Disruption during travel',closure:'Closure',delay:'Delay',cancellation:'Cancellation',minor:'Minor',major:'Major',severe:'Severe',active:'Active',resolved:'Resolved',both:'Both directions',forward:'From → to',reverse:'To → from'};
const builtInStops=[['EW2_A','Tampines'],['EW8_A','Paya Lebar'],['EW9_A','Aljunied'],['EW12_A','Bugis'],['CC9_A','Paya Lebar'],['CC4_A','Promenade'],['DT15_A','Promenade'],['DT14_A','Bugis']];
const options=(values,value)=>values.map(key=>`<option value="${key}" ${value===key?'selected':''}>${labels[key]??key}</option>`).join('');
const timeLabel=value=>`${value.slice(0,10)} · ${value.slice(11,16)} SGT`;

function ensureStyles(){
  if(document.querySelector('link[data-demo-incidents]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/src/demo-incidents.css';link.dataset.demoIncidents='';document.head.append(link);
}

/** Shared authoring UI. Replay execution is owned by the demo:run-replay listener. */
export function mountDemoIncidents({host,getNetwork=()=>null,getDate=()=>null,onNormal,page=false}={}){
  if(!host)throw Error('A host is required for demo incidents.');
  ensureStyles();
  let dialog=null,surface=null,returnFocus=null,screen='scenarios',selectedId=null,draft=null,editingId=null,notice='',clearPending=false,loadError='';
  const incidents=()=>{try{const entries=loadIncidentLog({strict:true});loadError='';return entries;}catch(error){loadError=error.message;return [];}};
  const selected=()=>incidents().find(incident=>incident.id===selectedId&&incident.status==='active')??null;
  const title=()=>screen==='editor'?(editingId?'Edit demo incident':labels[draft.scenario]):screen==='log'?'Incident log':'Try a journey scenario';
  const replayButton=()=>`<div class="demo-replay-choice"><p>${selected()?`Selected: <strong>${esc(selected().title)}</strong>`:'Normal commute selected · no incident'}</p><button type="button" class="demo-primary" id="replay">Run automatic event replay</button></div>`;

  function close(){
    if(!dialog)return;
    dialog.close();dialog.remove();dialog=null;surface=null;
    if(returnFocus?.isConnected)returnFocus.focus();else if(returnFocus?.id)document.getElementById(returnFocus.id)?.focus();
  }
  function open(next='scenarios'){
    screen=next;notice='';clearPending=false;
    if(page){surface=host;surface.classList.add('demo-incidents');render();return;}
    if(!dialog){
      returnFocus=document.activeElement;dialog=document.createElement('dialog');dialog.className='demo-incidents demo-incident-dialog';dialog.setAttribute('aria-labelledby','demo-incident-title');
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}});
      document.body.append(dialog);surface=dialog;render();dialog.showModal();surface.querySelector('h2').focus();
    }else render();
  }
  function startDraft(scenario){
    const date=getDate();draft=createIncidentDraft(scenario,date?{date}:{});editingId=null;screen='editor';notice='';render();
  }
  function scenarioMarkup(){
    return `<div class="demo-scenarios"><button type="button" data-demo-scenario="normal"><span aria-hidden="true">✓</span><span><strong>Normal commute</strong><small>A rehearsal with no fictional incident</small></span></button><button type="button" data-demo-scenario="planned"><span aria-hidden="true">◷</span><span><strong>Planned track works</strong><small>Edit a planned closure, service and time window</small></span></button><button type="button" data-demo-scenario="disruption"><span aria-hidden="true">!</span><span><strong>Disruption during travel</strong><small>Edit a delay or cancellation during your journey</small></span></button></div>${replayButton()}<button type="button" class="demo-secondary demo-back" id="demo-choose-saved">Choose a saved incident</button><a class="demo-log-link" href="/demo-incidents.html">Open incident log <span>(${incidents().length})</span></a>`;
  }
  function editorMarkup(){
    const network=getNetwork(),stops=network?.stops?.map(stop=>[stop.id,stop.name])??builtInStops;
    return `<form id="demo-incident-form" novalidate><p class="demo-help">Save fictional details to this device’s incident log. All times are Singapore time (SGT).</p><label>Incident title<input name="title" required maxlength="120" value="${esc(draft.title)}" autocomplete="off"></label><div class="demo-fields"><label>Incident type<select name="type">${options(['closure','delay','cancellation'],draft.type)}</select></label><label>Severity<select name="severity">${options(['minor','major','severe'],draft.severity)}</select></label></div><label>Service or line<input name="service" required maxlength="40" list="demo-service-options" value="${esc(draft.service)}" aria-describedby="demo-service-help" autocomplete="off"></label><datalist id="demo-service-options">${['EW','NS','NE','CC','DT','TE','BP','SE','SW','PE','PW'].map(line=>`<option value="${line}"></option>`).join('')}</datalist><p id="demo-service-help" class="demo-help">Use a rail line code, such as EW, or a bus service number, such as 36.</p><label>Route scope<select name="scope"><option value="segment" ${draft.scope==='segment'?'selected':''}>Between two stops</option><option value="service" ${draft.scope==='service'?'selected':''}>Whole service or line</option></select></label><fieldset id="demo-segment-fields" ${draft.scope==='service'?'hidden disabled':''}><legend>Affected segment</legend><div class="demo-fields"><label>From stop<input name="from" list="demo-stop-options" required maxlength="64" value="${esc(draft.from)}" autocomplete="off"></label><label>To stop<input name="to" list="demo-stop-options" required maxlength="64" value="${esc(draft.to)}" autocomplete="off"></label></div><datalist id="demo-stop-options">${stops.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}</datalist><p class="demo-help">Choose a stop code from the suggestions. EW8_A is Paya Lebar; EW9_A is Aljunied. Bus stops use their routing code, for example bus:01012.</p></fieldset><label>Direction<select name="direction">${options(draft.scope==='service'?['both']:['both','forward','reverse'],draft.scope==='service'?'both':draft.direction)}</select></label><p class="demo-help">Direction follows the stop order above. Whole-service incidents apply to both directions; choose two stops to limit the direction.</p><div class="demo-fields"><label>Starts at (SGT)<input name="startsAt" type="datetime-local" required value="${esc(draft.startsAt.slice(0,16))}"></label><label>Ends at (SGT)<input name="endsAt" type="datetime-local" required value="${esc(draft.endsAt.slice(0,16))}"></label></div><label id="demo-delay-field" ${draft.type==='delay'?'':'hidden'}>Delay (minutes)<input name="delayMinutes" type="number" min="1" max="180" step="1" required value="${draft.delayMinutes||22}" ${draft.type==='delay'?'':'disabled'}></label><label>Incident details<textarea name="details" required maxlength="2000" rows="4" aria-describedby="demo-details-help">${esc(draft.details)}</textarea></label><p id="demo-details-help" class="demo-help">Describe the fictional effect on travel. Keep personal details out of the demo log.</p><p id="demo-form-error" class="demo-error" role="alert" tabindex="-1"></p><div class="demo-actions"><button type="submit" class="demo-primary">${editingId?'Save changes':'Save to incident log'}</button><button type="button" class="demo-secondary" data-demo-back>Cancel</button></div></form>`;
  }
  function logMarkup(){
    const entries=incidents();
    if(loadError)return '<p class="demo-help">Your existing data is preserved. The incident log is unavailable until browser storage can be read.</p>';
    return `<p class="demo-help">Saved on this device only. These incidents are fictional and are never submitted as operator notices.</p><div class="demo-actions"><button type="button" class="demo-secondary" data-demo-scenario="planned">Add planned track works</button><button type="button" class="demo-secondary" data-demo-scenario="disruption">Add travel disruption</button></div>${entries.length?`<ol class="demo-log-list">${entries.map(incident=>`<li><article aria-labelledby="demo-title-${esc(incident.id)}"><div class="demo-log-header"><span class="demo-badge">Demo · ${labels[incident.status]}</span><span>${labels[incident.severity]} ${labels[incident.type].toLowerCase()}</span></div><h3 id="demo-title-${esc(incident.id)}">${esc(incident.title)}</h3><p><strong>${esc(incident.service)}</strong> · ${incident.scope==='segment'?`${esc(incident.from)} → ${esc(incident.to)}`:'Whole service'} · ${labels[incident.direction]}</p><p>${esc(timeLabel(incident.startsAt))}<br>to ${esc(timeLabel(incident.endsAt))}${incident.type==='delay'?` · ${incident.delayMinutes} minute delay`:''}</p><p class="demo-incident-details">${esc(incident.details)}</p><p class="demo-help">Updated ${esc(timeLabel(incident.updatedAt))} · revision ${incident.revision}</p><div class="demo-actions"><button type="button" class="demo-secondary" data-demo-edit="${esc(incident.id)}">Edit<span class="demo-sr-only"> ${esc(incident.title)}</span></button>${incident.status==='active'?`${page?'':`<button type="button" class="demo-secondary" data-demo-select="${esc(incident.id)}" aria-pressed="${selectedId===incident.id}">Select for replay<span class="demo-sr-only"> ${esc(incident.title)}</span></button>`}<button type="button" class="demo-secondary" data-demo-resolve="${esc(incident.id)}">Mark resolved<span class="demo-sr-only"> ${esc(incident.title)}</span></button>`:''}</div></article></li>`).join('')}</ol>${page?'':replayButton()}${clearPending?'<div class="demo-clear-confirm"><p>Delete all saved demo incidents from this device?</p><div class="demo-actions"><button type="button" class="demo-secondary" id="demo-confirm-clear">Delete demo log</button><button type="button" class="demo-secondary" id="demo-cancel-clear">Keep incidents</button></div></div>':'<button type="button" class="demo-secondary" id="demo-clear-log">Clear demo log</button>'}`:'<div class="demo-log-empty"><h3>No saved demo incidents</h3><p>Add a planned change or travel disruption to start your log.</p></div>'}`;
  }
  function render({focus=true}={}){
    if(!surface)return;
    incidents();
    surface.innerHTML=`<div class="demo-dialog-header"><div><span class="demo-badge">Demo · fictional incidents</span><h2 id="demo-incident-title" tabindex="-1">${title()}</h2></div>${page?'':'<button type="button" class="demo-close" aria-label="Close demo dialog">×</button>'}</div>${loadError?`<p class="demo-error" role="alert">${esc(loadError)}</p>`:''}${notice?`<p class="demo-status" role="status">${esc(notice)}</p>`:''}${screen==='editor'?editorMarkup():screen==='log'?logMarkup():scenarioMarkup()}${screen==='log'&&!page?'<button type="button" class="demo-secondary demo-back" data-demo-back>Back to scenarios</button>':''}`;
    surface.querySelector('.demo-close')?.addEventListener('click',close);
    surface.querySelector('#demo-choose-saved')?.addEventListener('click',()=>{screen='log';notice='';render();});
    for(const button of surface.querySelectorAll('[data-demo-scenario]'))button.onclick=()=>{if(button.dataset.demoScenario==='normal'){selectedId=null;notice='Normal commute selected.';onNormal?.();render();}else startDraft(button.dataset.demoScenario);};
    for(const button of surface.querySelectorAll('[data-demo-back]'))button.onclick=()=>{screen=page?'log':'scenarios';notice='';clearPending=false;render();};
    for(const button of surface.querySelectorAll('[data-demo-edit]'))button.onclick=()=>{const incident=incidents().find(item=>item.id===button.dataset.demoEdit);if(!incident)return;draft=incident;editingId=incident.id;screen='editor';notice='';render();};
    for(const button of surface.querySelectorAll('[data-demo-select]'))button.onclick=()=>{selectedId=button.dataset.demoSelect;notice='Demo incident selected for replay.';render();};
    for(const button of surface.querySelectorAll('[data-demo-resolve]'))button.onclick=()=>attempt(()=>{resolveIncident(button.dataset.demoResolve);notice='Demo incident marked resolved.';render();});
    surface.querySelector('#demo-clear-log')?.addEventListener('click',()=>{clearPending=true;render();surface.querySelector('#demo-cancel-clear').focus();});
    surface.querySelector('#demo-cancel-clear')?.addEventListener('click',()=>{clearPending=false;render();});
    surface.querySelector('#demo-confirm-clear')?.addEventListener('click',()=>attempt(()=>{clearIncidentLog();selectedId=null;clearPending=false;notice='Demo incident log cleared.';render();}));
    surface.querySelector('#replay')?.addEventListener('click',()=>{const incident=selected();close();window.dispatchEvent(new CustomEvent('demo:run-replay',{detail:{incident}}));});
    const form=surface.querySelector('form');
    if(form){
      form.elements.scope.onchange=()=>{const group=form.querySelector('#demo-segment-fields');const whole=form.elements.scope.value==='service';group.hidden=group.disabled=whole;form.elements.direction.innerHTML=options(whole?['both']:['both','forward','reverse'],whole?'both':form.elements.direction.value);};
      form.elements.type.onchange=()=>{const hidden=form.elements.type.value!=='delay';form.querySelector('#demo-delay-field').hidden=hidden;form.elements.delayMinutes.disabled=hidden;};
      form.addEventListener('input',event=>{event.target.setCustomValidity?.('');event.target.removeAttribute('aria-invalid');if(['startsAt','endsAt'].includes(event.target.name)){form.elements.endsAt.setCustomValidity('');form.elements.endsAt.removeAttribute('aria-invalid');}form.querySelector('#demo-form-error').textContent='';});
      form.onsubmit=event=>{event.preventDefault();saveForm(form);};
    }
    if(focus)surface.querySelector('h2').focus();
  }
  function attempt(action){try{action();}catch(error){notice=error.message;render();}}
  function saveForm(form){
    const values=Object.fromEntries(new FormData(form)),error=form.querySelector('#demo-form-error');
    if(!form.checkValidity()){for(const field of form.querySelectorAll(':invalid'))field.setAttribute('aria-invalid','true');error.textContent='Check the highlighted fields. A title, service, valid time window and incident details are required.';form.reportValidity();return;}
    if(values.endsAt<=values.startsAt){form.elements.endsAt.setCustomValidity('End time must be after the start time.');form.elements.endsAt.setAttribute('aria-invalid','true');error.textContent='End time must be after the start time.';form.elements.endsAt.reportValidity();return;}
    try{
      const input={...values,scenario:draft.scenario,startsAt:`${values.startsAt}:00+08:00`,endsAt:`${values.endsAt}:00+08:00`,delayMinutes:values.type==='delay'?Number(values.delayMinutes):0,from:values.from??'',to:values.to??''};
      const incident=editingId?updateIncident(editingId,input):saveIncident(input);
      selectedId=incident.status==='active'?incident.id:null;screen='log';notice='Demo incident saved to this device.';render();
    }catch(failure){error.textContent=failure.message;error.focus();}
  }
  function refresh(){if(surface&&screen!=='editor')render({focus:false});}
  const storageChanged=event=>{if(event.key===DEMO_INCIDENTS_KEY||event.key===null)refresh();};
  window.addEventListener('demo:incidents-changed',refresh);window.addEventListener('storage',storageChanged);
  if(page)open('log');else{host.innerHTML='<button type="button" class="secondary" id="demo-scenario-open">Try a journey scenario</button>';host.querySelector('button').onclick=()=>open();}
  return {openScenario:()=>open(),openLog:()=>open('log'),destroy(){close();window.removeEventListener('demo:incidents-changed',refresh);window.removeEventListener('storage',storageChanged);host.replaceChildren();}};
}
