import test from 'node:test';
import assert from 'node:assert/strict';
import {publicStationLabel,publicLineName,publicInstruction,itineraryStepLabel,itineraryDisplay,checkpointChoices,itineraryGuidance,renderItineraryTimeline} from '../src/itinerary-display.js';
import {routeFromLegacy,startJourney,confirmCheckpoint,saveActive,restoreActive} from '../src/journey-v2.js';
import {acceptJourney} from '../src/journey-state.js';

const labels = {
  CC26_B:'Pasir Panjang (CC26_B)', CC22_B:'Buona Vista (CC22_B)',
  EW21_A:'Buona Vista (EW21_A)', EW9_A:'Aljunied (EW9_A)',
  'bus:70251':'MacPherson Stn Exit C (bus:70251)', 'bus:75009':'Tampines Int (bus:75009)',
};
const name = id => labels[id] ?? id;
function routeFixture() {
  let cursor = 36000;
  const phases = [
    {type:'access',fromStopId:'CC26_B',toStopId:'CC26_B',durationSeconds:120,assumed:true},
    {type:'wait',fromStopId:'CC26_B',toStopId:'CC26_B',durationSeconds:80},
    {type:'ride',mode:'rail',routeId:'CCL_LOOP',fromStopId:'CC26_B',toStopId:'CC22_B',durationSeconds:420,stopIds:['CC26_B','CC25_B','CC22_B']},
    {type:'transfer',fromStopId:'CC22_B',toStopId:'EW21_A',durationSeconds:240,assumed:true},
    {type:'wait',fromStopId:'EW21_A',toStopId:'EW21_A',durationSeconds:40},
    {type:'ride',mode:'rail',routeId:'EWL',fromStopId:'EW21_A',toStopId:'EW9_A',durationSeconds:1500},
    {type:'exit',fromStopId:'EW9_A',toStopId:'EW9_A',durationSeconds:120,assumed:true},
  ];
  const legs = phases.map(phase => {
    const leg = {...phase,startSeconds:cursor,endSeconds:cursor + phase.durationSeconds};
    cursor = leg.endSeconds;
    return leg;
  });
  return {id:'r4-circle-eastwest',departureSeconds:36000,arrivalSeconds:cursor,deadlineSeconds:null,walkingSeconds:480,legs};
}
const input = {date:'2026-09-21',originId:'CC26_B',destinationId:'EW9_A',departureTime:'10:00',walkingLimitMinutes:30};
const planFixture = () => routeFromLegacy(routeFixture(), input, {name});
function freezeDeep(value) {
  for (const item of Object.values(value ?? {})) if (item && typeof item === 'object') freezeDeep(item);
  return Object.freeze(value);
}

test('public labels keep platform routing IDs intact while displaying real codes and line names', () => {
  assert.equal(publicStationLabel('Pasir Panjang (CC26_B)'), 'Pasir Panjang (CC26)');
  assert.equal(publicStationLabel('MacPherson (bus:70251)'), 'MacPherson (70251)');
  assert.equal(publicStationLabel('EW21_A / CC22_B'), 'EW21 / CC22');
  assert.equal(publicLineName('CCL_PPJ_PMN_1ST_TRAIN'), 'Circle Line');
  assert.equal(publicLineName('EWL_CGL'), 'East West Line');
  assert.equal(publicLineName('PG'), 'Punggol LRT');
  assert.equal(publicInstruction('Wait for EW Line at Aljunied (EW9_A)'), 'Wait for East West Line at Aljunied (EW9)');
});

test('same-location access/wait and transfer/wait form five timed groups without losing any canonical phase', () => {
  const route = freezeDeep(planFixture().route), before = JSON.stringify(route), groups = itineraryDisplay(route, {name});
  assert.deepEqual(groups.map(group => group.canonicalIndices), [[0,1],[2],[3,4],[5],[6]]);
  assert.deepEqual(groups.flatMap(group => group.canonicalIndices), [0,1,2,3,4,5,6]);
  assert.equal(groups.reduce((sum,group) => sum + group.durationSeconds, 0), route.arrivalSeconds - route.departureSeconds);
  assert.equal(groups[0].durationSeconds, 200);
  assert.equal(groups[2].durationSeconds, 280);
  assert.equal(groups[2].startSeconds, route.steps[3].source.startSeconds);
  assert.equal(groups[2].endSeconds, route.steps[4].source.endSeconds);
  assert.equal(JSON.stringify(route), before);
});

