import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAddressAdapter,normalizeProviderItineraries,normalizeOneMapSearch} from '../server/address-adapter.js';
import {createAddressRouter,normalizeAddressItineraries,externalRerouteState,ADDRESS_PLAN_LIMIT} from '../src/address-routing.js';
import {createOneMapAddressSearch} from '../src/address-search.js';
import {startJourney,saveActive,restoreActive,validatePlan,confirmCheckpoint} from '../src/journey-v2.js';
import {decodePolyline,validExternalGeometry} from '../src/external-geometry.js';
import {drawExternalRoute} from '../src/network-map.js';
import {renderItineraryTimeline,checkpointChoices} from '../src/itinerary-display.js';
import {handleSharingApi} from '../server/sharing.js';
import {LocalSharingStore} from '../server/providers-local.js';

// Synthetic contract inputs only. These are not live provider captures or
// evidence that these stops/services or corridors exist in the real world.
const NOW=Date.parse('2026-09-19T09:00:00+08:00');
const p=(name,lat=1.3,lon=103.8)=>({name,lat,lon});
const leg=(mode,start,end,from,to,extra={})=>({mode,startTime:NOW+start*1000,endTime:NOW+end*1000,duration:end-start,distance:mode==='WALK'?300:4000,from,to,...extra});
function upstream(){return {plan:{itineraries:[{startTime:NOW,endTime:NOW+1500*1000,walkTime:600,legs:[leg('WALK',0,300,p('Example doorway'),p('Example stop A',1.301)),leg('BUS',420,1200,p('Example stop A',1.301),p('Example stop B',1.32),{route:'23A',headsign:'Public terminus'}),leg('WALK',1200,1500,p('Example stop B',1.32),p('Example destination',1.321))]}]}};}
function input(overrides={}){return {origin:{id:'local-home',label:'My secret home',savedVia:'user',sourceId:'photon:osm:N:1',address:'Public start address',lat:1.3,lng:103.8},destination:{id:'local-work',label:'Private appointment',kind:'saved',address:'Public destination address',lat:1.321,lng:103.8},date:'2026-09-19',departureTime:'09:00',preferences:{walkingLimitMinutes:30,stepFree:false},...overrides};}
function dto(raw=upstream()){return {provider:'onemap',status:'ok',retrievedAt:NOW,itineraries:normalizeProviderItineraries(raw)};}
function request(endpoint,body=input(),extra={}){return new Request('https://commute.test/api/address/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});}
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const body=async response=>({status:response.status,value:await response.json()});
const normal=()=>normalizeAddressItineraries(dto(),input(),{now:NOW});

test('OneMap proxy refuses missing credentials explicitly without contacting upstream',async()=>{
  let calls=0;const handle=createAddressAdapter({fetcher:()=>{calls++;},clock:()=>NOW});
  const result=await body(await handle(request('route')));assert.equal(result.status,503);assert.equal(result.value.status,'unavailable');assert.equal(calls,0);
  const status=await body(await handle(new Request('https://commute.test/api/address/status')));assert.equal(status.value.status,'unavailable');
});

test('token travels only in an Authorization header; route input exposes no personal label or minutes-as-metres',async()=>{
  let call;const handle=createAddressAdapter({clock:()=>NOW,fetcher:async(url,options)=>{call={url:new URL(url),options};return json(upstream());}});
  const result=await body(await handle(request('route'),{ONEMAP_TOKEN:'synthetic-secret'}));
  assert.equal(result.status,200);assert.equal(call.url.origin,'https://www.onemap.gov.sg');assert.equal(call.url.searchParams.get('date'),'09-19-2026');assert.equal(call.url.searchParams.get('time'),'09:00:00');assert.equal(call.url.searchParams.get('numItineraries'),'3');assert.equal(call.url.searchParams.has('maxWalkDistance'),false);assert.equal(call.options.headers.Authorization,'synthetic-secret');assert.equal(call.options.redirect,'error');assert.doesNotMatch(call.url.href,/secret|home|appointment/i);assert.doesNotMatch(JSON.stringify(result.value),/synthetic-secret/);
});

test('proxy keeps API private, rejects cross origin, URL queries, unsupported dates and step-free access',async()=>{
  const handle=createAddressAdapter({clock:()=>NOW,fetcher:async()=>json(upstream())}),env={ONEMAP_TOKEN:'test'};
  assert.equal((await handle(request('route',input(),{Origin:'https://evil.test'}),env)).status,403);
  assert.equal((await handle(new Request('https://commute.test/api/address/route?origin=private'),env)).status,400);
  assert.equal((await handle(request('route',input({date:'2026-10-20'})),env)).status,422);
  assert.equal((await handle(request('route',input({date:'2026-09-18'})),env)).status,422);
  const blocked=await body(await handle(request('route',input({preferences:{stepFree:true,walkingLimitMinutes:30}})),env));assert.equal(blocked.value.status,'accessibility-unverified');
  const response=await handle(request('route'),env);assert.match(response.headers.get('cache-control'),/no-store, private/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});

test('one-calendar-month horizon clamps leap month ends without changing Singapore date',async()=>{
  const handle=createAddressAdapter({clock:()=>Date.parse('2028-01-31T00:30:00+08:00'),fetcher:async()=>json(upstream())}),env={ONEMAP_TOKEN:'test'};
  assert.equal((await handle(request('route',input({date:'2028-02-29'})),env)).status,200);
  assert.equal((await handle(request('route',input({date:'2028-03-01'})),env)).status,422);
});

test('bounded requests, concurrent calls and upstream backoff cannot fan out',async()=>{
  let resolve,calls=0;const handle=createAddressAdapter({clock:()=>NOW,maxConcurrent:1,fetcher:()=>{calls++;return new Promise(done=>resolve=done);}}),env={ONEMAP_TOKEN:'test'};
  const first=handle(request('route'),env);await new Promise(done=>setTimeout(done,5));assert.equal((await handle(request('route'),env)).status,429);resolve(json(upstream()));await first;assert.equal(calls,1);
  const rate=createAddressAdapter({clock:()=>NOW,fetcher:async()=>new Response('not forwarded',{status:429})});assert.equal((await rate(request('route'),env)).status,429);assert.equal((await rate(request('route'),env)).status,429);
});

test('expired access, network failure, huge bodies and malformed responses never echo upstream details',async()=>{
  for(const fetcher of [async()=>new Response('secret diagnostic',{status:401}),async()=>{throw Error('private url');},async()=>json({invalid:'secret diagnostic'})]){
    const result=await body(await createAddressAdapter({clock:()=>NOW,fetcher})(request('route'),{ONEMAP_TOKEN:'test'}));assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.value),/secret diagnostic|private url/);
  }
  const handle=createAddressAdapter({clock:()=>NOW});assert.equal((await handle(request('search',{query:'x'.repeat(5000)}))).status,400);
});

test('contract normalization rejects overlapping, missing, unsupported or inconsistent transit legs',()=>{
  for(const mutate of [r=>r.plan.itineraries[0].legs[1].startTime=NOW,r=>delete r.plan.itineraries[0].legs[0].from,r=>r.plan.itineraries[0].legs[1].mode='FERRY',r=>r.plan.itineraries[0].legs[1].duration=1]){const raw=upstream();mutate(raw);assert.deepEqual(normalizeProviderItineraries(raw),[]);}
  assert.throws(()=>normalizeProviderItineraries({itineraries:[]}));
});

test('canonical provider journey preserves public identity, wait phases, provider distance and explicit progress',()=>{
  const result=normal();assert.equal(result.status,'ok');const plan=result.plans[0];assert.ok(validatePlan(plan));assert.equal(plan.origin.label,'Public start address');assert.equal(plan.route.steps.length,4);assert.equal(plan.route.steps[1].type,'wait');assert.equal(plan.route.walkingSeconds,600);assert.equal(plan.route.departureSeconds,9*3600);assert.equal(plan.route.arrivalSeconds,9*3600+1500);assert.equal(plan.route.accessibility,'unknown');assert.equal(plan.route.fareEstimate,undefined);assert.equal(plan.route.steps.find(s=>s.type==='ride').source.distanceMetres,4000);assert.equal(plan.route.legacyRoute,undefined);assert.doesNotMatch(JSON.stringify(plan),/My secret home|Private appointment/);
  let active=startJourney(plan,NOW);assert.equal(active.routingContext,undefined);active=confirmCheckpoint(active,{stepIndex:2,kind:'onboard'},NOW+1);assert.equal(active.progress.stepIndex,2);assert.equal(externalRerouteState(active).status,'unsupported');
  assert.deepEqual(checkpointChoices(plan.route).map(c=>c.stepIndex),[0,1,2,3]);
  const html=renderItineraryTimeline(plan.route);assert.match(html,/Example stop A → Example stop B/);assert.match(html,/Bus 23A/);
});

test('walking limit is cumulative seconds across all legs and never distance',()=>{
  const rejected=normalizeAddressItineraries(dto(),input({preferences:{walkingLimitMinutes:9,stepFree:false}}));assert.equal(rejected.status,'walking-limit');assert.equal(rejected.plans.length,0);
  const highTotal=dto();highTotal.itineraries[0].walkTime=1900;assert.equal(normalizeAddressItineraries(highTotal,input()).status,'walking-limit');
  assert.equal(normalizeAddressItineraries(dto(),input({preferences:{walkingLimitMinutes:10,stepFree:false}})).status,'ok');
});

test('missing transfer connections and silently snapped endpoints cannot create an accepted itinerary',()=>{
  const disconnected=dto();disconnected.itineraries[0].legs[1].from.lat+=.01;assert.equal(normalizeAddressItineraries(disconnected,input()).status,'unsupported-response');
  const snapped=dto();snapped.itineraries[0].legs[0].from.lat+=.01;assert.equal(normalizeAddressItineraries(snapped,input()).status,'unsupported-response');
  const anonymous=dto();anonymous.itineraries[0].legs[1].route='';assert.equal(normalizeAddressItineraries(anonymous,input()).status,'unsupported-response');
});

test('provider geometry is decoded and bounded without changing canonical steps',()=>{
  const encode=points=>{let lat=0,lng=0;const delta=n=>{let value=n<0?-n*2-1:n*2,s='';while(value>=32){s+=String.fromCharCode((value%32|32)+63);value=Math.floor(value/32);}return s+String.fromCharCode(value+63);};return points.map(p=>{const nextLat=Math.round(p[0]*1e5),nextLng=Math.round(p[1]*1e5),out=delta(nextLat-lat)+delta(nextLng-lng);lat=nextLat;lng=nextLng;return out;}).join('');};
  const raw=dto();for(const leg of raw.itineraries[0].legs){leg.geometry=encode(Array.from({length:200},(_,i)=>[leg.from.lat+(leg.to.lat-leg.from.lat)*i/199,leg.from.lng]));}
  const plan=normalizeAddressItineraries(raw,input()).plans[0];assert.equal(plan.route.steps.length,4);assert.equal(plan.route.geometry.reduce((sum,g)=>sum+g.points.length,0),192);assert.ok(plan.route.geometry.every(g=>g.kind==='provider'));assert.equal(validExternalGeometry(plan.route),true);assert.ok(new TextEncoder().encode(JSON.stringify(plan)).byteLength<=24576);
});

test('external ranking honors walking preference only within the extra-time allowance and makes no crowding claim',()=>{
  const payload=dto(),later=structuredClone(payload.itineraries[0]);
  later.startTime+=600000;later.endTime+=600000;for(const leg of later.legs){leg.startTime+=600000;leg.endTime+=600000;}
  later.walkTime=300;later.legs[0].mode='BUS';later.legs[0].route='99';payload.itineraries.push(later);
  const bounded=normalizeAddressItineraries(payload,input({preferences:{walkingLimitMinutes:30,stepFree:false,preference:'less-walking',maxExtraMinutes:5}}));assert.equal(bounded.plans[0].route.walkingSeconds,600);
  const flexible=normalizeAddressItineraries(payload,input({preferences:{walkingLimitMinutes:30,stepFree:false,preference:'less-walking',maxExtraMinutes:15}}));assert.equal(flexible.plans[0].route.walkingSeconds,300);
  const quieter=normalizeAddressItineraries(payload,input({preferences:{walkingLimitMinutes:30,stepFree:false,preference:'quieter'}}));assert.match(quieter.message,/Crowding is unknown/);assert.equal(quieter.plans[0].route.walkingSeconds,600);
});

test('deadlines and date rollover use Singapore instants, preserving constraints',()=>{
  assert.equal(normalizeAddressItineraries(dto(),input({deadline:'09:24',deadlineDate:'2026-09-19',timeMode:'arrive-by'})).status,'impossible-deadline');
  const raw=upstream(),shift=14.75*3600000;for(const item of raw.plan.itineraries){item.startTime+=shift;item.endTime+=shift;for(const l of item.legs){l.startTime+=shift;l.endTime+=shift;}}
  const result=normalizeAddressItineraries(dto(raw),input({departureTime:'23:45',deadline:'00:15',deadlineDate:'2026-09-20',timeMode:'arrive-by'}));assert.equal(result.status,'ok');assert.equal(result.plans[0].route.arrivalSeconds,87000);assert.equal(result.plans[0].deadlineDate,'2026-09-20');
});

test('provider plans restore offline without a fake local routing context',()=>{
  const active=startJourney(normal().plans[0],NOW),records=new Map(),storage={setItem:(k,v)=>records.set(k,v),getItem:k=>records.get(k)};assert.equal(saveActive(storage,active),true);const restored=restoreActive(storage);assert.deepEqual(restored.route,active.route);assert.equal(restored.routingContext,undefined);assert.equal(restored.permissions.location,false);
});

test('invalid external map coordinates or canonical indices fail saved/shared plan validation',()=>{
  const plan=normal().plans[0];plan.route.geometry[0].points[0]=[91,103.8];assert.equal(validatePlan(plan),null);
  const other=normal().plans[0];other.route.geometry[0].stepIndex=999;assert.equal(validExternalGeometry(other.route),false);assert.equal(validatePlan(other),null);
  assert.throws(()=>decodePolyline('~~~~'));assert.throws(()=>decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'));
});

test('malicious provider labels render as inert text in standalone external itinerary',()=>{
  const raw=upstream();raw.plan.itineraries[0].legs[1].from.name='<img src=x onerror=alert(1)>';const plan=normalizeAddressItineraries(dto(raw),input()).plans[0];const html=renderItineraryTimeline(plan.route);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
});

test('external map helper uses accepted geometry only, labels absent paths schematic and does not move map',()=>{
  const route=normal().plans[0].route,drawn=[],map={},layer={addTo:target=>{assert.equal(target,map);return layer;}},leaflet={layerGroup:()=>layer,polyline:(points,options)=>({addTo:()=>drawn.push({points,options})})};
  const result=drawExternalRoute(map,route,{leaflet});assert.equal(result.schematic,true);assert.equal(result.points.length,6);
  const lines=drawn.filter(d=>d.options.className?.startsWith('journey-route-line'));
  assert.equal(lines.length,3);assert.deepEqual(lines.map(d=>d.points),route.geometry.map(g=>g.points));
  assert.deepEqual(lines.map(d=>d.options.dashArray),['1 9',null,'1 9']);
  assert.equal(drawn.filter(d=>d.options.className==='journey-bus-detail').length,1);
});

test('browser request sends only coordinates, date/time and preferences; cancellation ignores late response',async()=>{
  let resolve,requestOptions;const router=createAddressRouter({fetcher:(_url,options)=>{requestOptions=options;return new Promise(done=>resolve=done);}});const pending=router.route(input());const sent=JSON.parse(requestOptions.body);assert.deepEqual(Object.keys(sent.origin),['lat','lng']);assert.doesNotMatch(requestOptions.body,/secret|appointment|Public start|local-home/);router.cancel();resolve(json(dto()));assert.equal(await pending,null);assert.equal(requestOptions.signal.aborted,true);
  const offline=await createAddressRouter({isOnline:()=>false,fetcher:()=>assert.fail('offline fetch')}).route(input());assert.equal(offline.status,'offline');
});

test('OneMap search is bounded, explicit, POST only and stays separate from personal saved labels',async()=>{
  const results=normalizeOneMapSearch({results:[{ADDRESS:'10 PUBLIC ROAD',SEARCHVAL:'PUBLIC BUILDING',LATITUDE:'1.3',LONGITUDE:'103.8'},{ADDRESS:'OUTSIDE',LATITUDE:'0',LONGITUDE:'0'}]});assert.equal(results.length,1);assert.equal(results[0].routingId,null);assert.equal(results[0].accessibility,'unknown');let calls=0;
  const search=createOneMapAddressSearch({fetcher:async(url,options)=>{calls++;assert.equal(url,'/api/address/search');assert.deepEqual(JSON.parse(options.body),{query:'public road'});assert.equal(options.method,'POST');return json({provider:'onemap',status:'ok',results});}});assert.equal(calls,0);assert.equal((await search.search('public road')).length,1);await search.search('public road');assert.equal(calls,1);
});

test('external plan fits the 24 KiB sharing contract and persists through invitation review',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'r5-address-sharing-')),store=new LocalSharingStore(path.join(directory,'test.sqlite'));t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true});});
  const plan=normal().plans[0];assert.ok(new TextEncoder().encode(JSON.stringify(plan)).byteLength<=ADDRESS_PLAN_LIMIT);
  const created=await handleSharingApi(new Request('https://commute.test/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})}),{SHARING_STORE:store});assert.equal(created.status,201);const share=await created.json();
  const reviewed=await handleSharingApi(new Request(`https://commute.test/api/shares/${share.id}`,{headers:{Authorization:'Bearer '+share.inviteToken}}),{SHARING_STORE:store});assert.equal(reviewed.status,200);assert.deepEqual((await reviewed.json()).proposedPlan.route.geometry,plan.route.geometry);
  plan.route.geometry[0].stepIndex=100;
  const invalid=await handleSharingApi(new Request('https://commute.test/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})}),{SHARING_STORE:store});assert.equal(invalid.status,400);
});

test('sharing byte bound rejects multibyte oversized content even below character limit',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'r5-address-sharing-')),store=new LocalSharingStore(path.join(directory,'test.sqlite'));t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true});});
  const plan={schemaVersion:2,origin:{id:'a'},destination:{id:'b'},notes:Array(9).fill('界'.repeat(1000))};assert.ok(JSON.stringify(plan).length<24576);
  const response=await handleSharingApi(new Request('https://commute.test/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})}),{SHARING_STORE:store});assert.equal(response.status,400);
});
