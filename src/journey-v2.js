// One accepted state for guidance, sharing, facilities, detours and completion.
export const JOURNEY_KEY='commute-copilot-journey-v2';
export const SCHEMA_VERSION=2;
const copy=value=>structuredClone(value);
const uid=()=>crypto.randomUUID();
const finite=n=>Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const terminal=s=>['completed','cancelled'].includes(s);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const optionalText=(v,max=2000)=>v==null||text(v,max);
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const instant=v=>finite(v)&&Number.isFinite(new Date(v).getTime());
const clock=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const civilDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const progressKinds=['unknown','checkpoint','not-departed','waiting','onboard','transferring','arrived'];
const geoStates=['not-requested','granted','denied','unavailable','stopped'];
function validPlace(p){
  if(!record(p)||!text(p.id,1000)||!optionalText(p.label)||!optionalText(p.stationId,1000))return false;
  if(p.lat!==undefined||p.lng!==undefined)if(!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lng)||Math.abs(p.lng)>180)return false;
  if(p.coordinates!==undefined&&(!Array.isArray(p.coordinates)||p.coordinates.length!==2||!Number.isFinite(p.coordinates[0])||Math.abs(p.coordinates[0])>90||!Number.isFinite(p.coordinates[1])||Math.abs(p.coordinates[1])>180))return false;
  return true;
}
function validSteps(steps,requireIds=true){return Array.isArray(steps)&&steps.length>0&&steps.length<=1000&&steps.every(s=>record(s)&&(!requireIds||text(s.id,1000))&&(s.id==null||text(s.id,1000))&&text(s.text,4000)&&finite(s.durationSeconds))&&(!requireIds||new Set(steps.map(s=>s.id)).size===steps.length);}
function validRoute(r){return record(r)&&text(r.id,2000)&&validSteps(r.steps)&&finite(r.arrivalSeconds)&&finite(r.departureSeconds)&&r.arrivalSeconds>=r.departureSeconds&&finite(r.walkingSeconds)&&['unknown','verified','fixture','unverified'].includes(r.accessibility??'unknown')&&optionalText(r.provenance,8000)&&['facilityPathSeconds','facilityPathWalkingSeconds'].every(k=>r[k]==null||finite(r[k]));}
function validPath(path){
  if(path==null)return true;
  if(!record(path)||path.feasible!==true||!Array.isArray(path.nodes)||!path.nodes.length||path.nodes.length>1000||path.nodes.some(n=>!text(n,1000))||!Array.isArray(path.edges)||path.edges.length!==path.nodes.length-1||!finite(path.seconds)||!finite(path.walkingSeconds)||path.walkingSeconds>path.seconds)return false;
  if(path.edges.some((e,i)=>!record(e)||!text(e.id,1000)||e.from!==path.nodes[i]||e.to!==path.nodes[i+1]||!finite(e.seconds)||e.seconds<=0||!finite(e.walkingSeconds)||e.walkingSeconds>e.seconds||!['passage','lift','stairs','escalator','gate','ramp'].includes(e.kind)||!optionalText(e.facilityId,1000)))return false;
  const same=(a,b)=>Math.abs(a-b)<1e-6;
  return same(path.edges.reduce((n,e)=>n+e.seconds,0),path.seconds)&&same(path.edges.reduce((n,e)=>n+e.walkingSeconds,0),path.walkingSeconds)&&(path.facilityIds==null||Array.isArray(path.facilityIds)&&path.facilityIds.every(id=>text(id,1000)))&&(path.gateCrossings==null||counter(path.gateCrossings));
}
function validDetourPreview(d){
  if(!record(d)||!text(d.toiletId,1000)||!finite(d.addedSeconds)||!finite(d.walkingSeconds)||!finite(d.breakMinutes)||d.breakMinutes>120||!validSteps(d.steps,false)||!validPath(d.outbound)||!validPath(d.returnPath)||!optionalText(d.stationId,1000)||!optionalText(d.onward,1000))return false;
  if(d.fixture!==undefined&&typeof d.fixture!=='boolean'||d.verified!==undefined&&typeof d.verified!=='boolean')return false;
  if(d.returnPath&&(!d.outbound||d.returnPath.nodes[0]!==d.outbound.nodes.at(-1)||d.onward!==d.returnPath.nodes.at(-1)))return false;
  if(d.outbound&&d.returnPath&&Math.abs(d.walkingSeconds-d.outbound.walkingSeconds-d.returnPath.walkingSeconds)>1e-6)return false;
  if(d.fixture!==true&&d.verified===true&&(!d.outbound||!d.returnPath))return false;
  if(d.stepIndex!=null&&(!counter(d.stepIndex)||d.stepIndex>=d.steps.length)||d.returnStepIndex!=null&&(!counter(d.returnStepIndex)||!d.returnPath||d.returnStepIndex>d.returnPath.edges.length))return false;
  return true;
}
function validStops(stops,mode){return Array.isArray(stops)&&stops.length<=100&&stops.every(s=>record(s)&&s.type==='toilet'&&text(s.facilityId??s.toiletId,1000)&&(s.id==null||text(s.id,1000))&&(s.status==null||['accepted','reached','returning','resumed','cancelled','planned'].includes(s.status))&&(s.preview==null||validDetourPreview(s.preview)&&!(s.preview.fixture&&mode!=='replay')));}
function validCheckpoint(cp){return cp==null||record(cp)&&optionalText(cp.nodeId,1000)&&optionalText(cp.stationId,1000)&&optionalText(cp.label,4000)&&(cp.floor==null||typeof cp.floor==='string'&&cp.floor.length>0&&cp.floor.length<=80||Number.isFinite(cp.floor));}
export function makePlan({origin,destination,date,departureTime,deadline=null,preferences={},route,mode='real',stops=[]},now=Date.now()) {
  if(!origin?.id||!destination?.id||!route?.steps?.length||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}/.test(departureTime))throw Error('Choose supported endpoints, a date, time and a calculated route.');
  const plan={schemaVersion:2,id:uid(),origin:copy(origin),destination:copy(destination),departureDate:date,departureTime,deadline,preferences:{stepFree:false,walkingLimitMinutes:30,...preferences},route:copy(route),mode,stops:copy(stops),createdAt:now,sourceTimes:route.sourceTimes??{},estimateProvenance:route.provenance??'See route source'};
  if(!validatePlan(plan))throw Error('Invalid trip plan.');return plan;
}
export function validatePlan(plan) {
  if(!record(plan)||plan.schemaVersion!==2||!['real','replay'].includes(plan.mode)||!text(plan.id,1000)||!validPlace(plan.origin)||!validPlace(plan.destination)||!validStops(plan.stops,plan.mode)||!record(plan.preferences)||!finite(plan.preferences.walkingLimitMinutes)||plan.preferences.walkingLimitMinutes>240||typeof plan.preferences.stepFree!=='boolean'||!instant(plan.createdAt))return null;
  if(!validRoute(plan.route)||!civilDate(plan.departureDate)||!clock(plan.departureTime)||plan.deadline!=null&&plan.deadline!==''&&!clock(plan.deadline))return null;
  return plan;
}
export function startJourney(plan,now=Date.now()) {
  if(!validatePlan(plan)||!instant(now))throw Error('Review a valid trip before starting.');
  if(plan.preferences.stepFree&&plan.route.accessibility!=='verified'&&plan.mode!=='replay')throw Error('This route has no verified continuous step-free path. Contact station staff; unverified connections cannot be accepted as accessible guidance.');
  return {schemaVersion:2,id:uid(),plan:copy(plan),route:copy(plan.route),status:'started',startedAt:now,updatedAt:now,revision:0,routeRevisions:[],progress:{stepIndex:0,kind:'unknown',checkpoint:null,confirmedAt:null},stops:copy(plan.stops),detour:null,proposal:null,permissions:{progress:false,location:false,geolocation:'not-requested',paused:false,revoked:false},location:null,sharing:null,completedAt:null};
}
export function validateActive(value) {
  if(!record(value)||value.schemaVersion!==2||!validatePlan(value.plan)||!text(value.id,1000)||!['started','paused','completed','cancelled'].includes(value.status)||!counter(value.revision)||!instant(value.startedAt)||!instant(value.updatedAt)||!validRoute(value.route)||!record(value.progress)||!counter(value.progress.stepIndex)||value.progress.stepIndex>=value.route.steps.length||!progressKinds.includes(value.progress.kind)||!validCheckpoint(value.progress.checkpoint)||value.progress.confirmedAt!=null&&!instant(value.progress.confirmedAt)||!validStops(value.stops,value.plan.mode)||!Array.isArray(value.routeRevisions)||value.routeRevisions.length>1000||!record(value.permissions))return null;
  const p=value.permissions;
  if(['progress','location','paused','revoked'].some(k=>typeof p[k]!=='boolean')||!geoStates.includes(p.geolocation)||p.revoked&&(p.progress||p.location))return null;
  if(value.status==='paused'&&!instant(value.pausedAt)||value.pausedAt!=null&&!instant(value.pausedAt)||terminal(value.status)&&(!instant(value.completedAt)||p.progress||p.location||value.location!=null)||!terminal(value.status)&&value.completedAt!=null)return null;
  if(value.routeRevisions.some(r=>!record(r)||!counter(r.revision)||r.revision>value.revision||!instant(r.acceptedAt)||!text(r.reason,4000)||r.previousRoute!=null&&!validRoute(r.previousRoute)))return null;
  if(value.proposal!=null&&(!record(value.proposal)||!validRoute(value.proposal.route)||!text(value.proposal.reason,4000)||!instant(value.proposal.createdAt)||!counter(value.proposal.basedOnRevision)||value.proposal.basedOnRevision>value.revision))return null;
  if(value.location!=null){const l=value.location;if(!record(l)||l.kind!=='approximate'||!Number.isFinite(l.latitude)||Math.abs(l.latitude)>90||!Number.isFinite(l.longitude)||Math.abs(l.longitude)>180||!finite(l.accuracy)||!instant(l.timestamp))return null;}
  if(['facilityBlocked','facilityReview'].some(k=>value[k]!=null&&typeof value[k]!=='boolean'))return null;
  if(value.detour!=null){const d=value.detour;if(!validDetourPreview(d)||!text(d.id,1000)||!['accepted','reached','returning','resumed','cancelled'].includes(d.status)||!instant(d.acceptedAt)||!finite(d.baseArrivalSeconds)||!finite(d.baseWalkingSeconds)||!counter(d.baseStepIndex)||!validPlace(d.originalDestination)||d.originalDestination.id!==value.plan.destination.id||d.fixture&&value.plan.mode!=='replay'||!d.fixture&&d.verified!==true||d.blocked!=null&&typeof d.blocked!=='boolean')return null;
    if(['reached','returning','resumed'].includes(d.status)&&!instant(d.reachedAt)||['returning','resumed'].includes(d.status)&&!instant(d.resumedAt)||d.status==='returning'&&!d.returnPath||!value.stops.some(s=>s.id===d.id&&s.facilityId===d.toiletId&&s.status===d.status))return null;
  }
  return value;
}
function mutate(state,now=Date.now()){if(!validateActive(state)||!instant(now)||state.revision===Number.MAX_SAFE_INTEGER)throw Error('No valid active journey.');if(terminal(state.status))throw Error('This journey has ended.');return {...copy(state),revision:state.revision+1,updatedAt:now};}
export function transition(state,action,now=Date.now()) {
  if(terminal(state?.status)&&((action==='finish'&&state.status==='completed')||(action==='cancel'&&state.status==='cancelled'))){if(!validateActive(state))throw Error('No valid active journey.');return state;}
  const next=mutate(state,now);
  if(action==='pause'){if(next.status!=='started')throw Error('Journey is already paused.');next.status='paused';next.pausedAt=now;}
  else if(action==='resume'){if(next.status!=='paused')throw Error('Journey is not paused.');if(now<next.pausedAt)throw Error('Resume time is before the saved pause; confirm the device clock.');next.status='started';next.route.arrivalSeconds+=Math.ceil((now-next.pausedAt)/1000);next.route.provenance+='; pause-adjusted estimate, connections require recheck';next.pausedAt=null;}
  else if(action==='finish'){if(next.detour&&next.detour.status!=='cancelled'&&next.detour.status!=='resumed')throw Error('Resume or cancel the toilet stop before confirming final arrival.');next.status='completed';next.completedAt=now;next.permissions={...next.permissions,progress:false,location:false,paused:true};next.location=null;}
  else if(action==='cancel'){next.status='cancelled';next.completedAt=now;next.permissions={...next.permissions,progress:false,location:false,paused:true};next.location=null;}
  else throw Error('Unknown journey action.');return next;
}
export function confirmCheckpoint(state,{stepIndex=state.progress.stepIndex,nodeId=null,stationId=null,floor=null,label=null,kind='checkpoint'},now=Date.now()) {
  const next=mutate(state,now);if(!Number.isInteger(stepIndex)||stepIndex<0||stepIndex>=next.route.steps.length||!progressKinds.includes(kind)||!validCheckpoint({nodeId,stationId,floor,label}))throw Error('Choose a valid current step.');
  next.progress={stepIndex,kind,checkpoint:{nodeId,stationId,floor,label:label??next.route.steps[stepIndex].text},confirmedAt:now};
  const d=next.detour;
  if(d&&stationId===d.stationId&&nodeId){
    if(d.status==='accepted'&&d.outbound){const at=d.outbound.nodes.indexOf(nodeId);if(at>=0)d.stepIndex=Math.min(at,d.steps.length-1);}
    if(d.status==='returning'&&d.returnPath){const at=d.returnPath.nodes.indexOf(nodeId);if(at>=0)d.returnStepIndex=at;}
    if(d.status==='returning'&&nodeId===d.onward){d.status='resumed';next.stops.find(s=>s.id===d.id).status='resumed';}
  }return next;
}
export function setPermissions(state,changes,now=Date.now()) {
  const next=mutate(state,now);if(!record(changes)||Object.keys(changes).some(k=>!['progress','location','paused','revoked','geolocation'].includes(k))||changes.geolocation!==undefined&&!geoStates.includes(changes.geolocation))throw Error('Invalid consent');for(const k of ['progress','location','paused','revoked'])if(changes[k]!==undefined&&typeof changes[k]!=='boolean')throw Error('Invalid consent');
  next.permissions={...next.permissions,...changes};if(next.permissions.revoked){next.permissions.progress=false;next.permissions.location=false;}
  if(!next.permissions.location||next.permissions.paused||next.permissions.revoked)next.location=null;return next;
}
export function setApproximateLocation(state,position,now=Date.now()) {
  const next=mutate(state,now);const {latitude,longitude,accuracy,timestamp}=position;
  if(![latitude,longitude,accuracy,timestamp].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||timestamp>now+30000||now-timestamp>120000)throw Error('Location is missing or stale; use a manual checkpoint.');
  next.location={latitude,longitude,accuracy,timestamp,kind:'approximate'};next.permissions.geolocation='granted';return next;
}
export function proposeRoute(state,route,reason,now=Date.now()) {
  const next=mutate(state,now);if(!validRoute(route)||!text(reason,4000))throw Error('No feasible alternative');next.proposal={route:copy(route),reason,createdAt:now,basedOnRevision:state.revision};return next;
}
export function acceptRoute(state,now=Date.now()) {
  if(!state.proposal)throw Error('No alternative to accept');const next=mutate(state,now);
  if(next.detour&&!['cancelled','resumed'].includes(next.detour.status))throw Error('Cancel or complete the intermediate stop, then recheck it against the proposed route.');
  if(next.plan.preferences.stepFree&&next.proposal.route.accessibility!=='verified'&&next.plan.mode!=='replay')throw Error('Alternative step-free connections are unverified.');
  next.routeRevisions.push({revision:next.revision,acceptedAt:now,previousRoute:copy(next.route),reason:next.proposal.reason});next.route=copy(next.proposal.route);next.plan.route=copy(next.route);next.progress.stepIndex=0;next.proposal=null;next.facilityReview=false;next.facilityBlocked=false;return next;
}
export function acceptDetour(state,preview,now=Date.now()) {
  const next=mutate(state,now);if(!validDetourPreview(preview))throw Error('A traversable prepared detour is required.');
  if(next.facilityBlocked)throw Error('No supported onward route remains. Ask station staff before adding this stop.');
  if(next.facilityReview)throw Error('Review and accept the revised main route before adding this stop.');
  if(preview.fixture&&next.plan.mode!=='replay')throw Error('Fixture toilet directions are available only in the labelled rehearsal.');
  if(!preview.fixture&&preview.verified!==true)throw Error('This toilet entrance path is not verified. Ask station staff.');
  if((preview.walkingSeconds+(next.route.walkingSeconds??0))>next.plan.preferences.walkingLimitMinutes*60)throw Error('The detour exceeds your walking allowance.');
  if(next.detour&&!['resumed','cancelled'].includes(next.detour.status))throw Error('Cancel the current stop before replacing it.');
  next.detour={...copy(preview),id:uid(),status:'accepted',acceptedAt:now,baseArrivalSeconds:next.route.arrivalSeconds,baseWalkingSeconds:next.route.walkingSeconds,baseStepIndex:next.progress.stepIndex,originalDestination:copy(next.plan.destination)};
  next.route.walkingSeconds+=preview.walkingSeconds;
  next.stops.push({id:next.detour.id,type:'toilet',facilityId:preview.toiletId,status:'accepted'});next.route.arrivalSeconds+=preview.addedSeconds;
  if(preview.fareImpact?.status!=='unchanged-integrated-route')next.route.fareEstimate={status:'unavailable',reason:preview.fareImpact?.message??preview.fareImpact??'Recheck integrated fare and any gate re-entry; no free re-entry assumed.'};
  next.routeRevisions.push({revision:next.revision,acceptedAt:now,reason:'Intermediate stop accepted',facilityId:preview.toiletId});return next;
}
export function stopAction(state,action,now=Date.now()) {
  const next=mutate(state,now);const d=next.detour;if(!d||['resumed','cancelled'].includes(d.status))throw Error('No current toilet stop.');
  if(d.blocked&&action!=='cancel')throw Error('This stop path is blocked. Review a replacement or ask station staff.');
  if(action==='reached'){if(d.status!=='accepted')throw Error('Already reached this stop.');d.status='reached';d.reachedAt=now;next.progress={...next.progress,kind:'checkpoint',checkpoint:{nodeId:d.outbound?.nodes.at(-1)??null,stationId:d.stationId,label:d.name??d.toiletId,floor:null},confirmedAt:now};}
  else if(action==='resume'){if(d.status!=='reached')throw Error('Confirm reaching the toilet first.');d.status=d.returnPath?'returning':'resumed';d.resumedAt=now;next.route.arrivalSeconds+=Math.max(0,Math.ceil((now-d.reachedAt)/1000)-d.breakMinutes*60);}
  else if(action==='cancel'){if(d.status==='accepted'){next.route.arrivalSeconds=d.baseArrivalSeconds;next.route.walkingSeconds=d.baseWalkingSeconds;}else next.route.provenance+='; cancelled after reaching stop, onward ETA requires recheck';d.status='cancelled';}
  else throw Error('Unknown stop action');next.stops.find(s=>s.id===d.id).status=d.status;return next;
}
export function journeyCard(state,{online=true,visible=true,now=Date.now()}={}) {
  if(!state)return null;const step=state.route.steps[state.progress.stepIndex],next=state.route.steps[state.progress.stepIndex+1];const d=state.detour;
  let current=step?.text??'Confirm your current step',upcoming=next?.text??`Arrive at ${state.plan.destination.label}`;
  if(d?.status==='accepted'){const index=d.stepIndex??0;current=d.steps[index]?.text??`Go to ${d.toiletId}`;upcoming=d.steps[index+1]?.text??'Confirm Reached toilet';if(d.outbound&&index>=d.outbound.edges.length){current='Confirm Reached toilet when you are at its entrance';upcoming='Resume the journey when you are ready';}}
  if(d?.status==='reached'){current='Toilet stop · resume when ready';upcoming=`Continue to ${state.plan.destination.label}`;}
  if(d?.status==='returning'){const returning=d.steps.filter(s=>s.id?.startsWith('toilet-return-')),index=d.returnStepIndex??0;current=returning[index]?.text??'Return to your confirmed onward checkpoint';upcoming=returning[index+1]?.text??'Confirm the onward platform or exit before continuing';}
  if(d?.blocked){current='Stop path unavailable · review an alternative';upcoming='Ask station staff if no supported path remains';}
  if(state.facilityBlocked){current='Station path unavailable · ask station staff';upcoming='Review supported connections before continuing';}
  else if(state.facilityReview){current='Facility change · review revised directions';upcoming='Accept a supported alternative before continuing';}
  if(state.status==='paused')current='Journey paused';if(terminal(state.status)){current=state.status==='completed'?'Arrival confirmed':'Journey cancelled';upcoming=state.status==='completed'?'Journey finished · no further travel steps':'Choose a new journey when ready';}
  const warnings=[];if(!online)warnings.push('Offline · saved guidance; no fresh reports or uploads');if(!visible)warnings.push('Location collection paused while hidden');if(!state.progress.confirmedAt)warnings.push('Position unknown · confirm a checkpoint');else if(now-state.progress.confirmedAt>300000)warnings.push('Last confirmed position is over 5 minutes old');if(state.location&&now-state.location.timestamp>120000)warnings.push('Approximate location stale');
  return {status:state.status,current,next:upcoming,arrivalSeconds:state.route.arrivalSeconds,warnings,revision:state.revision,estimated:true};
}
export function saveActive(storage,state){try{if(!validateActive(state))return false;const raw=JSON.stringify(state);storage.setItem(JOURNEY_KEY,raw);if(storage.getItem(JOURNEY_KEY)!==raw)throw Error();return true;}catch{return false;}}
export function restoreActive(storage){try{return validateActive(JSON.parse(storage.getItem(JOURNEY_KEY)));}catch{return null;}}
// Caller supplies the existing v1 validator. Original records remain untouched.
export function migrateActive(storage,validateV1,name=id=>id){
  const existing=restoreActive(storage);if(existing)return {state:existing,migrated:false};
  try{const old=validateV1(JSON.parse(storage.getItem('commute-copilot-active-journey-v1')));if(!old)return {state:null,migrated:false};
    const plan=routeFromLegacy(old.route,old.input,{name,mode:old.input.fixture?'replay':'real',source:'Migrated accepted timetable guidance; recheck conditions'}),state=startJourney(plan,old.acceptedAt);
    state.routingContext=copy(old);state.revision=old.revision;state.progress={stepIndex:Math.min(old.progress.legIndex,state.route.steps.length-1),kind:old.progress.kind,confirmedAt:old.progress.confirmedAt,checkpoint:{nodeId:null,stationId:null,floor:null,label:'Previously manually confirmed '+old.progress.kind}};
    // v1 arrived was an explicit user confirmation, but migrate as paused for a
    // deliberate completion/ledger decision, never retrospectively charge it.
    if(old.progress.kind==='arrived'){state.status='paused';state.pausedAt=Date.now();}
    const saved=saveActive(storage,state);return {state,migrated:true,saved};
  }catch{return {state:null,migrated:false};}
}
export function routeFromLegacy(route,input,{name=id=>id,mode='real',source='Imported timetable / planning allowances'}={}) {
  const replay=mode==='replay',date=input.date,originId=input.originId??input.origin,destinationId=input.destinationId??input.destination;
  const steps=route.legs.map((l,i)=>({id:`${route.id}:${i}`,type:l.type,text:l.text??`${l.type==='ride'?(l.mode==='bus'?'Bus '+l.serviceNo:l.routeId+' train'):l.type}: ${name(l.fromStopId)} → ${name(l.toStopId)}`,durationSeconds:replay?(l.minutes+(l.delay??0))*60:l.durationSeconds,facilityId:null,stationId:l.station??null,fromStopId:l.fromStopId,toStopId:l.toStopId,stopIds:l.stopIds??l.stops??[],source:l}));
  return makePlan({origin:{id:originId,label:name(originId)},destination:{id:destinationId,label:name(destinationId)},date,departureTime:input.departureTime??input.departure,deadline:input.deadlineTime??input.deadline,mode,preferences:{walkingLimitMinutes:Number(input.walkingLimitMinutes??input.walkingLimit??30),stepFree:false},route:{id:route.id,steps,departureSeconds:replay?route.legs[0].start*60:route.departureSeconds,arrivalSeconds:replay?route.arrival*60:route.arrivalSeconds,walkingSeconds:replay?route.totalWalking*60:route.walkingSeconds,accessibility:'unknown',provenance:source,legacyRoute:copy(route),legacyInput:copy(input)}});
}
