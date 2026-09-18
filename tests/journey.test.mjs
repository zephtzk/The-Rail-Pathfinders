import test from 'node:test';
import assert from 'node:assert/strict';
import {createRailRouter} from '../src/rail-engine.js';
import {acceptJourney,confirmProgress,confirmedQuery,validateEvent,ingestEvents,compareJourney,decide,validateJourney,POLICY} from '../src/journey-state.js';

const sec=t=>Number(t.slice(0,2))*3600+Number(t.slice(3))*60;
const membership={A:['a'],X:['xr','xb'],Y:['yb','yg'],D:['d']};
const stations=Object.entries(membership).map(([id,stopIds])=>({id,stopIds}));
const trip=(id,routeId,from,to,start,end)=>({id,routeId,directionId:0,serviceId:'daily',stopTimes:[[from,sec(start),sec(start)],[to,sec(end),sec(end)]]});
function fixture(){
 const network={schemaVersion:1,timeZone:'Asia/Singapore',stations,stops:stations.flatMap(s=>s.stopIds.map(id=>({id,stationId:s.id}))),routes:['red','blue','green','direct'].map(id=>({id})),services:[{id:'daily',startDate:'2026-09-18',endDate:'2026-09-18',weekdays:[5]}],coverage:{startDate:'2026-09-18',endDate:'2026-09-18'},assumptions:{accessSeconds:120,exitSeconds:120},
 trips:[trip('r','red','a','xr','08:05','08:15'),trip('b','blue','xb','yb','08:20','08:30'),trip('g','green','yg','d','08:35','08:45'),trip('d','direct','a','d','08:10','08:55')],
 transfers:[{fromStopId:'xr',toStopId:'xb',seconds:240,walkSeconds:180,provenance:'independent example'},{fromStopId:'yb',toStopId:'yg',seconds:180,walkSeconds:120,provenance:'independent example'}]};
 const input={originId:'A',destinationId:'D',date:'2026-09-18',departureTime:'08:00',deadlineTime:'09:00',deadlineDate:'2026-09-18',walkingLimitMinutes:9,preference:'fastest',maxExtraMinutes:15,mode:'mixed',fixture:'none'};
 const router={network,...createRailRouter(network)},route=router.route(input).recommended;
 return {network,input,router,state:acceptJourney(route,input,'test-build',NOW)};
}
const NOW=Date.parse('2026-09-18T00:00:00Z');
const event=(more={})=>({id:'incident',revision:1,evidence:'synthetic',build:'test-build',effect:'cancelled',tripId:'r',routeId:'red',directionId:0,serviceDate:'2026-09-18',impactStartSeconds:sec('08:05'),impactEndSeconds:sec('08:15'),sourceTime:new Date(NOW).toISOString(),retrievedAt:new Date(NOW).toISOString(),validFrom:new Date(NOW-1000).toISOString(),validUntil:new Date(NOW+90000).toISOString(),...more});
function progress(state,kind,index,time,walk){return confirmProgress(state,{kind,legIndex:index,confirmedSeconds:sec(time),walkedSeconds:walk},NOW);}

