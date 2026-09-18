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

test('R2 upgrade preserves ambiguous station bookmarks referenced by timestamped routes without rewriting bytes',()=>{
 const storage=memory(),store=createPersonalStore(storage);store.saveRoute({label:'Old R2 commute',origin:endpoint('EW8'),destination:endpoint('EW12',1.31)});
 const old=store.read().state;old.places.forEach(p=>delete p.savedVia);old.places[0].label='Home';old.templates.forEach(t=>delete t.savedVia);storage.setItem(PERSONAL_KEY,JSON.stringify(old,null,2));
 const original=storage.getItem(PERSONAL_KEY),ids=old.places.map(p=>p.id);
 assert.deepEqual(visiblePersonalState(store.read().state).places.map(p=>p.id),ids);assert.equal(storage.getItem(PERSONAL_KEY),original);
 assert.deepEqual(visiblePersonalState(createPersonalStore(storage).read().state).places.map(p=>p.id),ids);assert.equal(storage.getItem(PERSONAL_KEY),original);
 store.deleteTemplate(old.templates[0].id);const after=store.read().state;
 assert.deepEqual(after.places.map(({savedVia,...p})=>p),old.places);assert.ok(after.places.every(p=>p.savedVia==='user'));assert.equal(after.templates.length,0);
 assert.deepEqual(visiblePersonalState(createPersonalStore(storage).read().state).places.map(p=>p.id),ids);
});

test('saving a route reuses an older visible station bookmark as user intent through deletion and reload',()=>{
 const storage=memory(),store=createPersonalStore(storage),home={...endpoint('my-home'),label:'Home',routingId:'EW8',entranceId:null};
 storage.setItem(PERSONAL_KEY,JSON.stringify({schemaVersion:2,places:[home],templates:[],migrations:[]}));
 store.saveRoute({label:'Daily commute',origin:endpoint('EW8'),destination:endpoint('EW12',1.31)});
 const saved=store.read().state,route=saved.templates[0];
 assert.equal(route.originId,home.id);assert.equal(saved.places.length,2);assert.equal(saved.places.find(p=>p.id===home.id).savedVia,'user');
 assert.deepEqual(visiblePersonalState(saved).places.map(p=>p.label),['Home']);assert.equal(instantiateTemplate(saved,route.id).origin.routingId,'EW8');
 store.deleteTemplate(route.id);const reloaded=createPersonalStore(storage).read().state;
 assert.deepEqual(visiblePersonalState(reloaded).places.map(p=>p.label),['Home']);assert.equal(reloaded.places.length,2);assert.equal(reloaded.places.find(p=>p.id!==home.id).savedVia,'route-endpoint');
});

test('explicit automatic endpoints and migration records stay hidden after route deletion and reload',()=>{
 const storage=memory(),store=createPersonalStore(storage);
 store.saveRoute({label:'Commute',origin:endpoint('EW8'),destination:endpoint('EW12',1.31)});
 store.saveRoute({label:'Imported commute',origin:endpoint('EW9',1.32),destination:endpoint('EW10',1.33),savedVia:'migration'});
 const before=store.read().state;assert.equal(visiblePersonalState(before).places.length,0);
 for(const route of before.templates)store.deleteTemplate(route.id);
 const after=createPersonalStore(storage).read().state;assert.deepEqual(after.places,before.places);assert.equal(after.templates.length,0);assert.equal(visiblePersonalState(after).places.length,0);
});

test('older identified migration endpoints do not become visible when the imported route is deleted',()=>{
 const storage=memory(),store=createPersonalStore(storage),places=[endpoint('a'),endpoint('b',1.31)];
 const old={schemaVersion:2,places,templates:[{id:'old-import',label:'Imported rail route',originId:'a',destinationId:'b',preferences:{},savedAt:'2026-09-18T12:00:00Z'}],migrations:['route-input:commute-copilot-rail-guidance-v1']};
 storage.setItem(PERSONAL_KEY,JSON.stringify(old));assert.equal(visiblePersonalState(store.read().state).places.length,0);
 store.deleteTemplate('old-import');const after=createPersonalStore(storage).read().state;
 assert.equal(visiblePersonalState(after).places.length,0);assert.deepEqual(after.places.map(({savedVia,...p})=>p),places);assert.ok(after.places.every(p=>p.savedVia==='route-endpoint'));
});

test('deleting a user route preserves ambiguous endpoints still referenced by an imported route',()=>{
 const storage=memory(),store=createPersonalStore(storage),places=[{...endpoint('home'),label:'Home'},endpoint('work',1.31)];
 const imported={id:'old-import',label:'Imported rail route',originId:'home',destinationId:'work',preferences:{},savedAt:'2026-09-18T12:00:00Z'};
 const deliberate={...imported,id:'user-route',label:'My regular journey',savedVia:'user'};
 const old={schemaVersion:2,places,templates:[imported,deliberate],migrations:['route-input:commute-copilot-rail-guidance-v1']};
 storage.setItem(PERSONAL_KEY,JSON.stringify(old));const original=storage.getItem(PERSONAL_KEY);
 assert.deepEqual(visiblePersonalState(store.read().state).places.map(p=>p.id),['home','work']);assert.equal(storage.getItem(PERSONAL_KEY),original);
 store.deleteTemplate('user-route');const after=createPersonalStore(storage).read().state;
 assert.deepEqual(visiblePersonalState(after).places.map(p=>p.id),['home','work']);assert.deepEqual(after.templates,[imported]);
 assert.ok(after.places.every(p=>p.savedVia==='user'));assert.deepEqual(after.places.map(({savedVia,...p})=>p),places);
 store.deleteTemplate(imported.id);assert.deepEqual(visiblePersonalState(createPersonalStore(storage).read().state).places.map(p=>p.id),['home','work']);
});
