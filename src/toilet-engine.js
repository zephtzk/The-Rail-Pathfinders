import {findFacilityPath,pathInstructions,facilityStatus} from './facility-engine.js';

// Normalized, reviewed weekly opening intervals; unsupported OSM expressions
// remain unknown. This is a schedule check, never an occupancy prediction.
export function toiletOpeningAt(hours,arrivalMs){
  if(!hours||hours.timezone!=='Asia/Singapore'||!Number.isFinite(arrivalMs))return {status:'unknown',label:'Opening hours unknown'};
  if(hours.always===true)return {status:'scheduled-open',label:'Scheduled to be open; live availability unknown'};
  if(!Array.isArray(hours.weekly))return {status:'unknown',label:'Opening hours unknown'};
  const local=new Date(arrivalMs+8*3600000),day=local.getUTCDay(),minute=local.getUTCHours()*60+local.getUTCMinutes()+local.getUTCSeconds()/60;
  let valid=true,open=false;
  for(const span of hours.weekly){
    if(!Array.isArray(span.days)||span.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!Number.isInteger(span.startMinute)||!Number.isInteger(span.endMinute)||span.startMinute<0||span.startMinute>=1440||span.endMinute<0||span.endMinute>1440||span.startMinute===span.endMinute){valid=false;continue;}
    if(span.endMinute>span.startMinute)open ||= span.days.includes(day)&&minute>=span.startMinute&&minute<span.endMinute;
    else open ||= span.days.includes(day)&&minute>=span.startMinute||span.days.includes((day+6)%7)&&minute<span.endMinute;
  }
  if(!valid)return {status:'unknown',label:'Opening schedule is not validated'};
  return {status:open?'scheduled-open':'scheduled-closed',label:open?'Scheduled to be open; live availability unknown':'Scheduled to be closed at arrival'};
}

export function toiletAvailability(toilet,arrivalMs,now=Date.now(),offline=false){
  const opening=toiletOpeningAt(toilet.openingHours,arrivalMs),report=toilet.report?facilityStatus(toilet.report,now,offline):null;
  if(report?.status==='reported-unavailable')return {...opening,status:'reported-closed',label:report.stale?'Last closure report retained · stale; availability unknown':'Reported closed',report};
  if(opening.status==='scheduled-closed')return opening;
  if(report?.status==='verified-available')return {...opening,status:'recently-reported-available',label:'Recently reported available; no occupancy information',report};
  return {...opening,report,stale:Boolean(offline||report?.stale)};
}

export function rankToilets(layout,{from,onward=from,profile={stepFree:true},statuses={},allowFixtures=false,walkingLimitSeconds=Infinity,now=Date.now(),arrivalBaseMs=now,breakMinutes=5,offline=false,positionKind='manual',upcomingStationIds=[]}={}){
  const results=[];
  if(!Number.isFinite(breakMinutes)||breakMinutes<0||breakMinutes>120)throw Error('Choose a break duration from 0 to 120 minutes.');
  for(const toilet of layout.toilets??[]){
    const unknown=[],excluded=[];
    if(positionKind==='onboard'&&!upcomingStationIds.includes(toilet.stationId)){results.push({toilet,status:'excluded',reasons:['Not a confirmed reachable upcoming station. Street GPS proximity is not used.']});continue;}
    if(toilet.verification!=='verified'&&!(allowFixtures&&layout.fixture&&toilet.verification==='fixture'))unknown.push('Toilet entrance and attributes have not been verified.');
    if(toilet.access==null)unknown.push('Public access restrictions unknown.');
    else if(!['public','passengers'].includes(toilet.access))excluded.push('Access restricted.');
    if(toilet.paidArea==null)unknown.push('Fare-gate side unknown.');
    if(profile.wheelchairToilet===true||profile.wheelchairToilet!==false&&profile.stepFree!==false){if(toilet.wheelchair===false)excluded.push('Toilet is not wheelchair accessible.');else if(toilet.wheelchair!==true)unknown.push('Wheelchair provision unknown.');}
    for(const field of ['seated','grabRails'])if(profile[field]){if(toilet[field]===false)excluded.push(`Required ${field==='grabRails'?'grab rails':'seated toilet'} unavailable.`);else if(toilet[field]!==true)unknown.push(`Required ${field==='grabRails'?'grab rails':'seated toilet'} unverified.`);}
    const outbound=findFacilityPath(layout,{from,to:toilet.nodeId,profile,statuses,allowFixtures,walkingLimitSeconds,now,offline});
    let returnPath=null;
    if(outbound.feasible)returnPath=findFacilityPath(layout,{from:toilet.nodeId,to:onward,profile,statuses,allowFixtures,walkingLimitSeconds:walkingLimitSeconds-outbound.walkingSeconds,now,offline});
    if(!outbound.feasible||!returnPath?.feasible){
      if(!toilet.nodeId||!layout.nodes.length)unknown.push('Connecting path unverified; walking time unavailable.');
      else excluded.push('No supported usable path to the toilet and back to the onward checkpoint.');
    }
    const availability=toiletAvailability(toilet,outbound.feasible?arrivalBaseMs+outbound.seconds*1000:NaN,now,offline);
    if(['scheduled-closed','reported-closed'].includes(availability.status))excluded.push(availability.label);
    if(availability.status==='unknown')unknown.push(availability.label);
    if(toilet.feeCents!=null&&(!Number.isInteger(toilet.feeCents)||toilet.feeCents<0))unknown.push('Fee data invalid.');
    const status=excluded.length?'excluded':unknown.length?'unknown':'suitable';
    results.push({toilet,status,reasons:[...excluded,...unknown],availability,outbound,returnPath,arrivalMs:outbound.feasible?arrivalBaseMs+outbound.seconds*1000:null,seconds:outbound.feasible&&returnPath?.feasible?outbound.seconds+returnPath.seconds:null,walkingSeconds:outbound.feasible&&returnPath?.feasible?outbound.walkingSeconds+returnPath.walkingSeconds:null,fixture:Boolean(layout.fixture),feeUnknown:toilet.feeCents==null});
  }
  return results.sort((a,b)=>['suitable','unknown','excluded'].indexOf(a.status)-['suitable','unknown','excluded'].indexOf(b.status)||(a.outbound?.seconds??Infinity)-(b.outbound?.seconds??Infinity)||a.toilet.id.localeCompare(b.toilet.id));
}

