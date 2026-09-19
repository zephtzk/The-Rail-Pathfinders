import {noticeSnapshot,newerSnapshot} from './feed-health.js';
import {demoIncidentState,demoIncidentAlertable,serviceDemoIncidents,officialServiceState,serviceNoticeKey} from './services-model.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>Number.isFinite(typeof value==='number'?value:Date.parse(value))?new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(value))+' SGT':'Not supplied';
const DISMISS_KEY='commute-services-dismissed-v1';
const excerpt=(value,max=180)=>{const text=String(value??'').replace(/\s+/g,' ').trim();return text.length>max?text.slice(0,max-1)+'…':text;};

/** The host is a sibling of facilities. This controller never alters a journey. */
export function mountServices({host,noticeHost,loadIncidents=()=>[],getContext=()=>({}),onReplay=()=>{},onOpenServices=()=>{},fetcher=globalThis.fetch,storage,now=Date.now}={}){
  if(!host||!noticeHost)throw Error('Services needs a list host and an entry notice host.');
  if(!document.querySelector('link[data-services-css]')){
    const style=document.createElement('link');style.rel='stylesheet';style.href='/src/services.css';style.dataset.servicesCss='true';document.head.append(style);
  }
  let store=storage;
  if(store===undefined){try{store=globalThis.sessionStorage;}catch{store=null;}}
  let dismissed=new Set();
  try{const saved=JSON.parse(store?.getItem(DISMISS_KEY)??'[]');if(Array.isArray(saved))dismissed=new Set(saved.filter(key=>typeof key==='string').slice(-200));}catch{}
  let incidents=[],feed=null,loading=false,checked=false,request=null,destroyed=false,revealed=false,lastError=null;
  const online=()=>globalThis.navigator?.onLine!==false;
  const readIncidents=()=>{try{incidents=serviceDemoIncidents(loadIncidents());}catch{incidents=[];}};
  const saveDismissed=()=>{dismissed=new Set([...dismissed].slice(-200));try{store?.setItem(DISMISS_KEY,JSON.stringify([...dismissed]));}catch{}};
  const currentContext=()=>{try{return getContext()??{};}catch{return {};}};
  const candidates=()=>{
    const context=currentContext(),official=officialServiceState(feed,{now:now(),online:online()});
    return [...incidents.filter(incident=>demoIncidentAlertable(incident,context,now())).map(incident=>({kind:'demo',record:incident,key:serviceNoticeKey('demo',incident)})),...(official.alertable?official.items.map(item=>({kind:'official',record:item,key:serviceNoticeKey('official',item)})):[])];
  };
  host.classList.add('services-panel');noticeHost.classList.add('services-entry-host');
  host.innerHTML=`<section aria-labelledby="services-notices-heading"><div class="services-heading"><h2 id="services-notices-heading" tabindex="-1">Service notices</h2><button type="button" class="secondary" id="services-refresh">Refresh notices</button></div><p class="services-note">Notices do not automatically change your journey.</p><button type="button" class="secondary" id="services-reopen" hidden>Show entry notice again</button><p id="services-feed-status" class="services-note" role="status"></p><div id="services-official"></div><div id="services-demo"></div></section>`;
  const $=id=>host.querySelector('#services-'+id);

  function feedText(){
    if(loading)return 'Checking official service notices…';
    if(!online())return 'Offline. Current official notices cannot be checked. Any previous notices below are last known reports.';
    if(!checked)return 'Official service notices have not been checked.';
    if(feed?.notices?.error==='not_configured')return 'Live official service notices are not connected. Current service conditions are unknown.';
    if(lastError||feed?.notices?.status==='unavailable')return 'Official service notices are unavailable. Current service conditions are unknown. Any previous notices below are last known reports.';
    const state=officialServiceState(feed,{now:now(),online:online()}),retrieval=time(feed?.notices?.retrievedAt);
    if(!state.fresh)return `Last known official notices. Retrieved ${retrieval}. Current validity is unconfirmed.`;
    if(state.partial)return `Official feed is incomplete. Retrieved ${retrieval}. Other notices may be missing.`;
    return state.items.length?`Official notices retrieved ${retrieval}.`:`No notices returned by the official feed. Retrieved ${retrieval}. This does not confirm normal service.`;
  }

  function renderNotice(){
    const all=candidates(),shown=revealed?all:all.filter(item=>!dismissed.has(item.key));
    noticeHost.hidden=!shown.length;
    $('reopen').hidden=!all.length||shown.length>0;
    if(!shown.length){noticeHost.replaceChildren();return;}
    const demos=shown.filter(item=>item.kind==='demo'),official=shown.filter(item=>item.kind==='official');
    noticeHost.innerHTML=`<section class="services-entry" aria-labelledby="services-entry-title"><div role="status" aria-live="polite" aria-atomic="true"><h2 id="services-entry-title">${demos.length&&official.length?'Service notices to review':demos.length?'Simulated service incident':'Official service advisory'}</h2>${demos.length?`<p><strong>Demo only · ${demos.length} ${demos.length===1?'incident':'incidents'}</strong>. ${esc(excerpt(demos[0].record.title??'Saved demo incident',100))}${demoIncidentState(demos[0].record,now())==='scheduled'?' (scheduled simulation)':''}. This does not report a real disruption.</p>`:''}${official.length?`<p><strong>Official · LTA DataMall</strong>. ${esc(excerpt(official[0].record.text))}${official.length>1?` (${official.length} notices available)`:''}</p>`:''}</div><div class="services-entry-actions"><button type="button" class="secondary" data-services-open>View in Services</button><button type="button" class="secondary" data-services-dismiss>Dismiss notice</button></div></section>`;
    noticeHost.querySelector('[data-services-open]').onclick=()=>{onOpenServices();$('notices-heading').focus({preventScroll:true});$('notices-heading').scrollIntoView({block:'nearest'});};
    noticeHost.querySelector('[data-services-dismiss]').onclick=()=>{
      all.forEach(item=>dismissed.add(item.key));saveDismissed();revealed=false;
      // Restore focus to the app's existing keyboard flow without changing views.
      const next=[...document.querySelectorAll('button,a[href],input,select,summary,[tabindex="0"]')].find(el=>!noticeHost.contains(el)&&!el.disabled&&!el.closest('[hidden]')&&el.getClientRects().length);
      renderNotice();next?.focus({preventScroll:true});
    };
  }

  function render(){
    if(destroyed)return;
    const focusKey=document.activeElement?.dataset?.servicesReplay;
    $('refresh').disabled=loading;$('refresh').textContent=loading?'Checking…':'Refresh notices';
    $('feed-status').textContent=feedText();
    const official=officialServiceState(feed,{now:now(),online:online()});
    $('official').innerHTML=official.items.length?`<h3>Official advisories</h3><p class="services-note">Source: LTA DataMall Train Service Alerts. Notices are informational; validity and affected route coverage may be unspecified.</p>${official.items.map(item=>`<article class="services-card services-official-card"><span class="services-tag">${official.fresh?'Official notice':'Last known official notice'}</span><p>${esc(item.text)}</p></article>`).join('')}`:'';
    $('demo').innerHTML=`<h3>Demo incidents</h3><p class="services-note">Simulated incidents saved on this browser. They are separate from the official feed.</p>${incidents.length?incidents.map((incident,index)=>{
      const phase=demoIncidentState(incident,now()),canReplay=['active','scheduled'].includes(phase);
      return `<article class="services-card services-demo-card" data-service-incident="${esc(incident.id??index)}"><div class="services-card-heading"><span class="services-tag">Demo only · ${esc(phase)}</span>${incident.service?`<span class="services-note">Service ${esc(incident.service)}</span>`:''}</div><h4>${esc(incident.title??'Saved demo incident')}</h4>${incident.details||incident.description?`<p>${esc(incident.details??incident.description)}</p>`:''}<p class="services-note">${incident.startsAt||incident.endsAt?`Simulation window: ${esc(time(incident.startsAt))} – ${esc(time(incident.endsAt))}.`:'Simulation time not supplied.'}${incident.updatedAt?` Updated ${esc(time(incident.updatedAt))}.`:''}</p>${canReplay?`<button type="button" class="secondary" data-services-replay="${index}">Run demo replay</button>`:'<p class="services-note">Retained in the demo log for reference.</p>'}</article>`;
    }).join(''):'<p class="services-empty">No saved demo incidents.</p>'}`;
    host.querySelectorAll('[data-services-replay]').forEach(button=>{button.onclick=()=>onReplay(incidents[Number(button.dataset.servicesReplay)]);});
    if(focusKey!==undefined)host.querySelector(`[data-services-replay="${Number(focusKey)}"]`)?.focus({preventScroll:true});
    renderNotice();
  }

  async function refresh(){
    if(loading||destroyed)return;
    readIncidents();checked=true;lastError=null;
    if(!online()){render();return;}
    const controller=new AbortController();request=controller;loading=true;render();const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetcher('/api/notices',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('unavailable');
      const next=noticeSnapshot(await response.json());
      if(!next||!newerSnapshot(feed,next,now()))throw Error('invalid_snapshot');
      if(!destroyed)feed=next;
    }catch{
      lastError='unavailable';
      if(feed)feed={...feed,notices:{...feed.notices,status:'unavailable'}};
    }finally{clearTimeout(timer);request=null;loading=false;render();}
  }

  function incidentsChanged(){readIncidents();render();}
  function freshnessChanged(){readIncidents();render();}
  function storageChanged(event){if(event.key===null||event.key==='commute-copilot-demo-incidents-v1')incidentsChanged();}
  $('refresh').onclick=refresh;
  $('reopen').onclick=()=>{revealed=true;renderNotice();noticeHost.querySelector('[data-services-dismiss]')?.focus({preventScroll:true});noticeHost.scrollIntoView({block:'nearest'});};
  window.addEventListener('demo:incidents-changed',incidentsChanged);
  window.addEventListener('offline',freshnessChanged);
  window.addEventListener('online',freshnessChanged);
  window.addEventListener('focus',freshnessChanged);
  window.addEventListener('storage',storageChanged);
  readIncidents();render();void refresh();
  return {refresh,setIncidents(value){incidents=serviceDemoIncidents(value);render();},render,destroy(){destroyed=true;request?.abort();window.removeEventListener('demo:incidents-changed',incidentsChanged);window.removeEventListener('offline',freshnessChanged);window.removeEventListener('online',freshnessChanged);window.removeEventListener('focus',freshnessChanged);window.removeEventListener('storage',storageChanged);}};
}
