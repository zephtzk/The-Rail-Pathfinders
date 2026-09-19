import {confirmedQuery} from './journey-state.js';
import {compileDemoClosures,demoRouteAffected} from './demo-closures.js';
import {renderItineraryTimeline,publicStationLabel} from './itinerary-display.js';
import {clock} from './planner-model.js';
export const REPLAY_HANDOFF_KEY='commute-copilot-demo-replay-handoff-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function replayJourney({incident,context,network,search,build}) {
  if(context?.replayBlocked)return {status:'confirmation',message:context.replayBlocked};
  if(!context?.route?.legs?.length)return {status:'needs-route',message:'Plan and select a journey first, then run this incident again from Services. Your starting point and destination are yours to choose.'};
  if(context.build!==build)return {status:'confirmation',message:'The saved journey uses a different data version. Find a fresh route before replaying; saved directions have been retained.'};
  const effect=compileDemoClosures(incident,network,context.input.date);
  const remaining={...context.route,legs:context.route.legs.slice(context.progress.legIndex)};
  const base={incident,original:context.route,input:context.input,effect,example:context.example};
  if(effect.status==='unsupported')return {...base,status:'unsupported',message:effect.message};
  const point=confirmedQuery(context,network);
  if(!point.query)return {...base,status:'confirmation',message:point.reason};
  const affected=demoRouteAffected(context.route,effect.impactRules??[],network,context.progress.legIndex);
  if(effect.status==='delay')return {...base,affected,status:'advisory',message:affected?effect.message:'The simulated delay does not overlap the remaining selected ride in its stated time window. The selected directions remain unchanged.',directions:remaining};
  if(!affected)return {...base,affected,status:'unaffected',message:effect.status==='normal'?effect.message:effect.status==='resolved'?effect.message:'This incident does not intersect your remaining selected route and travel time. Your selected directions remain unchanged.',directions:remaining};
  const result=await search({...point.query,demoClosures:effect.rules});
  const deadline=context.route.deadlineSeconds;
  const alternatives=(result.routes??[]).map(r=>({...r,deadlineMet:deadline==null||r.arrivalSeconds<=deadline}));
  const alternative=alternatives.find(r=>r.deadlineMet)??alternatives[0];
  if(!alternative)return {...base,affected,status:'no-route',message:'Your selected route crosses the simulated closure. No supported alternative was found within your remaining walking allowance and timetable coverage. Do not follow the affected segment in this rehearsal; seek station assistance or choose a later departure. This does not establish a real-world service failure.'};
  if(demoRouteAffected(alternative,effect.rules,network))return {...base,affected,status:'no-route',message:'The alternative could not be verified against the closure boundaries. No replacement directions are offered; check with station staff.'};
  return {...base,affected,status:alternative.deadlineMet?'alternative':'late',directions:alternative,message:alternative.deadlineMet?'Demo alternative from your confirmed point. The destination and remaining walking allowance are preserved. Review these simulated directions; your accepted trip has not changed.':'This demo alternative misses your original arrival deadline. It is not presented as an on-time route. Your accepted trip has not changed.'};
}
export function mountDemoReplay({host,getContext,getNetwork,getBuild,search,name,onReturn,loadIncidents=()=>[]}) {
  let epoch=0,lastIncident=null;
  function show(result,{focus=true}={}){
    const label=result.input?`${publicStationLabel(name(result.input.originId))} → ${publicStationLabel(name(result.input.destinationId))}`:'Your journey';
    host.hidden=false;host.innerHTML=`<section class="demo-replay-result" aria-labelledby="replay-result-title"><div class="service-panel-heading"><h2 id="replay-result-title" tabindex="-1">Demo replay · ${esc(label)}</h2><button type="button" class="quiet" id="close-replay">Close replay</button></div><p class="field-note"><strong>Simulated incident · not live travel advice</strong></p>${result.example?`<p class="notice"><strong>Example journey</strong> · ${esc(result.example)}</p>`:''}${result.incident?`<h3>${esc(result.incident.title)}</h3><p>${esc(result.incident.service)} · ${esc(result.incident.type)} · ${esc(result.incident.scope==='segment'?`${name(result.incident.from)} → ${name(result.incident.to)} (${result.incident.direction})`:'whole service')}<br>${esc(result.incident.startsAt)} – ${esc(result.incident.endsAt)}</p>`:''}<p id="replay-outcome" role="status" data-status="${esc(result.status)}">${esc(result.message)}</p>${result.effect?.status==='closure'?`<p class="field-note">${esc(result.effect.message)}</p>`:''}${result.directions?`<p><strong>${result.status==='advisory'?'Original timetable arrival (delay not included)':result.affected?'Demo estimated arrival':'Selected timetable arrival'}: ${clock(result.directions.arrivalSeconds)}</strong></p>${renderItineraryTimeline(result.directions,{name})}`:''}<button type="button" class="secondary" id="replay-services">Open Services</button></section>`;
    host.querySelector('#close-replay').onclick=()=>{epoch++;host.hidden=true;host.replaceChildren();};
    host.querySelector('#replay-services').onclick=()=>onReturn('facilities');
    if(focus){host.querySelector('h2').focus({preventScroll:true});host.scrollIntoView({block:'start'});}
  }
  async function run(incident){
    lastIncident=incident??null;const token=++epoch;
    onReturn('plan');
    host.hidden=false;host.innerHTML='<p role="status">Checking this demo incident against your selected journey…</p>';
    try{const current=await getContext(lastIncident);if(token!==epoch)return;onReturn(current?.active?'current':'plan');const result=await replayJourney({incident:lastIncident,context:current?.context,network:getNetwork(),search,build:getBuild()});if(token===epoch)show(result);}
    catch(error){if(token===epoch)show({incident:lastIncident,status:'unavailable',message:error.name==='AbortError'?'Replay cancelled. Your selected journey is unchanged.':'Replay routing is unavailable. Your selected journey is unchanged; try again after the routing data loads.'});}
  }
  const event=e=>run(e.detail?.incident??(e.detail?.demo===true?e.detail:null));
  const changed=()=>{epoch++;if(!host.hidden)show({incident:lastIncident,status:'changed',message:'The journey or incident changed. Run the replay again from Services to check the latest selection.'},{focus:false});};
  window.addEventListener('demo:run-replay',event);
  window.addEventListener('demo:incidents-changed',changed);
  window.addEventListener('storage',event=>{if(event.key===null||event.key==='commute-copilot-demo-incidents-v1')changed();});
  window.addEventListener('focus',()=>{if(!lastIncident||host.hidden)return;try{const current=loadIncidents().find(incident=>incident.id===lastIncident.id);if(JSON.stringify(current)!==JSON.stringify(lastIncident))changed();}catch{changed();}});
  window.addEventListener('copilot:state-changed',e=>{if(!e.detail?.locationOnly)changed();});
  return {run,invalidate:changed};
}
// Kept separate from the legacy scene timer: never reset to an unrelated trip.
export function installLegacyReplayBridge({getInput=()=>null}={}) {
  window.addEventListener('demo:run-replay',event=>{
    try{sessionStorage.setItem(REPLAY_HANDOFF_KEY,JSON.stringify({incident:event.detail?.incident??null,input:getInput(),createdAt:Date.now()}));location.assign('/#replay');}
    catch{const note=document.getElementById('toast');if(note)note.textContent='Device storage is unavailable. Open the main app and select this incident from Services.';}
  });
}
