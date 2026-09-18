import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchArena} from '../src/search-arena.js';

test('arena resets every label state field and releases retained graph references',()=>{
  const arena=createSearchArena(),source={id:'trip'},leg=arena.railRide(null,source,'A','B',100,200,'2026-09-18');
  const first=arena.label('B',200,30,2,true,leg,7,true);
  const detached={...arena.leg(leg)};
  arena.release();
  assert.equal(first.chain,0);
  assert.equal(arena.previous(leg),0);
  assert.equal(arena.leg(leg),null);
  assert.equal(detached.trip,source);
  const next=arena.label('C',300,0,0,false,null);
  assert.equal(next,first);
  assert.deepEqual(next,{stop:'C',time:300,walk:0,boardings:0,externalSinceRide:false,chain:0,segment:-1,newlyBoarded:false});
  arena.reset();
  assert.equal(next.chain,0);
});

test('arena compact ride and transfer factories overwrite optional values on reuse',()=>{
  const arena=createSearchArena(),pattern={id:'old'},trip={id:'old-trip'};
  const bus=arena.busRide(null,pattern,1,3,100,300,'2026-09-18','first','AM');
  const rail=arena.railRide(bus,trip,'A','B',300,400,'2026-09-18');
  const transfer=arena.transfer(rail,{fromStopId:'B',toStopId:'C',seconds:90,walkSeconds:60,provenance:'reviewed',pathId:'path',assumed:true},400,490);
  const oldBus=arena.leg(bus),oldRail=arena.leg(rail),oldTransfer=arena.leg(transfer);
  arena.release();
  assert.equal(oldBus.pattern,null);
  assert.equal(oldRail.trip,null);
  const newBus=arena.busRide(null,{id:'new'},0,1,600,650,'2026-09-19','estimated',null);
  assert.equal(arena.leg(newBus),oldBus);
  assert.deepEqual(arena.leg(newBus),{type:'bus-ride',pattern:{id:'new'},fromIndex:0,toIndex:1,startSeconds:600,endSeconds:650,serviceDate:'2026-09-19',boardingBasis:'estimated',headwayField:null});
  const newTransfer=arena.transfer(newBus,{fromStopId:'X',toStopId:'Y',seconds:60,walkSeconds:0,provenance:'same stop'},650,710);
  assert.equal(arena.leg(newTransfer),oldTransfer);
  assert.deepEqual(arena.leg(newTransfer),{type:'transfer',fromStopId:'X',toStopId:'Y',startSeconds:650,endSeconds:710,durationSeconds:60,walkingSeconds:0,allowanceSeconds:60,provenance:'same stop',pathId:undefined,assumed:false});
});

test('arena bus and rail waits have independent public shapes',()=>{
  const arena=createSearchArena();
  const bus=arena.wait(null,'bus:A',100,150,true),rail=arena.wait(bus,'rail:B',200,250,false);
  assert.equal(arena.leg(bus).mode,'bus');
  assert.equal(arena.leg(bus).timing,'frequency-estimated');
  assert.equal(Object.hasOwn(arena.leg(rail),'mode'),false);
  assert.equal(Object.hasOwn(arena.leg(rail),'timing'),false);
  const oldBus=arena.leg(bus),oldRail=arena.leg(rail);
  arena.reset();
  assert.equal(arena.leg(arena.wait(null,'rail:C',300,310,false)),oldRail);
  assert.equal(arena.leg(arena.wait(null,'bus:D',400,440,true)),oldBus);
  assert.equal(oldRail.durationSeconds,10);
  assert.equal(oldBus.durationSeconds,40);
});

test('packed chain IDs preserve overflow paths, reject invalid indices, and expire on release',()=>{
  const arena=createSearchArena(),sharedLeg={type:'test'};
  let tail=0;
  for(let i=0;i<131079;i++)tail=arena.chain(tail,sharedLeg);
  assert.equal(tail,131079,'the retention cap does not truncate a query');
  assert.equal(typeof tail,'number');
  assert.equal(arena.leg(tail),sharedLeg);
  assert.equal(arena.previous(tail),tail-1);
  let length=0;
  for(let id=tail;id;id=arena.previous(id))length++;
  assert.equal(length,131079);
  for(const invalid of [null,undefined,0,-1,1.5,NaN,Infinity,tail+1]) {
    assert.equal(arena.previous(invalid),0);
    assert.equal(arena.leg(invalid),null);
  }
  assert.throws(()=>arena.chain(tail+1,sharedLeg),RangeError);
  arena.release();
  assert.equal(arena.previous(tail),0);
  assert.equal(arena.leg(tail),null);
  assert.equal(arena.leg(1),null);
  const fresh=arena.chain(null,{type:'fresh'});
  assert.equal(fresh,1);
  assert.deepEqual(arena.leg(fresh),{type:'fresh'});
  assert.equal(arena.previous(fresh),0);
  assert.equal(arena.leg(tail),null);
});

test('arena retention cap does not cap allocation or reuse overflow objects',()=>{
  const arena=createSearchArena();
  const first=arena.label('first',0,0,0,false,null);
  let overflow;
  for(let i=1;i<=65536;i++)overflow=arena.label(String(i),i,0,0,false,null);
  assert.notEqual(overflow,first);
  assert.equal(first.stop,'first');
  arena.release();
  assert.equal(arena.label('again',0,0,0,false,null),first);
  let nextOverflow;
  for(let i=1;i<=65536;i++)nextOverflow=arena.label(String(i),i,0,0,false,null);
  assert.notEqual(nextOverflow,overflow);
});