test('a same-name Circle to East West interchange remains an explicit meaningful choice', () => {
  const groups = itineraryDisplay(planFixture().route, {name});
  assert.equal(groups[2].kind, 'transfer');
  assert.equal(groups[2].title, 'Change Circle Line → East West Line at Buona Vista (CC22)');
  const choice = checkpointChoices(planFixture().route, {name})[2];
  assert.equal(choice.stepIndex, 3);
  assert.equal(choice.kind, 'checkpoint');
  assert.match(choice.label, /Circle Line → East West Line/);
});

test('choices show recognisable actions without raw numbering, headers or repeated endpoint rows', () => {
  const choices = checkpointChoices(planFixture().route, {name});
  assert.deepEqual(choices.map(choice => choice.stepIndex), [0,2,3,5,6]);
  assert.equal(choices[0].label, 'At Pasir Panjang (CC26) · before boarding');
  assert.equal(choices[1].label, 'On Circle Line · Pasir Panjang (CC26) → Buona Vista (CC22)');
  assert.equal(choices[4].label, 'At Aljunied (EW9) · leaving the station');
  assert.doesNotMatch(choices.map(choice => choice.label).join(' '), /\b(?:access|wait|exit):|_A|_B|CCL_LOOP|\b\d+\./);
});

test('every current canonical phase survives choice grouping, explicit confirmation and reload', () => {
  const plan = planFixture();
  for (let index = 0; index < plan.route.steps.length; index++) {
    let active = startJourney(plan, 100);
    active.routingContext = acceptJourney(routeFixture(), input, 'r4-test', 100);
    const originalLegs = structuredClone(active.routingContext.route.legs);
    active = confirmCheckpoint(active, {stepIndex:index,kind:plan.route.steps[index].type === 'ride' ? 'onboard' : 'checkpoint'}, 200);
    const choices = checkpointChoices(active.route, {name,currentStepIndex:active.progress.stepIndex});
    const selected = choices.find(choice => choice.canonicalIndices.includes(index));
    assert.equal(selected.stepIndex, index, `phase ${index} must not jump within its display group`);
    active = confirmCheckpoint(active, {stepIndex:selected.stepIndex,kind:selected.kind}, 300);
    assert.equal(active.progress.stepIndex, index);
    assert.equal(active.status, 'started', 'no grouped phase automatically completes the journey');
    assert.deepEqual(active.routingContext.route.legs, originalLegs);
    let raw;
    const storage = {setItem:(_,value) => {raw = value;},getItem:() => raw};
    assert.equal(saveActive(storage, active), true);
    const restored = restoreActive(storage);
    assert.equal(restored.progress.stepIndex, index);
    assert.deepEqual(checkpointChoices(restored.route, {name,currentStepIndex:index}), choices);
  }
});

test('grouped origin never auto-confirms boarding and a ride must be explicitly selected', () => {
  const active = startJourney(planFixture(), 100), before = JSON.stringify(active);
  const choices = checkpointChoices(active.route, {name,currentStepIndex:0});
  assert.equal(JSON.stringify(active), before);
  const atStation = confirmCheckpoint(active, {stepIndex:choices[0].stepIndex,kind:choices[0].kind}, 200);
  assert.equal(atStation.progress.stepIndex, 0);
  assert.equal(atStation.progress.kind, 'checkpoint');
  const onboard = confirmCheckpoint(atStation, {stepIndex:choices[1].stepIndex,kind:choices[1].kind}, 300);
  assert.equal(onboard.progress.stepIndex, 2);
  assert.equal(onboard.progress.kind, 'onboard');
});

test('same-stop bus transfer and a same-stop ride never disappear as cosmetic phases', () => {
  const common = {fromStopId:'bus:70251',toStopId:'bus:70251',durationSeconds:60};
  const route = {departureSeconds:36000,legs:[
    {...common,type:'ride',mode:'bus',serviceNo:'28'},
    {...common,type:'transfer'},
    {...common,type:'wait'},
    {...common,type:'ride',mode:'bus',serviceNo:'23'},
  ]};
  const groups = itineraryDisplay(route, {name});
  assert.deepEqual(groups.map(group => group.canonicalIndices), [[0],[1,2],[3]]);
  assert.match(groups[1].title, /Change Bus 28 → Bus 23/);
  assert.equal(checkpointChoices(route, {name})[1].stepIndex, 1);
});