test('independent progress oracle: 300s completed walk + 240s remaining = 540, exact platform and no repeated access',()=>{
 const {state,router}=fixture(),i=state.route.legs.findIndex(l=>l.type==='wait'&&l.fromStopId==='xb');
 const s=progress(state,'waiting',i,'08:19',300),q=confirmedQuery(s,router.network).query;
 assert.equal(q.walkingLimitMinutes,4);assert.deepEqual(q.progressSeed,{stopId:'xb',canBoard:true,hasBoarded:true,externalSinceRide:false});
 const r=router.route(q).recommended;assert.equal(r.arrivalSeconds,sec('08:47'));assert.equal(r.walkingSeconds,240);assert.equal(r.accessSeconds,0);
 assert.notEqual(router.route({...q,walkingLimitMinutes:3}).status,'ok');
});
test('transferring charges 240s, not an instantaneous platform move; walking budget cannot reset',()=>{
 const {state,router}=fixture(),i=state.route.legs.findIndex(l=>l.type==='transfer');
 const s=progress(state,'transferring',i,'08:15',120),q=confirmedQuery(s,router.network).query,r=router.route(q).recommended;
 assert.equal(q.progressSeed.canBoard,false);assert.equal(r.transferSeconds,420);assert.equal(r.walkingSeconds,420);assert.equal(r.arrivalSeconds,sec('08:47'));
 assert.throws(()=>progress(state,'waiting',i+1,'08:19',0),/at least 300/);
});
test('missed scheduled connection never shifts a departed train; all late outcomes preserve original deadline',()=>{
 const {state,router}=fixture(),i=state.route.legs.findIndex(l=>l.type==='wait'&&l.fromStopId==='xb');
 const s=progress(state,'waiting',i,'08:21',300),c=compareJourney(s,router,NOW);
 assert.equal(c.continuing.feasible,false);assert.match(c.continuing.reason,/missed/);assert.equal(c.status,'no-feasible');
 const late={...state,input:{...state.input,deadlineTime:'08:50'},route:{...state.route,deadlineSeconds:sec('08:50')}};
 const changed=ingestEvents(late,[event()],router.network,NOW);const result=compareJourney(changed,router,NOW);
 assert.equal(result.status,'all-late');assert.equal(result.alternative.deadlineMet,false);assert.equal(result.alternative.arrivalSeconds,sec('08:57'));
});
test('onboard and unknown progress request confirmation without inferring elapsed travel',()=>{
 const {state,router}=fixture(),i=state.route.legs.findIndex(l=>l.type==='ride');
 for(const kind of ['onboard','unknown']){const s=progress(state,kind,i,'08:10',120);assert.equal(compareJourney(s,router,NOW+3600000).status,'confirmation');assert.equal(s.route,state.route);}
 const s=progress(state,'onboard',i,'08:10',120);assert.throws(()=>progress(s,'waiting',1,'08:09',120),/backwards/);
 assert.throws(()=>progress(state,'onboard',0,'08:00',0),/planned/);
});
test('confirmed final exit can finish without another train',()=>{
 const {state,router}=fixture();const s=progress(state,'transferring',state.route.legs.length-1,'08:45',420),q=confirmedQuery(s,router.network).query;
 assert.equal(router.route(q).recommended.arrivalSeconds,sec('08:47'));
 assert.equal(router.route(q).recommended.walkingSeconds,120);
});
test('wrong trip, direction, date, version, time or segment cannot alter routing; prose/live effects disabled',()=>{
 const {network}=fixture();assert.equal(validateEvent(event(),network,'test-build',NOW).applicable,true);
 for(const change of [{tripId:'other'},{directionId:1},{serviceDate:'2026-09-19'},{build:'other'},{evidence:'real-api'},{effect:'10 minute delay'},{impactStartSeconds:sec('09:00'),impactEndSeconds:sec('09:10')},{effect:'segment-unavailable',fromStopId:'xr',toStopId:'a'},{validUntil:new Date(NOW).toISOString()},{sourceTime:new Date(NOW+60000).toISOString()}])assert.equal(validateEvent(event(change),network,'test-build',NOW).applicable,false,JSON.stringify(change));
 assert.equal(validateEvent(event(),network,'test-build',NOW,false).applicable,false);
});
test('cancellation offers a feasible change, decline retained, duplicate suppressed, accept persists exact progress',()=>{
 const {state,router}=fixture();let s=ingestEvents(state,[event()],router.network,NOW),c=compareJourney(s,router,NOW);
 assert.equal(c.status,'offer');assert.equal(c.alternative.arrivalSeconds,sec('08:57'));
 const declined=decide(s,c,'declined',NOW);assert.equal(declined.route.id,state.route.id);assert.equal(compareJourney(declined,router,NOW).status,'suppressed');
 const accepted=decide(s,c,'accepted',NOW);assert.equal(accepted.route.id,c.alternative.id);assert.ok(validateJourney(JSON.parse(JSON.stringify(accepted))));
 assert.throws(()=>decide({...s,revision:1},c,'accepted',NOW),/changed/);
 assert.throws(()=>decide(s,c,'accepted',NOW+90001),/expired/);
});
test('accepted waiting reroute restores and preserves actual boarding/exterior context',()=>{
 const {state,router}=fixture();let s=progress(state,'waiting',1,'08:03',120);s=ingestEvents(s,[event()],router.network,NOW);const c=compareJourney(s,router,NOW);assert.equal(c.status,'offer');
 const accepted=decide(s,c,'accepted',NOW);assert.ok(validateJourney(JSON.parse(JSON.stringify(accepted))));
 assert.equal(accepted.carriedContext.hasBoarded,false);assert.equal(accepted.progress.kind,'waiting');
 assert.equal(confirmedQuery(accepted,router.network).query.progressSeed.hasBoarded,false);
});
test('recovery, expiry, missing, conflict and out-of-order have distinct meanings',()=>{
 const {state,router}=fixture();let s=ingestEvents(state,[event()],router.network,NOW);
 assert.equal(compareJourney(s,router,NOW).status,'offer');
 assert.equal(ingestEvents(s,[],router.network,NOW).events.length,1);
 assert.match(compareJourney(s,router,NOW+90001).checked[0].reason,/unknown/);
 const recovery=event({revision:2,effect:'recovered'});s=ingestEvents(s,[recovery],router.network,NOW);assert.equal(compareJourney(s,router,NOW).status,'continue');
 s=ingestEvents(s,[event()],router.network,NOW);assert.equal(s.events[0].effect,'recovered');
 s=ingestEvents(s,[event({tripId:'d',routeId:'direct',impactEndSeconds:sec('08:55')})],router.network,NOW);assert.equal(s.events[0].conflict,undefined);
 const conflict=ingestEvents(state,[event(),event({effect:'recovered'})],router.network,NOW);assert.equal(conflict.events[0].conflict,true);assert.match(compareJourney(conflict,router,NOW).checked[0].reason,/unknown/);
 const badRecovery=ingestEvents(ingestEvents(state,[event()],router.network,NOW),[event({revision:2,effect:'recovered',tripId:'d',routeId:'direct',impactEndSeconds:sec('08:55')})],router.network,NOW);assert.equal(badRecovery.events[0].conflict,true);
});
test('irrelevant remaining event and small/uncertain gains do not recommend switching; cooldown protects guidance',()=>{
 const {state,router}=fixture();let s=progress(state,'transferring',3,'08:15',120);s=ingestEvents(s,[event()],router.network,NOW);assert.equal(compareJourney(s,router,NOW).relevant.length,0);
 assert.equal(compareJourney(state,router,NOW).status,'continue');assert.equal(POLICY.minimumGainSeconds,300);
 const changed=ingestEvents(state,[event()],router.network,NOW),c=compareJourney(changed,router,NOW),declined=decide(changed,c,'declined',NOW);
 const updated=ingestEvents(declined,[event({id:'second-incident',tripId:'b',routeId:'blue',impactStartSeconds:sec('08:20'),impactEndSeconds:sec('08:30')})],router.network,NOW);assert.equal(compareJourney(updated,router,NOW+1).status,'offer');
 const moved=confirmProgress(declined,{...declined.progress,confirmedSeconds:sec('08:01')},NOW);assert.equal(compareJourney(moved,router,NOW+1).status,'suppressed');
 const uncertain={...state,route:{...state.route,estimated:true}};assert.equal(compareJourney(uncertain,router,NOW).status,'continue');
});
test('malformed saved state fails closed without a render crash',()=>{
 const {state}=fixture();assert.ok(validateJourney(state));for(const change of [{progress:{...state.progress,confirmedAt:'bad'}},{route:{...state.route,legs:[null]}},{events:[null]},{decisions:[null]},{input:{}},{carriedContext:null},{progress:{kind:'onboard'}},{route:{...state.route,deadlineSeconds:NaN}}])assert.equal(validateJourney({...state,...change}),null);
});

