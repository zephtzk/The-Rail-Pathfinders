import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSavedPilot,validatePilotArrivals,pilotPredictionState,validPilotTimestamp} from '../src/pilot-validation.js';
import {normalizeBusArrivals} from '../server/bus-adapter.js';

function savedGuidance() {
  return {schemaVersion:1,savedAt:'2026-09-18T00:00:00.000Z',build:'synthetic-validated-build',
    input:{originId:'bus:01001',destinationId:'bus:01002',date:'2026-09-18',departureTime:'10:00',deadlineDate:'2026-09-18',deadlineTime:'10:30',walkingLimitMinutes:10,maxExtraMinutes:15,preference:'fastest',mode:'mixed',fixture:'none'},
    labels:[['bus:01001','Origin stop'],['bus:01002','Destination stop']],
    route:{id:'synthetic-route',originId:'bus:01001',destinationId:'bus:01002',date:'2026-09-18',estimated:true,timing:'frequency-estimated',departureSeconds:36000,arrivalSeconds:36930,totalSeconds:930,accessSeconds:0,waitSeconds:600,rideSeconds:330,transferSeconds:0,transferWalkSeconds:0,exitSeconds:0,walkingSeconds:0,transfers:0,deadlineSeconds:37800,deadlineBufferSeconds:870,deadlineMet:true,assumptions:['Synthetic waiting/riding estimate'],legs:[
      {type:'access',fromStopId:'bus:01001',toStopId:'bus:01001',startSeconds:36000,endSeconds:36000,durationSeconds:0,walkingSeconds:0},
      {type:'wait',mode:'bus',timing:'frequency-estimated',fromStopId:'bus:01001',toStopId:'bus:01001',startSeconds:36000,endSeconds:36600,durationSeconds:600},
      {type:'ride',mode:'bus',timing:'frequency-estimated',tripId:'estimate:7:1',routeId:'7',patternId:'7',serviceNo:'7',serviceDate:'2026-09-18',directionId:1,fromSequence:1,toSequence:2,visitNumber:1,stopIds:['bus:01001','bus:01002'],fromStopId:'bus:01001',toStopId:'bus:01002',startSeconds:36600,endSeconds:36930,durationSeconds:330},
      {type:'exit',fromStopId:'bus:01002',toStopId:'bus:01002',startSeconds:36930,endSeconds:36930,durationSeconds:0,walkingSeconds:0}
    ]}
  };
}
const now = Date.parse('2026-09-18T02:00:00Z');
const patterns = [{id:'7',serviceNo:'7',operator:'SBST',originCode:'01001',destinationCode:'01002',direction:1,stops:[{stopId:'01001',sequence:1,visitNumber:1},{stopId:'01002',sequence:2,visitNumber:1}]}];
function liveFeed() {
  return {schemaVersion:1,...normalizeBusArrivals({BusStopCode:'01001',Services:[{ServiceNo:'7',Operator:'SBST',NextBus:{OriginCode:'01001',DestinationCode:'01002',EstimatedArrival:'2026-09-18T10:05:00+08:00',Monitored:1,VisitNumber:'1'},NextBus2:{EstimatedArrival:''},NextBus3:{EstimatedArrival:''}}]},'01001',patterns),retrievedAt:new Date(now).toISOString(),nextRefreshAt:new Date(now+30000).toISOString(),providerHttpDate:new Date(now).toISOString()};
}

test('valid saved pilot guidance is usable with and without an arrival deadline',() => {
  const saved = savedGuidance();
  assert.equal(validateSavedPilot(saved),saved);
  saved.input.deadlineTime=''; saved.route.deadlineSeconds=null; saved.route.deadlineBufferSeconds=null;
  assert.equal(validateSavedPilot(saved),saved);
});

test('malformed saved nested maps, inputs, legs and assumptions are rejected without throwing',() => {
  const mutations = [
    saved => { saved.labels=[null]; }, saved => { saved.labels.push(saved.labels[0]); },
    saved => { saved.labels[0][1]={}; }, saved => { saved.input=null; },
    saved => { saved.input.date='2026-02-30'; }, saved => { saved.input.departureTime='25:00'; },
    saved => { saved.input.deadlineDate='"><img src=x>'; }, saved => { saved.input.walkingLimitMinutes=[]; },
    saved => { saved.input.preference='unknown'; }, saved => { saved.input.mode='unknown'; },
    saved => { saved.route.legs=[null]; }, saved => { saved.route.legs=[]; },
    saved => { saved.route.assumptions=null; }, saved => { saved.route.assumptions=[{}]; },
    saved => { saved.route.legs[0].type='toString'; }, saved => { saved.route.legs[2].stopIds=['unknown']; },
    saved => { saved.route.legs[2].toSequence=0; }, saved => { saved.route.legs[2].visitNumber=0; },
    saved => { saved.route.legs[2].tripId=null; }, saved => { saved.route.legs[2].serviceDate='wrong'; }
  ];
  for (const mutate of mutations) { const saved=savedGuidance(); mutate(saved); assert.equal(validateSavedPilot(saved),null,mutate.toString()); }
  for (const saved of [null,{},[],{schemaVersion:1}]) assert.equal(validateSavedPilot(saved),null);
});

