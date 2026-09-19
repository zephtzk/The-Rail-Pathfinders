import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=name=>fs.readFileSync(path.join(root,name));
const json=name=>JSON.parse(read(name));
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const code=id=>id.replace(/_[AB]$/,'');
const aliasKey=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const byKey=(a,b)=>a[0].localeCompare(b[0],'en');
function haversine(a,b){
  const radians=Math.PI/180,dlat=(b[0]-a[0])*radians,dlon=(b[1]-a[1])*radians;
  const h=Math.sin(dlat/2)**2+Math.cos(a[0]*radians)*Math.cos(b[0]*radians)*Math.sin(dlon/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

// This compiler creates geographic estimates, never official fare distances.
// It uses code-level nodes because the GTFS parent station groups some tap-out
// interchanges whose line-specific paid areas must remain separate.
export function buildFareDistanceData(){
  const railBytes=read('public/data/rail-network.json'),rail=JSON.parse(railBytes),manifest=json('public/data/rail-manifest.json');
  const rulesBytes=read('data/rail/validation.json'),rules=JSON.parse(rulesBytes);
  requireValue(hash(railBytes)===manifest.sizes.networkSha256,'Rail network hash differs from its source manifest.');
  requireValue(hash(rulesBytes)===manifest.rules.sha256,'Rail transfer rules hash differs from its source manifest.');
  const coordinates=new Map(),stopCodes=new Map(),nameCodes=new Map();
  for(const stop of rail.stops){
    requireValue(/^([A-Z]+\d*|STC|PTC)_[AB]$/.test(stop.id)&&Number.isFinite(stop.lat)&&Number.isFinite(stop.lon),'Invalid rail stop coordinate.');
    const id=code(stop.id);stopCodes.set(stop.id,id);
    if(!coordinates.has(id))coordinates.set(id,[stop.lat,stop.lon]);
    const key=aliasKey(stop.name);if(!nameCodes.has(key))nameCodes.set(key,new Set());nameCodes.get(key).add(id);
  }
  const edges=new Map(),zeroEdges=new Map([...coordinates.keys()].map(id=>[id,new Set()]));
  const add=(from,to,metres)=>{
    if(from===to)return;
    const key=from+'|'+to,previous=edges.get(key);
    if(!previous||metres<previous[2])edges.set(key,[from,to,metres]);
  };
  for(const trip of rail.trips)for(let i=1;i<trip.stopTimes.length;i++){
    const from=stopCodes.get(trip.stopTimes[i-1][0]),to=stopCodes.get(trip.stopTimes[i][0]);
    requireValue(from&&to,'Trip references an unknown rail stop.');
    // Millimetre precision prevents per-edge rounding from accumulating whole
    // metre bias. Only the final shortest-path sum is rounded up to 100 metres.
    add(from,to,Math.round(haversine(coordinates.get(from),coordinates.get(to))*1000)/1000);
  }
  const reviewedTransfers=new Map(rules.transfers.map(t=>[t.fromStopId+'|'+t.toStopId,t]));
  const excluded=(from,to)=>rules.unsupportedConnections.some(c=>c.codes.includes(from)&&c.codes.includes(to));
  for(const transfer of rail.transfers){
    const from=stopCodes.get(transfer.fromStopId),to=stopCodes.get(transfer.toStopId);
    if(!from||!to||from===to||excluded(from,to))continue;
    const reviewed=reviewedTransfers.get(transfer.fromStopId+'|'+transfer.toStopId);
    if(!reviewed||reviewed.provenance!==transfer.provenance||!reviewed.provenance.includes(rules.topologySource)||!reviewed.provenance.includes('standard interchange ')||!reviewed.provenance.includes('reviewed '+rules.reviewedAt)||transfer.pathId||transfer.requiresTapOut)continue;
    add(from,to,0);zeroEdges.get(from).add(to);
  }
  const equivalent=(from,to)=>{
    const seen=new Set([from]),queue=[from];
    for(const at of queue)for(const next of zeroEdges.get(at))if(!seen.has(next)){seen.add(next);queue.push(next);}
    return seen.has(to);
  };
  const aliases={};
  for(const [name,ids] of [...nameCodes.entries()].sort(byKey)){
    const list=[...ids].sort();
    // Never infer paid-area membership from a shared name or GTFS parent id.
    if(list.every(id=>equivalent(list[0],id)&&equivalent(id,list[0])))aliases[name]=list[0];
  }
  const bus=json('public/data/bus-network.json'),busManifest=json('public/data/bus-manifest.json');
  const directory='data/bus/sources/'+busManifest.sourceDirectory;
  const metadataBytes=read(directory+'/metadata.json'),metadata=JSON.parse(metadataBytes);
  requireValue(metadata.version===bus.sourceVersion&&metadata.version===busManifest.sourceVersion,'Bus source versions disagree.');
  requireValue(hash(metadataBytes)===busManifest.sourceMetadataSha256,'Bus source metadata hash differs from manifest.');
  const services=metadata.datasets.BusServices;
  requireValue(services.paginationComplete&&services.terminalEmptyPage&&services.pages.at(-1).count===0,'Bus service source is incomplete.');
  const categories=new Map();let count=0;
  for(const [index,page] of services.pages.entries()){
    requireValue(page.file===`BusServices/${String(index*500).padStart(6,'0')}.json`,'Unexpected bus source page path.');
    const bytes=read(directory+'/'+page.file);requireValue(hash(bytes)===page.sha256,'Bus service page hash differs from metadata.');
    const rows=JSON.parse(bytes).value;requireValue(Array.isArray(rows)&&rows.length===page.count,'Bus service page count mismatch.');
    count+=rows.length;
    for(const row of rows){
      const id=`${row.ServiceNo}:${row.Operator}:${row.Direction}`;
      requireValue(!categories.has(id)&&typeof row.Category==='string'&&/^[A-Z _-]+$/.test(row.Category),'Invalid or duplicate bus category.');
      categories.set(id,row.Category);
    }
  }
  requireValue(count===services.rawCount,'Bus service source count mismatch.');
  const included={};for(const pattern of [...bus.patterns].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
    requireValue(categories.has(pattern.id),'Bus pattern has no official service category.');included[pattern.id]=categories.get(pattern.id);
  }
  return {
    RAIL_DISTANCE_VERSION:{id:'rail-coordinate-estimate-v1',validFrom:rail.coverage.startDate,validThrough:rail.coverage.endDate,reviewedAt:rules.reviewedAt,source:manifest.source.sourceUrl,sourceVersion:manifest.source.version,networkSha256:manifest.sizes.networkSha256,topologySource:rules.topologySource,topologySha256:manifest.rules.sha256,method:'Approximate shortest distance through consecutive GTFS rail stops using straight coordinate segments and reviewed interchange connections. Rounded up to 0.1 km; not official fare distance or track length. Timetable duration is not used; service availability and tap-out shortcuts are not inferred.'},
    RAIL_DISTANCE_STATIONS:Object.fromEntries([...coordinates.entries()].sort(byKey)),
    RAIL_DISTANCE_EDGES:[...edges.values()].sort((a,b)=>a[0].localeCompare(b[0],'en')||a[1].localeCompare(b[1],'en')),
    RAIL_DISTANCE_ALIASES:aliases,
    RAIL_DISTANCE_EXCLUDED_TRANSFERS:rules.unsupportedConnections.map(c=>({codes:c.codes,reason:c.reason})),
    BUS_CATEGORY_VERSION:{source:metadata.sourceUrl,sourceVersion:metadata.version,reviewedAt:busManifest.retrievedAt.slice(0,10),validFrom:bus.coverage.validFrom,validThrough:bus.coverage.validThrough,metadataSha256:hash(metadataBytes),servicePageSha256s:services.pages.map(p=>p.sha256)},
    BUS_FARE_CATEGORIES:included
  };
}

export function renderFareDistanceData(data=buildFareDistanceData()){
  return '// Generated by scripts/build-fare-distances.mjs. Coordinate estimates are NOT official fare distances.\n'+Object.entries(data).map(([key,value])=>`export const ${key}=${JSON.stringify(value)};`).join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=path.join(root,'src/fare-distance-data.js'),rendered=renderFareDistanceData();
  if(process.argv.includes('--check'))requireValue(fs.readFileSync(output,'utf8')===rendered,'Generated fare distance data is stale.');
  else fs.writeFileSync(output,rendered);
  console.log(`Fare distance data ${process.argv.includes('--check')?'verified':'generated'} (${Buffer.byteLength(rendered)} bytes).`);
}