test('segment incident uses that segment interval, and finite validity bounds acceptance',()=>{
 const {network,state,router}=fixture();network.trips[0].stopTimes.push(['yb',sec('08:25'),sec('08:25')]);
 const wrong=event({effect:'segment-unavailable',fromStopId:'xr',toStopId:'yb',impactStartSeconds:sec('08:04'),impactEndSeconds:sec('08:06')});
 assert.equal(validateEvent(wrong,network,'test-build',NOW).applicable,false);
 const valid=event({validUntil:new Date(NOW+10000).toISOString()});const s=ingestEvents(state,[valid],router.network,NOW),c=compareJourney(s,router,NOW);
 assert.equal(c.status,'offer');assert.throws(()=>decide(s,c,'accepted',NOW+10001),/expired/);
});
test('material scheduled gain threshold is inclusive at five minutes; four minutes and uncertain gains suppress',()=>{
 for(const [arrival,expected] of [['08:50','offer'],['08:49','continue']]){
  const {network,input}=fixture();network.trips.find(t=>t.id==='d').stopTimes[1]=['d',sec(arrival),sec(arrival)];
  const router={network,...createRailRouter(network)},direct=router.route(input).routes.find(r=>r.legs.some(l=>l.tripId==='d'));
  const state=acceptJourney(direct,input,'test-build',NOW);assert.equal(compareJourney(state,router,NOW).status,expected);
  assert.equal(compareJourney({...state,route:{...state.route,estimated:true}},router,NOW).status,'continue');
 }
});

test('arrived and transfer-stage disruptions require confirmed transitions and preserve completed work',()=>{
 const {state,router}=fixture();
 const arrived=progress(state,'arrived',state.route.legs.length,'08:47',540);assert.equal(compareJourney(arrived,router,NOW).status,'confirmation');assert.match(compareJourney(arrived,router,NOW).message,/Arrival confirmed/);
 const transfer=progress(state,'transferring',3,'08:15',120),e=event({tripId:'b',routeId:'blue',impactStartSeconds:sec('08:20'),impactEndSeconds:sec('08:30')});
 const changed=ingestEvents(transfer,[e],router.network,NOW),c=compareJourney(changed,router,NOW);assert.equal(c.relevant.length,1);assert.equal(c.continuing.feasible,false);assert.equal(changed.progress.walkedSeconds,120);assert.equal(c.status,'no-feasible');
});
