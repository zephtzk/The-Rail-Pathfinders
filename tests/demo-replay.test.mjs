import test from 'node:test';
import assert from 'node:assert/strict';
import {createRailRouter} from '../src/rail-engine.js';
import {acceptJourney,confirmProgress} from '../src/journey-state.js';
import {compileDemoClosures,compileSavedDemoClosures,demoConnectionClosed,demoRouteAffected} from '../src/demo-closures.js';
import {replayJourney} from '../src/demo-replay.js';

const sec=time=>{const [h,m]=time.split(':').map(Number);return h*3600+m*60;};
const at=time=>`2026-09-19T${time}:00+08:00`;
const st=(id,time)=>[id,sec(time),sec(time),true,true];
const trip=(id,routeId,directionId,times)=>({id,routeId,directionId,serviceId:'daily',headsign:times.at(-1)[0],stopTimes:times});
function network({bypass=true}={}){
  const stations=['A','B','C','D','U','V'].map(id=>({id,name:id,lat:1,lon:103,stopIds:[id.toLowerCase()]}));
  return {schemaVersion:1,timeZone:'Asia/Singapore',stations,stops:stations.map(s=>({id:s.stopIds[0],stationId:s.id,name:s.id,lat:1,lon:103})),routes:['main','bypass','other'].map(id=>({id,shortName:id,name:id,color:'112233'})),services:[{id:'daily',startDate:'2026-09-01',endDate:'2026-09-30',weekdays:[0,1,2,3,4,5,6],exceptions:{}}],trips:[trip('out','main',0,[st('a','08:05'),st('b','08:15'),st('c','08:25'),st('d','08:35')]),trip('back','main',1,[st('d','09:05'),st('c','09:15'),st('b','09:25'),st('a','09:35')]),trip('isolated','other',0,[st('u','08:05'),st('v','08:15')]),...(bypass?[trip('alternative','bypass',0,[st('a','08:07'),st('d','08:45')])]:[])],transfers:[],coverage:{startDate:'2026-09-01',endDate:'2026-09-30'},assumptions:{accessSeconds:120,exitSeconds:120}};
}
const input={originId:'A',destinationId:'D',date:'2026-09-19',departureTime:'08:00',deadlineTime:'10:00',walkingLimitMinutes:10,preference:'fastest',maxExtraMinutes:15};
const incident={id:'closure',demo:true,source:'demo',title:'Fixture simulation',type:'closure',service:'main',scope:'segment',from:'b',to:'c',direction:'forward',startsAt:at('08:14'),endsAt:at('08:26'),status:'active',revision:1};
function fixture(options={},query={}){const n=network(options),router=createRailRouter(n),q={...input,...query},route=router.route(q).recommended;assert.ok(route,'Fixture selected route exists');const context=acceptJourney(route,q,'fixture-build',Date.parse(at('08:00')));return {n,router,context};}
function run(f,change={},context=f.context,search=q=>f.router.route(q)){return replayJourney({incident:{...incident,...change},context,network:f.n,search,build:'fixture-build'});}

test('closure windows are half-open and require actual traversal overlap',()=>{
  const rules=[{demo:true,routeId:'main',edges:[['b','c']],startSeconds:sec('08:15'),endSeconds:sec('08:25')}];
  assert.equal(demoConnectionClosed(rules,'main','b','c',sec('08:05'),sec('08:15')),false,'arrival exactly at start remains outside');
  assert.equal(demoConnectionClosed(rules,'main','b','c',sec('08:25'),sec('08:35')),false,'departure exactly at end remains outside');
  assert.equal(demoConnectionClosed(rules,'main','b','c',sec('08:15'),sec('08:25')),true,'traversal during the window is closed');
  assert.equal(demoConnectionClosed(rules,'main','b','c',sec('08:10'),sec('08:20')),true);
  assert.equal(demoConnectionClosed(rules,'main','c','b',sec('08:15'),sec('08:25')),false);
  assert.equal(demoConnectionClosed(rules,'other','b','c',sec('08:15'),sec('08:25')),false);
});

