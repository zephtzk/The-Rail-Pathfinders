import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,startJourney,transition,confirmCheckpoint,setPermissions,setApproximateLocation,acceptDetour,stopAction,journeyCard,proposeRoute,acceptRoute,restoreActive,saveActive,validatePlan,validateActive} from '../src/journey-v2.js';
import {FIXTURE_LAYOUT,fixtureStatuses} from '../src/facility-data.js';
import {rankToilets,previewToiletDetour} from '../src/toilet-engine.js';
import {acceptJourney} from '../src/journey-state.js';
const plan=(mode='replay')=>makePlan({origin:{id:'a',label:'Origin'},destination:{id:'b',label:'Destination'},date:'2026-09-18',departureTime:'10:00',mode,preferences:{stepFree:true},route:{id:'r',departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:100,accessibility:'unknown',provenance:'fixture',steps:[{id:'s1',text:'Use lift A',durationSeconds:120},{id:'s2',text:'Exit B',durationSeconds:200}]}},100);
const preview={toiletId:'fixture:t1',addedSeconds:500,walkingSeconds:100,breakMinutes:5,fixture:true,steps:[{text:'Use alternative lift B',durationSeconds:100}]};
test('real unverified step-free routes fail closed; timetable never establishes arrival',()=>{assert.throws(()=>startJourney(plan('real')),/verified/);const s=startJourney(plan());assert.equal(journeyCard(s,{now:Date.now()+86400000}).status,'started');assert.equal(s.progress.kind,'unknown');});
test('checkpoint and approximate GPS remain separate; pause is explicit',()=>{let s=startJourney(plan(),100);s=confirmCheckpoint(s,{nodeId:'gate',floor:'B1',label:'Gate'},200);s=setApproximateLocation(s,{latitude:1.3,longitude:103.8,accuracy:300,timestamp:300},300);assert.equal(s.progress.checkpoint.nodeId,'gate');assert.equal(s.location.kind,'approximate');s=transition(s,'pause',400);assert.equal(journeyCard(s).current,'Journey paused');s=transition(s,'resume',1400);assert.equal(s.route.arrivalSeconds,36601);assert.throws(()=>setApproximateLocation(s,{latitude:999},1500));});
test('toilet lifecycle preserves destination, accepts revisions, never completes itself',()=>{let s=startJourney(plan(),100);s=acceptDetour(s,preview,200);assert.equal(s.plan.destination.id,'b');assert.equal(s.route.arrivalSeconds,37100);assert.match(journeyCard(s).current,/lift B/);assert.throws(()=>transition(s,'finish'),/toilet/);s=stopAction(s,'reached',300);assert.match(journeyCard(s).current,/resume/);s=stopAction(s,'resume',400);assert.equal(s.status,'started');assert.equal(s.plan.destination.id,'b');s=transition(s,'finish',500);assert.equal(s.status,'completed');assert.deepEqual(transition(s,'finish',600),s);});
test('detour cancellation restores ETA; excessive walk and real fixture insertion reject',()=>{let s=startJourney(plan());const original=s.route.arrivalSeconds;s=acceptDetour(s,preview);s=stopAction(s,'cancel');assert.equal(s.route.arrivalSeconds,original);assert.throws(()=>acceptDetour(s,{...preview,walkingSeconds:99999}),/allowance/);const p=plan('real');p.preferences.stepFree=false;assert.throws(()=>acceptDetour(startJourney(p),preview),/Fixture/);});
test('route proposal does not change accepted route until explicit acceptance',()=>{let s=startJourney(plan());s=proposeRoute(s,{...s.route,id:'new',arrivalSeconds:37000},'Closure');assert.equal(s.route.id,'r');assert.equal(s.proposal.route.id,'new');s=acceptRoute(s);assert.equal(s.route.id,'new');assert.equal(s.plan.route.id,'new');assert.equal(s.routeRevisions.length,1);});
test('revocation clears location, finish stops sharing, offline card derives same state',()=>{let s=startJourney(plan());s=setPermissions(s,{progress:true,location:true});s=setApproximateLocation(s,{latitude:1,longitude:100,accuracy:5,timestamp:Date.now()});s=setPermissions(s,{revoked:true});assert.equal(s.location,null);assert.equal(s.permissions.location,false);assert.equal(s.permissions.progress,false);assert.match(journeyCard(s,{online:false}).warnings.join(' '),/Offline/);s=transition(s,'finish');assert.equal(s.permissions.paused,true);});
test('storage errors never acknowledge durability and invalid snapshots fail closed',()=>{const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};const s=startJourney(plan());assert.equal(saveActive(storage,s),true);assert.equal(restoreActive(storage).id,s.id);assert.equal(saveActive({setItem(){throw Error()}},s),false);assert.equal(restoreActive({getItem:()=>'{bad'}),null);});
test('terminal card never instructs another travel step',()=>{const state=startJourney(plan());assert.match(journeyCard(transition(state,'finish')).next,/no further travel/);assert.match(journeyCard(transition(state,'cancel')).next,/new journey/);});
test('civil dates and clock inputs reject rollover dates, 24:00 and trailing text',()=>{
  for(const date of ['2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-01-00','2026-09-18T00:00:00Z']){const p=plan();p.departureDate=date;assert.equal(validatePlan(p),null,date);}
  for(const value of ['24:00','23:60','-1:00','09:00:00','9:00','09:00junk','']){const p=plan();p.departureTime=value;assert.equal(validatePlan(p),null,value);}
  const leap=plan();leap.departureDate='2024-02-29';assert.ok(validatePlan(leap));leap.deadline='24:00';assert.equal(validatePlan(leap),null);
});
test('plan identity, coordinates, route costs and steps are validated before acceptance',()=>{
  const mutations=[p=>p.origin.id={},p=>p.destination.lat=NaN,p=>p.origin.coordinates=[1.3,181],p=>p.route.walkingSeconds=-1,p=>p.route.arrivalSeconds=NaN,p=>p.route.departureSeconds=Infinity,p=>p.route.steps[0].durationSeconds=-3,p=>p.route.steps[1].id=p.route.steps[0].id,p=>p.createdAt=Infinity,p=>p.preferences.stepFree='true',p=>p.stops=[null]];
  for(const mutate of mutations){const p=plan();mutate(p);assert.equal(validatePlan(p),null);assert.throws(()=>startJourney(p));}
});
test('active snapshots reject corrupt counters, permission shapes and impossible progress',()=>{
  const mutations=[s=>s.revision=-1,s=>s.revision=0.5,s=>s.updatedAt=NaN,s=>s.startedAt=-1,s=>s.route.walkingSeconds=NaN,s=>s.route.arrivalSeconds=-1,s=>s.progress.stepIndex=99,s=>s.progress.kind='teleported',s=>s.progress.checkpoint=[],s=>s.progress.confirmedAt=-1,s=>s.permissions.progress='true',s=>s.permissions.geolocation='invented',s=>s.permissions={progress:false},s=>s.routeRevisions=[null],s=>s.facilityBlocked='false',s=>{s.status='paused';s.pausedAt=null;},s=>{s.status='completed';s.completedAt=100;s.permissions.location=true;}];
  for(const mutate of mutations){const s=startJourney(plan(),100);mutate(s);assert.equal(validateActive(s),null);assert.equal(restoreActive({getItem:()=>JSON.stringify(s)}),null);assert.equal(saveActive({setItem(){throw Error('must not write invalid state');}},s),false);}
});

