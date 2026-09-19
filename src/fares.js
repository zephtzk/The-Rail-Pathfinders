import {FARE_VERSION,ADULT_CENTS,CONCESSION_CENTS,RAIL_FARE_DISTANCES,BUS_SOURCE_VERSION} from './fare-data.js';
import {approximateRailDistance} from './fare-distances.js';
import {BUS_FARE_CATEGORIES,BUS_CATEGORY_VERSION} from './fare-distance-data.js';
export {FARE_VERSION,RAIL_FARE_DISTANCES};
export const formatSGD=cents=>cents==null?'Amount needed':new Intl.NumberFormat('en-SG',{style:'currency',currency:'SGD'}).format(cents/100);
const metadata=()=>({version:FARE_VERSION.id,source:FARE_VERSION.source,effectiveFrom:FARE_VERSION.effectiveFrom,reviewedAt:FARE_VERSION.reviewedAt});
const unavailable=reason=>({status:'unavailable',totalCents:null,reason,...metadata()});
const aliases={payalebar:'EW8','paya-lebar':'EW8',CC9:'EW8',tampines:'EW2',DT32:'EW2',bugis:'EW12',DT14:'EW12'};
const station=id=>aliases[String(id??'').replace(/_[AB]$/,'')]??String(id??'').replace(/_[AB]$/,'');
const basic=category=>['TRUNK','FEEDER'].includes(category);
const serviceFamily=service=>String(service).replace(/[A-Z]$/i,'');
const centsFor=(metres,rates)=>rates[Math.min(Math.max(0,Math.ceil((metres-3200)/1000)),rates.length-1)];
function validDate(date){return /^\d{4}-\d\d-\d\d$/.test(date??'')&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;}

export function fareForDistance(metres,category='adult',date=FARE_VERSION.reviewedAt){
  if(!validDate(date)||date<FARE_VERSION.effectiveFrom||(FARE_VERSION.effectiveUntil&&date>FARE_VERSION.effectiveUntil))return unavailable('No reviewed fare table for this date.');
  if(!Number.isInteger(metres)||metres<=0||metres%100!==0)return unavailable('A fare distance in 0.1 km units is required.');
  const rates=category==='adult'?ADULT_CENTS:CONCESSION_CENTS[category];
  if(!rates)return unavailable('This passenger category is not validated. Enter the charged amount manually.');
  return {status:'estimate',totalCents:centsFor(metres,rates),category,officialDistanceMetres:metres,...metadata(),assumptions:'Standard basic service card fare. Concession card eligibility is user-selected; excludes passes, promotions and early-morning discounts.'};
}
export function officialRailDistance(from,to){return RAIL_FARE_DISTANCES.find(r=>r.from===station(from)&&r.to===station(to))??null;}

