// Explicit synthetic exclusions only. Provider notices never enter this path.
// Times use the search date's Singapore midnight and a half-open [start,end) window.
export function demoConnectionClosed(rules, routeId, from, to, departure, arrival) {
  return rules?.some(rule=>rule.demo===true&&rule.routeId===routeId&&
    departure<rule.endSeconds&&arrival>rule.startSeconds&&
    (!rule.edges||rule.edges.some(edge=>edge[0]===from&&edge[1]===to)))??false;
}

export function compileDemoClosures(incident, network, date) {
  if(!incident)return {status:'normal',rules:[],message:'Normal rehearsal: no simulated incident selected.'};
  if(incident.demo!==true||incident.source!=='demo')return {status:'unsupported',rules:[],message:'Only labelled demo incidents can affect a replay. Official notices stay advisory.'};
  if(incident.status==='resolved')return {status:'resolved',rules:[],message:'This demo incident was resolved. No simulated closure is applied.'};
  const midnight=Date.parse(`${date}T00:00:00+08:00`),startSeconds=(Date.parse(incident.startsAt)-midnight)/1000,endSeconds=(Date.parse(incident.endsAt)-midnight)/1000;
  if(!Number.isFinite(startSeconds)||!Number.isFinite(endSeconds)||startSeconds>=endSeconds||!['service','segment'].includes(incident.scope)||!['both','forward','reverse'].includes(incident.direction))return {status:'unsupported',rules:[],message:'The incident needs a valid service, boundary, direction and time window before it can affect directions.'};
  const railRoutes=new Set(network.routes.filter(r=>r.id===incident.service||r.shortName===incident.service).map(r=>r.id));
  const patterns=(network.frequency?.patterns??[]).filter(p=>p.serviceNo===incident.service);
  const sequences=[...network.trips.filter(t=>railRoutes.has(t.routeId)).map(t=>({routeId:t.routeId,direction:t.directionId,ids:t.stopTimes.map(s=>s[0])})),...patterns.map(p=>({routeId:p.id,direction:p.direction,ids:p.stops.map(s=>s.stopId)}))];
  if(!sequences.length)return {status:'unsupported',rules:[],message:'This service cannot be matched to the loaded timetable. Check the incident service code; no closure has been inferred.'};
  // Service-wide direction names have no universal provider definition.
  if(incident.scope==='service'&&incident.direction!=='both')return {status:'unsupported',rules:[],message:'A directional replay needs segment endpoints. Choose a segment or both directions; no provider direction is guessed.'};
  const stations=new Map(network.stops.map(s=>[s.id,s.stationId]));
  const station=id=>stations.get(id)??(network.stations.some(s=>s.id===id)?id:null);
  const from=station(incident.from),to=station(incident.to);
  if(incident.scope==='segment'&&(!from||!to||from===to))return {status:'unsupported',rules:[],message:'The closure boundaries do not match two distinct stops or stations in the loaded data.'};
  const mapped=new Map(),seen=new Set();let ambiguous=false;
  for(const seq of sequences){
    const key=seq.routeId+'|'+seq.ids.join(',');if(seen.has(key))continue;seen.add(key);
    if(incident.scope==='service'){mapped.set(seq.routeId,null);continue;}
    const a=seq.ids.flatMap((id,i)=>station(id)===from?[i]:[]),b=seq.ids.flatMap((id,i)=>station(id)===to?[i]:[]);
    if(!a.length||!b.length)continue;
    if(a.length!==1||b.length!==1){ambiguous=true;continue;}
    if(a[0]<b[0]&&incident.direction==='reverse'||a[0]>b[0]&&incident.direction==='forward')continue;
    const edges=mapped.get(seq.routeId)??new Map();
    for(let i=Math.min(a[0],b[0]);i<Math.max(a[0],b[0]);i++)edges.set(seq.ids[i]+'|'+seq.ids[i+1],[seq.ids[i],seq.ids[i+1]]);
    mapped.set(seq.routeId,edges);
  }
  if(ambiguous)return {status:'unsupported',rules:[],message:'These endpoints occur more than once on a looping service. Choose unambiguous boundaries; the replay will not guess which visit is closed.'};
  if(!mapped.size)return {status:'unsupported',rules:[],message:'No continuous directed segment matches those boundaries on this service. No unrelated track or stop has been closed.'};
  const rules=[...mapped].map(([routeId,edges])=>({demo:true,routeId,startSeconds,endSeconds,edges:edges?[...edges.values()]:null}));
  if(incident.type==='delay')return {status:'delay',rules:[],impactRules:rules,message:`Simulated ${incident.delayMinutes}-minute delay. Connections and arrival after a delay cannot be validated by this timetable; confirm the next departure and allow extra time. No cancellation or precise revised arrival is inferred.`};
  if(!['closure','cancellation'].includes(incident.type))return {status:'unsupported',rules:[],message:'This incident type has no validated replay routing effect.'};
  return {status:'closure',rules,impactRules:rules,message:'Simulated closure applies only to the selected service, directed segment and incident time window. All other connections use the loaded timetable.'};
}

export function demoRouteAffected(route, rules, network, fromIndex=0) {
  return (route?.legs??[]).slice(fromIndex).some(leg=>{
    if(leg.type!=='ride')return false;
    const ids=leg.stopIds??[leg.fromStopId,leg.toStopId];
    if(leg.mode==='rail'){
      const trip=network.trips.find(t=>t.id===leg.tripId),offset=(Date.parse(`${leg.serviceDate}T00:00:00+08:00`)-Date.parse(`${route.date}T00:00:00+08:00`))/1000;
      for(let i=0;i<ids.length-1;i++){
        const index=trip?.stopTimes.findIndex((s,j)=>s[0]===ids[i]&&trip.stopTimes[j+1]?.[0]===ids[i+1]);
        if(index>=0&&demoConnectionClosed(rules,leg.routeId,ids[i],ids[i+1],trip.stopTimes[index][2]+offset,trip.stopTimes[index+1][1]+offset))return true;
      }
      return false;
    }
    // Bus edge times are uncalibrated; conservatively intersect the ride window.
    return ids.some((id,i)=>i+1<ids.length&&demoConnectionClosed(rules,leg.patternId,id,ids[i+1],leg.startSeconds,leg.endSeconds));
  });
}
