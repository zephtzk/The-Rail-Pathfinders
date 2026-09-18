import {acceptJourney,confirmProgress,compareJourney} from '../src/journey-state.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMultimodalRouter} from '../src/multimodal-engine.js';

// Synthetic reference network. Expected totals below are calculated explicitly,
// independently of router helpers, and do not establish field walking or traffic times.
const sec = value => { const [hours,minutes] = value.split(':').map(Number); return hours*3600+minutes*60; };
const time = (stop,clock) => [stop,sec(clock),sec(clock),true,true];
const query = {originId:'bus:01001',destinationId:'bus:01003',date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:10,preference:'fastest',maxExtraMinutes:15};
const occurrence = (stopId,sequence,distanceKm,visitNumber = 1) => ({stopId,sequence,distanceKm,visitNumber,firstLast:{WD:[sec('06:00'),sec('23:00')]}});
const pattern = (id,stops,direction = 1) => ({id,serviceNo:id,operator:'SBST',direction,originCode:stops[0].stopId,destinationCode:stops.at(-1).stopId,headways:{AM_Offpeak_Freq:[5,10]},stops});
function fixture() {
  const rail = {
    schemaVersion:1,timeZone:'Asia/Singapore',
    stations:['A','X','D'].map(id => ({id,name:`Rail ${id}`,stopIds:[id.toLowerCase()]})),
    stops:['A','X','D'].map(id => ({id:id.toLowerCase(),stationId:id,name:id,lat:1,lon:103})),
    routes:[{id:'rail',name:'Reference rail'}],
    services:[{id:'daily',startDate:'2026-09-01',endDate:'2026-09-30',weekdays:[0,1,2,3,4,5,6],exceptions:{}}],
    trips:[
      {id:'AX',routeId:'rail',serviceId:'daily',directionId:1,stopTimes:[time('a','10:03'),time('x','10:13')]},
      {id:'XD',routeId:'rail',serviceId:'daily',directionId:1,stopTimes:[time('x','10:20'),time('d','10:30')]},
      {id:'XD-later',routeId:'rail',serviceId:'daily',directionId:1,stopTimes:[time('x','10:40'),time('d','10:50')]}
    ],
    transfers:[{fromStopId:'x',toStopId:'x',seconds:60,walkSeconds:0,assumed:true,provenance:'Synthetic minimum train-change allowance'}],
    coverage:{startDate:'2026-09-01',endDate:'2026-09-30'},assumptions:{accessSeconds:120,exitSeconds:120}
  };
  const bus = {
    schemaVersion:1,coverage:{validFrom:'2026-09-18',validThrough:'2026-09-30',earliestSeconds:sec('09:30'),latestSeconds:sec('16:30'),excludedDates:[]},
    assumptions:{rideSpeedKph:18,dwellSecondsPerStop:30},
    stops:['01001','01002','01003','01011','01012','01013'].map(id => ({id,name:`Bus ${id}`,lat:1,lon:103})),
    patterns:[pattern('7',[occurrence('01001',1,0),occurrence('01002',2,1.5),occurrence('01003',3,3)])]
  };
  const walking = {links:[{id:'reviewed-reference',enabled:true,busStopId:'01002',railStationId:'X',railPlatformIds:['x'],externalSeconds:90,railAllowanceSeconds:120,directionality:'bidirectional',entrance:'Synthetic entrance',sourceUrls:['https://example.invalid/synthetic-pedestrian-fixture']}]};
  return {rail,bus,walking};
}
const build = ({rail,bus,walking},options) => createMultimodalRouter(rail,bus,walking,options);
function components(route,expected) {
  for (const [field,value] of Object.entries(expected)) assert.equal(route[field],value,field);
  assert.equal(route.totalSeconds,route.legs.reduce((sum,leg) => sum+leg.durationSeconds,0));
  assert.equal(route.arrivalSeconds-route.departureSeconds,route.totalSeconds);
  assert.equal(route.totalSeconds,route.accessSeconds+route.waitSeconds+route.rideSeconds+route.transferSeconds+route.exitSeconds);
  assert.equal(route.walkingSeconds,route.accessSeconds+route.transferWalkSeconds+route.exitSeconds);
  let last = route.departureSeconds;
  for (const leg of route.legs) { assert.equal(leg.startSeconds,last); assert.equal(leg.endSeconds-leg.startSeconds,leg.durationSeconds); last=leg.endSeconds; }
  assert.equal(last,route.arrivalSeconds);
}

