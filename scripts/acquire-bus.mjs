/** Versioned DataMall static bus acquisition. Never persists AccountKey. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export const ENDPOINTS=['BusStops','BusRoutes','BusServices'];
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const BASE='https://datamall2.mytransport.sg/ltaodataservice/';
export async function acquireBus(key,outputDir,{fetchImpl=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  if(!key)throw new Error('DataMall key unavailable');
  const startedAt=new Date().toISOString(),datasets={};
  // Single request at a time; explicit empty terminal page proves exhaustion.
  for(const endpoint of ENDPOINTS){
    const records=[],pages=[];let exhausted=false;
    for(let skip=0;skip<=100000;skip+=500){
      const retrievedAt=new Date().toISOString();
      const response=await fetchImpl(`${BASE}${endpoint}?$skip=${skip}`,{headers:{AccountKey:key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error(`DataMall ${endpoint} HTTP ${response.status}; acquisition aborted`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>8*1024*1024)throw new Error('Page byte bound exceeded');
      const payload=JSON.parse(bytes.toString('utf8'));
      if(!Array.isArray(payload.value)||payload.value.length>500)throw new Error('Invalid page envelope');
      const contentSha256=sha256(JSON.stringify(payload.value));
      if(payload.value.length&&pages.some(p=>p.contentSha256===contentSha256))throw new Error('Repeated page; pagination ignored or unstable');
      pages.push({skip,count:payload.value.length,retrievedAt,httpDate:response.headers.get('Date'),lastModified:response.headers.get('Last-Modified'),sha256:sha256(bytes),contentSha256,raw:bytes.toString('utf8')});
      records.push(...payload.value);
      if(!payload.value.length){exhausted=true;break;}
      await pause(150);
    }
    if(!exhausted)throw new Error('Pagination did not reach an empty terminal page');
    datasets[endpoint]={endpoint:BASE+endpoint,records,pages};
  }
  const canonical=JSON.stringify(Object.fromEntries(ENDPOINTS.map(e=>[e,datasets[e].records])));
  const version=sha256(canonical),directory=path.join(outputDir,`lta-bus-${startedAt.slice(0,10)}-${version.slice(0,12)}`);
  await mkdir(outputDir,{recursive:true});
  try{await mkdir(directory,{recursive:false});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const previous=JSON.parse(await readFile(path.join(directory,'metadata.json'),'utf8'));
    if(previous.version!==version)throw new Error('Existing snapshot version mismatch');
    for(const endpoint of ENDPOINTS)for(const page of previous.datasets[endpoint].pages){
      if(page.file!==`${endpoint}/${String(page.skip).padStart(6,'0')}.json`)throw new Error('Invalid existing snapshot path');
      if(sha256(await readFile(path.join(directory,page.file)))!==page.sha256)throw new Error('Existing snapshot hash mismatch');
    }
    return {directory,version,counts:Object.fromEntries(ENDPOINTS.map(e=>[e,datasets[e].records.length])),credentialPersisted:false,reusedExisting:true,repeatVerifiedAt:new Date().toISOString(),repeatRequestCount:Object.values(datasets).reduce((n,d)=>n+d.pages.length,0)};
  }
  const metadata={schemaVersion:1,publisher:'Land Transport Authority Singapore',dataset:'BusStops, BusRoutes, BusServices',sourceUrl:'https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html',documentationUrl:'https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf',documentationVersion:'6.9 (3 Aug 2026)',retrievalStartedAt:startedAt,retrievedAt:new Date().toISOString(),version,credentialPersisted:false,license:'Singapore Open Data Licence v1.0',licenseUrl:'https://data.gov.sg/open-data-licence',datasets:{}};
  for(const endpoint of ENDPOINTS){
    const data=datasets[endpoint];await mkdir(path.join(directory,endpoint));
    for(const page of data.pages){const {raw,...record}=page;record.file=`${endpoint}/${String(page.skip).padStart(6,'0')}.json`;await writeFile(path.join(directory,record.file),raw);Object.assign(page,record);delete page.raw;}
    metadata.datasets[endpoint]={endpoint:data.endpoint,rawCount:data.records.length,pageSize:500,paginationComplete:true,terminalEmptyPage:true,pages:data.pages};
  }
  await writeFile(path.join(directory,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
  return {directory,version,counts:Object.fromEntries(ENDPOINTS.map(e=>[e,datasets[e].records.length])),credentialPersisted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await acquireBus(process.env.LTA_ACCOUNT_KEY,process.argv[2]??'data/bus/sources')));}
  catch(error){console.error(`Bus acquisition failed: ${error.message.includes('DataMall')?error.message:error.name}. No credential saved.`);process.exitCode=1;}
}