test('saved inconsistent timing, bounds and mode provenance fail closed',() => {
  const mutations = [
    saved => { saved.route.totalSeconds++; }, saved => { saved.route.waitSeconds++; },
    saved => { saved.route.walkingSeconds++; }, saved => { saved.route.transferWalkSeconds++; },
    saved => { saved.route.legs[2].startSeconds++; }, saved => { saved.route.legs[2].durationSeconds++; },
    saved => { saved.route.legs[0].walkingSeconds=1; }, saved => { saved.input.departureTime='10:01'; },
    saved => { saved.route.arrivalSeconds=NaN; }, saved => { saved.route.transfers=1; },
    saved => { saved.route.estimated=false; }, saved => { saved.route.deadlineSeconds--; },
    saved => { saved.route.deadlineBufferSeconds--; }, saved => { saved.route.deadlineMet=false; },
    saved => { saved.route.originId='unknown'; }
  ];
  for (const mutate of mutations) { const saved=savedGuidance(); mutate(saved); assert.equal(validateSavedPilot(saved),null,mutate.toString()); }
});

test('client timestamp validation rejects impossible civil dates and accepts explicit valid offsets',() => {
  for (const value of ['2026-02-30T10:05:00+08:00','2026-09-18T25:00:00Z','2026-09-18T10:61:00Z','2026-09-18T10:05:00','bad',null]) assert.equal(validPilotTimestamp(value),false);
  for (const value of ['2024-02-29T10:05:00+08:00','2026-09-18T02:05:00.000Z']) assert.equal(validPilotTimestamp(value),true);
});

test('normalized live records are accepted only for their exact requested stop and checked pattern occurrence',() => {
  assert.equal(validatePilotArrivals(liveFeed(),'01001',patterns),true);
  assert.equal(validatePilotArrivals(liveFeed(),'01002',patterns),false);
  const mutations = [
    feed => { feed.schemaVersion=2; }, feed => { feed.providerTimestamp='invented'; },
    feed => { feed.retrievedAt='bad'; }, feed => { feed.nextRefreshAt='bad'; },
    feed => { feed.predictions=[null]; }, feed => { feed.predictions[0].predictedArrival='bad'; },
    feed => { feed.predictions[0].predictedArrival='2026-02-30T10:05:00+08:00'; },
    feed => { feed.predictions[0].stopCode='01002'; }, feed => { feed.predictions[0].match.sequence=2; },
    feed => { feed.predictions[0].match.direction=2; }, feed => { feed.predictions[0].match.patternId='7A'; },
    feed => { feed.predictions[0].serviceNo=7; }, feed => { feed.predictions[0].operator='SMRT'; },
    feed => { feed.predictions[0].visitNumber=2; }, feed => { feed.predictions[0].matchStatus='unmatched'; }
  ];
  for (const mutate of mutations) { const feed=liveFeed(); mutate(feed); assert.equal(validatePilotArrivals(feed,'01001',patterns),false,mutate.toString()); }
});

test('empty, partial, unmatched, ambiguous and unavailable feeds preserve their distinct meaning',() => {
  const feed=liveFeed(); feed.predictions=[]; feed.status='empty';
  assert.equal(validatePilotArrivals(feed,'01001',patterns),true);
  feed.status='partial'; assert.equal(validatePilotArrivals(feed,'01001',patterns),true);
  feed.status='unavailable'; feed.retrievedAt=null; assert.equal(validatePilotArrivals(feed,'01001',patterns),true);
  const unmatched=liveFeed(); unmatched.predictions[0].matchStatus='unmatched'; unmatched.predictions[0].match=null;
  assert.equal(validatePilotArrivals(unmatched,'01001',[]),true);
  const ambiguous=liveFeed(); ambiguous.predictions[0].matchStatus='ambiguous'; ambiguous.predictions[0].match=null;
  assert.equal(validatePilotArrivals(ambiguous,'01001',[...patterns,{...patterns[0],id:'variant'}]),true);
});

test('client freshness never labels invalid, expired, future-observation or offline predictions current',() => {
  const feed=liveFeed(), prediction=feed.predictions[0];
  assert.equal(pilotPredictionState(prediction,feed,now,true),'fresh');
  assert.equal(pilotPredictionState(prediction,feed,now,false),'offline');
  assert.equal(pilotPredictionState(prediction,{...feed,status:'unavailable'},now,true),'unavailable');
  assert.equal(pilotPredictionState({...prediction,predictedArrival:'bad'},feed,now,true),'expired');
  assert.equal(pilotPredictionState(prediction,feed,now+90001,true),'expired');
  assert.equal(pilotPredictionState({...prediction,predictedArrival:new Date(now).toISOString()},feed,now,true),'expired');
  assert.equal(pilotPredictionState({...prediction,predictedArrival:new Date(now+7200001).toISOString()},feed,now,true),'expired');
  assert.equal(pilotPredictionState(prediction,{...feed,retrievedAt:new Date(now+5001).toISOString()},now,true),'expired');
  assert.equal(pilotPredictionState({...prediction,matchStatus:'unmatched'},feed,now,true),'unmatched');
});