test('direct bus arithmetic uses maximum-headway waiting and distance plus each traversed-stop dwell',() => {
  const result = build(fixture()).route(query);
  assert.equal(result.status,'ok');
  // 10:00 + 10 min maximum-headway wait + 10 min to cover 3 km at 18 km/h
  // + 2*30s stop dwell = 10:21. Bus-stop endpoints add no rail access/exit.
  components(result.recommended,{arrivalSeconds:sec('10:21'),totalSeconds:1260,accessSeconds:0,waitSeconds:600,rideSeconds:660,transferSeconds:0,exitSeconds:0,walkingSeconds:0,transfers:0});
  assert.equal(result.recommended.estimated,true);
  assert.equal(result.recommended.legs.find(leg => leg.type === 'ride').timing,'frequency-estimated');
  assert.ok(result.recommended.assumptions.some(text => /not guaranteed/.test(text)));
  assert.ok(result.recommended.assumptions.some(text => /not an exact departure/.test(text)));
});

test('bus to rail meets a feasible train with one exterior path and one indoor allowance',() => {
  const result = build(fixture()).route({...query,destinationId:'D'});
  assert.equal(result.status,'ok');
  // Bus 10:10–10:15:30, walk90+indoor120 => ready10:19, rail10:20–10:30,
  // exit120 => 10:32. Total 600+330+210+60+600+120 = 1,920s.
  components(result.recommended,{arrivalSeconds:sec('10:32'),totalSeconds:1920,accessSeconds:0,waitSeconds:660,rideSeconds:930,transferSeconds:210,exitSeconds:120,walkingSeconds:330,transfers:1});
  assert.deepEqual(result.recommended.legs.filter(leg => leg.type === 'ride').map(leg => leg.mode),['bus','rail']);
  assert.equal(result.recommended.legs.find(leg => leg.type === 'transfer').pathId,'reviewed-reference');
});

test('rail to bus accounts for endpoint access, full pedestrian allowance and a fresh bus wait',() => {
  const result = build(fixture()).route({...query,originId:'A'});
  assert.equal(result.status,'ok');
  // Access10:00–10:02, rail10:03–10:13, path210 => ready10:16:30,
  // bus wait600 + ride330 => 10:32; no exit charge at bus stop.
  components(result.recommended,{arrivalSeconds:sec('10:32'),totalSeconds:1920,accessSeconds:120,waitSeconds:660,rideSeconds:930,transferSeconds:210,exitSeconds:0,walkingSeconds:330,transfers:1});
  assert.deepEqual(result.recommended.legs.filter(leg => leg.type === 'ride').map(leg => leg.mode),['rail','bus']);
});

test('missed rail connection waits for a genuinely later scheduled service',() => {
  const data = fixture();
  data.rail.trips.find(trip => trip.id === 'XD').stopTimes = [time('x','10:18'),time('d','10:28')];
  const result = build(data).route({...query,destinationId:'D'});
  assert.equal(result.status,'ok');
  assert.equal(result.recommended.arrivalSeconds,sec('10:52'));
  assert.equal(result.recommended.legs.find(leg => leg.mode === 'rail').tripId,'XD-later');
  assert.ok(result.recommended.legs.some(leg => leg.type === 'wait' && leg.durationSeconds === 21*60));
});

test('same physical stop bus transfer includes change allowance and separate waiting',() => {
  const data = fixture();
  data.bus.patterns = [pattern('7',[occurrence('01001',1,0),occurrence('01002',2,1.5)]),pattern('8',[occurrence('01002',1,0),occurrence('01003',2,1.5)])];
  const result = build(data,{busOnly:true}).route(query);
  assert.equal(result.status,'ok');
  // 600 wait +330 ride +60 change +600 wait +330 ride = 1,920s.
  components(result.recommended,{arrivalSeconds:sec('10:32'),totalSeconds:1920,accessSeconds:0,waitSeconds:1200,rideSeconds:660,transferSeconds:60,exitSeconds:0,walkingSeconds:0,transfers:1});
});

test('bus alternatives preserve preference budgets and explicitly disclose unavailable crowding',() => {
  const data = fixture();
  data.bus.patterns.push(
    {...pattern('8',[occurrence('01001',1,0),occurrence('01002',2,1.5)]),headways:{AM_Offpeak_Freq:[1,2]}},
    {...pattern('9',[occurrence('01002',1,0),occurrence('01003',2,1.5)]),headways:{AM_Offpeak_Freq:[1,2]}}
  );
  const router = build(data,{busOnly:true});
  // Two short-headway buses:120+330+60+120+330=960s (10:16).
  // One direct bus takes1,260s (10:21), exactly five minutes more.
  const fastest = router.route(query).recommended;
  assert.equal(fastest.arrivalSeconds,sec('10:16')); assert.equal(fastest.transfers,1);
  const preferred = router.route({...query,preference:'fewer-transfers',maxExtraMinutes:5}).recommended;
  assert.equal(preferred.arrivalSeconds,sec('10:21')); assert.equal(preferred.transfers,0);
  assert.equal(router.route({...query,preference:'fewer-transfers',maxExtraMinutes:4}).recommended.transfers,1);
  const quieter = router.route({...query,preference:'quieter'}).recommended;
  assert.equal(quieter.arrivalSeconds,sec('10:16')); assert.equal(quieter.crowding,null);
  assert.ok(quieter.assumptions.some(text => text.includes('crowding is unavailable')));
});

