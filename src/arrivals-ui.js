import {validatePilotArrivals,pilotPredictionState} from './pilot-validation.js';
import {singaporeNow} from './personal.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=value=>new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
export function currentBusArrivalContext(active){
 if(!active||active.status!=='started'||active.facilityBlocked||active.facilityReview||active.detour&&!['resumed','cancelled'].includes(active.detour.status))return null;
 const index=active.progress.stepIndex,step=active.route.steps[index];
 if(step?.type==='ride'&&step.source?.mode==='bus'&&active.progress.kind!=='onboard')return {leg:step.source,date:active.plan.departureDate};
 if(step?.type==='wait'&&active.route.steps[index+1]?.source?.mode==='bus')return {leg:active.route.steps[index+1].source,date:active.plan.departureDate};
 return null;
}
export function mountBusArrivals(host,{getContext,getNetwork,name}={}){
 let contextKey='',feed=null,controller=null,epoch=0,busy=false,retryAt=0;
 const network=()=>getNetwork(),stopName=code=>network()?.stops.find(s=>s.id===code)?.name??name?.('bus:'+code)??code;
 function render(){
  const context=getContext(),leg=context?.leg,stop=String(leg?.fromStopId??'').replace(/^bus:/,'');
  if(!leg){host.hidden=true;return;}
  if(!/^\d{5}$/.test(stop)||!network()?.stops.some(s=>s.id===stop)){host.hidden=false;host.innerHTML='<section class="bus-arrivals"><h3>Current bus arrivals</h3><p>The boarding stop could not be matched to a supported arrival-feed identifier. Check the stop display or operator information; planned times are not live arrivals.</p></section>';return;}
  host.hidden=false;const key=JSON.stringify([stop,leg.patternId,leg.serviceNo,leg.fromSequence,context.date]);
  if(key!==contextKey){contextKey=key;controller?.abort();epoch++;feed=null;busy=false;retryAt=0;}
  const predictions=(feed?.predictions??[]).filter(p=>p.serviceNo===leg.serviceNo&&(!p.match||p.match.patternId===leg.patternId&&p.match.sequence===leg.fromSequence)).slice(0,3),checked=feed?.retrievedAt;
  host.innerHTML=`<section class="bus-arrivals"><h3>Bus ${esc(leg.serviceNo)} arrivals · ${esc(stopName(stop))}</h3><p>Boarding stop ${esc(stop)}. ${context.date!==singaporeNow().departureDate?`Your plan is for ${esc(context.date)}. These predictions are for now.`:'Current predictions for this stop.'}</p><button type="button" class="secondary" data-check-arrivals ${busy||!navigator.onLine||Date.now()<retryAt?'disabled':''}>${busy?'Checking…':'Check current arrivals'}</button><p class="field-note">${checked?`Last checked ${clock(checked)} SGT. `:''}No automatic requests. A bus prediction is not your destination arrival time or a guaranteed transfer.</p>${!navigator.onLine?'<p class="notice">Offline — saved predictions are not current.</p>':''}${feed?`<ul class="arrival-predictions">${predictions.map(p=>{const state=pilotPredictionState(p,feed,Date.now(),navigator.onLine),basis=p.predictionBasis==='vehicle-location-estimate'?'Live vehicle estimate':'Operator schedule',pattern=network().patterns.find(x=>x.id===p.match?.patternId);return `<li><strong>${esc(p.serviceNo)} · ${clock(p.predictedArrival)} SGT</strong><span>${esc(basis)} · ${state==='fresh'?'current':state==='expired'?'stale or expired':esc(state)}</span><span>${p.match?`Direction ${p.match.direction} toward ${esc(stopName(p.destinationCode))}${pattern?.loopDescription?` · loop via ${esc(pattern.loopDescription)}`:''}`:`Reported destination ${esc(stopName(p.destinationCode))}; direction/stop visit unverified`}</span></li>`;}).join('')}</ul>${!predictions.length?'<p>No matching prediction is available. This does not establish that the service has stopped.</p>':''}${feed.status==='unavailable'?'<p class="notice">Live information is unavailable. Your accepted route stays unchanged.</p>':''}<details><summary>Arrival source details</summary><p>LTA BusArrival · ${esc(feed.status)}. Provider observation time is not supplied. Estimates can change.</p><p>${esc(feed.error??'')}</p></details>`:'<p class="field-note">No live request yet. Planned bus times remain frequency estimates.</p>'}</section>`;
  host.querySelector('[data-check-arrivals]').onclick=async()=>{
   busy=true;controller=new AbortController();const token=++epoch;retryAt=Date.now()+30000;render();const timer=setTimeout(()=>controller?.abort(),8000);
   try{const response=await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(stop)}`,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error();const result=await response.json();if(!validatePilotArrivals(result,stop,network().patterns))throw Error();if(token===epoch){feed=result;retryAt=Math.max(retryAt,Date.parse(result.nextRefreshAt)||0);}}
   catch{if(token===epoch)feed={status:'unavailable',retrievedAt:null,predictions:[],error:'Network or provider access unavailable'};}
   finally{clearTimeout(timer);if(token===epoch){busy=false;render();}}
  };
 }
 const timer=setInterval(()=>{if(!document.hidden)render();},15000);render();return {refresh:render,destroy(){clearInterval(timer);controller?.abort();}};
}
