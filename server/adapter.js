import {LIVE_STATIONS,LIVE_LINES,noticeRelevance} from '../src/live-data.js';

const DATAMALL_BASE='https://datamall2.mytransport.sg/ltaodataservice/';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cleanText=(value,key,max=2000)=>typeof value==='string'?value.split(key||'\u0000').join('[redacted]').slice(0,max):null;
const iso=ms=>new Date(ms).toISOString();

export function normalizeNotices(payload,key='') {
  const v=payload?.value;
  if(!v||Array.isArray(v)||![1,2].includes(v.Status))throw new Error('malformed');
  if(v.Message!==undefined&&!Array.isArray(v.Message)||v.AffectedSegments!==undefined&&!Array.isArray(v.AffectedSegments))throw new Error('malformed');
  const missingFields=['Message','AffectedSegments'].filter(k=>v[k]===undefined);let invalidRecords=0;
  const items=(v.Message??[]).slice(0,100).flatMap((m,i)=>{
    if(!m||typeof m.Content!=='string'){invalidRecords++;return [];}
    // The response has no structured link from a message to an affected segment.
    return [{id:`notice-${i}`,text:cleanText(m.Content,key),sourceTime:cleanText(m.CreatedDate,key,60),expiresAt:null,relevance:'unmapped'}];
  });
  const segments=(v.AffectedSegments??[]).slice(0,100).flatMap(s=>{
    if(!s||typeof s!=='object'||Array.isArray(s)){invalidRecords++;return [];}
    const fields={Line:cleanText(s.Line,key,20),Stations:cleanText(s.Stations,key,500)};
    return [{...noticeRelevance(fields),direction:cleanText(s.Direction,key,80),stationIdentifiers:fields.Stations,startsAt:null,endsAt:null,routeImpact:'informational'}];
  });
  return {serviceStatus:v.Status,status:missingFields.length?'missing':invalidRecords?'partial':items.length||segments.length?'available':'empty',items,segments,missingFields,invalidRecords,
    sourceTime:null,expiresAt:null,limits:'Notice validity and timezone may be unspecified. Status 1 includes minor delays; advisories do not change replay routes.'};
}
export function normalizeCrowding(payload,line,key='') {
  if(!payload||!Array.isArray(payload.value)||payload.value.length>1000)throw new Error('malformed');
  const expected=LIVE_STATIONS.filter(s=>s.line===line),groups=new Map();let invalidRecords=0,unmappedRecords=0;
  for(const r of payload.value){
    if(!r||typeof r.Station!=='string'){invalidRecords++;continue;}
    // Only documented single codes until an actual compound identifier is validated.
    const code=r.Station.trim().toUpperCase(),station=expected.find(s=>s.code===code);
    if(!station){unmappedRecords++;continue;}
    if(!['l','m','h','NA'].includes(r.CrowdLevel)||typeof r.StartTime!=='string'||typeof r.EndTime!=='string')invalidRecords++;
    const row={...station,reportedStation:cleanText(r.Station,key,80),level:['l','m','h','NA'].includes(r.CrowdLevel)?r.CrowdLevel:null,
      startTime:cleanText(r.StartTime,key,60),endTime:cleanText(r.EndTime,key,60),observationTime:null};
    const previous=groups.get(code);
    if(!previous)groups.set(code,row);
    else if(JSON.stringify(previous)!==JSON.stringify(row))groups.set(code,{...previous,level:null,conflict:true});
  }
  return {line,status:invalidRecords?'partial':payload.value.length?'available':'empty',records:[...groups.values()],receivedRecords:payload.value.length,invalidRecords,unmappedRecords,
    missingCodes:expected.filter(s=>!groups.has(s.code)).map(s=>s.code),source:'LTA DataMall PCDRealTime'};
}
async function boundedJson(response) {
  if(Number(response.headers.get('content-length'))>2*1024*1024)throw new Error('malformed');
  const reader=response.body?.getReader();if(!reader)throw new Error('malformed');const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw new Error('malformed');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const all=new Uint8Array(size);let at=0;for(const part of chunks){all.set(part,at);at+=part.length;}
  try{return JSON.parse(new TextDecoder().decode(all));}catch{throw new Error('malformed');}
}
export function createTransportAdapter({fetcher=fetch,clock=Date.now,timeoutMs=6000}={}) {
  // Shared per Worker isolate/process; concurrent calls are coalesced. Not a global rate limiter.
  let credential=null,generation=0;const cache=new Map();
  async function readFeed(path,key,normalize,ttl) {
    const now=clock();const entry=cache.get(path);
    if(entry?.pending)return structuredClone(await entry.pending);
    if(entry&&entry.nextAt>now)return structuredClone(entry.result);
    const previous=entry?.lastGood,epoch=generation;
    const pending=(async()=>{
      let result,nextAt=now+Math.min(600000,60000*2**Math.min(entry?.failures??0,4)),lastGood=previous;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const response=await fetcher(DATAMALL_BASE+path,{headers:{AccountKey:key,accept:'application/json'},redirect:'error',signal:controller.signal});
        if(!response.ok){
          const error=[401,403].includes(response.status)?'authentication':response.status===429?'rate_limited':'http_error';
          if(error==='authentication')nextAt=clock()+300000;
          if(error==='rate_limited'){
            const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry??'')?Number(retry):Math.ceil((Date.parse(retry)-clock())/1000);
            nextAt=Math.min(8640000000000000,clock()+Math.max(60,Number.isFinite(seconds)?seconds:60)*1000);
          }
          result={...(previous??{}),status:'unavailable',error,httpStatus:response.status,attemptedAt:iso(now),nextRefreshAt:iso(nextAt)};
        }else{
          const data=normalize(await boundedJson(response)),retrievedAt=iso(clock());nextAt=clock()+ttl;
          result={...data,retrievedAt,attemptedAt:iso(now),nextRefreshAt:iso(nextAt),error:null,httpStatus:response.status};lastGood=result;
        }
      }catch(error){result={...(previous??{}),status:'unavailable',httpStatus:null,error:controller.signal.aborted?'timeout':error?.message==='malformed'?'malformed':'network',attemptedAt:iso(now),nextRefreshAt:iso(nextAt)};}
      finally{clearTimeout(timer);}
      if(epoch===generation)cache.set(path,{result,lastGood,nextAt,failures:result.status==='unavailable'?(entry?.failures??0)+1:0});return result;
    })();
    cache.set(path,{pending,lastGood:previous});return structuredClone(await pending);
  }
  return async function status(env={}, noticesOnly=false) {
    const key=typeof env.LTA_ACCOUNT_KEY==='string'?env.LTA_ACCOUNT_KEY.trim():'';
    if(credential!==key){cache.clear();credential=key;generation++;}
    const checkedAt=iso(clock());
    if(!key)return {schemaVersion:1,status:'unavailable',checkedAt,source:'LTA DataMall',alerts:[],notices:{status:'unavailable',error:'not_configured',items:[],segments:[]},
      crowding:{status:'unavailable',lines:LIVE_LINES.map(line=>({line,status:'unavailable',error:'not_configured',records:[],missingCodes:LIVE_STATIONS.filter(s=>s.line===line).map(s=>s.code)}))},routing:{status:'replay'},message:'Live information is not connected. Journey calculations remain labelled replay.'};
    const [notices,...lines]=await Promise.all([readFeed('TrainServiceAlerts',key,p=>normalizeNotices(p,key),60000),
      ...(noticesOnly?[]:LIVE_LINES).map(line=>readFeed(`PCDRealTime?TrainLine=${line}`,key,p=>normalizeCrowding(p,line,key),600000).then(r=>({line,records:[],...r})))]);
    const available=lines.filter(l=>l.status!=='unavailable').length;
    return {schemaVersion:1,status:available||notices.status!=='unavailable'?'partial':'unavailable',checkedAt,source:'LTA DataMall',notices,alerts:notices.items??[],
      crowding:{status:available===3?'available':available?'partial':'unavailable',lines},routing:{status:'replay'},
      message:'Official notices and station reports are informational. Journey times, route ranking and demo events remain replay calculations.'};
  };
}
const defaultTransportAdapter=createTransportAdapter();
export async function transportStatus(env={},fetcher,now) {
  return fetcher?createTransportAdapter({fetcher,clock:()=>now??Date.now()})(env):defaultTransportAdapter(env);
}
export async function handleApi(request,env) {
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(new URL(request.url).pathname==='/api/notices')return json(await defaultTransportAdapter(env,true));
  if(new URL(request.url).pathname==='/api/status')return json(await transportStatus(env));
  if(new URL(request.url).pathname==='/api/health')return json({ok:true,version:'1.1.0'});
  return json({error:'Not found'},404);
}