test('different canonical stops are not collapsed because their station names happen to match', () => {
  const route = {departureSeconds:36000,legs:[
    {type:'access',fromStopId:'CC22_B',toStopId:'CC22_B',durationSeconds:120},
    {type:'wait',fromStopId:'EW21_A',toStopId:'EW21_A',durationSeconds:60},
    {type:'transfer',fromStopId:'EW21_A',toStopId:'EW21_A',durationSeconds:60},
    {type:'transfer',fromStopId:'EW21_A',toStopId:'CC22_B',durationSeconds:60},
  ]};
  assert.deepEqual(itineraryDisplay(route, {name}).map(group => group.canonicalIndices), [[0],[1],[2],[3]]);
});

test('exit stays a separate explicit alighting/checkpoint action before any later access', () => {
  const common = {fromStopId:'EW9_A',toStopId:'EW9_A',durationSeconds:60};
  const route = {departureSeconds:36000,legs:['ride','exit','access','wait','ride'].map(type => ({...common,type,routeId:'EWL',mode:'rail'}))};
  assert.deepEqual(itineraryDisplay(route, {name}).map(group => group.canonicalIndices), [[0],[1],[2,3],[4]]);
});

test('saved and shared plans retain human station names without a local name lookup', () => {
  const route = planFixture().route;
  const withoutNames = itineraryDisplay(route);
  assert.equal(withoutNames[1].from, 'Pasir Panjang (CC26)');
  assert.equal(withoutNames[1].to, 'Buona Vista (CC22)');
  assert.doesNotMatch(renderItineraryTimeline(route), /_A|_B|CCL_LOOP|EWL train/);
});

test('current guidance names the exact phase but Next skips cosmetic repeated waiting', () => {
  const route = planFixture().route;
  const start = itineraryGuidance(route, {name,currentStepIndex:0});
  assert.match(start.current, /Start at Pasir Panjang/);
  assert.match(start.next, /Ride Circle Line/);
  const waiting = itineraryGuidance(route, {name,currentStepIndex:1});
  assert.match(waiting.current, /Wait at Pasir Panjang .* for Circle Line/);
  assert.equal(waiting.next, start.next);
  const changing = itineraryGuidance(route, {name,currentStepIndex:3});
  assert.match(changing.current, /Change Circle Line → East West Line/);
  assert.match(changing.next, /Ride East West Line/);
  assert.match(itineraryGuidance(route, {name,currentStepIndex:6}).next, /Confirm arrival/);
});

test('authored facility directions stay intact and are never inferred to be station access', () => {
  const route = {departureSeconds:36000,steps:[
    {id:'facility-1',text:'Take the verified fixture lift to Level 2',durationSeconds:45},
    {id:'facility-2',text:'Pass fixture gate A and follow signs to the toilet',durationSeconds:30},
  ]};
  const groups = itineraryDisplay(route);
  assert.equal(groups[0].title, route.steps[0].text);
  assert.equal(groups[1].title, route.steps[1].text);
  assert.equal(groups[1].endSeconds, 36075);
});

test('timeline retains seconds, overnight civil-day offsets and estimated bus timing', () => {
  const route = {departureSeconds:86340,legs:[
    {type:'ride',mode:'bus',serviceNo:'23',fromStopId:'bus:70251',toStopId:'bus:75009',durationSeconds:125,startSeconds:86340,endSeconds:86465,timing:'frequency-estimated'},
  ]};
  const html = renderItineraryTimeline(route, {name,currentStepIndex:0});
  assert.match(html, /23:59–00:01 \(\+1 day\)/);
  assert.match(html, /2 min 5 sec · estimated/);
  assert.match(html, /aria-current="step"/);
  assert.doesNotMatch(html, /direction 1|terminal|bus:|platform/);
});

test('timeline escapes untrusted names and exposes all underlying phase indices as safe integers', () => {
  const html = renderItineraryTimeline(planFixture().route, {name:() => '<img src=x onerror=alert(1)>'});
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /data-step-indices="0,1"/);
  assert.match(html, /data-step-indices="3,4"/);
  assert.match(html, /3 min 20 sec/);
  assert.match(html, /Walking & waiting time/);
});

test('legacy raw legs and accepted canonical steps produce the same display groups', () => {
  const legacy = routeFixture(), accepted = routeFromLegacy(legacy, input, {name}).route;
  assert.deepEqual(itineraryDisplay(legacy, {name}), itineraryDisplay(accepted, {name}));
  assert.equal(itineraryStepLabel(accepted.steps[3], {name,steps:accepted.steps,index:3}), 'Change Circle Line → East West Line at Buona Vista (CC22)');
});
