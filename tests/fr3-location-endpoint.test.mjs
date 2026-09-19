import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationAssistance,LOCATION_PREFERENCE_KEY,LOCATION_MAX_AGE,LOCATION_MAX_ACCURACY} from '../src/location-assistance.js';
import {locationEndpoint,locationEndpointProblem,requestLocationEndpoint} from '../src/location-endpoint.js';

const NOW=1800000000000;
const ready=(position={})=>({enabled:true,status:'watching',usable:true,reason:'Fresh approximate position.',position:{latitude:1.3,longitude:103.8,accuracy:12,timestamp:NOW,...position}});

function harness({preference='off',permission='prompt',visible=true,synchronousFailure}={}){
  const values=new Map([[LOCATION_PREFERENCE_KEY,preference]]),calls=[],cleared=[];
  let foreground=visible,subscriptions=0;
  const local=createLocationAssistance({
    storage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},
    permissions:{query:async()=>({state:permission})},
    geolocation:{watchPosition(success,failure,options){calls.push({success,failure,options});if(synchronousFailure)failure({code:synchronousFailure});return calls.length;},clearWatch:id=>cleared.push(id)},
    isVisible:()=>foreground,
  });
  const service={...local,subscribe(listener){
    subscriptions++;
    const unsubscribe=local.subscribe(listener);let attached=true;
    return()=>{if(attached){attached=false;subscriptions--;unsubscribe();}};
  }};
  return {service,calls,cleared,values,get subscriptions(){return subscriptions;},
    fix(overrides={}){calls.at(-1).success({coords:{latitude:1.3,longitude:103.8,accuracy:12,...overrides.coords},timestamp:overrides.timestamp??Date.now()});},
    fail(code){calls.at(-1).failure({code});},
    visibility(value){foreground=value;service.visibilityChanged();},
  };
}

test('fresh device location becomes a coordinate endpoint for either planner role',()=>{
  const point=locationEndpoint(ready(),NOW);
  assert.equal(point.label,'My location');assert.equal(point.kind,'device-location');
  assert.equal(point.lat,1.3);assert.equal(point.lng,103.8);assert.equal(point.routingId,null);
  assert.equal(point.accuracy,12);assert.equal(point.timestamp,NOW);assert.match(point.detail,/12 m/);
});

test('location endpoint accepts inclusive age, accuracy and future-clock tolerance limits',()=>{
  for(const timestamp of [NOW-LOCATION_MAX_AGE,NOW,NOW+1000]){
    const point=locationEndpoint(ready({accuracy:LOCATION_MAX_ACCURACY,timestamp}),NOW);
    assert.equal(point.timestamp,timestamp);assert.equal(point.accuracy,LOCATION_MAX_ACCURACY);
  }
});

test('location endpoint independently rejects stale, inaccurate and invalid fixes even with a cached usable flag',()=>{
  for(const position of [
    {timestamp:NOW-LOCATION_MAX_AGE-1},{timestamp:NOW+1001},{accuracy:LOCATION_MAX_ACCURACY+1},
    {accuracy:-1},{latitude:NaN},{longitude:Infinity},{timestamp:undefined},
  ])assert.throws(()=>locationEndpoint(ready(position),NOW));
  assert.throws(()=>locationEndpoint({...ready(),usable:false},NOW),/fresh, accurate location/i);
  assert.throws(()=>locationEndpoint({...ready(),usable:false,position:null,reason:'Location is stale.'},NOW),/stale/i);
  assert.throws(()=>locationEndpoint(ready({accuracy:51}),NOW),/accuracy is too low.*51 m/i);
});

test('globally valid locations outside Singapore are not silently snapped to a supported endpoint',()=>{
  for(const position of [{latitude:1.1439},{latitude:1.4941},{longitude:103.5349},{longitude:104.5021}]){
    assert.throws(()=>locationEndpoint(ready(position),NOW),/outside the supported Singapore area/i);
  }
});

test('explicit endpoint requests enable the saved-off session once and share its existing watch',async()=>{
  const h=harness();await h.service.boot();assert.equal(h.calls.length,0);
  const first=requestLocationEndpoint(h.service),second=requestLocationEndpoint(h.service);
  assert.equal(h.calls.length,1);assert.equal(h.subscriptions,2);
  assert.deepEqual(h.calls[0].options,{maximumAge:0,timeout:12000,enableHighAccuracy:true});
  h.fix();const points=await Promise.all([first,second]);
  assert.deepEqual(points[0],points[1]);assert.equal(h.subscriptions,0);
  assert.equal(h.service.getState().enabled,true);assert.deepEqual(h.cleared,[]);
  assert.deepEqual([...h.values.keys()],[LOCATION_PREFERENCE_KEY]);
});

test('explicit My location retries persisted denial and unavailability without a boot retry loop',async()=>{
  for(const preference of ['denied','unavailable']){
    const h=harness({preference});await h.service.boot();assert.equal(h.calls.length,0,preference);
    const pending=requestLocationEndpoint(h.service);assert.equal(h.calls.length,1);
    h.fix();assert.equal((await pending).label,'My location');assert.equal(h.subscriptions,0);
  }
});

