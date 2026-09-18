import test from 'node:test';
import assert from 'node:assert/strict';
import {ADDRESS_SEARCH_BOUNDS,createAddressSearch,normalizeAddressResults} from '../src/address-search.js';
import {createPersonalStore,PERSONAL_KEY,visiblePersonalState,instantiateTemplate} from '../src/personal.js';
const feature=(properties={},coordinates=[103.82,1.3])=>({type:'Feature',geometry:{type:'Point',coordinates},properties:{name:'Example Hospital',street:'Hospital Road',housenumber:'10',postcode:'123456',countrycode:'SG',osm_type:'N',osm_id:123,...properties}});
const collection=(...features)=>({type:'FeatureCollection',features});
const response=(...features)=>new Response(JSON.stringify(collection(...features)));
const memory=()=>{const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};};
const endpoint=(id,lat=1.3)=>({id,label:id,lat,lng:103.8,routingId:id,sourceId:`lta:${id}`,coverage:'supported',accessibility:'unknown'});

test('address candidates stay in Singapore and never claim transit or accessibility connections',()=>{
 const results=normalizeAddressResults(collection(feature(),feature(),feature({countrycode:'MY',osm_id:456}),feature({osm_id:789},[103.9,2]),feature({osm_id:999},[104.4,1.25]),feature({osm_id:'invalid'})));
 assert.equal(results.length,2);assert.equal(results[0].address,'Example Hospital, 10 Hospital Road, 123456, Singapore');
 assert.equal(results[0].routingId,null);assert.equal(results[0].stationId,null);assert.equal(results[0].coverage,'unknown');assert.equal(results[0].accessibility,'unknown');
 assert.throws(()=>normalizeAddressResults({features:[]}),/unreadable/);
});

test('explicit search sends only query and Singapore filters, caches and throttles requests',async()=>{
 const requests=[];let now=0;const search=createAddressSearch({clock:()=>now,fetcher:async(url,options)=>{requests.push({url:new URL(url),options});return response(feature());}});
 assert.equal(requests.length,0);await search.search('10 Hospital Road');
 const request=requests[0];assert.equal(request.url.searchParams.get('q'),'10 Hospital Road');assert.equal(request.url.searchParams.get('countrycode'),'SG');assert.equal(request.url.searchParams.get('bbox'),ADDRESS_SEARCH_BOUNDS.join(','));assert.equal(request.url.searchParams.get('limit'),'6');assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');
 const cached=await search.search('10 hospital road');cached[0].lat=0;
 assert.equal((await search.search('10 Hospital Road'))[0].lat,1.3);assert.equal(requests.length,1);
 await assert.rejects(search.search('Other Road'),/wait a moment/);now=1500;await search.search('Other Road');assert.equal(requests.length,2);
});

test('editing the query aborts an in-flight request and drops stale results even if fetch ignores abort',async()=>{
 let resolve,signal;const search=createAddressSearch({minIntervalMs:0,fetcher:(_url,options)=>{signal=options.signal;return new Promise(done=>resolve=done);}});
 const pending=search.search('Hospital');search.cancel();assert.equal(signal.aborted,true);resolve(response(feature()));assert.equal(await pending,null);
});

test('a newer search wins over an older response',async()=>{
 const requests=[];const search=createAddressSearch({minIntervalMs:0,fetcher:()=>new Promise(resolve=>requests.push(resolve))});
 const first=search.search('Hospital'),second=search.search('Airport');requests[1](response(feature({name:'Airport',osm_id:2})));assert.equal((await second)[0].label,'Airport');requests[0](response(feature()));assert.equal(await first,null);
});

test('no match, server failure, offline and timeout are explicit and cannot produce a place',async()=>{
 assert.deepEqual(await createAddressSearch({fetcher:async()=>response()}).search('Unknown building'),[]);
 await assert.rejects(createAddressSearch({fetcher:async()=>new Response('',{status:429})}).search('Hospital'),/busy/);
 await assert.rejects(createAddressSearch({fetcher:async()=>{throw TypeError('fetch failed');}}).search('Hospital'),/could not connect/);
 const timeout=createAddressSearch({timeoutMs:5,fetcher:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});
 await assert.rejects(timeout.search('Hospital'),/took too long/);
});

test('saving an address preserves its position with a distinct local ID and no station snapping',()=>{
 const store=createPersonalStore(memory()),candidate=normalizeAddressResults(collection(feature()))[0];
 store.addPlace({...candidate,id:'local-home',label:'Home'});const saved=store.read().state.places[0];
 assert.equal(saved.id,'local-home');assert.equal(saved.sourceId,'photon:osm:N:123');assert.equal(saved.address,candidate.address);assert.equal(saved.lat,1.3);assert.equal(saved.routingId,null);assert.equal(saved.savedVia,'user');
});

