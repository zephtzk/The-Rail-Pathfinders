import {itineraryGuidance,itineraryDisplay,publicInstruction,publicStationLabel} from './itinerary-display.js';
import {stationFacts,indoorCoverageForStep} from './station-guidance-data.js';
import {stationLayout} from './facility-data.js';

const ended=status=>['completed','cancelled'].includes(status);
const activeDetour=d=>d&&!['cancelled','resumed'].includes(d.status);
const safeLabel=(value,fallback)=>typeof value==='string'&&value.trim()?publicStationLabel(value):fallback;
function detourLabel(value,detour){
  let text=publicInstruction(value??'Confirm your current station checkpoint');
  const layout=stationLayout(detour?.stationId);
  for(const item of [...(layout?.facilities??[])].sort((a,b)=>b.id.length-a.id.length))text=text.replaceAll(item.id,item.label);
  return text;
}
/** Pure presentation resolver. Never consumes previews, clocks, GPS or proposals
 * as progress; all indices remain those of the canonical accepted journey. */
export function resolveCurrentExecution(active,{prepared=null,name}={}){
  if(!active){const ready=!!prepared;return {phase:ready?'prepared':'none',current:ready?'Review your trip, then choose Start journey':'Choose a journey to start guidance',next:'',canonicalStepIndex:null,step:null,stationId:null,stationLabel:null,destination:ready?safeLabel(prepared.destination?.label,'your destination'):null,contextKey:JSON.stringify([ready?'prepared':'none',prepared?.id??null]),primaryAction:ready?'review':'plan',indoorNotice:null,accepted:false};}
  const index=active.progress?.stepIndex??0,steps=active.route?.steps??[],routeStep=steps[index],d=activeDetour(active.detour)?active.detour:null;
  const guidance=itineraryGuidance(active.route,{name,currentStepIndex:index});
  let current=guidance.current,next=guidance.next,step=routeStep,phase='route',primaryAction=routeStep?.type==='exit'&&index===steps.length-1?'finish':'checkpoint';
  if(d?.status==='accepted'){
    phase='detour-outbound';const at=d.stepIndex??0;step=d.steps[at];
    current=detourLabel(step?.text??'Follow your accepted toilet directions',d);next=detourLabel(d.steps[at+1]?.text??'Confirm Reached toilet',d);primaryAction='station-checkpoint';
    if(d.outbound&&at>=d.outbound.edges.length){current='Confirm Reached toilet when you are at its entrance';next='Resume the journey when you are ready';primaryAction='reached-toilet';}
  }else if(d?.status==='reached'){phase='detour-reached';step=null;current='Toilet stop · resume when ready';next=`Continue to ${safeLabel(active.plan.destination.label,'your destination')}`;primaryAction='resume-detour';}
  else if(d?.status==='returning'){
    phase='detour-return';const returning=d.steps.filter(s=>s.id?.startsWith('toilet-return-')),at=d.returnStepIndex??0;step=returning[at];current=detourLabel(step?.text??'Return to your confirmed onward checkpoint',d);next=detourLabel(returning[at+1]?.text??'Confirm the onward platform or exit before continuing',d);primaryAction='station-checkpoint';
  }
  if(d?.blocked){phase='detour-blocked';current='Stop path unavailable · review an alternative';next='Ask station staff if no supported path remains';primaryAction='station-help';}
  if(active.facilityBlocked){phase='blocked';current='Station path unavailable · ask station staff';next='Review supported connections before continuing';primaryAction='station-help';}
  else if(active.facilityReview){phase='review';current='Facility change · review revised directions';next='Accept a supported alternative before continuing';primaryAction='review-route';}
  if(active.status==='paused'){phase='paused';current='Journey paused';next='Resume when ready; check any changed connections before continuing';primaryAction='resume';}
  if(ended(active.status)){phase=active.status;current=active.status==='completed'?'Arrival confirmed':'Journey cancelled';next=active.status==='completed'?'Journey finished · no further travel steps':'Choose a new journey when ready';primaryAction='plan';}
  const source=routeStep?.source??routeStep??{},stationId=d?.stationId??routeStep?.stationId??source.station??(routeStep?.type==='access'?(routeStep.toStopId??source.toStopId):(routeStep?.fromStopId??source.fromStopId))??null;
  const facts=stationFacts(stationId),resolved=name&&stationId?name(stationId):null;
  const stationLabel=facts?.name??(resolved&&resolved!==stationId?safeLabel(resolved,null):stationId&&/^(?:CC|CE|EW|CG|NS|NE|DT|TE|BP|SE|SW|PE|PW)\d+/i.test(stationId)?publicStationLabel(stationId):null)??source.fromLabel??null;
  const destinationPlace=active.plan?.destination,publicDestinationId=destinationPlace?.routingId??destinationPlace?.stationId??destinationPlace?.id,resolvedDestination=name&&publicDestinationId?name(publicDestinationId):null;
  const destination=resolvedDestination&&resolvedDestination!==publicDestinationId?publicStationLabel(resolvedDestination):safeLabel(steps.at(-1)?.source?.toLabel??destinationPlace?.label,'your destination');
  const display=itineraryDisplay(active.route,{name}).find(group=>group.canonicalIndices.includes(index));
  // External walking/waiting around a rail boarding/alighting point includes an
  // unverified station transition. This flag is presentation only, never a path.
  const adjacentRail=active.route.provider==='onemap'&&['walk','wait'].includes(routeStep?.type)&&[steps[index-1],steps[index+1],routeStep?.type==='walk'&&steps[index+1]?.type==='wait'?steps[index+2]:null].some(s=>s?.source?.mode==='rail');
  const coverageStep=adjacentRail?{...routeStep,indoor:true}:routeStep;
  const indoorNotice=ended(active.status)?null:indoorCoverageForStep(d?step??routeStep:coverageStep,{fixture:d?.fixture===true,detour:!!d});
  const result={phase,current:publicInstruction(current),next:publicInstruction(next),canonicalStepIndex:index,step:step??null,stationId,stationLabel,destination,rideDestination:phase==='route'&&routeStep?.type==='ride'?display?.to??null:null,primaryAction,indoorNotice,accepted:!ended(active.status),fixture:active.plan.mode==='replay',detourStatus:d?.status??null};
  // Ignore location/permission revisions; reset alternate staff text whenever the
  // accepted route, executed phase, destination or instruction actually changes.
  result.contextKey=JSON.stringify([active.id,active.route.id,active.routeRevisions?.length??0,index,d?.id??null,d?.stepIndex??null,d?.returnStepIndex??null,phase,result.current,destination]);
  return result;
}
