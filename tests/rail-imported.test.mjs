import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRailRouter} from '../src/rail-engine.js';
import {checkRailImport} from '../scripts/check-rail-import.mjs';
const network=JSON.parse(await readFile(new URL('../public/data/rail-network.json',import.meta.url),'utf8'));
const router=createRailRouter(network);
const base={date:'2026-09-19',departure:'08:10',deadline:'11:00',walkingLimit:30,preference:'fastest'};
const trips=new Map(network.trips.map(t=>[t.id,t]));
function validateJourney(journey){
 assert.equal(journey.totalSeconds,journey.legs.reduce((s,l)=>s+l.durationSeconds,0));
 assert.equal(journey.totalSeconds,journey.accessSeconds+journey.waitSeconds+journey.rideSeconds+journey.transferSeconds+journey.exitSeconds);
 assert.equal(journey.walkingSeconds,journey.accessSeconds+journey.transferWalkSeconds+journey.exitSeconds);
 let last=journey.departureSeconds;
 for(const leg of journey.legs){
  assert.equal(leg.startSeconds,last);assert.equal(leg.endSeconds-leg.startSeconds,leg.durationSeconds);last=leg.endSeconds;
  if(leg.type==='transfer')assert.ok(network.transfers.some(e=>e.fromStopId===leg.fromStopId&&e.toStopId===leg.toStopId&&e.seconds===leg.durationSeconds));
  if(leg.type==='ride'){
   const trip=trips.get(leg.tripId);assert.ok(trip);assert.equal(trip.serviceId,leg.serviceId);assert.equal(trip.directionId,leg.directionId);
   const offset=(Date.parse(leg.serviceDate)-Date.parse(base.date))/1000;
   const starts=trip.stopTimes.map((s,i)=>({s,i})).filter(({s})=>s[0]===leg.fromStopId&&s[2]+offset===leg.startSeconds);
   assert.ok(starts.some(({i})=>trip.stopTimes.slice(i+1).some(s=>s[0]===leg.toStopId&&s[1]+offset===leg.endSeconds)));
  }
 }
 assert.equal(last,journey.arrivalSeconds);
}
test('pinned schedule import hashes match source, rules, importer and compiled data',async()=>{await checkRailImport();});
test('independently checked source corridor has exact scheduled arithmetic, distinct from replay',()=>{
 // Directly checked raw ZIP stop_times.txt: EWL_Main_WB_WE_31, EW2_B 08:17:20 to EW12_B 08:48:20.
 // Depart 08:10 + 120 access + 320 wait + 1860 train (including intermediate dwell) + 120 exit = 08:50:20.
 const result=router.route({...base,origin:'DT32',destination:'DT14'});assert.equal(result.status,'ok');
 const j=result.recommended;assert.equal(j.arrivalSeconds,31820);assert.equal(j.totalSeconds,2420);
 assert.deepEqual([j.accessSeconds,j.waitSeconds,j.rideSeconds,j.exitSeconds],[120,320,1860,120]);
 assert.equal(j.legs.find(l=>l.type==='ride').tripId,'EWL_Main_WB_WE_31');validateJourney(j);
});
test('outside-corridor routes work both ways with two and three validated train changes',()=>{
 for(const [origin,destination,count]of[['NS5','NE18',2],['NE18','NS5',2],['NS23','PE6',2],['PE6','NS23',2],['BP2','NE18',3],['NE18','BP2',3]]){
  const result=router.route({...base,origin,destination});assert.equal(result.status,'ok',origin+'→'+destination);assert.equal(result.recommended.transfers,count);validateJourney(result.recommended);
 }
});
test('actual source Sunday BP exception removes service without inventing rail replacement',()=>{
 const result=router.route({...base,origin:'BP2',destination:'BP3',date:'2026-09-20'});assert.equal(result.status,'no-service');
});
test('tap-out connections remain omitted, bad source trip quarantined, unsupported coverage explicit',()=>{
 assert.ok(!trips.has('CCL_Clockwise_Loop_WD_1'));
 for(const [a,b]of[['EW2','DT32'],['NS21','DT11'],['BP6','DT1']])assert.ok(!network.transfers.some(e=>e.fromStopId.startsWith(a+'_')&&e.toStopId.startsWith(b+'_')));
 assert.equal(router.route({...base,origin:'DT32',destination:'NOT_IMPORTED'}).status,'unsupported-station');
 assert.equal(router.route({...base,origin:'DT32',destination:'DT14',date:'2027-02-01'}).status,'unsupported-date');
 assert.equal(router.route({...base,origin:'DT32',destination:'DT14',walkingLimit:3}).status,'no-feasible');
 assert.equal(router.route({...base,origin:'DT32',destination:'DT14',deadline:'08:11'}).status,'deadline');
});
