import test from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURE_LAYOUT,fixtureStatuses,stationLayout} from '../src/facility-data.js';
import {rankToilets,toiletOpeningAt,toiletAvailability,previewToiletDetour,detourStillFeasible} from '../src/toilet-engine.js';
const now=Date.parse('2026-09-18T08:00:00Z');
const options=(scenario='none',more={})=>({from:'platform',onward:'platform',allowFixtures:true,now,arrivalBaseMs:now,statuses:fixtureStatuses(scenario,now),...more});

test('toilet rank uses connected usable path, then goes back to original onward checkpoint',()=>{
  const list=rankToilets(FIXTURE_LAYOUT,options());assert.equal(list[0].toilet.id,'fixture-toilet-a');assert.equal(list[0].outbound.seconds,80);assert.equal(list[0].returnPath.nodes.at(-1),'platform');
  assert.equal(list[0].seconds,160);assert.equal(list[0].walkingSeconds,100);
});
test('wheelchair toilet behind unavailable lift is excluded and independent alternative wins',()=>{
  const list=rankToilets(FIXTURE_LAYOUT,options('lift-outage'));assert.equal(list[0].toilet.id,'fixture-toilet-b');assert.equal(list.find(r=>r.toilet.id==='fixture-toilet-a').status,'excluded');assert.equal(list[0].status,'suitable');assert.ok(!list[0].outbound.facilityIds.includes('fixture-lift-a'));
});
test('toilet accessibility and usable step-free entrance are distinct checks',()=>{
  const layout=structuredClone(FIXTURE_LAYOUT);layout.toilets[0].wheelchair=false;
  assert.equal(rankToilets(layout,options()).find(r=>r.toilet.id==='fixture-toilet-a').status,'excluded');
  layout.toilets[0].wheelchair=null;
  assert.equal(rankToilets(layout,options('none',{profile:{stepFree:false,wheelchairToilet:true}})).find(r=>r.toilet.id==='fixture-toilet-a').status,'unknown');
});
test('unknown attributes, access, hours and paths never become verified suitable or get exact time',()=>{
  const results=rankToilets(stationLayout('bugis'),{from:null,now});assert.equal(results.length,1);assert.equal(results[0].status,'unknown');assert.equal(results[0].seconds,null);assert.equal(results[0].outbound.feasible,false);assert.equal(results[0].toilet.wheelchair,null);assert.equal(results[0].toilet.feeCents,null);
  assert.throws(()=>previewToiletDetour(stationLayout('bugis'),results[0]),/supported usable/);
});
test('arrival-time opening check excludes a toilet closing before the traveller arrives',()=>{
  const layout=structuredClone(FIXTURE_LAYOUT);layout.toilets[0].openingHours={timezone:'Asia/Singapore',weekly:[{days:[5],startMinute:0,endMinute:16*60+1}]};
  const result=rankToilets(layout,options()).find(r=>r.toilet.id==='fixture-toilet-a');assert.equal(result.availability.status,'scheduled-closed');assert.equal(result.status,'excluded');
});
test('weekly and overnight hours honor Singapore day boundaries',()=>{
  const hours={timezone:'Asia/Singapore',weekly:[{days:[5],startMinute:23*60,endMinute:60}]};
  assert.equal(toiletOpeningAt(hours,Date.parse('2026-09-18T16:30:00Z')).status,'scheduled-open');
  assert.equal(toiletOpeningAt(hours,Date.parse('2026-09-18T17:00:00Z')).status,'scheduled-closed');
  assert.equal(toiletOpeningAt(null,now).status,'unknown');assert.equal(toiletOpeningAt({timezone:'UTC',always:true},now).status,'unknown');
});
test('stale closure report is retained; stale available report is not a fresh availability claim',()=>{
  const toilet={...FIXTURE_LAYOUT.toilets[0],report:{status:'reported-unavailable',fetchedAt:new Date(now-86400000).toISOString()}};
  assert.equal(toiletAvailability(toilet,now,now,true).status,'reported-closed');
  toilet.report={status:'verified-available',evidence:'operator',fetchedAt:new Date(now-86400000).toISOString(),validUntil:new Date(now+86400000).toISOString()};assert.equal(toiletAvailability(toilet,now,now,true).status,'scheduled-open');assert.equal(toiletAvailability(toilet,now,now,true).stale,true);
});
test('onboard search only considers confirmed upcoming station context',()=>{
  const list=rankToilets(FIXTURE_LAYOUT,options('none',{positionKind:'onboard',upcomingStationIds:['bugis']}));assert.ok(list.every(r=>r.status==='excluded'));
  const reachable=rankToilets(FIXTURE_LAYOUT,options('none',{positionKind:'onboard',upcomingStationIds:['fixture-interchange']}));assert.equal(reachable[0].status,'suitable');
});
test('round trip walking budget applies to outbound plus onward rather than only proximity',()=>{
  const list=rankToilets(FIXTURE_LAYOUT,options('none',{walkingLimitSeconds:75}));assert.ok(list.every(r=>r.status!=='suitable'));
});
test('detour preview preserves original destination, timing, gate consequences and manual lifecycle instructions',()=>{
  const result=rankToilets(FIXTURE_LAYOUT,options())[0],destination={id:'destination',label:'Appointment entrance'},preview=previewToiletDetour(FIXTURE_LAYOUT,result,{originalDestination:destination,breakMinutes:7,now});
  assert.deepEqual(preview.originalDestination,destination);assert.equal(preview.addedSeconds,580);assert.equal(preview.fixture,true);assert.equal(preview.verified,false);assert.equal(preview.fareImpact.status,'unchanged-integrated-route');assert.equal(preview.breakMinutes,7);assert.ok(preview.steps.some(s=>s.text.includes('Resume journey')));
  const outside=rankToilets(FIXTURE_LAYOUT,options()).find(r=>r.toilet.id==='fixture-toilet-c'),outsidePreview=previewToiletDetour(FIXTURE_LAYOUT,outside,{now});assert.equal(outsidePreview.gateCrossings,2);assert.equal(outsidePreview.fareImpact.status,'recalculation-required');
});
test('changed facility conditions require a replacement proposal rather than silently mutating accepted stop',()=>{
  const accepted=previewToiletDetour(FIXTURE_LAYOUT,rankToilets(FIXTURE_LAYOUT,options())[0],{now}),copy=structuredClone(accepted),check=detourStillFeasible(FIXTURE_LAYOUT,accepted,options('lift-outage'));
  assert.equal(check.feasible,false);assert.equal(check.replacement.toilet.id,'fixture-toilet-b');assert.deepEqual(accepted,copy);
});
test('fixtures and unknown position cannot be promoted to real directions',()=>{
  assert.ok(rankToilets(FIXTURE_LAYOUT,{...options(),allowFixtures:false}).every(r=>r.status!=='suitable'));
  assert.ok(rankToilets(FIXTURE_LAYOUT,{...options(),from:'unknown'}).every(r=>r.status!=='suitable'));
  assert.throws(()=>rankToilets(FIXTURE_LAYOUT,options('none',{breakMinutes:-1})),/break/);
});
