import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusTiming,createMultimodalRouter} from '../src/multimodal-engine.js';
import {itineraryStepLabel} from '../src/itinerary-display.js';
import {acceptJourney} from '../src/journey-state.js';

// Synthetic three-stop network: two buses meet at an aggregated terminal code.
const span={WD:[36000,43200],SAT:null,SUN:null};
const stop=(id,sequence,distanceKm)=>({stopId:id,sequence,distanceKm,visitNumber:1,firstLast:span});
const pattern=(id,stops)=>({id,serviceNo:id,operator:'TEST',direction:1,originCode:stops[0].stopId,destinationCode:stops.at(-1).stopId,timingSupported:true,headways:{AM_Offpeak_Freq:[5,10]},stops});
function fixture(){
  const rail={schemaVersion:1,stations:[],stops:[],routes:[],trips:[],services:[],transfers:[],coverage:{startDate:'2026-09-18',endDate:'2026-10-02'},assumptions:{accessSeconds:0,exitSeconds:0}};
  const bus={schemaVersion:1,coverage:{calendarMode:'service-day',validFrom:'2026-09-18',validThrough:'2026-10-02',weekdays:[0,1,2,3,4,5,6],earliestSeconds:0,latestSeconds:172800},
    assumptions:{rideSpeedKph:18,dwellSecondsPerStop:30,allowEstimatedBayTransfers:true,bayTransferSeconds:300,unverifiedBayStopCodes:['01002'],headwayBands:[{field:'AM_Offpeak_Freq',startSeconds:30660,endSeconds:61200}]},
    stops:['01001','01002','01003','01004'].map(id=>({id,name:id})),patterns:[pattern('A',[stop('01001',5,4),stop('01002',9,5)]),pattern('B',[stop('01002',3,1),stop('01003',7,2)])]};
  return {rail,bus};
}
const input={originId:'bus:01001',destinationId:'bus:01003',date:'2026-09-21',departureTime:'10:01',walkingLimitMinutes:5,preference:'fastest',maxExtraMinutes:0};

test('same-code terminal estimate enables a connection with its full walking allowance',()=>{
  const {rail,bus}=fixture(),router=createMultimodalRouter(rail,bus,{links:[]},{busOnly:true});
  const result=router.route(input);
  assert.equal(result.status,'ok');
  // Two waits (600 each), two 1 km rides (200+30 each), and 300s terminal walk.
  assert.equal(result.recommended.totalSeconds,1960);
  assert.equal(result.recommended.walkingSeconds,300);
  const transfer=result.recommended.legs.find(l=>l.type==='transfer');
  assert.equal(transfer.estimatedBay,true);assert.equal(transfer.pathId,undefined);
  assert.match(transfer.provenance,/unverified/);
  assert.match(itineraryStepLabel(transfer,{steps:result.recommended.legs}),/about 5 min and confirm the boarding bay/);
  assert.equal(router.route({...input,walkingLimitMinutes:4}).routes.length,0);
  const accepted=acceptJourney(result.recommended,input,'synthetic-island-test');
  assert.equal(accepted.route.legs.find(l=>l.type==='transfer').estimatedBay,true);
});

test('terminal estimate may be disabled and never connects different stop codes',()=>{
  const {rail,bus}=fixture();bus.assumptions.allowEstimatedBayTransfers=false;
  assert.equal(createMultimodalRouter(rail,bus,{links:[]},{busOnly:true}).route(input).routes.length,0);
  bus.assumptions.allowEstimatedBayTransfers=true;
  bus.patterns[1].stops[0].stopId='01004';bus.patterns[1].originCode='01004';
  assert.equal(createMultimodalRouter(rail,bus,{links:[]},{busOnly:true}).route(input).status,'disconnected');
});

test('source sequence gaps and nonzero distance preserve exact ride identity and arithmetic',()=>{
  const {rail,bus}=fixture();
  const result=createMultimodalRouter(rail,bus,{links:[]},{busOnly:true}).route({...input,destinationId:'bus:01002'});
  const ride=result.recommended.legs.find(l=>l.type==='ride');
  assert.equal(ride.fromSequence,5);assert.equal(ride.toSequence,9);
  assert.equal(ride.durationSeconds,230);assert.deepEqual(ride.stopIds,['bus:01001','bus:01002']);
});

test('short services can use a published daytime first arrival, with no repeating fixed-trip invention',()=>{
  const {bus}=fixture(),p=bus.patterns[0],timing=createBusTiming(bus);
  const first=timing.boarding(p,0,35940,'2026-09-21');
  assert.equal(first.seconds,36000);assert.equal(first.basis,'published-first-arrival');
  p.timingSupported=false;
  assert.equal(timing.boarding(p,0,35940,'2026-09-21'),null);
  assert.equal(timing.boarding(p,0,36600,'2026-09-21'),null);
});

test('rail incumbent preserves later preferred alternatives with the detourLimit alias',()=>{
  const {rail,bus}=fixture();bus.patterns=[];bus.stops=[];
  rail.stations=['A','X','D'].map(id=>({id,name:id,stopIds:[id]}));
  rail.stops=['A','X','D'].map(id=>({id,stationId:id,name:id}));
  rail.routes=[{id:'line'}];rail.services=[{id:'daily',startDate:'2026-09-18',endDate:'2026-10-02',weekdays:[0,1,2,3,4,5,6],exceptions:{}}];
  const trip=(id,stops)=>({id,routeId:'line',serviceId:'daily',directionId:1,stopTimes:stops.map(([id,t])=>[id,t,t,true,true])});
  rail.trips=[trip('fast1',[['A',36000],['X',36300]]),trip('fast2',[['X',36360],['D',36600]]),trip('direct',[['A',37200],['D',38400]])];
  rail.transfers=[{fromStopId:'X',toStopId:'X',seconds:60,walkSeconds:0,assumed:true,provenance:'Synthetic change'}];
  const router=createMultimodalRouter(rail,bus,{links:[]});
  const query={originId:'A',destinationId:'D',date:'2026-09-21',departureTime:'09:59',walkingLimitMinutes:0,preference:'fewer-transfers'};
  const alias=router.route({...query,detourLimit:45}),canonical=router.route({...query,maxExtraMinutes:45});
  assert.equal(alias.status,'ok');assert.equal(alias.recommended.arrivalSeconds,38400);assert.equal(alias.recommended.transfers,0);
  assert.deepEqual(alias.routes,canonical.routes);
});