test('repeated stop visits keep their occurrence sequence rather than collapsing the loop',() => {
  const data = fixture();
  data.bus.patterns = [pattern('loop',[occurrence('01001',1,0),occurrence('01002',2,1.5),occurrence('01001',3,3,2),occurrence('01003',4,4.5)])];
  const result = build(data).route(query), ride = result.recommended.legs.find(leg => leg.type === 'ride');
  assert.equal(result.status,'ok');
  assert.equal(ride.fromSequence,3); assert.equal(ride.toSequence,4); assert.equal(ride.visitNumber,2);
  assert.equal(ride.durationSeconds,330); assert.equal(result.recommended.arrivalSeconds,sec('10:15')+30);
  const through = build(data).route({...query,originId:'bus:01002'}).recommended;
  assert.deepEqual(through.legs.find(leg => leg.type === 'ride').stopIds,['bus:01002','bus:01001','bus:01003']);
  assert.equal(through.rideSeconds,660,'the repeated intermediate visit retains its distance and dwell');
});

test('opposite-direction stops and coincident coordinates never imply a connection',() => {
  const data = fixture();
  data.bus.patterns.push(pattern('7-reverse',[occurrence('01013',1,0),occurrence('01012',2,1.5),occurrence('01011',3,3)],2));
  const router = build(data);
  assert.equal(router.route({...query,originId:'bus:01003',destinationId:'bus:01001'}).status,'disconnected');
  assert.equal(router.route({...query,originId:'bus:01013',destinationId:'bus:01011'}).recommended.legs.find(leg => leg.type === 'ride').directionId,2);
  assert.equal(router.route({...query,destinationId:'bus:01012'}).status,'disconnected');
});

test('only enabled path directionality permits bus/rail transfers',() => {
  const data = fixture();
  data.walking.links[0].directionality = 'bus-to-rail';
  assert.equal(build(data).route({...query,destinationId:'D'}).status,'ok');
  assert.equal(build(data).route({...query,originId:'A'}).status,'disconnected');
  data.walking.links[0].enabled = false;
  assert.equal(build(data).route({...query,destinationId:'D'}).status,'disconnected');
});

test('two pedestrian links never create an unreviewed walk through a station',() => {
  const data = fixture();
  data.bus.patterns = [pattern('7',[occurrence('01001',1,0),occurrence('01002',2,1.5)]),pattern('8',[occurrence('01012',1,0),occurrence('01013',2,1.5)])];
  data.walking.links.push({...data.walking.links[0],id:'second-reference',busStopId:'01012'});
  assert.notEqual(build(data).route({...query,destinationId:'bus:01013'}).status,'ok');
  // A real intervening train ride makes two separate reviewed exterior transfers
  // valid: bus10:15:30 +path210, train10:20–10:30 +path210, wait600+ride330.
  data.walking.links[1].railStationId = 'D';
  data.walking.links[1].railPlatformIds = ['d'];
  const result = build(data).route({...query,destinationId:'bus:01013'});
  assert.equal(result.status,'ok');
  components(result.recommended,{arrivalSeconds:sec('10:49'),totalSeconds:2940,accessSeconds:0,waitSeconds:1260,rideSeconds:1260,transferSeconds:420,exitSeconds:0,walkingSeconds:420,transfers:2});
});

test('rail endpoints require a rail ride on their applicable side rather than charging indoor access twice',() => {
  const router = build(fixture());
  // X has the exterior bus link. A rail-station origin cannot enter the platform
  // for120s then immediately leave it for another120s just to catch a bus.
  const origin = router.route({...query,originId:'X'});
  assert.notEqual(origin.status,'ok');
  assert.equal(origin.recommended,null);
  // Nor may an arriving bus walk to X's platform then pay another station exit.
  const destination = router.route({...query,destinationId:'X'});
  assert.notEqual(destination.status,'ok');
  assert.equal(destination.recommended,null);
  // Using the reviewed walk after an actual rail ride remains permitted, and a
  // bus-stop endpoint pays the link's one indoor allowance but no station exit.
  const stopEndpoint = router.route({...query,originId:'A',destinationId:'bus:01002'});
  assert.equal(stopEndpoint.status,'ok');
  components(stopEndpoint.recommended,{arrivalSeconds:sec('10:16')+30,totalSeconds:990,accessSeconds:120,waitSeconds:60,rideSeconds:600,transferSeconds:210,exitSeconds:0,walkingSeconds:330,transfers:0});
});

