// OneMap's token belongs to the server runtime only. Queries/coordinates arrive
// in POST bodies, are never logged or cached, and go only to allowlisted URLs.
const ORIGIN='https://www.onemap.gov.sg';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const text=(value,max=180)=>typeof value==='string'?value.trim().slice(0,max):'';
const coord=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=1.144&&p.lat<=1.494&&p.lng>=103.535&&p.lng<=104.502;
const number=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max;
const civil=v=>/^\d{4}-\d\d-\d\d$/.test(v??'')&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const time=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v??'');
const failure=(status,message,http=503)=>reply({provider:'onemap',status,message},http);
async function boundedJSON(response,max){
  const reader=response.body?.getReader();if(!reader)throw Error('invalid');let count=0,parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>max){await reader.cancel();throw Error('large');}parts.push(value);}
  const joined=new Uint8Array(count);let index=0;for(const part of parts){joined.set(part,index);index+=part.length;}return JSON.parse(new TextDecoder().decode(joined));
}
function place(p){if(!coord({lat:p?.lat,lng:p?.lon}))throw Error('place');return {name:text(p.name,120)||'Unnamed stop',lat:p.lat,lng:p.lon};}
// Whitelist the ordinary OTP-style response contract. Never forward arbitrary
// provider response fields, diagnostic bodies or credentials to the browser.
export function normalizeProviderItineraries(payload){
  const list=payload?.plan?.itineraries;if(!Array.isArray(list))throw Error('schema');
  return list.slice(0,3).flatMap(itinerary=>{
    try{
      if(!number(itinerary.startTime,9e15)||!number(itinerary.endTime,9e15)||itinerary.endTime<itinerary.startTime||itinerary.endTime-itinerary.startTime>86400000||!Array.isArray(itinerary.legs)||!itinerary.legs.length||itinerary.legs.length>24)throw Error('itinerary');
      let previous=itinerary.startTime;
      const legs=itinerary.legs.map(leg=>{
        if(!['WALK','BUS','SUBWAY','RAIL','TRAM'].includes(leg.mode)||!number(leg.startTime,9e15)||!number(leg.endTime,9e15)||leg.startTime<previous||leg.endTime<leg.startTime||leg.endTime>itinerary.endTime||!number(leg.duration,86400)||Math.abs(leg.duration-(leg.endTime-leg.startTime)/1000)>2||!number(leg.distance,200000))throw Error('leg');
        previous=leg.endTime;
        const geometry=typeof leg.legGeometry?.points==='string'&&leg.legGeometry.points.length<=48000?leg.legGeometry.points:null;
        return {mode:leg.mode,startTime:leg.startTime,endTime:leg.endTime,duration:leg.duration,distance:leg.distance,from:place(leg.from),to:place(leg.to),route:text(leg.routeShortName??leg.route,80),headsign:text(leg.headsign,120),geometry};
      });
      if(legs[0].startTime!==itinerary.startTime||legs.at(-1).endTime!==itinerary.endTime)throw Error('times');
      return [{startTime:itinerary.startTime,endTime:itinerary.endTime,walkTime:number(itinerary.walkTime,86400)?itinerary.walkTime:null,legs}];
    }catch{return [];}
  });
}
export function normalizeOneMapSearch(payload){
  if(!Array.isArray(payload?.results))throw Error('schema');const seen=new Set();
  return payload.results.slice(0,30).flatMap(item=>{
    const lat=Number(item.LATITUDE),lng=Number(item.LONGITUDE),address=text(item.ADDRESS,240),label=text(item.SEARCHVAL,80)||address;
    if(!coord({lat,lng})||!address||seen.has(address))return [];seen.add(address);
    const sourceId=`onemap:${lat.toFixed(6)},${lng.toFixed(6)}`;
    return [{id:sourceId,sourceId,label,address,lat,lng,routingId:null,stationId:null,entranceId:null,coverage:'unknown',accessibility:'unknown'}];
  }).slice(0,6);
}
export function createAddressAdapter({fetcher=globalThis.fetch,clock=Date.now,timeoutMs=8000,maxConcurrent=2,maxPerMinute=40}={}){
  let concurrent=0,windowStart=0,requests=0,backoffUntil=0;
  return async function handle(request,env={}){
    const url=new URL(request.url),token=env.ONEMAP_TOKEN;
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return failure('forbidden','Cross-origin address requests are not allowed.',403);
    if(url.search)return failure('invalid-input','Send address details in the request body.',400);
    if(url.pathname==='/api/address/status'&&request.method==='GET'){const configured=typeof token==='string'&&!!token.trim();return reply({provider:'onemap',status:configured?'configured':'unavailable',message:configured?'Address provider is configured. A successful fresh request is still required.':'Address routing needs a securely configured OneMap token on this server.'});}
    if(!['/api/address/search','/api/address/route'].includes(url.pathname))return failure('not-found','Unknown address endpoint.',404);
    if(request.method!=='POST')return failure('invalid-method','Use POST for address requests.',405);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return failure('invalid-input','Use application/json.',415);
    let input;try{input=await boundedJSON(request,4096);}catch{return failure('invalid-input','Address request is unreadable or too large.',400);}
    const upstream=new URL(url.pathname.endsWith('/search')?'/api/common/elastic/search':'/api/public/routingsvc/route',ORIGIN);
    if(url.pathname.endsWith('/search')){
      const query=text(input?.query,161);if(query.length<2||query.length>160)return failure('invalid-input','Enter between 2 and 160 characters.',400);
      upstream.search=new URLSearchParams({searchVal:query,returnGeom:'Y',getAddrDetails:'Y',pageNum:'1'});
    }else{
      if(!coord(input?.origin)||!coord(input?.destination)||!civil(input.date)||!time(input.departureTime)||!number(input.preferences?.walkingLimitMinutes,240)||typeof input.preferences?.stepFree!=='boolean')return failure('invalid-input','Choose Singapore coordinates, a valid Singapore departure date/time and walking preferences.',400);
      if(input.preferences.stepFree)return failure('accessibility-unverified','OneMap public-transport routing does not verify a continuous step-free path. Your accessibility setting has been preserved.',422);
      const today=new Date(clock()+8*3600000).toISOString().slice(0,10),horizon=new Date(today+'T00:00:00Z');
      const day=horizon.getUTCDate();horizon.setUTCDate(1);horizon.setUTCMonth(horizon.getUTCMonth()+2);horizon.setUTCDate(0);const endDay=horizon.getUTCDate();horizon.setUTCDate(Math.min(day,endDay));
      if(input.date<today||input.date>horizon.toISOString().slice(0,10))return failure('unsupported-date','Fresh address routes support today through one calendar month ahead in Singapore. Choose a supported date.',422);
      const [year,month,date]=input.date.split('-');
      // No minutes-to-metres conversion: omit maxWalkDistance. Enforce the
      // cumulative returned walking time in the canonical client normalizer.
      upstream.search=new URLSearchParams({start:`${input.origin.lat},${input.origin.lng}`,end:`${input.destination.lat},${input.destination.lng}`,routeType:'pt',date:`${month}-${date}-${year}`,time:input.departureTime+':00',mode:'transit',numItineraries:'3'});
    }
    if(typeof token!=='string'||!token.trim())return failure('unavailable','Address routing needs a securely configured OneMap token. Saved station routes remain available.');
    const now=clock();if(now-windowStart>=60000){windowStart=now;requests=0;}
    if(concurrent>=maxConcurrent||requests>=maxPerMinute||now<backoffUntil)return failure('busy','Address requests are busy. Wait a moment and try again.',429);
    requests++;concurrent++;const controller=new AbortController(),cancel=()=>controller.abort();request.signal.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,timeoutMs);
    try{
      const response=await fetcher(upstream.href,{headers:{Authorization:token,Accept:'application/json'},redirect:'error',signal:controller.signal});
      if(!response.ok){
        if(response.status===429){backoffUntil=clock()+30000;return failure('busy','OneMap is busy. Wait a moment and try again.',429);}
        if([401,403].includes(response.status))return failure('unavailable','OneMap access is unavailable or expired. Server configuration needs renewal.');
        if(response.status===404)return failure('no-route','OneMap found no route for these details. This does not establish that no real-world connection exists.',422);
        return failure('unavailable','The address provider could not complete this request. Try again later.');
      }
      const payload=await boundedJSON(response,512*1024),retrievedAt=clock();
      if(url.pathname.endsWith('/search'))return reply({provider:'onemap',status:'ok',retrievedAt,results:normalizeOneMapSearch(payload)});
      const itineraries=normalizeProviderItineraries(payload);
      return itineraries.length?reply({provider:'onemap',status:'ok',retrievedAt,itineraries}):failure('unsupported-response','No complete supported itinerary was returned. Keep your saved guidance or try different details.',422);
    }catch{return failure(controller.signal.aborted?'timeout':'unavailable',controller.signal.aborted?'Address routing timed out. Try again when connected.':'The address provider response could not be verified. Try again later.');}
    finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);concurrent--;}
  };
}
