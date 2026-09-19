import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimateLocationProgress,projectLocationToPath,requiresIndoorConfirmation} from '../src/location-progress.js';

const now=1000000;
const fix=(latitude=1.3,longitude=103.802,accuracy=8)=>({latitude,longitude,accuracy,timestamp:now});
const walk=text=>({type:'walk',text,source:{mode:'walk'}});
const line=(stepIndex,points,kind='provider')=>({stepIndex,points,kind});
const active=(steps=[walk('Walk along the public street')],geometry=[line(0,[[1.3,103.8],[1.3,103.804]])])=>({id:'accepted',status:'started',plan:{mode:'real'},progress:{stepIndex:0,confirmedAt:null},route:{id:'accepted-route',provider:'onemap',steps,geometry}});
const estimate=(journey,position=fix(),options={})=>estimateLocationProgress(journey,position,{now,...options});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};

test('a fresh accurate interior fix estimates an outdoor step without mutating accepted state',()=>{
  const journey=freeze(active()),before=JSON.stringify(journey),result=estimate(journey);
  assert.equal(result.status,'estimated');assert.equal(result.canonicalStepIndex,0);assert.equal(result.estimatedStepIndex,0);
  assert.equal(result.current,'Walk along the public street');assert.equal(result.label,'Estimated outdoor step 1 of 1');
  assert.equal(result.requiresIndoorConfirmation,false);assert.ok(Math.abs(result.projection.fraction-.5)<.001);
  assert.equal(JSON.stringify(journey),before);assert.equal(journey.progress.confirmedAt,null);
});

test('projection respects every vertex, reversals, duplicate vertices and invalid coordinates',()=>{
  const points=[[1.3,103.8],[1.3,103.801],[1.3,103.801],[1.301,103.801]],position=fix(1.3005,103.801);
  const forward=projectLocationToPath(position,points),reverse=projectLocationToPath(position,[...points].reverse());
  assert.ok(forward.distanceMeters<.001);assert.ok(Math.abs(forward.alongMeters-reverse.remainingMeters)<.01);
  assert.ok(forward.fraction>.74&&forward.fraction<.76);
  for(const path of [[],[[1.3,103.8]],[[1.3,103.8],[null,103.9]],[[1.3,103.8],[95,103.9]],[[1.3,103.8],[1.3,103.8]]])assert.equal(projectLocationToPath(position,path),null);
  assert.equal(projectLocationToPath({...position,latitude:NaN},points),null);
});

test('stale, low accuracy, invalid, future and pre-confirmation fixes preserve canonical guidance',()=>{
  const journey=active();
  for(const [position,reason] of [[{...fix(),timestamp:now-60001},'stale-location'],[{...fix(),accuracy:50.01},'low-accuracy'],[{...fix(),timestamp:now+1001},'stale-location'],[{...fix(),accuracy:-1},'missing-location'],[{...fix(),longitude:Infinity},'missing-location'],[null,'missing-location']]){
    const result=estimate(journey,position);assert.equal(result.status,'unavailable');assert.equal(result.reason,reason);assert.equal(result.estimatedStepIndex,null);assert.equal(journey.progress.stepIndex,0);
  }
  assert.equal(estimate(journey,{...fix(),timestamp:now-60000}).status,'estimated');
  journey.progress.confirmedAt=now;assert.equal(estimate(journey,{...fix(),timestamp:now-1}).reason,'fix-before-confirmation');
});

test('canonical indices survive inserted waits; bus or rail boarding cannot be inferred',()=>{
  const steps=[walk('Walk to the bus'),{type:'wait'}, {type:'ride',source:{mode:'bus'}},walk('Walk to the destination')];
  const journey=active(steps,[line(0,[[1.3,103.8],[1.3,103.804]]),line(2,[[1.31,103.8],[1.31,103.804]]),line(3,[[1.32,103.8],[1.32,103.804]])]);
  assert.equal(estimate(journey).estimatedStepIndex,0);
  assert.equal(estimate(journey,fix(1.31)).reason,'confirmation-required');
  assert.equal(estimate(journey,fix(1.32)).reason,'sequentially-ambiguous');
  journey.progress.stepIndex=2;assert.equal(estimate(journey,fix(1.31)).status,'unavailable');
  journey.progress.stepIndex=3;assert.equal(estimate(journey,fix(1.32)).estimatedStepIndex,3);
  for(const index of [1,2])assert.equal(requiresIndoorConfirmation(journey,index),true);
});

