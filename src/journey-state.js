// Confirmed progress and deterministic routing effects. Provider effects remain
// disabled until a real contract/sample establishes every required mapping.
export const POLICY = {minimumGainSeconds:300,cooldownMs:300000,maxAgeMs:90000};
const clone = value => structuredClone(value);
const seconds = value => Number.isFinite(value) && value >= 0;
const sumWalk = legs => legs.reduce((n,l)=>n+(l.walkingSeconds??0),0);
export const clockTime = s => `${String(Math.floor(s/3600)%24).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(Math.floor(s)%60).padStart(2,'0')}`;
export const pathKey = route => route.legs.filter(l=>l.type==='ride'||l.type==='transfer').map(l=>[l.type,l.patternId??l.routeId??'',l.directionId??'',l.fromStopId,l.toStopId,l.fromSequence??'',l.toSequence??'',l.pathId??''].join('/')).join('|');
export function acceptJourney(route,input,build,now=Date.now()) {
  return {schemaVersion:1,build,input:clone(input),route:clone(route),acceptedAt:now,carriedWalkSeconds:0,carriedContext:{hasBoarded:false,externalSinceRide:false},revision:0,decisions:[],events:[],progress:{kind:'not-departed',legIndex:0,confirmedSeconds:route.departureSeconds,walkedSeconds:0,confirmedAt:now},proposal:null};
}
export function validateJourney(value) {
  // Persistence is fail-closed; malformed storage must never become guidance.
  if (!value || value.schemaVersion!==1 || typeof value.build!=='string' || !value.input || !value.route || !Array.isArray(value.route.legs) || !value.route.legs.length || !Array.isArray(value.events) || !Array.isArray(value.decisions) || !Number.isInteger(value.revision) || !seconds(value.carriedWalkSeconds)) return null;
  if (!seconds(Number(value.input.walkingLimitMinutes)) || !value.carriedContext || typeof value.carriedContext.hasBoarded!=='boolean' || typeof value.carriedContext.externalSinceRide!=='boolean' || value.events.some(e=>!e||typeof e.id!=='string'||!Number.isInteger(e.revision)) || value.decisions.some(d=>!d||typeof d.key!=='string'||!seconds(d.at))) return null;
  if (value.route.deadlineSeconds!==null&&!seconds(value.route.deadlineSeconds)) return null;
  if (!seconds(value.progress?.confirmedAt)||!Number.isFinite(new Date(value.progress.confirmedAt).getTime())||!Number.isFinite(new Date(value.acceptedAt).getTime())) return null;
  if (!seconds(value.route.arrivalSeconds) || !seconds(value.acceptedAt) || value.route.legs.length>1000 || value.events.length>100 || value.decisions.length>100) return null;
  if (value.route.legs.some(l=>!l||!['access','wait','ride','transfer','exit'].includes(l.type)||typeof l.fromStopId!=='string'||typeof l.toStopId!=='string'||!seconds(l.durationSeconds)||!seconds(l.startSeconds)||!seconds(l.endSeconds)||l.endSeconds-l.startSeconds!==l.durationSeconds)) return null;
  try { confirmProgress({...value,progress:null},value.progress,value.progress.confirmedAt); return {...value,proposal:null}; } catch {return null;}
}
export function confirmProgress(state, change, now=Date.now()) {
  if(!seconds(now)||!Number.isFinite(new Date(now).getTime()))throw Error('Invalid confirmation time');
  const p={...change,confirmedAt:now}; const legs=state.route.legs;
  if (!['not-departed','waiting','onboard','transferring','arrived','unknown'].includes(p.kind) || !seconds(p.confirmedSeconds) || p.confirmedSeconds>=172800 || !seconds(p.walkedSeconds) || p.walkedSeconds>Number(state.input.walkingLimitMinutes)*60 || !Number.isInteger(p.legIndex) || p.legIndex<0 || p.legIndex>legs.length) throw Error('Confirm a valid journey step, time and walking used within the original allowance.');
  if (state.progress && (p.confirmedSeconds<state.progress.confirmedSeconds || p.walkedSeconds<state.progress.walkedSeconds || p.legIndex<state.progress.legIndex)) throw Error('Progress cannot move backwards. Start a new accepted journey to correct earlier travel.');
  if (p.kind==='not-departed' && (p.legIndex!==0 || state.carriedWalkSeconds>0)) throw Error('This journey has already started.');
  if (p.kind==='arrived' && p.legIndex!==legs.length) throw Error('Confirm completion of the final step.');
  const leg=legs[p.legIndex];
  if (p.kind==='onboard' && leg?.type!=='ride') throw Error('Choose the planned bus or train ride you are onboard.');
  if (p.kind==='waiting' && !['wait','ride'].includes(leg?.type)) throw Error('Confirm the exact boarding platform or stop before waiting.');
  if (p.kind==='transferring' && !['transfer','exit'].includes(leg?.type)) throw Error('Confirm the start of a planned transfer or final exit.');
  const minimum=state.carriedWalkSeconds+sumWalk(legs.slice(0,p.legIndex));
  if (p.walkedSeconds<minimum) throw Error(`Completed steps account for at least ${minimum} seconds walking. Include this in walking used.`);
  p.stopId=leg?.fromStopId??legs.at(-1).toStopId;
  return {...state,revision:state.revision+1,progress:p,proposal:null};
}
export function confirmedQuery(state,network) {
  const p=state.progress, input=state.input;
  if (p.kind==='unknown') return {reason:'Confirm your planned onboard leg or the exact stop/platform and current time. Saved instructions remain available.'};
  if (p.kind==='onboard') return {reason:'Remain with the accepted onboard leg. Confirm alighting at its planned end before a new route is calculated; no exit between stops is inferred.'};
  if (p.kind==='arrived') return {reason:'Arrival confirmed. No rerouting is needed.'};
  if (p.confirmedSeconds>=86400) return {reason:'Next-day progress requires a new dated search; saved instructions are retained.'};
  const remaining=Number(input.walkingLimitMinutes)*60-p.walkedSeconds;
  const query={...input,departureTime:clockTime(p.confirmedSeconds),walkingLimitMinutes:remaining/60};
  if (p.kind!=='not-departed') {
    const stop=network.stops.find(s=>s.id===p.stopId);
    if (!stop) return {reason:'Confirmed platform is unavailable in this data version. Keep saved guidance and confirm a supported point.'};
    const completed=state.route.legs.slice(0,p.legIndex), lastRide=completed.findLastIndex(l=>l.type==='ride');
    query.originId=stop.stationId;
    query.progressSeed={stopId:p.stopId,canBoard:p.kind==='waiting',hasBoarded:lastRide>=0||state.carriedContext.hasBoarded,externalSinceRide:(lastRide<0&&state.carriedContext.externalSinceRide)||completed.slice(lastRide+1).some(l=>l.pathId)};
  }
  // The engine normally rejects a past deadline. Search without that filter and
  // compare every returned arrival to the original deadline explicitly below.
  if (state.route.deadlineSeconds!==null && state.route.deadlineSeconds<p.confirmedSeconds) {query.deadlineTime='';query.deadlineDate='';}
  return {query};
}
export function validateEvent(event,network,build,now=Date.now(),online=true) {
  const advisory=reason=>({applicable:false,reason,event});
  if (!event || !online) return advisory('Offline: incident is last-known, not current.');
  if (event.evidence!=='synthetic') return advisory('Real-provider routing effects disabled: complete mapping and meaning have not been validated.');
  if (!event.id || !Number.isInteger(event.revision) || event.revision<1 || event.build!==build || !['cancelled','segment-unavailable','recovered'].includes(event.effect)) return advisory('Unmapped event or schedule version.');
  const stamps=['sourceTime','retrievedAt','validFrom','validUntil'].map(k=>Date.parse(event[k]));
  if (stamps.some(s=>!Number.isFinite(s)) || stamps[0]>stamps[1]+5000 || stamps[1]>now+5000 || now-stamps[1]>POLICY.maxAgeMs || now<stamps[2] || now>=stamps[3]) return advisory('Stale, expired or not yet effective; service state is unknown, not restored.');
  const trip=network.trips.find(t=>t.id===event.tripId);
  if (!trip || trip.routeId!==event.routeId || String(trip.directionId)!==String(event.directionId)) return advisory('Trip, route or direction does not match.');
  const service=network.services.find(s=>s.id===trip.serviceId),date=event.serviceDate;
  if (!/^\d{4}-\d\d-\d\d$/.test(date??'') || date<network.coverage.startDate || date>network.coverage.endDate || !(Object.hasOwn(service.exceptions??{},date)?service.exceptions[date]:date>=service.startDate&&date<=service.endDate&&service.weekdays.includes(new Date(date+'T00:00:00Z').getUTCDay()))) return advisory('Service date is not active in the imported schedule.');
  if (!seconds(event.impactStartSeconds) || !seconds(event.impactEndSeconds) || event.impactEndSeconds<=event.impactStartSeconds || !trip.stopTimes.some(s=>s[1]>=event.impactStartSeconds&&s[1]<=event.impactEndSeconds)) return advisory('Effective service-time interval does not overlap the trip.');
  if (event.effect==='segment-unavailable' && !trip.stopTimes.some((s,i)=>s[0]===event.fromStopId&&trip.stopTimes[i+1]?.[0]===event.toStopId&&s[2]<=event.impactEndSeconds&&trip.stopTimes[i+1][1]>=event.impactStartSeconds)) return advisory('Segment is not consecutive on the specified trip.');
  return {applicable:true,event,reason:event.effect==='recovered'?'Explicit scoped recovery; other services remain unknown.':'Validated synthetic trip scope; not real live evidence.'};
}
export function ingestEvents(state,incoming,network,now=Date.now(),online=true) {
  const events=clone(state.events);
  for (const event of incoming.slice(0,100)) {
    const check=validateEvent(event,network,state.build,now,online);if(!check.applicable)continue;
    const i=events.findIndex(e=>e.id===event.id), old=events[i];
    if (old && (event.revision<old.revision || Date.parse(event.sourceTime)<Date.parse(old.sourceTime))) continue;
    if (old && ['tripId','serviceDate','directionId','routeId','fromStopId','toStopId','impactStartSeconds','impactEndSeconds'].some(k=>old[k]!==event[k])) {events[i]={...old,conflict:true};continue;}
    if (old && event.revision===old.revision) {
      // A conflicting revision cannot choose its own winner or issue all-clear.
      if (JSON.stringify(old)!==JSON.stringify(event)) events[i]={...old,conflict:true};
      continue;
    }
    if (i<0)events.push(clone(event));else events[i]=clone(event);
  }
  return {...state,events:events.slice(-100),proposal:null};
}
function affects(event,leg) {
  return leg.type==='ride' && event.tripId===leg.tripId && event.serviceDate===leg.serviceDate && String(event.directionId)===String(leg.directionId) && (event.effect!=='segment-unavailable' || leg.stopIds?.some((s,i)=>s===event.fromStopId&&leg.stopIds[i+1]===event.toStopId));
}
export function compareJourney(state,router,now=Date.now(),online=true) {
  const point=confirmedQuery(state,router.network);
  if (!point.query) return {status:'confirmation',message:point.reason};
  const remaining=state.route.legs.slice(state.progress.legIndex);
  const checked=state.events.map(e=>e.conflict?{applicable:false,event:e,reason:'Conflicting updates: service state unknown.'}:validateEvent(e,router.network,state.build,now,online));
  const active=checked.filter(c=>c.applicable&&c.event.effect!=='recovered').map(c=>c.event);
  const relevant=active.filter(e=>remaining.some(l=>affects(e,l)));
  const exclusions=active.map(e=>({tripId:e.tripId,serviceDate:e.serviceDate,...(e.effect==='segment-unavailable'?{impactStartSeconds:e.impactStartSeconds,impactEndSeconds:e.impactEndSeconds,fromStopId:e.fromStopId,toStopId:e.toStopId}:{})}));
  let time=state.progress.confirmedSeconds,walking=0,waiting=0,missed=false;
  for (const l of remaining) {
    if (l.type==='wait') {waiting+=Math.max(0,l.endSeconds-time);time=Math.max(time,l.endSeconds);}
    else if (l.type==='ride') {waiting+=Math.max(0,l.startSeconds-time);time=Math.max(time,l.startSeconds);if(l.mode!=='bus'&&time>l.startSeconds)missed=true;time=l.mode==='bus'?time+l.durationSeconds:Math.max(time,l.endSeconds);}
    else {time+=l.durationSeconds;walking+=l.walkingSeconds??0;}
  }
  const deadline=state.route.deadlineSeconds;
  const continuing={arrivalSeconds:time,walkingSeconds:walking,waitSeconds:waiting,transfers:Math.max(0,remaining.filter(l=>l.type==='ride').length-1),estimated:state.route.estimated,feasible:!missed&&!relevant.length&&walking+state.progress.walkedSeconds<=Number(state.input.walkingLimitMinutes)*60,deadlineMet:deadline===null||time<=deadline,reason:relevant.length?'Scoped planned service unavailable':missed?'A planned scheduled connection has been missed':state.route.estimated?'Uncalibrated bus timing; rail connection is uncertain':'Scheduled continuation'};
  const result=router.route({...point.query,excludedConnections:exclusions});
  const alternatives=result.routes.map(r=>({...r,deadlineSeconds:deadline,deadlineMet:deadline===null||r.arrivalSeconds<=deadline,deadlineBufferSeconds:deadline===null?null:deadline-r.arrivalSeconds}));
  const alternative=alternatives.find(r=>r.deadlineMet)??alternatives[0];
  const base={continuing,alternative,checked,relevant,resultStatus:result.status,revision:state.revision,eventsKey:JSON.stringify(state.events),computedAt:now,expiresAt:Math.min(now+POLICY.maxAgeMs,...active.map(e=>Math.min(Date.parse(e.validUntil),Date.parse(e.retrievedAt)+POLICY.maxAgeMs)))};
  if (!alternative) return {...base,status:'no-feasible',message:result.errors.map(e=>e.message).join(' ')||'No feasible route within the original walking allowance. Retain instructions and confirm your situation.'};
  if (!alternative.deadlineMet) return {...base,status:'all-late',message:'All feasible alternatives miss the original deadline. No option is represented as on time.'};
  const gain=continuing.arrivalSeconds-alternative.arrivalSeconds;
  const serious=[...new Set(relevant.map(e=>[e.effect,e.tripId,e.directionId,e.serviceDate,e.fromStopId??'',e.toStopId??'',e.impactStartSeconds,e.impactEndSeconds].join('/')))].sort().join('|');
  const key=`${serious}|${state.revision}|${pathKey(alternative)}`;
  if (state.decisions.some(d=>d.key===key)) return {...base,status:'suppressed',message:'You already accepted or declined this recommendation. Current guidance is retained.'};
  const last=state.decisions.at(-1),newSerious=serious&&!state.decisions.some(d=>d.serious===serious);
  if (last && now-last.at<POLICY.cooldownMs && !newSerious) return {...base,status:'suppressed',message:'Switching cooldown: retain accepted guidance for five minutes unless a newly validated serious event applies.'};
  if (continuing.feasible && (gain<POLICY.minimumGainSeconds || continuing.estimated || alternative.estimated)) return {...base,status:'continue',message:'Keep accepted guidance. A switch needs at least five minutes of supported scheduled benefit; uncalibrated bus savings cannot establish that benefit.'};
  return {...base,status:'offer',key,serious,message:missed?'A scheduled connection was missed. Review a feasible alternative.':'A material scoped change affects the remaining journey. Review before switching.'};
}
export function decide(state,comparison,decision,now=Date.now()) {
  if (comparison.status!=='offer'||comparison.revision!==state.revision||comparison.eventsKey!==JSON.stringify(state.events)||now-comparison.computedAt>POLICY.maxAgeMs||now>=comparison.expiresAt) throw Error('This comparison changed or expired. Reassess before accepting.');
  const decisions=[...state.decisions,{key:comparison.key,serious:comparison.serious,decision,at:now}].slice(-100);
  if (decision==='declined') return {...state,decisions,proposal:null};
  if (decision!=='accepted') throw Error('Unknown decision');
  const route=clone(comparison.alternative);
  const completed=state.route.legs.slice(0,state.progress.legIndex),lastRide=completed.findLastIndex(l=>l.type==='ride');
  const carriedContext={hasBoarded:lastRide>=0||state.carriedContext.hasBoarded,externalSinceRide:(lastRide<0&&state.carriedContext.externalSinceRide)||completed.slice(lastRide+1).some(l=>l.pathId)};
  const index=state.progress.kind==='not-departed'?0:Math.max(0,route.legs.findIndex(l=>l.durationSeconds>0));
  const kind=state.progress.kind==='not-departed'?'not-departed':['transfer','exit'].includes(route.legs[index].type)?'transferring':'waiting';
  return {...state,decisions,route,carriedContext,carriedWalkSeconds:state.progress.walkedSeconds,acceptedAt:now,revision:state.revision+1,progress:{...state.progress,legIndex:index,stopId:route.legs[index].fromStopId,kind},proposal:null};
}