test('compiler targets the selected directed edge only and supports public station boundaries',()=>{
  const n=network(),effect=compileDemoClosures({...incident,from:'B',to:'C',endsAt:at('10:00')},n,input.date);
  assert.equal(effect.status,'closure');assert.deepEqual(effect.rules[0].edges,[['b','c']]);
  const both=compileDemoClosures({...incident,direction:'both'},n,input.date);
  assert.deepEqual(new Set(both.rules[0].edges.map(edge=>edge.join('-'))),new Set(['b-c','c-b']));
  const reverse=compileDemoClosures({...incident,direction:'reverse'},n,input.date);
  assert.deepEqual(reverse.rules[0].edges,[['c','b']]);
});

test('rail search cannot teleport over a closed edge, but each side and reverse remain usable',()=>{
  const f=fixture({bypass:false}),rules=compileDemoClosures({...incident,endsAt:at('10:00')},f.n,input.date).rules;
  assert.equal(f.router.route({...input,demoClosures:rules}).routes.length,0,'No A→D continuation through the removed B→C connection');
  assert.equal(f.router.route({...input,destinationId:'B',demoClosures:rules}).recommended.arrivalSeconds,sec('08:17'));
  assert.equal(f.router.route({...input,originId:'C',departureTime:'08:20',demoClosures:rules}).recommended.arrivalSeconds,sec('08:37'));
  assert.equal(f.router.route({...input,originId:'C',destinationId:'B',departureTime:'09:10',demoClosures:rules}).recommended.arrivalSeconds,sec('09:27'));
});

test('exact incident endpoints do not remove connections before or after the closure',()=>{
  const f=fixture({bypass:false});
  for(const change of [{startsAt:at('08:25'),endsAt:at('08:35')},{startsAt:at('08:05'),endsAt:at('08:15')}]){
    const effect=compileDemoClosures({...incident,...change},f.n,input.date);
    assert.equal(demoRouteAffected(f.context.route,effect.rules,f.n),false);
    assert.equal(f.router.route({...input,demoClosures:effect.rules}).recommended.arrivalSeconds,sec('08:37'));
  }
});

test('affected replay returns a verified alternative preserving destination, budget and accepted context',async()=>{
  const f=fixture(),before=structuredClone(f.context);let query;
  const result=await run(f,{},f.context,q=>{query=q;return f.router.route(q);});
  assert.equal(result.status,'alternative');assert.equal(result.affected,true);
  assert.equal(result.directions.arrivalSeconds,sec('08:47'));
  assert.deepEqual(result.directions.legs.filter(l=>l.type==='ride').map(l=>l.tripId),['alternative']);
  assert.equal(query.originId,'A');assert.equal(query.destinationId,'D');assert.equal(query.walkingLimitMinutes,10);
  assert.deepEqual(f.context,before,'Rehearsal must never accept or mutate the active trip');
  assert.equal(demoRouteAffected(result.directions,result.effect.rules,f.n),false);
});

test('unrelated and resolved incidents retain selected directions and never invoke search',async()=>{
  const f=fixture(),before=structuredClone(f.context);let searches=0;
  for(const change of [{service:'other',from:'u',to:'v'},{status:'resolved'},{startsAt:at('10:00'),endsAt:at('11:00')}]){
    const result=await run(f,change,f.context,()=>{searches++;throw Error('Unnecessary route replacement');});
    assert.equal(result.status,'unaffected');assert.deepEqual(result.directions,f.context.route);
  }
  assert.equal(searches,0);assert.deepEqual(f.context,before);
});

test('no feasible route does not return unsafe original directions as a replacement',async()=>{
  const f=fixture({bypass:false}),result=await run(f);
  assert.equal(result.status,'no-route');assert.equal(result.affected,true);assert.equal(result.directions,undefined);assert.match(result.message,/No supported alternative/);
});