test('only continuous, wholly outdoor steps may estimate later than the accepted anchor',()=>{
  const journey=active([walk('First street'),walk('Second street'),walk('Third street')],[line(0,[[1.3,103.8],[1.3,103.804]]),line(1,[[1.3,103.804],[1.3,103.808]]),line(2,[[1.3,103.808],[1.3,103.812]])]);
  const result=estimate(journey,fix(1.3,103.81));assert.equal(result.estimatedStepIndex,2);assert.equal(result.canonicalStepIndex,0);assert.equal(journey.progress.stepIndex,0);
  journey.route.geometry[1].points=[[1.31,103.804],[1.31,103.808]];
  assert.equal(estimate(journey,fix(1.3,103.81)).reason,'sequentially-ambiguous');
  journey.progress.stepIndex=2;assert.equal(estimate(journey).status,'unavailable','never regress canonical position from GPS');
});

test('an enclosed transfer, unknown path or missing intermediate geometry prevents skipping ahead',()=>{
  for(const middle of [{type:'transfer',fromStopId:'DT14_A',toStopId:'EW12_A'},walk('Missing geometry'),{type:'walk',indoor:true}]){
    const journey=active([walk('First street'),middle,walk('After transfer')],[line(0,[[1.3,103.8],[1.3,103.804]]),line(2,[[1.32,103.8],[1.32,103.804]])]);
    assert.equal(estimate(journey,fix(1.32)).status,'unavailable');
  }
});

test('OneMap rail entrance and exit walks remain enclosed even without station IDs',()=>{
  const journey=active([walk('Walk to station'),{type:'wait'},{type:'ride',source:{mode:'rail'}},walk('Leave station')],[line(0,[[1.3,103.8],[1.3,103.804]]),line(3,[[1.32,103.8],[1.32,103.804]])]);
  for(const index of [0,1,2,3])assert.equal(requiresIndoorConfirmation(journey,index),true);
  assert.equal(estimate(journey).reason,'confirmation-required');
  journey.progress.stepIndex=3;assert.equal(estimate(journey,fix(1.32)).reason,'confirmation-required');
});

test('near a boundary or crossing, overlapping steps and distant fixes do not claim a current step',()=>{
  assert.equal(estimate(active(),fix(1.3,103.8)).reason,'near-step-boundary');
  assert.equal(estimate(active(),fix(1.3,103.80395)).reason,'near-step-boundary');
  assert.equal(estimate(active(),fix(1.32)).reason,'off-route');
  const parallel=active([walk('First pass'),walk('Later pass')],[line(0,[[1.3,103.8],[1.3,103.804]]),line(1,[[1.3001,103.804],[1.3001,103.8]])]);
  assert.equal(estimate(parallel).reason,'ambiguous-location');
  const loop=active([walk('Loop')],[line(0,[[1.299,103.801],[1.301,103.803],[1.301,103.801],[1.299,103.803]])]);
  assert.equal(estimate(loop).reason,'ambiguous-location');
});

test('schematic, malformed and duplicate geometry cannot establish a location',()=>{
  for(const geometry of [[line(0,[[1.3,103.8],[1.3,103.804]],'schematic')],[line(3,[[1.3,103.8],[1.3,103.804]])],[line(0,[[1.3,103.8],[null,103.804]])],[line(0,[[1.3,103.8],[1.3,103.804]]),line(0,[[1.3,103.8],[1.3,103.804]])]])assert.equal(estimate(active([walk('Walk')],geometry)).status,'unavailable');
  const journey=active();delete journey.route.geometry;journey.route.legacyRoute={legs:[{type:'walk',fromStopId:'A',toStopId:'B'}]};
  assert.equal(estimate(journey,fix(),{network:{stops:[{id:'A',lat:1.3,lon:103.8},{id:'B',lat:1.3,lon:103.804}]}}).reason,'no-supported-geometry');
});