test('restored rerouting context is validated before a controller consumes its route and progress',()=>{
  const active=startJourney(plan(),100),route={id:'r',departureSeconds:36000,arrivalSeconds:36600,deadlineSeconds:null,legs:[{type:'ride',fromStopId:'a',toStopId:'b',durationSeconds:600,startSeconds:36000,endSeconds:36600}]};
  active.routingContext=acceptJourney(route,{walkingLimitMinutes:30},'test-build',100);
  const before=structuredClone(active);assert.ok(validateActive(active));assert.deepEqual(active,before,'validation must not mutate the accepted snapshot');
  for(const context of [{},{route:{legs:[]}}, {...active.routingContext,progress:{}},{...active.routingContext,route:{...route,legs:[null]}}]){
    const corrupt={...active,routingContext:context};assert.equal(validateActive(corrupt),null);assert.equal(restoreActive({getItem:()=>JSON.stringify(corrupt)}),null);
  }
  const withoutContext={...active,routingContext:null};assert.ok(validateActive(withoutContext));
});
test('a prepared graph path is checked for connectivity and consistent costs when restored',()=>{
  const now=1000,result=rankToilets(FIXTURE_LAYOUT,{from:'platform',allowFixtures:true,statuses:fixtureStatuses('none',now),now,arrivalBaseMs:Date.parse('2026-09-18T08:00:00Z')})[0],full=previewToiletDetour(FIXTURE_LAYOUT,result,{now}),accepted=acceptDetour(startJourney(plan(),100),full,now);
  assert.ok(validateActive(accepted));
  const mutations=[d=>d.outbound.nodes=[],d=>d.outbound.edges[0].to='wrong-node',d=>d.outbound.walkingSeconds=-1,d=>d.outbound.seconds+=1,d=>d.returnPath.nodes[0]='different-toilet',d=>d.returnPath.edges[0].seconds=NaN,d=>d.onward='wrong-onward',d=>d.baseWalkingSeconds=-1,d=>d.baseStepIndex=NaN,d=>d.originalDestination.id='other-destination',d=>d.status='guessed-finished',d=>d.breakMinutes=Infinity];
  for(const mutate of mutations){const s=structuredClone(accepted);mutate(s.detour);assert.equal(validateActive(s),null);}
  const bad=structuredClone(full);bad.outbound.edges[0].to='disconnected';assert.throws(()=>acceptDetour(startJourney(plan(),100),bad,1000),/prepared detour/);
});
test('optional pathless fixture remains supported but malformed provided paths do not',()=>{
  const state=acceptDetour(startJourney(plan(),100),preview,200);assert.ok(validateActive(state));
  for(const change of [{walkingSeconds:NaN},{steps:[null]},{outbound:{}},{returnPath:[]},{fixture:'true'},{breakMinutes:121}])assert.throws(()=>acceptDetour(startJourney(plan(),100),{...preview,...change},200),/prepared detour/);
  assert.equal(validateActive({...state,stops:[]}),null);
});
test('permissions, location and progress mutations cannot introduce invalid snapshot fields',()=>{
  const state=startJourney(plan(),100);
  assert.throws(()=>setPermissions(state,{location:1},200),/consent/);assert.throws(()=>setPermissions(state,{unknownPermission:true},200),/consent/);
  assert.throws(()=>confirmCheckpoint(state,{kind:'guessed-arrival'},200),/valid current/);assert.throws(()=>confirmCheckpoint(state,{nodeId:{}},200),/valid current/);
  assert.throws(()=>transition(transition(state,'pause',300),'resume',200),/device clock/);
  const bad={...state,location:{kind:'approximate',latitude:1.3,longitude:103.8,accuracy:-1,timestamp:100}};assert.equal(validateActive(bad),null);
});
test('main facility review or blocked onward route must resolve before adding a toilet stop',()=>{
  const state=startJourney(plan(),100);
  assert.throws(()=>acceptDetour({...state,facilityReview:true},preview,200),/revised main route/);
  assert.throws(()=>acceptDetour({...state,facilityBlocked:true},preview,200),/No supported onward/);
});
test('consecutive stops account for previous walking; cancellation only restores unstarted allowance',()=>{
  const p=plan();p.preferences.walkingLimitMinutes=4;let s=acceptDetour(startJourney(p,100),preview,200);assert.equal(s.route.walkingSeconds,200);
  s=stopAction(s,'reached',300);s=stopAction(s,'resume',400);assert.throws(()=>acceptDetour(s,preview,500),/walking allowance/);
  const cancelled=stopAction(acceptDetour(startJourney(plan(),100),preview,200),'cancel',300);assert.equal(cancelled.route.walkingSeconds,100);
});
test('detour card advances only at confirmed connected checkpoints and shows the next facility',()=>{
  const now=1000,result=rankToilets(FIXTURE_LAYOUT,{from:'platform',allowFixtures:true,statuses:fixtureStatuses('none',now),now,arrivalBaseMs:Date.parse('2026-09-18T08:00:00Z')})[0],full=previewToiletDetour(FIXTURE_LAYOUT,result,{now});
  let state=acceptDetour(startJourney(plan(),100),full,now);
  assert.equal(journeyCard(state).current,full.steps[0].text);assert.equal(journeyCard(state).next,full.steps[1].text);
  state=confirmCheckpoint(state,{nodeId:'a-bottom',stationId:'fixture-interchange'},1100);assert.equal(state.detour.stepIndex,1);assert.match(journeyCard(state).current,/fixture-lift-a/);
  state=confirmCheckpoint(state,{nodeId:'toilet-a',stationId:'fixture-interchange'},1200);assert.equal(state.detour.status,'accepted');assert.match(journeyCard(state).current,/Confirm Reached toilet/);
  state=stopAction(state,'reached',1300);state=stopAction(state,'resume',1400);assert.equal(state.detour.status,'returning');
  const returning=full.steps.filter(s=>s.id.startsWith('toilet-return-'));assert.equal(journeyCard(state).next,returning[1].text);
  state=confirmCheckpoint(state,{nodeId:'a-top',stationId:'fixture-interchange'},1500);assert.equal(state.detour.returnStepIndex,1);assert.equal(journeyCard(state).current,returning[1].text);
  state=confirmCheckpoint(state,{nodeId:'platform',stationId:'different-station'},1600);assert.equal(state.detour.status,'returning');
  state=confirmCheckpoint(state,{nodeId:'platform',stationId:'fixture-interchange'},1700);assert.equal(state.detour.status,'resumed');assert.equal(state.status,'started');assert.ok(validateActive(state));
});
