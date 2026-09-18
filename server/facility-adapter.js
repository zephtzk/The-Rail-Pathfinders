// LTA API guide v6.9, 3 August 2026, p.44. Optional LiftID is never inferred.
const FACILITY_URL='https://datamall2.mytransport.sg/ltaodataservice/v2/FacilitiesMaintenance';
const facilityText=(value,key,max=500)=>typeof value==='string'?value.split(key||'\u0000').join('[redacted]').trim().slice(0,max):null;
export function normalizeFacilitiesMaintenance(payload,key=''){
  if(!payload||!Array.isArray(payload.value)||payload.value.length>10000)throw Error('malformed');
  let invalidRecords=0;
  const records=payload.value.flatMap((r,i)=>{
    if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.StationCode!=='string'||!r.StationCode.trim()){invalidRecords++;return [];}
    const stationCode=facilityText(r.StationCode,key,50),liftId=facilityText(r.LiftID,key,100)||null,liftDesc=facilityText(r.LiftDesc,key,1000)||null;
    if(r.LiftID!=null&&typeof r.LiftID!=='string'||r.LiftDesc!=null&&typeof r.LiftDesc!=='string')invalidRecords++;
    return [{id:`maintenance:${stationCode}:${liftId??'unmapped'}:${i}`,line:facilityText(r.Line,key,30),stationCode,stationName:facilityText(r.StationName,key,150),liftId,liftDesc,status:'reported-unavailable',sourceTime:null,startsAt:null,endsAt:null,mapping:liftId?'requires-reviewed-id-match':'unresolved'}];
  });
  const possiblyTruncated=payload.value.length>=500||Boolean(payload['@odata.nextLink']??payload['odata.nextLink']);
  return {schemaVersion:1,status:invalidRecords||possiblyTruncated?'partial':'available',records,invalidRecords,complete:!possiblyTruncated&&!invalidRecords,possiblyTruncated,source:'LTA DataMall v2/FacilitiesMaintenance',sourceTime:null,limits:'Current lift-maintenance reports only. No documented future dates, source timestamp or escalator coverage. Absence of a report does not confirm operation. A possibly paginated/truncated response is partial and cannot establish absence.'};
}
async function readFacilityJson(response){
  if(Number(response.headers.get('content-length'))>2*1024*1024)throw Error('malformed');
  const reader=response.body?.getReader();if(!reader)throw Error('malformed');let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw Error('malformed');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('malformed');}
}
export function createFacilityAdapter({fetcher=fetch,clock=Date.now,timeoutMs=6000,ttlMs=60000}={}){
  let saved=null,pending=null,lastGood=null,nextAt=0,credential=null,failures=0,generation=0;
  return async function facilities(env={}){
    const key=typeof env.LTA_ACCOUNT_KEY==='string'?env.LTA_ACCOUNT_KEY.trim():'';
    if(key!==credential){credential=key;saved=null;lastGood=null;pending=null;nextAt=0;failures=0;generation++;}
    if(!key)return {schemaVersion:1,status:'unavailable',records:[],source:'LTA DataMall v2/FacilitiesMaintenance',fetchedAt:null,sourceTime:null,error:'not_configured',limits:'Current lift maintenance cannot be checked without server-side LTA_ACCOUNT_KEY. No replay report is substituted.'};
    if(pending)return structuredClone(await pending);
    if(saved&&nextAt>clock())return structuredClone(saved);
    const epoch=generation;
    pending=(async()=>{
      const attemptedAt=new Date(clock()).toISOString(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let result;
      try{
        const response=await fetcher(FACILITY_URL,{headers:{AccountKey:key,Accept:'application/json'},signal:controller.signal,redirect:'error'});
        if(!response.ok){const retry=response.headers.get('retry-after'),retryAfterMs=/^\d+$/.test(retry??'')?Number(retry)*1000:Math.max(0,Date.parse(retry)-clock());const error=Object.assign(Error(response.status===429?'rate_limited':[401,403].includes(response.status)?'authentication':'upstream_error'),{httpStatus:response.status,retryAfterMs:Number.isFinite(retryAfterMs)?Math.min(86400000,retryAfterMs):0});throw error;}
        result={...normalizeFacilitiesMaintenance(await readFacilityJson(response),key),fetchedAt:new Date(clock()).toISOString(),attemptedAt,error:null};
        if(epoch===generation){lastGood=result;failures=0;nextAt=clock()+ttlMs;}
      }catch(error){
        const nextFailures=failures+1;
        result={...(lastGood??{schemaVersion:1,records:[],source:'LTA DataMall v2/FacilitiesMaintenance',fetchedAt:null,sourceTime:null}),status:'unavailable',stale:true,attemptedAt,error:controller.signal.aborted?'timeout':['malformed','rate_limited','authentication','upstream_error'].includes(error.message)?error.message:'network',httpStatus:error.httpStatus??null};
        if(epoch===generation){failures=nextFailures;nextAt=clock()+Math.max(error.retryAfterMs??0,error.message==='authentication'?300000:0,Math.min(600000,60000*2**Math.min(nextFailures-1,4)));}
      }finally{clearTimeout(timer);}
      result.nextRefreshAt=new Date(nextAt).toISOString();if(epoch===generation)saved=result;return result;
    })();
    try{return structuredClone(await pending);}finally{if(epoch===generation)pending=null;}
  };
}