test('delay remains advisory with original timetable and cannot fabricate a revised arrival',async()=>{
  const f=fixture();let searches=0;
  const result=await run(f,{type:'delay',delayMinutes:15},f.context,()=>{searches++;});
  assert.equal(result.status,'advisory');assert.equal(result.affected,true);assert.deepEqual(result.directions,f.context.route);assert.equal(result.directions.arrivalSeconds,sec('08:37'));assert.equal(searches,0);assert.match(result.message,/cannot be validated/);
});

test('onboard replay requires alighting confirmation and never invents an intermediate exit',async()=>{
  const f=fixture(),legIndex=f.context.route.legs.findIndex(l=>l.type==='ride'),context=confirmProgress(f.context,{kind:'onboard',legIndex,confirmedSeconds:sec('08:10'),walkedSeconds:120});let searches=0;
  const result=await run(f,{},context,()=>{searches++;});
  assert.equal(result.status,'confirmation');assert.match(result.message,/Confirm alighting/);assert.equal(result.directions,undefined);assert.equal(searches,0);
});

test('confirmed platform replay carries only the remaining walking allowance',async()=>{
  const f=fixture(),legIndex=f.context.route.legs.findIndex(l=>l.type==='ride'),context=confirmProgress(f.context,{kind:'waiting',legIndex,confirmedSeconds:sec('08:04'),walkedSeconds:120});let query;
  const result=await run(f,{},context,q=>{query=q;return f.router.route(q);});
  assert.equal(result.status,'alternative');assert.equal(query.walkingLimitMinutes,8);assert.equal(query.destinationId,'D');assert.equal(query.progressSeed.stopId,'a');assert.equal(query.progressSeed.canBoard,true);assert.equal(result.directions.walkingSeconds,120);
});

test('a search result still crossing the closure is rejected before directions are shown',async()=>{
  const f=fixture(),result=await run(f,{},f.context,()=>({routes:[f.context.route]}));
  assert.equal(result.status,'no-route');assert.equal(result.directions,undefined);assert.match(result.message,/could not be verified against the closure boundaries/);
});

test('late replacement is explicitly late and unlabelled official text cannot close a route',async()=>{
  const f=fixture({}, {deadlineTime:'08:40'}),late=await run(f);
  assert.equal(late.status,'late');assert.equal(late.directions.deadlineMet,false);
  const official=await run(f,{demo:false,source:'official'});assert.equal(official.status,'unsupported');assert.equal(official.directions,undefined);
});

test('unsupported boundaries and service-wide direction are rejected without guessing track scope',()=>{
  const n=network();
  for(const change of [{from:'unknown'},{from:'b',to:'b'},{scope:'service',direction:'forward'},{startsAt:'invalid'},{service:'unknown'}]){
    const effect=compileDemoClosures({...incident,...change},n,input.date);assert.equal(effect.status,'unsupported');assert.deepEqual(effect.rules,[]);
  }
});


test('saved unresolved closures change planner recommendation and resolution restores it',()=>{
  const f=fixture(),effects=compileSavedDemoClosures([incident],f.n,input.date);
  const changed=f.router.route({...input,demoClosures:effects.rules});
  assert.deepEqual(changed.recommended.legs.filter(l=>l.type==='ride').map(l=>l.tripId),['alternative']);
  assert.equal(demoRouteAffected(changed.recommended,effects.rules,f.n),false);
  const resolved=compileSavedDemoClosures([{...incident,status:'resolved'}],f.n,input.date);
  assert.equal(resolved.rules.length,0);
  assert.equal(f.router.route({...input,demoClosures:resolved.rules}).recommended.arrivalSeconds,sec('08:37'));
  const blocked=compileSavedDemoClosures([incident,{...incident,id:'second',service:'bypass',scope:'service',direction:'both',startsAt:at('08:00'),endsAt:at('10:00')}],f.n,input.date);
  assert.equal(f.router.route({...input,demoClosures:blocked.rules}).routes.length,0);
});