export function previewToiletDetour(layout,result,{originalDestination,onward,baselinePath=null,breakMinutes=5,now=Date.now()}={}){
  if(result?.status!=='suitable'||!result.outbound?.feasible||!result.returnPath?.feasible)throw Error('A supported usable outward and onward path is required. Ask station staff to check unknown options.');
  if(!Number.isFinite(breakMinutes)||breakMinutes<0||breakMinutes>120)throw Error('Choose a break duration from 0 to 120 minutes.');
  const baseline=baselinePath?.feasible?baselinePath.seconds:0;
  const gateCrossings=result.outbound.gateCrossings+result.returnPath.gateCrossings;
  const outboundInstructions=pathInstructions(layout,result.outbound),returnInstructions=pathInstructions(layout,result.returnPath);
  return {
    id:`toilet-stop:${result.toilet.id}`,kind:'toilet',toiletId:result.toilet.id,name:result.toilet.name,stationId:layout.id,
    originalDestination,onward:onward??result.returnPath.nodes.at(-1),fixture:Boolean(layout.fixture),verified:!layout.fixture&&result.toilet.verification==='verified',
    breakMinutes,addedSeconds:Math.max(0,result.seconds+breakMinutes*60-baseline),walkingSeconds:result.walkingSeconds,
    arrivalAt:new Date(result.arrivalMs).toISOString(),preparedAt:new Date(now).toISOString(),outbound:result.outbound,returnPath:result.returnPath,
    facilityIds:[...new Set([...result.outbound.facilityIds,...result.returnPath.facilityIds])],source:result.toilet.source,
    gateCrossings,fareImpact:gateCrossings?{status:'recalculation-required',message:'This stop crosses fare gates. Re-entry is not promised free; confirm transfer rules or enter a manual fare.'}:{status:'unchanged-integrated-route',message:'No additional fare-gate crossing in this detour. Keep the original journey fare estimate.'},
    steps:[...outboundInstructions.map((text,i)=>({id:`toilet-out-${i}`,type:'toilet-walk',text,durationSeconds:result.outbound.edges[i].seconds,facilityId:result.outbound.edges[i].facilityId??null})),{id:'toilet-break',type:'toilet-stop',text:'Confirm Reached toilet, then choose Resume journey when ready',durationSeconds:breakMinutes*60},...returnInstructions.map((text,i)=>({id:`toilet-return-${i}`,type:'toilet-walk',text,durationSeconds:result.returnPath.edges[i].seconds,facilityId:result.returnPath.edges[i].facilityId??null}))]
  };
}

export function detourStillFeasible(layout,detour,options){
  if(['reached','returning'].includes(detour.status)){
    const onward=findFacilityPath(layout,{...options,from:options.from??detour.outbound.nodes.at(-1),to:detour.onward});
    return {feasible:onward.feasible,result:{returnPath:onward},replacement:null};
  }
  const result=rankToilets(layout,{...options,from:detour.outbound.nodes[0],onward:detour.onward}).find(r=>r.toilet.id===detour.toiletId);
  return {feasible:result?.status==='suitable',result,replacement:result?.status==='suitable'?null:rankToilets(layout,options).find(r=>r.status==='suitable')??null};
}
