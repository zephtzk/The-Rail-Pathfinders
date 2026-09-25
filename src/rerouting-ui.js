import {confirmProgress,compareJourney,decide,ingestEvents,clockTime} from './journey-state.js';
import {confirmCheckpoint,proposeRoute,acceptRoute} from './journey-v2.js';
import {canonicalReroute} from './reroute-model.js';
import {noticeSnapshot,newerSnapshot} from './feed-health.js';
import {itineraryStepLabel} from './itinerary-display.js';
import {getAppLocation} from './location-assistance.js';
import {requiresIndoorConfirmation} from './location-progress.js';
import {externalRerouteState} from './address-routing.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountRerouting({host,demoHost,companion,router,build,name,message}) {
  const locationService=getAppLocation();
  function syncAssistance(){const a=active(),compact=locationService.getState().usable&&!requiresIndoorConfirmation(a,a?.progress?.stepIndex),details=host.querySelector('#r2-manual-correction');if(details&&details.dataset.compact!==String(compact)){details.dataset.compact=String(compact);if(!compact||!details.matches(':focus-within'))details.open=!compact;}}
  let comparison=null,feed=null,pending=false,lastAttempt=0,requestEpoch=0,reconnectTimer;
  const active=()=>companion.getActive();
  function supported(){const a=active();if(!a||a.status!=='started'||!a.routingContext)throw Error('Start or resume a journey before checking its route.');if(a.detour&&!['cancelled','resumed'].includes(a.detour.status))throw Error('Finish or cancel your toilet stop before checking the main route.');if(a.routingContext.build!==build)throw Error('Route information has changed. Your saved directions remain available; plan a new route to check connections.');return a;}
  const run=fn=>()=>{try{fn();}catch(e){message(e.message);}};
  function render(){const a=active();demoHost.hidden=!(a?.plan.mode==='replay'&&a.status==='started');const context=a?.routingContext,available=!!context&&a.status==='started'&&context.build===build,expanded=host.querySelector('.reroute-tools')?.open,noticesExpanded=host.querySelector('.service-notices')?.open;

    const external=externalRerouteState(a);
    if(external){host.hidden=false;host.innerHTML=`<details class="reroute-tools"><summary>Check address-route coverage</summary><p>${esc(external.message)}</p></details>`;return;}
    host.hidden=!available;
    host.innerHTML=available&&comparison?`<div id="r2-comparison" role="status">${comparison?`<h3>${comparison.status==='offer'?'Another connection is available':'Your current route has not changed'}</h3><p>${esc(comparison.message)}</p>${comparison.continuing?`<p>Current route: ${comparison.continuing.feasible?'estimated arrival '+clockTime(comparison.continuing.arrivalSeconds):'cannot be confirmed'} · ${esc(comparison.continuing.reason)}</p>`:''}${comparison.alternative?`<p>Alternative: estimated arrival ${clockTime(comparison.alternative.arrivalSeconds)} · ${Math.ceil(comparison.alternative.walkingSeconds/60)} min walking · ${comparison.alternative.transfers} transfers. ${comparison.alternative.estimated?'Bus times are estimates.':''}</p>`:''}${comparison.status==='offer'?'<button class="primary" id="r2-accept">Accept revised route</button><button class="secondary" id="r2-decline">Keep current route</button>':''}`:''}</div>`:'';
    host.hidden=!available||!comparison;
    syncAssistance();
    host.querySelector('#r2-progress')?.addEventListener('submit',e=>{e.preventDefault();try{const a=supported(),v=Object.fromEntries(new FormData(e.target)),parts=v.time.split(':').map(Number);const context=confirmProgress(a.routingContext,{kind:v.kind,legIndex:Number(v.legIndex),confirmedSeconds:parts[0]*3600+parts[1]*60+(parts[2]??0),walkedSeconds:Math.ceil(Number(v.walk)*60)});const next=confirmCheckpoint(a,{stepIndex:Math.min(context.progress.legIndex,a.route.steps.length-1),kind:v.kind,label:'Manually confirmed '+v.kind});next.routingContext=context;companion.update(next);reassess();}catch(e){message(e.message);}});
    host.querySelector('#r2-reassess')?.addEventListener('click',run(reassess));
    for(const [id,decision] of [['r2-accept','accepted'],['r2-decline','declined']])host.querySelector('#'+id)?.addEventListener('click',run(()=>{const a=supported(),fresh=compareJourney(a.routingContext,router,Date.now(),navigator.onLine);if(fresh.status!=='offer'||fresh.key!==comparison.key)throw Error('Conditions changed. Compare again before accepting.');const context=decide(a.routingContext,fresh,decision);let next={...a,routingContext:context};if(decision==='accepted'){const plan=canonicalReroute(context,{name,source:'Explicitly accepted routing comparison',priorRoute:a.route});next=acceptRoute(proposeRoute(a,plan.route,'Reviewed connection change'));next.routingContext=context;}else{next.revision++;next.updatedAt=Date.now();}comparison=null;companion.update(next);message(decision==='accepted'?'Revised route accepted. Your journey and destination are preserved.':'Current route kept.');}));
    host.querySelector('#r2-refresh')?.addEventListener('click',refresh);
    demoHost.innerHTML='<h2>Fictional route incidents</h2><p>These controls apply only to a labelled rehearsal with a timetable routing context.</p><button class="secondary" id="r2-demo-cancel">Demo: cancel next train</button><button class="secondary" id="r2-demo-recover">Demo: recover train</button>';
    demoHost.querySelector('#r2-demo-cancel').onclick=run(()=>synthetic(false));demoHost.querySelector('#r2-demo-recover').onclick=run(()=>synthetic(true));
  }
  function reassess(){const a=supported();comparison=compareJourney(a.routingContext,router,Date.now(),navigator.onLine);render();host.querySelector('#r2-comparison')?.scrollIntoView({block:'nearest'});}
  function synthetic(recover){const a=supported();if(a.plan.mode!=='replay')throw Error('Synthetic incidents require a labelled Demo journey. They never alter a personal trip.');const context=a.routingContext,leg=context.route.legs.slice(context.progress.legIndex).find(l=>l.type==='ride'&&l.mode==='rail'),old=context.events.at(-1),now=Date.now();if(recover&&!old||!recover&&!leg)throw Error('No matching demo event or next train.');const event=recover?{...old,revision:old.revision+1,effect:'recovered'}:{id:`demo:${leg.tripId}`,revision:(context.events.find(e=>e.id===`demo:${leg.tripId}`)?.revision??0)+1,evidence:'synthetic',effect:'cancelled',build,tripId:leg.tripId,routeId:leg.routeId,directionId:leg.directionId,serviceDate:leg.serviceDate,impactStartSeconds:leg.startSeconds,impactEndSeconds:leg.endSeconds};Object.assign(event,{sourceTime:new Date(now).toISOString(),retrievedAt:new Date(now).toISOString(),validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+90000).toISOString()});companion.update({...a,revision:a.revision+1,updatedAt:now,routingContext:ingestEvents(context,[event],router.network)});reassess();message('Fictional incident applied only to this labelled rehearsal.');}
  async function refresh(){if(pending||!navigator.onLine||Date.now()-lastAttempt<60000)return;pending=true;lastAttempt=Date.now();const epoch=++requestEpoch;render();try{const r=await fetch('/api/notices',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const next=noticeSnapshot(await r.json());if(!next)throw Error();if(epoch===requestEpoch&&newerSnapshot(feed,next))feed=next;}catch{if(epoch===requestEpoch)feed={notices:{status:'unavailable',items:[],retrievedAt:null}};}finally{if(epoch===requestEpoch){pending=false;render();}}}
  window.addEventListener('copilot:state-changed',e=>{if(e.detail.locationOnly)return;comparison=null;render();});
  window.addEventListener('offline',()=>{requestEpoch++;pending=false;comparison=null;clearTimeout(reconnectTimer);render();});
  window.addEventListener('online',()=>{render();clearTimeout(reconnectTimer);if(feed)reconnectTimer=setTimeout(refresh,Math.max(0,lastAttempt+60000-Date.now()));});
  locationService.subscribe(syncAssistance);
  render();
}
