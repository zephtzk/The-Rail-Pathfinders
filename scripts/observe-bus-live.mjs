/** Two real requests only; capture sanitized advisory outputs using production normalizer. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createBusAdapter} from '../server/bus-adapter.js';
export async function observeBus(key){
  const network=JSON.parse(await readFile('public/data/bus-network.json','utf8'));
  const shapes=[];
  const fetcher=async(...args)=>{
    const response=await fetch(...args);
    if(response.ok){
      try{
        const value=await response.clone().json(),first=value.Services?.[0];
        shapes.push({topLevelKeys:Object.keys(value),serviceKeys:first?Object.keys(first):[],predictionKeys:first?.NextBus?Object.keys(first.NextBus):[],serviceCount:value.Services?.length??null});
      }catch{shapes.push({parse:'malformed'});}
    }
    return response;
  };
  const adapter=createBusAdapter({patterns:network.patterns,allowedStopCodes:['81111','01059'],fetcher});
  const results=[];
  for(const code of ['81111','01059'])results.push(await adapter(code,{LTA_ACCOUNT_KEY:key}));
  const evidence={schemaVersion:1,kind:'real-api-observation',checkedAt:new Date().toISOString(),networkSourceVersion:network.sourceVersion,requestCount:2,credentialPersisted:false,shapeObservations:shapes,results,
    limitation:'Point-in-time observations only. Source supplies no observation/generation timestamp. Recorded predictions are historical evidence and must never be displayed as current or used as future itinerary timing.'};
  await mkdir('docs/evidence/phase3',{recursive:true});
  await writeFile('docs/evidence/phase3/bus-live-real.json',JSON.stringify(evidence,null,2)+'\n');
  return {requestCount:2,stops:results.map(r=>({stopCode:r.stopCode,status:r.status,matched:(r.predictions??[]).filter(p=>p.matchStatus==='matched').length,predictions:r.predictions?.length??0,error:r.error??null}))};
}
