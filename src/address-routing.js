import {makePlan,validatePlan} from './journey-v2.js';
import {normalizePreferences} from './preferences.js';
import {decodePolyline,compactGeometry,validCoordinate,validExternalGeometry} from './external-geometry.js';

export const ADDRESS_PLAN_LIMIT=24576;
const text=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const size=v=>new TextEncoder().encode(JSON.stringify(v)).byteLength;
const publicEndpoint=(p,role)=>({id:text(p.sourceId,180)||`onemap:${role}:${p.lat},${p.lng}`,label:text(p.address,240)||(!p.savedVia&&p.kind!=='saved'?text(p.label,120):'')||`Selected ${role}`,lat:p.lat,lng:p.lng});
const validTime=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v??'');
const at=(date,time)=>Date.parse(`${date}T${time}:00+08:00`);
const near=(a,b)=>Math.hypot(a.lat-b.lat,a.lng-b.lng)*111200<=30;
function bodyFor(input){
  if(!validCoordinate([input?.origin?.lat,input?.origin?.lng])||!validCoordinate([input?.destination?.lat,input?.destination?.lng]))throw Error('Choose an address or station with Singapore coordinates.');
  if(!/^\d{4}-\d\d-\d\d$/.test(input.date??'')||!validTime(input.departureTime)||!Number.isFinite(at(input.date,input.departureTime))||new Date(at(input.date,'00:00')+8*3600000).toISOString().slice(0,10)!==input.date)throw Error('Choose a valid Singapore departure date and time.');
  const preferences=normalizePreferences(input.preferences??input);
  const deadline=input.deadlineTime??input.deadline;
  if(deadline&&(!validTime(deadline)||!/^\d{4}-\d\d-\d\d$/.test(input.deadlineDate??input.date)||!Number.isFinite(at(input.deadlineDate??input.date,deadline))||new Date(at(input.deadlineDate??input.date,'00:00')+8*3600000).toISOString().slice(0,10)!==(input.deadlineDate??input.date)))throw Error('Choose a valid arrival deadline.');
  return {origin:{lat:input.origin.lat,lng:input.origin.lng},destination:{lat:input.destination.lat,lng:input.destination.lng},date:input.date,departureTime:input.departureTime,preferences};
}
// Inputs are a whitelisted server DTO, not arbitrary upstream diagnostic data.
// The timestamp basis remains Singapore civil midnight even across midnight.
export function normalizeAddressItineraries(payload,input,{now=Date.now()}={}){
  const request=bodyFor(input),preferences=request.preferences;
  if(preferences.stepFree)return {status:'accessibility-unverified',plans:[],message:'No verified continuous step-free address path is available. Your accessibility preference is unchanged.'};
  if(payload?.provider!=='onemap'||payload.status!=='ok'||!Array.isArray(payload.itineraries)||!Number.isFinite(payload.retrievedAt))throw Error('The address provider returned an unreadable response.');
  const midnight=at(input.date,'00:00'),depart=at(input.date,input.departureTime),deadline=input.deadlineTime??input.deadline,deadlineAt=deadline?at(input.deadlineDate??input.date,deadline):Infinity;
  let rejectedWalking=0,rejectedDeadline=0,rejectedSize=0;
  const plans=payload.itineraries.slice(0,3).flatMap((itinerary,option)=>{
    try{
      if(!Array.isArray(itinerary.legs)||!itinerary.legs.length||itinerary.legs.length>24||!Number.isFinite(itinerary.startTime)||!Number.isFinite(itinerary.endTime)||itinerary.startTime<depart||itinerary.endTime<itinerary.startTime||itinerary.endTime-itinerary.startTime>86400000)throw Error('Incomplete itinerary');
      const steps=[],geometry=[],limit=Math.floor(192/itinerary.legs.length);let walking=0,cursor=itinerary.startTime,previousPlace=null;
      for(const leg of itinerary.legs){
        const from=leg.from,to=leg.to;
        if(!validCoordinate([from?.lat,from?.lng])||!validCoordinate([to?.lat,to?.lng])||!text(from?.name)||!text(to?.name)||!['WALK','BUS','SUBWAY','RAIL','TRAM'].includes(leg.mode)||!Number.isFinite(leg.startTime)||!Number.isFinite(leg.endTime)||leg.startTime<cursor||leg.endTime<leg.startTime||leg.endTime>itinerary.endTime||!Number.isFinite(leg.duration)||Math.abs(leg.duration-(leg.endTime-leg.startTime)/1000)>2||!Number.isFinite(leg.distance)||leg.distance<0)throw Error('Incomplete leg');
        if(previousPlace&&!near(previousPlace,from)||leg.mode!=='WALK'&&!text(leg.route,80))throw Error('Unverified connection');
        if(leg.startTime>cursor)steps.push({id:`onemap-${option}-${steps.length}`,type:'wait',text:`Wait at ${text(from.name,120)} for the planned connection`,durationSeconds:(leg.startTime-cursor)/1000,source:{fromLabel:text(from.name,120),toLabel:text(from.name,120),startSeconds:(cursor-midnight)/1000,endSeconds:(leg.startTime-midnight)/1000,timing:'provider-planned'}});
        const walk=leg.mode==='WALK',service=walk?'Walk':leg.mode==='BUS'?`Bus ${text(leg.route,80)||'(service unconfirmed)'}`:text(leg.route,80)||'Train';
        const duration=(leg.endTime-leg.startTime)/1000;
        if(walk)walking+=Math.max(leg.duration,duration);
        const stepIndex=steps.length;
        const fromLabel=leg===itinerary.legs[0]&&/^origin$/i.test(from.name)?publicEndpoint(input.origin,'origin').label:text(from.name,120);
        const toLabel=leg===itinerary.legs.at(-1)&&/^destination$/i.test(to.name)?publicEndpoint(input.destination,'destination').label:text(to.name,120);
        const source={type:walk?'walk':'ride',mode:walk?'walk':leg.mode==='BUS'?'bus':'rail',fromLabel,toLabel,startSeconds:(leg.startTime-midnight)/1000,endSeconds:(leg.endTime-midnight)/1000,durationSeconds:duration,distanceMetres:leg.distance,timing:'provider-planned',...(leg.mode==='BUS'?{serviceNo:text(leg.route,80)}:{routeId:text(leg.route,80)})};
        steps.push({id:`onemap-${option}-${stepIndex}`,type:source.type,text:`${walk?'Walk':`Ride ${service}`} from ${source.fromLabel} to ${source.toLabel}${!walk&&text(leg.headsign)?` · towards ${text(leg.headsign,120)}`:''}`,durationSeconds:duration,source});
        let points,kind='provider';try{points=decodePolyline(leg.geometry);}catch{points=[[from.lat,from.lng],[to.lat,to.lng]];kind='schematic';}
        geometry.push({stepIndex,points:compactGeometry(points,Math.max(2,limit)),kind});cursor=leg.endTime;previousPlace=to;
      }
      if(itinerary.legs[0].startTime!==itinerary.startTime||cursor!==itinerary.endTime)throw Error('Incomplete times');
      if(!near(itinerary.legs[0].from,input.origin)||!near(itinerary.legs.at(-1).to,input.destination))throw Error('Unverified endpoint connection');
      if(Number.isFinite(itinerary.walkTime)){if(itinerary.walkTime<0)throw Error('Invalid walking time');walking=Math.max(walking,itinerary.walkTime);}
      if(walking>preferences.walkingLimitMinutes*60){rejectedWalking++;return [];}
      if(itinerary.endTime>deadlineAt){rejectedDeadline++;return [];}
      const route={id:`onemap:${payload.retrievedAt}:${option}`,provider:'onemap',providerRetrievedAt:payload.retrievedAt,steps,geometry,departureSeconds:(itinerary.startTime-midnight)/1000,arrivalSeconds:(itinerary.endTime-midnight)/1000,walkingSeconds:walking,accessibility:'unknown',provenance:'OneMap public transport plan; scheduled/estimated times, not live arrivals. Street geometry is approximate; indoor transitions and accessibility are unverified.',sourceTimes:{onemap:payload.retrievedAt}};
      const plan=makePlan({origin:publicEndpoint(input.origin,'origin'),destination:publicEndpoint(input.destination,'destination'),date:input.date,departureTime:input.departureTime,deadline,deadlineDate:input.deadlineDate,timeMode:input.timeMode,preferences,route},now);
      if(!validExternalGeometry(route)||!validatePlan(plan))throw Error('Invalid external plan');
      // Preserve instructions. Reduce only optional map detail, with an explicit
      // schematic designation, before enforcing the existing share byte budget.
      if(size(plan)>ADDRESS_PLAN_LIMIT)plan.route.geometry=plan.route.geometry.map(g=>({...g,points:[g.points[0],g.points.at(-1)],kind:'schematic'}));
      if(size(plan)>ADDRESS_PLAN_LIMIT){rejectedSize++;return [];}
      return [plan];
    }catch{return [];}
  });
  if(plans.length){
    const fastest=Math.min(...plans.map(p=>p.route.arrivalSeconds)),eligible=p=>p.route.arrivalSeconds<=fastest+preferences.maxExtraMinutes*60;
    const rides=p=>p.route.steps.filter(s=>s.type==='ride').length;
    plans.sort((a,b)=>{
      if(eligible(a)!==eligible(b))return eligible(a)?-1:1;
      if(eligible(a)&&preferences.preference==='less-walking'&&a.route.walkingSeconds!==b.route.walkingSeconds)return a.route.walkingSeconds-b.route.walkingSeconds;
      if(eligible(a)&&preferences.preference==='fewer-transfers'&&rides(a)!==rides(b))return rides(a)-rides(b);
      return a.route.arrivalSeconds-b.route.arrivalSeconds;
    });
  }
  const status=plans.length?'ok':rejectedWalking?'walking-limit':rejectedDeadline?'impossible-deadline':rejectedSize?'oversized':'unsupported-response';
  return {status,plans,message:plans.length?`OneMap planned options. Review the whole journey before accepting. Indoor guidance and accessibility remain unverified.${preferences.preference==='quieter'?' Crowding is unknown; a quieter service cannot be identified.':''}`:rejectedWalking?'Returned routes exceed your cumulative walking allowance. Your walking setting is unchanged.':rejectedDeadline?'Returned routes arrive after your deadline. Choose an earlier departure.':rejectedSize?'Returned directions exceed the supported saved/shared plan size. No instructions were silently removed.':'No complete supported itinerary was returned.'};
}
export function externalRerouteState(active){
  return active?.route?.provider==='onemap'?{status:'unsupported',message:'Fresh address-route recalculation from a current checkpoint is not verified. Your accepted guidance remains available. Plan a new journey from an explicitly selected address, then review and accept it; no position or walking already used is inferred.'}:null;
}
export function createAddressRouter({fetcher=globalThis.fetch,isOnline=()=>globalThis.navigator?.onLine!==false,timeoutMs=12000}={}){
  let generation=0,controller=null;
  const cancel=()=>{generation++;controller?.abort();controller=null;};
  async function route(input){
    cancel();const version=generation,body=bodyFor(input);
    if(!isOnline())return {status:'offline',plans:[],message:'Fresh address routing requires a connection. Your saved accepted guidance remains available offline.'};
    const requestController=new AbortController();controller=requestController;const timer=setTimeout(()=>requestController.abort(),timeoutMs);
    try{
      const response=await fetcher('/api/address/route',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json',Accept:'application/json'},cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer',signal:requestController.signal});
      const payload=await response.json();if(version!==generation)return null;
      if(!response.ok||payload.status!=='ok')return {status:text(payload.status,40)||'unavailable',plans:[],message:text(payload.message,500)||'Address routing is unavailable. Your accepted trip has not changed.'};
      return normalizeAddressItineraries(payload,input);
    }catch{if(version!==generation)return null;return {status:requestController.signal.aborted?'timeout':'unavailable',plans:[],message:requestController.signal.aborted?'Address routing timed out. Try again.':'Address routing could not connect. Saved guidance remains available.'};}
    finally{clearTimeout(timer);if(version===generation)controller=null;}
  }
  return {route,cancel};
}