// Use exact stop occurrences: a loop can visit the same stop more than once.
export function busFareLeg(leg,network){
  if(network?.sourceVersion!==BUS_SOURCE_VERSION)return null;
  const pattern=network.patterns?.find(p=>p.id===leg.patternId),category=BUS_FARE_CATEGORIES[leg.patternId];
  if(!pattern||!basic(category))return null;
  const from=pattern.stops.find(s=>s.sequence===leg.fromSequence),to=pattern.stops.find(s=>s.sequence===leg.toSequence);
  if(!from||!to||to.sequence<=from.sequence||'bus:'+from.stopId!==leg.fromStopId||'bus:'+to.stopId!==leg.toStopId||from.distanceSegment!==to.distanceSegment)return null;
  const section=pattern.stops.filter(s=>s.sequence>=from.sequence&&s.sequence<=to.sequence);
  if(section.some((s,i)=>s.distanceSegment!==from.distanceSegment||!Number.isFinite(s.distanceKm)||(i&&s.distanceKm<section[i-1].distanceKm)))return null;
  const routeMetres=Math.round((to.distanceKm-from.distanceKm)*1000),metres=category==='FEEDER'?Math.min(3200,routeMetres):routeMetres;
  if(metres<=0||metres%100!==0)return null;
  return {mode:'bus',serviceNo:pattern.serviceNo,serviceCategory:category,from:from.stopId,to:to.stopId,boardSeconds:leg.startSeconds,alightSeconds:leg.endSeconds,distance:{kind:'official-fare-distance',metres,routeMetres,serviceCategory:category,source:'https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html',sourceVersion:BUS_SOURCE_VERSION,patternId:pattern.id,fromSequence:from.sequence,toSequence:to.sequence,method:category==='FEEDER'?'LTA stop-occurrence distance, capped at 3.2 km for a feeder ride.':'LTA stop-occurrence distance difference.'}};
}
function distanceFor(leg){
  if(leg.mode==='rail'){
    const official=RAIL_FARE_DISTANCES.find(r=>r.id===leg.distanceId&&r.from===station(leg.from)&&r.to===station(leg.to));
    if(official)return official;
  }
  const d=leg.distance;
  if(!Number.isInteger(d?.metres)||d.metres<=0||d.metres%100!==0)return null;
  if(leg.mode==='rail'&&['estimated-rail-distance','provider-distance-estimate'].includes(d.kind))return d;
  if(leg.mode!=='bus'||!basic(leg.serviceCategory))return null;
  if(d.kind==='provider-distance-estimate')return d;
  return d.kind==='official-fare-distance'&&d.sourceVersion===BUS_SOURCE_VERSION&&BUS_FARE_CATEGORIES[d.patternId]===leg.serviceCategory&&d.patternId?.startsWith(leg.serviceNo+':')?d:null;
}
export function assessTransfer(previous,next,{firstBoardSeconds,transfers=0}={}){
  const gap=next.boardSeconds-previous.alightSeconds;
  if(!Number.isFinite(gap)||gap<0||!Number.isFinite(firstBoardSeconds))return {integrated:false,reason:'Transfer timing is unresolved.'};
  if(next.boardSeconds-firstBoardSeconds>7200)return {integrated:false,reason:'More than two hours between first and last boarding.'};
  if(transfers>=5)return {integrated:false,reason:'More than five transfers.'};
  if(previous.mode==='rail'&&next.mode==='rail'){
    if(station(previous.to)===station(next.from))return {integrated:false,reason:'Same-station exit and re-entry starts a new fare journey.'};
    if(gap>900)return {integrated:false,reason:'Rail station transfer exceeds 15 minutes.'};
  }else if(gap>2700)return {integrated:false,reason:'Bus transfer exceeds 45 minutes.'};
  if(previous.mode==='bus'&&next.mode==='bus'&&serviceFamily(previous.serviceNo)===serviceFamily(next.serviceNo))return {integrated:false,reason:'Same bus service or subsidiary service is a new fare journey.'};
  return {integrated:true,reason:'Transfer meets the reviewed distance-fare rules using planned times.'};
}
export function estimateFare({date,category='adult',payment='card',legs=[],pass=null}={}){
  if(!validDate(date)||date<FARE_VERSION.effectiveFrom)return unavailable('No reviewed fare table for this travel date.');
  if(payment!=='card')return unavailable('Cash, foreign-card fees and other payment products require a manual amount.');
  if(!Array.isArray(legs)||!legs.length||legs.length>30)return unavailable('No supported transit fare journey.');
  if(legs.some(l=>l?.mode==='bus')&&(date<BUS_CATEGORY_VERSION.validFrom||date>BUS_CATEGORY_VERSION.validThrough))return unavailable('Bus service classifications are outside their reviewed dates. Enter the charged amount manually.');
  if(legs.some((l,i)=>!['rail','bus'].includes(l?.mode)||!Number.isFinite(l.boardSeconds)||!Number.isFinite(l.alightSeconds)||l.boardSeconds<0||l.alightSeconds<l.boardSeconds||(i&&l.boardSeconds<legs[i-1].alightSeconds)))return unavailable('Ordered boarding and alighting times are needed to assess transfers.');
  if(pass){
    if(legs.some(l=>l.mode==='bus'&&!distanceFor(l)))return unavailable('Basic bus pass coverage is not verified for this bus service.');
    if(pass.confirmed===true&&pass.scope==='basic-bus-and-train'&&validDate(pass.validFrom)&&validDate(pass.validThrough)&&date>=pass.validFrom&&date<=pass.validThrough)return {status:'estimate',totalCents:0,...metadata(),category,breakdown:[{label:'Covered by your confirmed valid basic bus and train pass',cents:0}],assumptions:'No incremental ride charge under the user-confirmed pass. The pass purchase is a separate manual expense. Time-limit penalties are not included.'};
    return unavailable('Pass coverage or validity is not confirmed for this journey.');
  }
  const resolved=legs.map(distanceFor);
  if(resolved.some(d=>!d))return unavailable('A usable distance and supported basic service are needed for every transit leg. Enter the charged amount manually.');
  const groups=[];let group;
  for(let i=0;i<legs.length;i++){
    const leg=legs[i];let transfer=i?assessTransfer(legs[i-1],leg,{firstBoardSeconds:group.firstBoardSeconds,transfers:group.legs.length-1}):{integrated:false,reason:'Initial boarding'};
    if(transfer.integrated&&leg.mode==='bus'&&group.legs.some(prior=>prior.mode==='bus'&&serviceFamily(prior.serviceNo)===serviceFamily(leg.serviceNo)))transfer={integrated:false,reason:'Repeating a bus service or its subsidiary starts a new fare journey.'};
    if(!transfer.integrated){group={firstBoardSeconds:leg.boardSeconds,legs:[],metres:0,approximate:false,reason:transfer.reason};groups.push(group);}
    group.legs.push(leg);group.metres+=resolved[i].metres;group.approximate||=resolved[i].kind!=='official-fare-distance';
  }
  const breakdown=groups.map((g,i)=>({label:groups.length===1?'Combined integrated transit fare':`Fare journey ${i+1}`,cents:fareForDistance(g.metres,category,date).totalCents,[g.approximate?'estimatedDistanceMetres':'officialDistanceMetres']:g.metres,reason:g.reason,legCount:g.legs.length}));
  if(breakdown.some(g=>g.cents===null))return unavailable('This concession category or fare distance is unsupported. Enter a manual amount.');
  const approximate=groups.some(g=>g.approximate),hasRail=legs.some(l=>l.mode==='rail');
  const assumptions='Standard basic-service card fare; eligible transfers are priced together using planned times. '+(approximate?'Distance is approximate and can differ from the official charged distance. ':'')+'No pass, promotion, early-morning discount or payment-provider fee is applied. Enter the actual charge after travel.';
  return {status:'estimate',totalCents:breakdown.reduce((n,b)=>n+b.cents,0),...metadata(),date,category,payment,estimateKind:approximate?'approximate-distance':'published-distance',breakdown,distanceSources:resolved,rulesSource:FARE_VERSION.rulesSource,assumptions,warnings:[...(hasRail?['Rail tap-in discounts may reduce the charge, including eligible early-morning and north-east off-peak trips.']:[]),...(date>FARE_VERSION.reviewedAt?['Uses the fare table checked on '+FARE_VERSION.reviewedAt+'; future fares may change.']:[])]};
}

