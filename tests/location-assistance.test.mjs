import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationAssistance,LOCATION_PREFERENCE_KEY,LOCATION_MAX_AGE,LOCATION_MAX_ACCURACY,usableLocation,locationDescription} from '../src/location-assistance.js';

function harness({preference=null,permission='prompt',permissions,geolocation,storage,visible=true}={}) {
  let clock=1000000,foreground=visible;
  const callbacks=[],cleared=[],positions=[],states=[],writes=[],queries=[];
  const values=new Map(preference===null?[]:[[LOCATION_PREFERENCE_KEY,preference]]);
  const localStorage=storage??{getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push([key,value]);values.set(key,value);}};
  const service=createLocationAssistance({
    storage:localStorage,
    permissions:permissions??{query:async query=>{queries.push(query);return {state:permission};}},
    geolocation:geolocation??{watchPosition(success,failure,options){callbacks.push({success,failure,options});return callbacks.length;},clearWatch:id=>cleared.push(id)},
    now:()=>clock,isVisible:()=>foreground,onPosition:p=>positions.push(p),onState:s=>states.push(s),
  });
  return {service,callbacks,cleared,positions,states,writes,queries,values,storage:localStorage,
    advance:delta=>{clock+=delta;},
    visibility:value=>{foreground=value;service.visibilityChanged();},
    fix:(index=callbacks.length-1,overrides={})=>callbacks[index].success({coords:{latitude:1.3,longitude:103.8,accuracy:12,...overrides.coords},timestamp:overrides.timestamp??clock}),
  };
}

test('first boot uses the browser watch once, requests a fresh position, and is idempotent',async()=>{
  const h=harness();await h.service.boot();await h.service.boot();h.service.start();
  assert.deepEqual(h.queries,[{name:'geolocation'}]);assert.equal(h.callbacks.length,1);
  assert.deepEqual(h.callbacks[0].options,{maximumAge:0,timeout:12000,enableHighAccuracy:true});
  assert.equal(h.service.getState().collecting,true);assert.equal(h.service.getState().usable,false);
  h.fix();assert.equal(h.service.getState().usable,true);
  assert.deepEqual([...h.values.keys()],[LOCATION_PREFERENCE_KEY],'local assistance writes only its own preference, never caregiver sharing');
});

test('a previously denied browser permission provides manual fallback without asking or retrying',async()=>{
  const h=harness({permission:'denied'});await h.service.boot();await h.service.boot();h.visibility(false);h.visibility(true);
  assert.equal(h.callbacks.length,0);assert.equal(h.service.getState().enabled,false);
  assert.equal(h.service.getState().status,'denied');assert.match(h.service.getState().reason,/manually/);
});

test('persisted denial and unavailability do not retry merely because the app is reopened',async()=>{
  for(const preference of ['denied','unavailable']){
    const h=harness({preference});await h.service.boot();h.visibility(false);h.visibility(true);
    assert.equal(h.callbacks.length,0,preference);assert.equal(h.service.getState().status,preference);
    h.service.start();assert.equal(h.callbacks.length,1,'an explicit Settings retry can ask again');
  }
});

test('changed browser permission can recover a previous denial or unavailability at next load',async()=>{
  for(const preference of ['denied','unavailable']){
    const h=harness({preference,permission:'granted'});await h.service.boot();assert.equal(h.callbacks.length,1);h.fix();assert.equal(h.service.getState().usable,true);
  }
});

test('an explicit persisted stop wins even over granted browser permission',async()=>{
  const h=harness({preference:'off',permission:'granted'});await h.service.boot();h.visibility(false);h.visibility(true);
  assert.equal(h.queries.length,0);assert.equal(h.callbacks.length,0);assert.equal(h.service.getState().enabled,false);
  h.service.start();h.fix();assert.equal(h.service.getState().usable,true);
  h.service.stop();const reopened=harness({storage:h.storage,permission:'granted'});await reopened.service.boot();assert.equal(reopened.callbacks.length,0);
});

