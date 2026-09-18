const ENDPOINT='https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function transportStatus(env={},fetcher=fetch,now=Date.now()) {
  const checkedAt=new Date(now).toISOString();
  if(!env.LTA_ACCOUNT_KEY)return {status:'unavailable',checkedAt,source:'LTA DataMall',alerts:[],message:'Live service alerts are not connected. Journey estimates and events use labelled replay data.',crowding:{status:'unavailable'},routing:{status:'replay'}};
  try{
    const response=await fetcher(ENDPOINT,{headers:{AccountKey:env.LTA_ACCOUNT_KEY,accept:'application/json'},signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error('upstream');
    const payload=await response.json();const value=payload.value;
    if(!value||typeof value!=='object'||![1,2].includes(value.Status))throw Error('schema');
    // Notices are informational until current GTFS topology, timing and direction are validated.
    // Never infer recovery or inject a live delay number into the replay engine.
    const messages=Array.isArray(value.Message)?value.Message:[];
    return {status:'partial',checkedAt,source:'LTA DataMall',serviceStatus:Number(value.Status),alerts:messages.slice(0,20).map((m,i)=>({id:`lta-${i}`,text:String(m.Content??'').slice(0,2000),sourceTime:m.CreatedDate??null})),message:'Service notices available. Route times and crowding remain replay estimates; live notices do not change replay routes.',crowding:{status:'unavailable'},routing:{status:'replay'}};
  }catch{return {status:'unavailable',checkedAt,source:'LTA DataMall',alerts:[],message:'The service-alert source could not be checked. Keep your saved route and check station announcements.',crowding:{status:'unavailable'},routing:{status:'replay'}};}
}
export async function handleApi(request,env){
  if(new URL(request.url).pathname==='/api/status')return json(await transportStatus(env));
  if(new URL(request.url).pathname==='/api/health')return json({ok:true,version:'1.0.0'});
  return json({error:'Not found'},404);
}
