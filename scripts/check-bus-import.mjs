import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=(condition,message)=>{if(!condition)throw Error(`Bus import verification: ${message}`);};
export async function checkBusImport(){
  const manifest=JSON.parse(await readFile('public/data/bus-manifest.json','utf8'));
  const networkBytes=await readFile('public/data/bus-network.json'),network=JSON.parse(networkBytes);
  require(hash(networkBytes)===manifest.networkSha256,'network hash differs');
  require(hash(await readFile('scripts/import-bus.py'))===manifest.importerSha256,'importer changed; reimport required');
  require(hash(await readFile('data/bus/validation.json'))===manifest.rulesSha256,'rules changed; reimport required');
  require(/^lta-bus-\d{4}-\d\d-\d\d-[a-f0-9]{12}$/.test(manifest.sourceDirectory),'invalid source directory');
  const base=path.join('data/bus/sources',manifest.sourceDirectory),metadataBytes=await readFile(path.join(base,'metadata.json'));
  require(hash(metadataBytes)===manifest.sourceMetadataSha256,'source metadata changed');
  const metadata=JSON.parse(metadataBytes),all={};
  for(const endpoint of ['BusStops','BusRoutes','BusServices']){
    all[endpoint]=[];const spec=metadata.datasets[endpoint];
    require(spec.pages.at(-1).count===0&&spec.terminalEmptyPage&&spec.paginationComplete,'pagination not complete');
    for(const [index,page] of spec.pages.entries()){
      require(page.skip===index*500&&page.file===`${endpoint}/${String(page.skip).padStart(6,'0')}.json`,'bad page ordering/path');
      const bytes=await readFile(path.join(base,page.file));require(hash(bytes)===page.sha256,'raw page changed');
      const rows=JSON.parse(bytes).value;require(Array.isArray(rows)&&rows.length===page.count&&rows.length<=500,'page count differs');
      all[endpoint].push(...rows);
    }
    require(all[endpoint].length===spec.rawCount&&spec.rawCount===manifest.audit.rawCounts[endpoint],'total differs');
  }
  require(hash(JSON.stringify(all))===manifest.sourceVersion&&network.sourceVersion===manifest.sourceVersion,'combined source hash differs');
  const accepted=manifest.audit.acceptedCounts;
  require(network.stops.length===accepted.BusStops&&network.patterns.length===accepted.BusServices&&network.patterns.reduce((sum,p)=>sum+p.stops.length,0)===accepted.BusRoutes,'compiled counts differ');
  return {status:'PASS',sourceVersion:manifest.sourceVersion,networkSha256:manifest.networkSha256,networkBytes:networkBytes.length,acceptedCounts:accepted};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await checkBusImport()));