test('a trip-ending stop clears this session without saving a global disable for the next load',async()=>{
  const h=harness();await h.service.boot();h.fix();h.service.stop(undefined,{persist:false});
  assert.equal(h.service.getState().enabled,false);assert.equal(h.service.getState().position,null);assert.deepEqual(h.cleared,[1]);
  assert.equal(h.values.get(LOCATION_PREFERENCE_KEY),'on');h.visibility(false);h.visibility(true);h.fix();assert.equal(h.callbacks.length,1);assert.equal(h.service.getState().position,null);
  const reopened=harness({storage:h.storage});await reopened.service.boot();assert.equal(reopened.callbacks.length,1);reopened.fix();assert.equal(reopened.service.getState().usable,true);
});

test('a temporary stop cannot erase an existing explicit saved disable',async()=>{
  const h=harness({preference:'off'});await h.service.boot();h.service.stop(undefined,{persist:false});
  assert.equal(h.values.get(LOCATION_PREFERENCE_KEY),'off');const reopened=harness({storage:h.storage});await reopened.service.boot();assert.equal(reopened.callbacks.length,0);
});

test('blocked preference storage and missing permission-query support still use real browser permission',async()=>{
  const h=harness({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},permissions:{}});
  await h.service.boot();assert.equal(h.callbacks.length,1);h.service.stop();h.visibility(false);h.visibility(true);assert.equal(h.callbacks.length,1);
  const failingQuery=harness({permissions:{query:async()=>{throw Error('not supported');}}});await failingQuery.service.boot();assert.equal(failingQuery.callbacks.length,1);
});

test('stopping while browser permission is being checked prevents a late startup request',async()=>{
  let resolve;const h=harness({permissions:{query:()=>new Promise(done=>{resolve=done;})}});
  const pending=h.service.boot();h.service.stop();resolve({state:'granted'});await pending;
  assert.equal(h.callbacks.length,0);assert.equal(h.service.getState().enabled,false);assert.equal(h.values.get(LOCATION_PREFERENCE_KEY),'off');
});

test('hiding during a pending permission check preserves startup intent without collecting hidden',async()=>{
  let resolve;const h=harness({permissions:{query:()=>new Promise(done=>{resolve=done;})}});
  const pending=h.service.boot();h.visibility(false);resolve({state:'prompt'});await pending;
  assert.equal(h.callbacks.length,0);assert.equal(h.service.getState().enabled,true);assert.equal(h.service.getState().status,'suspended');
  h.visibility(true);assert.equal(h.callbacks.length,1);h.fix();assert.equal(h.service.getState().usable,true);
});

test('a hide/show cycle during pending permission checking does not lose the initial request',async()=>{
  let resolve;const h=harness({permissions:{query:()=>new Promise(done=>{resolve=done;})}});
  const pending=h.service.boot();h.visibility(false);h.visibility(true);resolve({state:'granted'});await pending;
  assert.equal(h.callbacks.length,1);h.fix();assert.equal(h.service.getState().usable,true);
});

test('an explicit stop still cancels startup after the app hides during permission checking',async()=>{
  let resolve;const h=harness({permissions:{query:()=>new Promise(done=>{resolve=done;})}});
  const pending=h.service.boot();h.visibility(false);h.service.stop();h.visibility(true);resolve({state:'granted'});await pending;
  assert.equal(h.callbacks.length,0);assert.equal(h.service.getState().enabled,false);assert.equal(h.values.get(LOCATION_PREFERENCE_KEY),'off');
});

test('a denied pending permission result stays denied after a hide/show cycle',async()=>{
  let resolve;const h=harness({permissions:{query:()=>new Promise(done=>{resolve=done;})}});
  const pending=h.service.boot();h.visibility(false);h.visibility(true);resolve({state:'denied'});await pending;
  assert.equal(h.callbacks.length,0);assert.equal(h.service.getState().enabled,false);assert.equal(h.service.getState().status,'denied');
});

test('an explicit start supersedes a pending startup permission query without creating duplicate watches',async()=>{
  let resolve;const h=harness({permissions:{query:()=>new Promise(done=>{resolve=done;})}});
  const pending=h.service.boot();h.service.start();resolve({state:'prompt'});await pending;
  assert.equal(h.callbacks.length,1);h.fix();assert.equal(h.service.getState().usable,true);
});

