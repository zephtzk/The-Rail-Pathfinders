// Explicit public-location smoke check through the configured local server.
// Never reads a credential, cookie, dotenv file or private saved-place library.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeAddressItineraries} from '../src/address-routing.js';
import {validatePlan,startJourney,saveActive,restoreActive} from '../src/journey-v2.js';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4195';
const record={checkedAt:new Date().toISOString(),kind:'authenticated-provider-public-location-smoke',transport:'local same-origin server; server-held OneMap token',deployment:false,physicalDevice:false,requests:[]};
async function post(endpoint,body){
  const response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),raw=await response.text(),payload=JSON.parse(raw);
  record.requests.push({endpoint,input:body,httpStatus:response.status,result:payload.status,retrievedAt:payload.retrievedAt??null,responseSha256:createHash('sha256').update(raw).digest('hex')});
  if(!response.ok||payload.status!=='ok')throw Error(payload.message??'Provider check failed');return payload;
}
try{
  const origin=(await post('/api/address/search',{query:'Bugis Junction'})).results[0];
  const destination=(await post('/api/address/search',{query:'Tampines Mall'})).results[0];
  const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10),departureTime='10:00';
  const request={origin:{lat:origin.lat,lng:origin.lng},destination:{lat:destination.lat,lng:destination.lng},date,departureTime,preferences:{walkingLimitMinutes:30,stepFree:false}};
  const response=await post('/api/address/route',request),normalized=normalizeAddressItineraries(response,{...request,origin,destination});
  record.result=normalized.status;record.message=normalized.message;record.publicLocations={origin:origin.address,destination:destination.address};
  record.plans=normalized.plans.map(plan=>{
    const saved=new Map(),storage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)},active=startJourney(plan),savedOk=saveActive(storage,active);
    return {valid:!!validatePlan(plan),bytes:new TextEncoder().encode(JSON.stringify(plan)).byteLength,phases:plan.route.steps.map(s=>({type:s.type,service:s.source.serviceNo??s.source.routeId??null,from:s.source.fromLabel,to:s.source.toLabel})),walkingSeconds:plan.route.walkingSeconds,departureSeconds:plan.route.departureSeconds,arrivalSeconds:plan.route.arrivalSeconds,geometryPoints:plan.route.geometry.reduce((n,g)=>n+g.points.length,0),schematicSegments:plan.route.geometry.filter(g=>g.kind==='schematic').length,accessibility:plan.route.accessibility,fareStatus:plan.route.fareEstimate.status,hasLocalRoutingContext:!!active.routingContext,offlineRestoration:savedOk&&!!restoreActive(storage)};
  });
  if(!record.plans.length||record.plans.some(p=>!p.valid||!p.offlineRestoration||p.bytes>24576))throw Error('No canonical supported itinerary passed validation');
}catch(error){record.result='failed';record.message=error.message;process.exitCode=1;}
await mkdir('docs/evidence/r5',{recursive:true});await writeFile('docs/evidence/r5/address-live.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({result:record.result,message:record.message,plans:record.plans?.length??0,evidence:'docs/evidence/r5/address-live.json'}));