test('denial and unavailability reject selection, release listeners and keep manual fallback messages',async()=>{
  for(const [code,pattern] of [[1,/permission denied.*browser.*enter a place/i],[2,/unavailable.*Retry My location.*enter a place/i]]){
    const h=harness(),pending=requestLocationEndpoint(h.service);
    h.fail(code);await assert.rejects(pending,pattern);
    assert.equal(h.subscriptions,0);assert.equal(h.service.getState().position,null);
    assert.equal(h.service.getState().enabled,false);assert.deepEqual(h.cleared,[1]);
  }
});

test('a cancelled endpoint request releases only its own subscription and leaves shared collection active',async()=>{
  const h=harness(),observations=[];
  const detachObserver=h.service.subscribe(state=>observations.push(state));
  const controller=new AbortController(),pending=requestLocationEndpoint(h.service,{signal:controller.signal});
  assert.equal(h.subscriptions,2);controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(h.subscriptions,1);assert.equal(h.service.getState().enabled,true);assert.deepEqual(h.cleared,[]);
  h.fix();assert.equal(observations.at(-1).usable,true);
  const next=await requestLocationEndpoint(h.service);assert.equal(next.lat,1.3);assert.equal(h.calls.length,1);
  detachObserver();assert.equal(h.subscriptions,0);
});

test('an already-cancelled request neither starts a watch nor subscribes',async()=>{
  const h=harness(),controller=new AbortController();controller.abort();
  await assert.rejects(requestLocationEndpoint(h.service,{signal:controller.signal}),{name:'AbortError'});
  assert.equal(h.calls.length,0);assert.equal(h.subscriptions,0);assert.equal(h.service.getState().enabled,false);
});

test('selection timeout releases its listener while the shared watch remains available for recovery',async()=>{
  const h=harness();
  await assert.rejects(requestLocationEndpoint(h.service,{timeoutMs:5}),/fresh, accurate location.*enter a place/i);
  assert.equal(h.subscriptions,0);assert.equal(h.service.getState().enabled,true);assert.deepEqual(h.cleared,[]);
  h.fix();assert.equal(h.service.getState().usable,true);assert.equal(h.calls.length,1);
});

test('a browser location timeout can recover on the same watch before endpoint selection times out',async()=>{
  const h=harness(),pending=requestLocationEndpoint(h.service,{timeoutMs:1000});
  h.fail(3);assert.equal(h.service.getState().usable,false);assert.equal(h.subscriptions,1);
  h.fix();assert.equal((await pending).lat,1.3);assert.equal(h.calls.length,1);assert.equal(h.subscriptions,0);
});

test('low accuracy waits for a better fix and remains explained if selection times out',async()=>{
  const h=harness(),pending=requestLocationEndpoint(h.service,{timeoutMs:1000});
  h.fix({coords:{accuracy:51}});assert.equal(h.subscriptions,1);assert.equal(h.service.getState().usable,false);
  h.fix({coords:{accuracy:50}});assert.equal((await pending).accuracy,50);assert.equal(h.subscriptions,0);
  h.fix({coords:{accuracy:51}});
  await assert.rejects(requestLocationEndpoint(h.service,{timeoutMs:5}),/accuracy is too low.*51 m/i);
  assert.equal(h.subscriptions,0);assert.deepEqual(h.cleared,[]);
});

test('synchronous subscription delivery releases listeners on immediate success and failure',async()=>{
  const readyHarness=harness();readyHarness.service.start();readyHarness.fix();
  assert.equal((await requestLocationEndpoint(readyHarness.service)).lat,1.3);
  assert.equal(readyHarness.subscriptions,0);assert.equal(readyHarness.calls.length,1);
  const denied=harness({synchronousFailure:1});
  await assert.rejects(requestLocationEndpoint(denied.service),/permission denied/i);
  assert.equal(denied.subscriptions,0);assert.deepEqual(denied.cleared,[1]);
  const outside=harness();outside.service.start();outside.fix({coords:{latitude:2}});
  await assert.rejects(requestLocationEndpoint(outside.service),/outside.*Singapore/i);
  assert.equal(outside.subscriptions,0);assert.equal(outside.service.getState().enabled,true);
});

test('hidden pages reject selection without collecting, and suspension withdraws an in-flight request',async()=>{
  const hidden=harness({visible:false});
  await assert.rejects(requestLocationEndpoint(hidden.service),/paused while this page is hidden/i);
  assert.equal(hidden.calls.length,0);assert.equal(hidden.subscriptions,0);
  const h=harness(),pending=requestLocationEndpoint(h.service);h.visibility(false);
  await assert.rejects(pending,/paused while this page is hidden/i);
  assert.equal(h.subscriptions,0);assert.deepEqual(h.cleared,[1]);
});

test('explicit stop rejects a pending selection and reports the enable action',async()=>{
  const h=harness(),pending=requestLocationEndpoint(h.service);h.service.stop();
  await assert.rejects(pending,/Location is off.*My location to enable/i);
  assert.equal(h.subscriptions,0);assert.equal(h.service.getState().position,null);
  assert.match(locationEndpointProblem(h.service.getState()),/enter a place/i);
});