test('device unavailability clears collection and remains stopped across visibility changes',async()=>{
  const h=harness();await h.service.boot();h.fix();h.callbacks[0].failure({code:2});h.fix();h.visibility(false);h.visibility(true);
  assert.equal(h.positions.length,1);assert.equal(h.service.getState().status,'unavailable');assert.equal(h.service.getState().position,null);
  assert.equal(h.service.getState().enabled,false);assert.deepEqual(h.cleared,[1]);assert.equal(h.callbacks.length,1);
  assert.equal(h.values.get(LOCATION_PREFERENCE_KEY),'unavailable');
});

test('missing or throwing browser geolocation produces a manual fallback without retry loops',async()=>{
  for(const geolocation of [{},{watchPosition(){throw Error('insecure context');}}]){
    const h=harness({geolocation});await h.service.boot();h.visibility(false);h.visibility(true);
    assert.equal(h.service.getState().status,'unavailable');assert.equal(h.service.getState().enabled,false);assert.match(h.service.getState().reason,/manually/);
  }
});

test('a synchronous browser denial clears the watch ID returned after its callback',async()=>{
  const cleared=[];const h=harness({geolocation:{watchPosition(success,failure){failure({code:1});return 0;},clearWatch:id=>cleared.push(id)}});
  await h.service.boot();assert.deepEqual(cleared,[0]);assert.equal(h.service.getState().status,'denied');assert.equal(h.service.getState().enabled,false);
  assert.equal(h.values.get(LOCATION_PREFERENCE_KEY),'denied');
});

test('stopped and superseded callbacks cannot revive a position or overwrite a new watch',async()=>{
  const h=harness();await h.service.boot();h.fix();h.service.stop();h.fix();h.callbacks[0].failure({code:1});
  assert.equal(h.positions.length,1);assert.equal(h.service.getState().status,'stopped');
  h.service.start();h.fix(1);h.callbacks[0].failure({code:2});h.fix(0,{coords:{latitude:1.8}});
  assert.equal(h.service.getState().status,'watching');assert.equal(h.service.getState().position.latitude,1.3);assert.equal(h.positions.length,2);
});

test('suspension forgets the old fix and foreground resumption requires a new usable fix',async()=>{
  const h=harness();await h.service.boot();h.fix();h.visibility(false);
  assert.equal(h.service.getState().position,null);assert.equal(h.service.getState().usable,false);assert.equal(h.service.getState().enabled,true);
  h.fix(0);h.callbacks[0].failure({code:1});h.visibility(true);h.visibility(true);
  assert.equal(h.callbacks.length,2);assert.equal(h.service.getState().usable,false);assert.equal(h.service.getState().status,'watching');
  h.fix(1);assert.equal(h.service.getState().usable,true);assert.deepEqual(h.cleared,[1]);
});

test('explicit stop during hidden suspension prevents automatic resumption',async()=>{
  const h=harness();await h.service.boot();h.visibility(false);h.service.stop();h.visibility(true);
  assert.equal(h.callbacks.length,1);assert.equal(h.service.getState().enabled,false);assert.equal(h.service.getState().status,'stopped');
});

test('timeout withdraws a usable fix but keeps one watch ready for a later signal',async()=>{
  const h=harness();await h.service.boot();h.fix();h.callbacks[0].failure({code:3});
  assert.equal(h.service.getState().position,null);assert.equal(h.service.getState().usable,false);assert.equal(h.service.getState().collecting,true);assert.match(h.service.getState().reason,/timed out/);
  h.fix();assert.equal(h.service.getState().usable,true);assert.equal(h.callbacks.length,1);assert.deepEqual(h.cleared,[]);
});

test('freshness expires without a new callback and refresh informs all consumers',async()=>{
  const h=harness();const seen=[];h.service.subscribe(state=>seen.push(state));await h.service.boot();h.fix();h.advance(LOCATION_MAX_AGE+1);
  assert.equal(h.service.getState().usable,false);h.service.refresh();assert.equal(h.service.getState().position,null);
  assert.equal(seen.at(-1).usable,false);assert.match(seen.at(-1).reason,/stale/);h.fix();assert.equal(seen.at(-1).usable,true);
});