test('automatic imports and route endpoint records stay preserved but out of personal lists',()=>{
 const storage=memory(),store=createPersonalStore(storage);
 store.saveRoute({label:'My commute',origin:endpoint('EW8'),destination:endpoint('EW12',1.31)});
 let raw=store.read().state;assert.equal(visiblePersonalState(raw).places.length,0);assert.equal(visiblePersonalState(raw).templates.length,1);
 store.addPlace({...endpoint('home-station'),label:'Home'});raw=store.read().state;
 const legacy={...endpoint('legacy-station:bugis'),sourceId:'legacy:public/data/sources.json'},importA={...endpoint('import-a')},importB={...endpoint('import-b',1.32)};
 raw.places.push(legacy,importA,importB);raw.templates.push({id:'legacy-offline-template',label:'Imported offline journey',originId:legacy.id,destinationId:legacy.id,preferences:{}},{id:'old-rail',label:'Imported rail route',originId:importA.id,destinationId:importB.id,preferences:{},savedAt:'2026-09-18T12:00:00Z'});raw.migrations.push('route-input:commute-copilot-rail-guidance-v1');
 storage.setItem(PERSONAL_KEY,JSON.stringify(raw));const original=storage.getItem(PERSONAL_KEY),visible=visiblePersonalState(store.read().state);
 assert.deepEqual(visible.places.map(p=>p.label),['Home']);assert.deepEqual(visible.templates.map(t=>t.label),['My commute']);assert.equal(storage.getItem(PERSONAL_KEY),original);
 const plan=instantiateTemplate(raw,visible.templates[0].id);assert.equal(plan.origin.routingId,'EW8');assert.equal(plan.destination.routingId,'EW12');
});

test('user-named imported route and R2 deliberately added station pairs stay visible',()=>{
 const storage=memory(),store=createPersonalStore(storage);store.addPlace(endpoint('a'));store.addPlace(endpoint('b',1.31));store.addTemplate({label:'Imported rail route',originId:'a',destinationId:'b'});
 let raw=store.read().state;raw.migrations.push('route-input:commute-copilot-rail-guidance-v1');assert.equal(visiblePersonalState(raw).templates.length,1);
 // R2 had no savedVia. A pair created from Add a place had no savedAt.
 raw.templates[0].label='My saved pair';delete raw.templates[0].savedVia;raw.places.forEach(p=>delete p.savedVia);
 assert.deepEqual(visiblePersonalState(raw).places.map(p=>p.id),['a','b']);
});

test('adding a station already retained for a route makes that place visible without breaking its route',()=>{
 const store=createPersonalStore(memory());store.saveRoute({label:'Commute',origin:endpoint('EW8'),destination:endpoint('EW12',1.31)});
 const before=store.read().state,originId=before.templates[0].originId;
 store.addPlace({...endpoint('EW8'),id:'new-local-choice'});const after=store.read().state;
 assert.equal(after.places.length,2);assert.equal(visiblePersonalState(after).places[0].id,originId);assert.equal(instantiateTemplate(after,after.templates[0].id).origin.routingId,'EW8');
});

test('deleting the last R2 route does not reveal its previously hidden automatic endpoints',()=>{
 const storage=memory(),store=createPersonalStore(storage);store.saveRoute({label:'Old R2 commute',origin:endpoint('EW8'),destination:endpoint('EW12',1.31)});
 const old=store.read().state;old.places.forEach(p=>delete p.savedVia);old.templates.forEach(t=>delete t.savedVia);storage.setItem(PERSONAL_KEY,JSON.stringify(old));
 store.addPlace({...endpoint('Home',1.32),id:'my-home'});
 assert.deepEqual(visiblePersonalState(store.read().state).places.map(p=>p.id),['my-home']);
 store.deleteTemplate(old.templates[0].id);const after=store.read().state;
 assert.deepEqual(visiblePersonalState(after).places.map(p=>p.id),['my-home']);assert.equal(after.places.length,3);assert.equal(after.templates.length,0);
 for(const original of old.places){const retained=after.places.find(p=>p.id===original.id);assert.equal(retained.savedVia,'route-endpoint');const {savedVia,...withoutVisibilityMetadata}=retained;assert.deepEqual(withoutVisibilityMetadata,original);}
 assert.deepEqual(visiblePersonalState(createPersonalStore(storage).read().state).places.map(p=>p.id),['my-home']);
});