const start=l=>l.startSeconds??l.start*60,end=l=>l.endSeconds??l.end*60;
const endpoint=(l,side)=>l[side+'StationId']??l[side+'StopId']??(side==='from'?l.stopIds?.[0]??l.stops?.[0]:l.stopIds?.at(-1)??l.stops?.at(-1))??l[side+'Label'];
function railFareLeg(rides,date,provider){
  const first=rides[0],last=rides.at(-1),from=endpoint(first,'from'),to=endpoint(last,'to'),official=officialRailDistance(from,to);
  let distance=official??approximateRailDistance(from,to,date);
  // Provider distance is a route estimate, never a fare-calculator result.
  if(!distance&&provider==='onemap'&&rides.every(l=>Number.isFinite(l.distanceMetres)&&l.distanceMetres>0))distance={kind:'provider-distance-estimate',metres:Math.ceil(rides.reduce((n,l)=>n+l.distanceMetres,0)/100)*100,source:'https://www.onemap.gov.sg/apidocs/',method:'OneMap planned rail distance; the official shortest fare distance may differ.'};
  return distance?{mode:'rail',from,to,boardSeconds:start(first),alightSeconds:end(last),...(official?{distanceId:official.id}:{distance})}:null;
}
function providerBusLeg(leg){
  const categories=[...new Set(Object.entries(BUS_FARE_CATEGORIES).filter(([id])=>id.startsWith(leg.serviceNo+':')).map(([,category])=>category))];
  if(categories.length!==1||!basic(categories[0])||!Number.isFinite(leg.distanceMetres)||leg.distanceMetres<=0)return null;
  const category=categories[0],metres=Math.ceil((category==='FEEDER'?Math.min(3200,leg.distanceMetres):leg.distanceMetres)/100)*100;
  return {mode:'bus',serviceNo:leg.serviceNo,serviceCategory:category,from:leg.fromLabel,to:leg.toLabel,boardSeconds:start(leg),alightSeconds:end(leg),distance:{kind:'provider-distance-estimate',metres,source:'https://www.onemap.gov.sg/apidocs/',method:'OneMap planned bus distance'+(category==='FEEDER'?', capped at 3.2 km for a feeder ride.':'; not an official fare distance.')}};
}
export function estimatePlanFare(value,options={}){
  const plan=value?.plan??value??{},route=value?.route??plan.route??value,raw=route?.legacyRoute??route,input=route?.legacyInput??plan;
  const date=options.date??plan.departureDate??input.date??options.input?.date;
  // Gate-changing detours and in-progress reroutes must not lose earlier paid legs.
  if(route?.fareEstimate?.status==='unavailable')return {...unavailable(route.fareEstimate.reason),requiresManual:true};
  const all=raw?.legs??route?.steps?.map(s=>({...s.source,type:s.type}))??[];
  if(value?.detour&&value.detour.status!=='cancelled'&&(value.detour.fareImpact?.status!=='unchanged-integrated-route'||all.some(l=>l.type==='ride'&&l.mode==='bus')))return unavailable('A toilet detour may change fare gates or transfer timing. Enter the actual charged amount after completion.');
  const rides=all.filter(l=>l.type==='ride');
  if(!rides.length)return unavailable('No transit fare legs are available for this plan.');
  const legs=[];let rail=[];
  const flush=()=>{if(rail.length){legs.push(railFareLeg(rail,date,route?.provider));rail=[];}};
  let previousRailIndex=-1;
  for(let i=0;i<all.length;i++){
    const leg=all[i];if(leg.type!=='ride')continue;
    if(leg.mode==='bus'){flush();legs.push(route?.provider==='onemap'?providerBusLeg(leg):busFareLeg(leg,options.busNetwork));previousRailIndex=-1;}
    else{
      // Normal paid-area line changes are one rail fare, not another boarding fee.
      // Explicit exterior paths between rail rides need verified gate/tap times.
      const between=rail.length?all.slice(previousRailIndex+1,i):[];
      if(between.some(l=>l.pathId||l.requiresTapOut||l.type==='exit'||(route?.provider==='onemap'&&l.type==='walk')))return unavailable('A rail transfer may leave the paid area. Confirm the charged amount after travel.');
      rail.push(leg);previousRailIndex=i;
    }
  }
  flush();
  if(all.some(l=>l.type==='transfer'&&(l.pathId||l.requiresTapOut))&&rides.every(l=>l.mode!=='bus'))return unavailable('Tap-out transfer fare distance and timing need a separate reviewed calculation.');
  if(legs.some(l=>!l))return unavailable('Distance or basic-service classification is unavailable for part of this journey. Express, premium and unclassified buses need a manual fare.');
  const result=estimateFare({date,category:options.category??plan.preferences?.fareCategory??'adult',payment:options.payment??'card',pass:options.pass,legs});
  if(result.status==='estimate'&&route?.provider==='onemap')result.providerRetrievedAt=route.providerRetrievedAt;
  return result;
}