test('walking budget and arrival deadlines include full transfer and station-exit allowances',() => {
  const router = build(fixture());
  assert.equal(router.route({...query,destinationId:'D',walkingLimitMinutes:5}).status,'no-feasible');
  assert.equal(router.route({...query,destinationId:'D',walkingLimitMinutes:5.5,deadlineTime:'10:32'}).status,'ok');
  assert.equal(router.route({...query,destinationId:'D',walkingLimitMinutes:5.5,deadlineTime:'10:31'}).status,'deadline');
  assert.equal(router.route({...query,deadlineTime:'10:21',walkingLimitMinutes:0}).status,'ok');
  assert.equal(router.route({...query,deadlineTime:'10:20'}).status,'deadline');
});

test('each boarding and alighting respects last-service and the declared estimate window',() => {
  const lastBoarding = fixture();
  lastBoarding.bus.patterns[0].stops[0].firstLast.WD[1] = sec('10:09');
  assert.notEqual(build(lastBoarding).route(query).status,'ok','cannot invent boarding after the last bus bound');
  const lastAlighting = fixture();
  lastAlighting.bus.patterns[0].stops[2].firstLast.WD[1] = sec('10:20');
  assert.notEqual(build(lastAlighting).route(query).status,'ok','cannot propagate a ride beyond an alighting last-service bound');
  assert.notEqual(build(fixture()).route({...query,departureTime:'16:20'}).status,'ok','arrival after16:30 is outside supported timing');
  assert.equal(build(fixture()).route({...query,departureTime:'16:30'}).status,'unsupported-bus-window');
});

test('weekends, excluded dates, peak and overnight bus requests fail explicitly while rail keeps its wider calendar',() => {
  const data = fixture(); data.bus.coverage.excludedDates = ['2026-09-21'];
  const router = build(data);
  for (const changes of [{date:'2026-09-19'},{date:'2026-09-21'},{date:'2026-10-01'},{departureTime:'09:29'},{departureTime:'23:55'},{departureTime:'00:10'}]) {
    assert.equal(router.route({...query,...changes}).status,'unsupported-bus-window',JSON.stringify(changes));
  }
  const rail = router.route({...query,originId:'A',destinationId:'D',date:'2026-09-20'});
  assert.equal(rail.status,'ok'); assert.equal(rail.recommended.estimated,false);
});

test('unsupported timing patterns are excluded instead of being assigned departures',() => {
  const data = fixture(); data.bus.patterns[0].timingSupported = false;
  assert.equal(build(data).route(query).status,'disconnected');
});

test('explicit rail-disruption fixture leaves a bus alternative labelled synthetic without claiming live closures',() => {
  const router = build(fixture(),{closedRailRouteIds:['rail']});
  const route = router.route(query).recommended;
  assert.equal(route.arrivalSeconds,sec('10:21'));
  assert.ok(route.assumptions.some(text => /SYNTHETIC DISRUPTION FIXTURE/.test(text) && /Not a live closure/.test(text)));
  assert.ok(route.legs.filter(leg => leg.type === 'ride').every(leg => leg.mode === 'bus'));
  assert.notEqual(router.route({...query,destinationId:'D'}).status,'ok');
});

test('confirmed bus alighting oracle: 10:17 +210s misses 10:20 train; 10:52 is seven minutes late',()=>{
 const data=fixture(),router=build(data),input={...query,destinationId:'D',deadlineDate:'2026-09-18',deadlineTime:'10:45'};
 let state=acceptJourney(router.route(input).recommended,input,'reference');
 const index=state.route.legs.findIndex(l=>l.type==='transfer');
 state=confirmProgress(state,{kind:'transferring',legIndex:index,confirmedSeconds:sec('10:17'),walkedSeconds:0});
 const comparison=compareJourney(state,router);
 assert.equal(comparison.continuing.feasible,false);
 assert.equal(comparison.status,'all-late');assert.equal(comparison.alternative.arrivalSeconds,sec('10:52'));
 assert.equal(comparison.alternative.walkingSeconds,330);assert.equal(comparison.alternative.deadlineBufferSeconds,-420);
});
