import test from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURE_LAYOUT,COVERAGE_REGISTRY,fixtureStatuses,stationLayout} from '../src/facility-data.js';
import {findFacilityPath,validateFacilityGraph,facilityStatus,mapMaintenanceNotices,compareFacilityPaths,pathInstructions} from '../src/facility-engine.js';
import {normalizeFacilitiesMaintenance,createFacilityAdapter} from '../server/facility-adapter.js';
const now=Date.parse('2026-09-18T08:00:00Z');
const opts=(scenario='none',more={})=>({from:'platform',to:'street-a',allowFixtures:true,statuses:fixtureStatuses(scenario,now),now,...more});

test('training graph has real graph invariants but is never geographic evidence',()=>{
  assert.deepEqual(validateFacilityGraph(FIXTURE_LAYOUT),[]);
  assert.equal(findFacilityPath(FIXTURE_LAYOUT,{...opts(),allowFixtures:false}).feasible,false);
  const route=findFacilityPath(FIXTURE_LAYOUT,opts());assert.equal(route.feasible,true);assert.equal(route.verifiedAccessible,false);assert.equal(route.fixture,true);
  for(let i=0;i<route.edges.length;i++){assert.equal(route.edges[i].from,route.nodes[i]);assert.equal(route.edges[i].to,route.nodes[i+1]);}
  assert.equal(pathInstructions(FIXTURE_LAYOUT,route).length,route.edges.length);
  assert.ok(FIXTURE_LAYOUT.nodes.every(n=>n.position===null));
});
test('known lift outage removes its connection; alternative uses a different usable lift',()=>{
  const original=findFacilityPath(FIXTURE_LAYOUT,opts()),revised=findFacilityPath(FIXTURE_LAYOUT,opts('lift-outage'));
  assert.ok(original.facilityIds.includes('fixture-lift-a'));assert.ok(!revised.facilityIds.includes('fixture-lift-a'));assert.ok(revised.facilityIds.includes('fixture-lift-b'));
  assert.ok(revised.edges.every(e=>!['stairs','escalator'].includes(e.kind)));
  const comparison=compareFacilityPaths(FIXTURE_LAYOUT,opts(),fixtureStatuses('none',now),fixtureStatuses('lift-outage',now));assert.ok(comparison.changed);assert.ok(comparison.addedSeconds>0);
});
test('walking profile may use escalator; an escalator closure changes its selected path',()=>{
  const before=findFacilityPath(FIXTURE_LAYOUT,opts('none',{profile:{stepFree:false}})),after=findFacilityPath(FIXTURE_LAYOUT,opts('escalator-outage',{profile:{stepFree:false}}));
  assert.ok(before.facilityIds.includes('fixture-escalator'));assert.ok(!after.facilityIds.includes('fixture-escalator'));assert.ok(after.feasible);
});
test('two apparent exits sharing failed lift are both rejected',()=>{
  for(const to of ['street-a','street-b'])assert.equal(findFacilityPath(FIXTURE_LAYOUT,opts('shared-lift',{to})).feasible,false);
  assert.equal(findFacilityPath(FIXTURE_LAYOUT,opts('no-accessible-exit')).feasible,false);
});
test('unknown gates, insufficient walking allowance and incomplete edges fail closed',()=>{
  assert.equal(findFacilityPath(FIXTURE_LAYOUT,opts('none',{walkingLimitSeconds:5})).feasible,false);
  assert.equal(findFacilityPath(FIXTURE_LAYOUT,opts('none',{profile:{stepFree:true,allowFareGates:false}})).feasible,false);
  const layout=structuredClone(FIXTURE_LAYOUT);layout.edges.find(e=>e.kind==='gate').accessibleGate=null;assert.equal(findFacilityPath(layout,opts()).feasible,false);
  layout.edges.find(e=>e.kind==='gate').accessibleGate=true;layout.edges.find(e=>e.id==='street-lift').verification='incomplete';assert.equal(findFacilityPath(layout,opts()).feasible,false);
});
test('floor changes and paid-area changes must be explicit graph connections',()=>{
  const layout=structuredClone(FIXTURE_LAYOUT);layout.edges.find(e=>e.id==='lift-a').kind='passage';assert.ok(validateFacilityGraph(layout).some(e=>e.includes('floor transition')));
  layout.edges.find(e=>e.id==='wide-gate').kind='passage';assert.ok(validateFacilityGraph(layout).some(e=>e.includes('fare gate')));
});
test('Pareto routing retains slower low-walking path under hard walking limit',()=>{
  const nodes=['s','a','b','x','t'].map(id=>({id,floor:'L1',paidArea:false,verification:'verified',source:{name:'Test'}}));
  const edge=(id,from,to,seconds,walkingSeconds)=>({id,from,to,seconds,walkingSeconds,kind:'passage',stepFree:true,verification:'verified',source:{name:'Test'},bidirectional:false});
  const layout={nodes,edges:[edge('sa','s','a',1,1),edge('ax','a','x',1,1),edge('sb','s','b',2,0),edge('bx','b','x',2,0),edge('xt','x','t',3,3)]};
  const route=findFacilityPath(layout,{from:'s',to:'t',walkingLimitSeconds:3});assert.ok(route.feasible);assert.deepEqual(route.nodes,['s','b','x','t']);assert.equal(route.seconds,7);
});
test('last unavailable report stays closed offline and on feed expiry',()=>{
  const record={status:'reported-unavailable',fetchedAt:new Date(now-3600000).toISOString()};assert.equal(facilityStatus(record,now).status,'reported-unavailable');assert.equal(facilityStatus(record,now,true).usable,false);
  assert.equal(facilityStatus({...record,status:'verified-available',evidence:'operator',validUntil:new Date(now+60000).toISOString()},now).status,'unknown');
  assert.equal(facilityStatus({status:'no-maintenance-report',fetchedAt:new Date(now).toISOString()},now).label,'No maintenance report found · operation unconfirmed');
});
test('exact IDs map; absent and ambiguous IDs never choose an arbitrary facility',()=>{
  const parsed=normalizeFacilitiesMaintenance({value:[{StationCode:'FIXTURE',LiftID:'A',LiftDesc:'Exit lift'},{StationCode:'FIXTURE',LiftID:null,LiftDesc:'Some lift'}]});
  const mapped=mapMaintenanceNotices({...parsed,fetchedAt:new Date(now).toISOString()},FIXTURE_LAYOUT.facilities,[],now);
  assert.equal(mapped.mapped.length,1);assert.equal(mapped.unresolved.length,1);assert.equal(mapped.statuses['fixture-lift-a'].status,'reported-unavailable');assert.equal(mapped.statuses['fixture-lift-b'].status,'unknown');
  const reviewed=mapMaintenanceNotices({...parsed,records:parsed.records.slice(1),fetchedAt:new Date(now).toISOString()},FIXTURE_LAYOUT.facilities,[{stationCode:'FIXTURE',liftDesc:'Some lift',facilityId:'fixture-lift-b',reviewedAt:'2026-09-18'}],now);assert.equal(reviewed.mapped[0].facilityId,'fixture-lift-b');
});
test('empty complete fresh feed means no maintenance report, never available; escalator remains unknown',()=>{
  const result=mapMaintenanceNotices({status:'available',records:[],fetchedAt:new Date(now).toISOString()},FIXTURE_LAYOUT.facilities,[],now);
  assert.equal(result.statuses['fixture-lift-a'].status,'no-maintenance-report');assert.equal(result.statuses['fixture-escalator'].status,'unknown');
  const stale=mapMaintenanceNotices({status:'available',records:[],fetchedAt:new Date(now-3600000).toISOString()},FIXTURE_LAYOUT.facilities,[],now);assert.equal(stale.statuses['fixture-lift-a'].status,'unknown');
});
test('normalizer accepts nullable LiftID and rejects a wrong response envelope',()=>{
  const result=normalizeFacilitiesMaintenance({value:[{Line:'EWL',StationCode:'EW12',StationName:'Bugis',LiftDesc:'Street to concourse'},{StationCode:'EW8',LiftID:null},{StationName:'Missing station'}]});
  assert.equal(result.records.length,2);assert.equal(result.records[0].liftId,null);assert.equal(result.records[0].sourceTime,null);assert.equal(result.records[0].startsAt,null);assert.equal(result.records[0].endsAt,null);assert.equal(result.status,'partial');
  assert.throws(()=>normalizeFacilitiesMaintenance({value:{}}),/malformed/);
});
test('potential pagination cannot claim complete station maintenance coverage',()=>{
  const result=normalizeFacilitiesMaintenance({value:[{StationCode:'EW12',LiftID:'A'}],'@odata.nextLink':'untrusted-next-page'});
  assert.equal(result.status,'partial');assert.equal(result.complete,false);
});
test('adapter uses server key, v2 path, coalesces, caches, retains report time on error',async()=>{
  let clock=now,calls=0,fail=false;const adapter=createFacilityAdapter({clock:()=>clock,fetcher:async(url,options)=>{calls++;assert.match(url,/v2\/FacilitiesMaintenance$/);assert.equal(options.headers.AccountKey,'private');return fail?new Response('bad',{status:503}):Response.json({value:[{StationCode:'EW12',LiftID:'B1L01'}]});}});
  const [a,b]=await Promise.all([adapter({LTA_ACCOUNT_KEY:'private'}),adapter({LTA_ACCOUNT_KEY:'private'})]);assert.deepEqual(a,b);assert.equal(calls,1);await adapter({LTA_ACCOUNT_KEY:'private'});assert.equal(calls,1);
  clock+=60001;fail=true;const failure=await adapter({LTA_ACCOUNT_KEY:'private'});assert.equal(failure.status,'unavailable');assert.equal(failure.fetchedAt,a.fetchedAt);assert.equal(failure.records.length,1);assert.equal(failure.stale,true);
  const notConfigured=await adapter({});assert.equal(notConfigured.error,'not_configured');assert.equal(notConfigured.records.length,0);
});
test('adapter does not leak keys even in upstream text and never substitutes fixtures',async()=>{
  const adapter=createFacilityAdapter({clock:()=>now,fetcher:async()=>Response.json({value:[{StationCode:'EW12',LiftDesc:'key SECRET',LiftID:'SECRET'}]})});
  const result=await adapter({LTA_ACCOUNT_KEY:'SECRET'});assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!JSON.stringify(result).includes('fixture'));
});
test('upstream retry-after is respected without fetching again early',async()=>{
  let at=now,calls=0;const adapter=createFacilityAdapter({clock:()=>at,fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'3600'}});}});
  const result=await adapter({LTA_ACCOUNT_KEY:'key'});assert.equal(Date.parse(result.nextRefreshAt),now+3600000);at+=600000;await adapter({LTA_ACCOUNT_KEY:'key'});assert.equal(calls,1);
});
test('coverage registry records real shortcomings without converting existing station footprints',()=>{
  assert.equal(COVERAGE_REGISTRY.accessibleDoorToDoor,false);assert.equal(stationLayout('EW12').id,'bugis');assert.equal(stationLayout('Nonexistent'),null);
  for(const s of COVERAGE_REGISTRY.stations){assert.equal(s.edges.length,0);assert.equal(s.nodes.length,0);}
});