test('real packaged reviewed exterior geometry uses canonical source and direction; indoor allowance stays unconfirmed',()=>{
  const walking=JSON.parse(readFileSync(new URL('../public/data/walking-links.json',import.meta.url),'utf8'));
  const link=walking.links.find(item=>item.id==='walk-81111-paya-lebar-b');
  assert.ok(link,'exercise a real packaged map-supported path');
  const points=link.path.waypoints.map(p=>[p.lat,p.lon??p.lng]);
  const point=points[2].map((value,index)=>value+(points[3][index]-value)*.15),position=fix(point[0],point[1],3);
  const transfer={type:'transfer',fromStopId:`bus:${link.busStopId}`,toStopId:link.railPlatformIds[0],source:{type:'transfer',pathId:link.id}};
  const journey=active([transfer],[]);delete journey.route.provider;delete journey.route.geometry;
  let result=estimate(journey,position,{walking});
  assert.equal(result.status,'estimated');assert.equal(result.reason,'reviewed-exterior');assert.equal(result.estimatedStepIndex,0);
  assert.equal(result.requiresIndoorConfirmation,true);assert.match(result.label,/outdoor portion/);
  const distance=result.projection.alongMeters;
  [transfer.fromStopId,transfer.toStopId]=[transfer.toStopId,transfer.fromStopId];
  result=estimate(journey,position,{walking});assert.equal(result.status,'estimated');assert.ok(Math.abs(distance-result.projection.remainingMeters)<.01);
  journey.route.steps.push(walk('After the indoor transfer'));journey.route.geometry=[line(1,[[1.32,103.8],[1.32,103.804]])];
  assert.equal(estimate(journey,fix(1.32),{walking}).status,'unavailable');
});

test('unreviewed, disabled and mismatched legacy path references do not become physical evidence',()=>{
  const step={type:'transfer',fromStopId:'bus:12345',toStopId:'DT14_A',source:{pathId:'path'}};
  const link={id:'path',enabled:true,evidenceLevel:'map-supported',sourceUrls:['https://example.test/evidence'],busStopId:'12345',railPlatformIds:['DT14_A'],directionality:'bus-to-rail',path:{waypoints:[{lat:1.3,lon:103.8},{lat:1.3,lon:103.804}]}};
  const journey=active([step],[]);delete journey.route.geometry;
  assert.equal(estimate(journey,fix(),{walking:{links:[link]}}).status,'estimated');
  for(const change of [{enabled:false},{evidenceLevel:'unknown'},{sourceUrls:[]},{railPlatformIds:['DT15_A']},{directionality:'rail-to-bus'}])assert.equal(estimate(journey,fix(),{walking:{links:[{...link,...change}]}}).reason,'no-supported-geometry');
});

test('paused, ended, rehearsal, active detours and facility review retain accepted instructions',()=>{
  for(const status of ['paused','completed','cancelled'])assert.equal(estimate({...active(),status}).reason,'journey-inactive');
  assert.equal(estimate(null).reason,'journey-inactive');
  for(const change of [{detour:{status:'accepted'}},{detour:{status:'returning'}},{detour:{status:'reached'}},{facilityBlocked:true},{facilityReview:true}])assert.equal(estimate({...active(),...change}).reason,'accepted-guidance-needs-review');
  assert.equal(estimate({...active(),plan:{mode:'replay'}}).reason,'rehearsal');
  const journey=active();journey.proposal={route:active([walk('Unaccepted preview')]).route};
  assert.equal(estimate(journey).current,'Walk along the public street');
  journey.progress.stepIndex=100;assert.equal(estimate(journey).reason,'invalid-canonical-step');
});
