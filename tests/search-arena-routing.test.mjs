import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMultimodalRouter} from '../src/multimodal-engine.js';

const read=name=>JSON.parse(readFileSync(new URL(`../public/data/${name}.json`,import.meta.url)));
const base={date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:30,preference:'fastest',maxExtraMinutes:15};
function deepFreeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))deepFreeze(child);
  Object.freeze(value);
 }
 return value;
}

test('previously returned mixed itineraries remain intact when callers freeze them and run later searches',()=>{
 const router=createMultimodalRouter(read('rail-network'),read('bus-network'),read('walking-links'));
 const originalQuery={...base,originId:'bus:75009',destinationId:'DT14'};
 const first=router.route(originalQuery);
 assert.equal(first.status,'ok');assert.ok(first.routes.length>1,'retain alternatives as well as the recommendation');
 assert.ok(first.recommended.legs.some(l=>l.mode==='bus'));
 assert.ok(first.recommended.legs.some(l=>l.mode==='rail'));
 assert.ok(first.recommended.legs.some(l=>l.type==='transfer'));
 const before=structuredClone(first);
 deepFreeze(first.routes);
 const subsequent=[
  [{originId:'DT14',destinationId:'bus:75009'},'ok'],
  [{originId:'bus:99009',destinationId:'bus:28009'},'ok'],
  [{originId:'NS9',destinationId:'CG2'},'ok'],
  [{originId:'bus:75009',destinationId:'DT14',deadlineTime:'10:05'},'deadline'],
  [{originId:'bus:99009',destinationId:'bus:28009',maxSearchWork:10},'search-limit'],
  [{originId:'bus:75009',destinationId:'DT14',signal:AbortSignal.abort()},'cancelled'],
  [{originId:'bus:75009',destinationId:'DT14',walkingLimitMinutes:0},'no-feasible'],
  [{originId:'NS9',destinationId:'CG2',departureTime:'24:00'},'invalid-input'],
 ];
 for(let round=0;round<2;round++)for(const [patch,status]of subsequent){
  assert.equal(router.route({...base,...patch}).status,status);
  assert.deepEqual(first,before,'a retained result changes only when its owner explicitly replaces it');
 }
 const repeated=router.route(originalQuery);
 assert.deepEqual(repeated.routes,before.routes);
 assert.notEqual(repeated.routes,first.routes);
 assert.notEqual(repeated.recommended.legs,first.recommended.legs);
 assert.notEqual(repeated.recommended.legs.find(l=>l.type==='ride').stopIds,first.recommended.legs.find(l=>l.type==='ride').stopIds);
 assert.ok(Object.isFrozen(first.recommended.legs));
 assert.ok(first.recommended.legs.every(Object.isFrozen));
});
