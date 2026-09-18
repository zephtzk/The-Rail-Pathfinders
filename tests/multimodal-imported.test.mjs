import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMultimodalRouter} from '../src/multimodal-engine.js';
const read = path=>JSON.parse(readFileSync(path));
const rail=read('public/data/rail-network.json'),bus=read('public/data/bus-network.json'),walking=read('data/bus/walking-links.json');
const query={date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:20,preference:'fastest',maxExtraMinutes:15};
function arithmetic(route) {
  assert.equal(route.totalSeconds,route.accessSeconds+route.waitSeconds+route.rideSeconds+route.transferSeconds+route.exitSeconds);
  assert.equal(route.arrivalSeconds-route.departureSeconds,route.totalSeconds);
  assert.equal(route.walkingSeconds,route.legs.reduce((s,l)=>s+(l.walkingSeconds??0),0));
  for(let i=1;i<route.legs.length;i++)assert.equal(route.legs[i].startSeconds,route.legs[i-1].endSeconds);
  for(const ride of route.legs.filter(l=>l.mode==='bus'&&l.type==='ride')){
    const p=bus.patterns.find(p=>p.id===ride.patternId),from=p.stops.find(s=>s.sequence===ride.fromSequence),to=p.stops.find(s=>s.sequence===ride.toSequence);
    assert.equal(from.stopId,ride.fromStopId.slice(4));assert.equal(to.stopId,ride.toStopId.slice(4));assert.ok(to.sequence>from.sequence);
    assert.equal(ride.visitNumber,from.visitNumber);assert.equal(ride.directionId,p.direction);
  }
}
test('actual complete loop supports a direct bus ride with independently computed arithmetic',()=>{
  const r=createMultimodalRouter(rail,bus,walking,{busOnly:true}).route({...query,originId:'bus:75009',destinationId:'bus:75059'}).recommended;
  // Source23: stop1→4, distance0→1.8km;12min wait +6min motion +90sec stop allowance.
  assert.equal(r.arrivalSeconds,37170);assert.equal(r.waitSeconds,720);assert.equal(r.rideSeconds,450);assert.equal(r.transfers,0);assert.equal(r.walkingSeconds,0);arithmetic(r);
});
test('decimal source distances do not add a spurious second to exact ride arithmetic',()=>{
  const r=createMultimodalRouter(rail,bus,walking,{busOnly:true}).route({...query,originId:'bus:82011',destinationId:'bus:76101',walkingLimitMinutes:0}).recommended;
  // Source28 direction2 seq24→46:19.1−9.5=9.6km at18km/h→1920s,22 stops→660s; wait14min.
  assert.equal(r.rideSeconds,2580);assert.equal(r.waitSeconds,840);assert.equal(r.arrivalSeconds,39420);arithmetic(r);
});
test('actual mixed journeys work in both directions over enabled path IDs',()=>{
  const router=createMultimodalRouter(rail,bus,walking);
  for(const [originId,destinationId] of [['bus:75009','DT14'],['DT14','bus:75009'],['bus:99009','NS22'],['NS22','bus:99009']]){
    const result=router.route({...query,originId,destinationId});assert.equal(result.status,'ok',JSON.stringify(result.errors));
    const r=result.recommended;assert.ok(r.legs.some(l=>l.mode==='bus'));assert.ok(r.legs.some(l=>l.mode==='rail'));assert.ok(r.legs.some(l=>l.pathId));assert.ok(r.estimated);arithmetic(r);
    for(const l of r.legs.filter(l=>l.pathId))assert.ok(walking.links.some(w=>w.id===l.pathId&&w.enabled));
  }
});
test('actual bus transfer, loops, deadlines and total walk bound remain explicit',()=>{
  const router=createMultimodalRouter(rail,bus,walking,{busOnly:true});
  const transfer=router.route({...query,originId:'bus:75009',destinationId:'bus:81119'}).recommended;
  assert.equal(transfer.transfers,1);assert.deepEqual(transfer.legs.filter(l=>l.type==='ride').map(l=>l.serviceNo),['23','28']);arithmetic(transfer);
  const loop=router.route({...query,originId:'bus:75059',destinationId:'bus:75009'}).recommended;arithmetic(loop);assert.ok(loop.legs.some(l=>l.toSequence===43));
  const mixed=createMultimodalRouter(rail,bus,walking);
  assert.notEqual(mixed.route({...query,originId:'bus:75009',destinationId:'DT14',walkingLimitMinutes:0}).status,'ok');
  assert.equal(mixed.route({...query,originId:'bus:75009',destinationId:'DT14',deadlineTime:'10:05'}).status,'deadline');
});