test('bad coordinates, nonnumeric values, stale timestamps and future fixes invalidate prior usable data',async()=>{
  const h=harness();await h.service.boot();
  for(const bad of [{coords:{latitude:91}},{coords:{longitude:-181}},{coords:{accuracy:-1}},{coords:{accuracy:NaN}},{coords:{latitude:'1.3'}},{timestamp:1000000-LOCATION_MAX_AGE-1},{timestamp:1001001}]){
    h.fix();const accepted=h.positions.length;h.fix(0,bad);assert.equal(h.positions.length,accepted);assert.equal(h.service.getState().position,null);assert.equal(h.service.getState().usable,false);
  }
});

test('low accuracy stays visibly approximate and cannot become usable until a better fix arrives',async()=>{
  const h=harness();await h.service.boot();h.fix(0,{coords:{accuracy:LOCATION_MAX_ACCURACY+1}});
  assert.equal(h.service.getState().position.accuracy,51);assert.equal(h.service.getState().usable,false);assert.match(h.service.getState().reason,/Low accuracy/);
  assert.match(locationDescription(h.service.getState().position,{collecting:true,now:1000000}),/low accuracy/);
  h.fix(0,{coords:{accuracy:LOCATION_MAX_ACCURACY}});assert.equal(h.service.getState().usable,true);
});

test('usableLocation applies inclusive accuracy/freshness bounds without accepting impossible values',()=>{
  const position={latitude:1.3,longitude:103.8,accuracy:LOCATION_MAX_ACCURACY,timestamp:1000000-LOCATION_MAX_AGE};
  assert.equal(usableLocation(position,1000000),true);
  for(const override of [{accuracy:51},{accuracy:-1},{timestamp:position.timestamp-1},{timestamp:1001001},{latitude:NaN},{longitude:181},{timestamp:undefined}])assert.equal(usableLocation({...position,...override},1000000),false);
  assert.equal(usableLocation(null,1000000),false);
});

test('subscriptions immediately share existing state and unsubscribe without affecting other consumers',async()=>{
  const h=harness(),first=[],second=[];const unsubscribe=h.service.subscribe(state=>first.push(state));h.service.subscribe(state=>second.push(state));
  assert.equal(first[0].status,'stopped');await h.service.boot();h.fix();assert.equal(first.at(-1).usable,true);assert.equal(second.at(-1).position,first.at(-1).position);
  unsubscribe();const count=first.length;h.service.stop();assert.equal(first.length,count);assert.equal(second.at(-1).status,'stopped');
});

test('the app singleton shares one session and handles page lifecycle and another tab disabling it',async()=>{
  const originals=new Map();const documentEvents=new Map(),windowEvents=new Map(),callbacks=[],cleared=[];let ticks;
  const replace=(key,value)=>{originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  try{
    replace('navigator',{geolocation:{watchPosition(success,failure){callbacks.push({success,failure});return callbacks.length;},clearWatch:id=>cleared.push(id)}});
    replace('localStorage',{getItem:()=>null,setItem(){}});
    replace('document',{hidden:false,addEventListener:(name,callback)=>documentEvents.set(name,callback)});
    replace('addEventListener',(name,callback)=>windowEvents.set(name,callback));
    replace('setInterval',callback=>{ticks=callback;return 1;});
    const {getAppLocation}=await import('../src/location-assistance.js?singleton-lifecycle-test');
    const service=getAppLocation();assert.equal(getAppLocation(),service);await Promise.resolve();
    assert.equal(callbacks.length,1);assert.equal(typeof ticks,'function');
    callbacks[0].success({coords:{latitude:1.3,longitude:103.8,accuracy:10},timestamp:Date.now()});assert.equal(service.getState().usable,true);
    globalThis.document.hidden=true;documentEvents.get('visibilitychange')();assert.equal(service.getState().position,null);assert.deepEqual(cleared,[1]);
    globalThis.document.hidden=false;windowEvents.get('pageshow')();assert.equal(callbacks.length,2);
    windowEvents.get('pagehide')();assert.deepEqual(cleared,[1,2]);windowEvents.get('pageshow')();assert.equal(callbacks.length,3);
    windowEvents.get('storage')({key:LOCATION_PREFERENCE_KEY,newValue:'off'});assert.equal(service.getState().enabled,false);assert.deepEqual(cleared,[1,2,3]);
    windowEvents.get('pageshow')();assert.equal(callbacks.length,3);
  }finally{
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
