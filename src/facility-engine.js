const time=value=>typeof value==='number'?value:Date.parse(value);
const fresh=(record,now,maxAge=15*60000)=>Number.isFinite(time(record?.fetchedAt))&&time(record.fetchedAt)<=now&&now-time(record.fetchedAt)<=maxAge;
export function facilityStatus(record,now=Date.now(),offline=false){
  if(!record)return {status:'unknown',usable:false,label:'Status unknown'};
  const ageMs=Number.isFinite(time(record.fetchedAt))?Math.max(0,now-time(record.fetchedAt)):null;
  const stale=offline||!fresh(record,now)||record.stale===true;
  // A stale closure must never reopen a route. A later positive report is required.
  if(record.status==='reported-unavailable')return {...record,status:'reported-unavailable',usable:false,stale,ageMs,label:stale?'Last report unavailable · stale':'Reported unavailable'};
  if(stale)return {...record,status:'unknown',previousStatus:record.status,usable:false,stale,ageMs,label:'Unknown / stale'};
  if(record.status==='verified-available'&&['operator','survey','fixture'].includes(record.evidence)&&time(record.validUntil)>now)return {...record,usable:true,stale:false,ageMs,label:record.evidence==='fixture'?'Training: available':'Recently verified available'};
  if(record.status==='no-maintenance-report')return {...record,usable:true,stale:false,ageMs,label:'No maintenance report found · operation unconfirmed'};
  return {...record,status:'unknown',usable:false,stale,ageMs,label:'Status unknown'};
}

// Only exact provider IDs or individually reviewed mappings may close an edge.
export function mapMaintenanceNotices(feed,facilities,reviewedMappings=[],now=Date.now()){
  const records=Array.isArray(feed?.records)?feed.records:[],mapped=[],unresolved=[];
  for(const notice of records){
    const matches=facilities.filter(f=>f.kind==='lift'&&f.stationCode===notice.stationCode&&((notice.liftId&&f.providerLiftId===notice.liftId)||reviewedMappings.some(m=>m.reviewedAt&&m.stationCode===notice.stationCode&&m.liftDesc===notice.liftDesc&&m.facilityId===f.id)));
    if(matches.length!==1){unresolved.push({...notice,reason:matches.length?'Multiple facility matches':'No reviewed facility match'});continue;}
    mapped.push({...notice,facilityId:matches[0].id});
  }
  const statuses={};
  for(const facility of facilities){
    const notice=mapped.find(n=>n.facilityId===facility.id);
    const uncertain=unresolved.some(n=>!n.stationCode||n.stationCode===facility.stationCode);
    const successful=feed?.status==='available'&&fresh(feed,now)&&!uncertain;
    statuses[facility.id]={status:notice?'reported-unavailable':facility.kind==='lift'&&successful?'no-maintenance-report':'unknown',source:feed?.source??'LTA DataMall',evidence:'operator',fetchedAt:feed?.fetchedAt??null,sourceTime:notice?.sourceTime??null,stale:feed?.status!=='available'||!fresh(feed,now),noticeId:notice?.id??null,reason:uncertain?'An unresolved station notice prevents a clear status.':null};
  }
  return {statuses,mapped,unresolved};
}

export function validateFacilityGraph(layout){
  const errors=[];
  if(!layout||!Array.isArray(layout.nodes)||!Array.isArray(layout.edges))return ['Missing graph'];
  const ids=new Set(layout.nodes.map(n=>n.id));
  if(ids.size!==layout.nodes.length)errors.push('Duplicate node ID');
  for(const node of layout.nodes){
    if(typeof node.id!=='string'||!node.id||node.floor==null||typeof node.paidArea!=='boolean')errors.push('Node floor, identity or fare-area boundary is unknown');
    if(!node.source||!['verified','fixture','incomplete'].includes(node.verification))errors.push(`Missing node evidence: ${node.id}`);
  }
  const edgeIds=new Set();
  for(const e of layout.edges){
    if(edgeIds.has(e.id))errors.push('Duplicate edge ID');edgeIds.add(e.id);
    const a=layout.nodes.find(n=>n.id===e.from),b=layout.nodes.find(n=>n.id===e.to);
    if(!a||!b||a===b)errors.push(`Invalid endpoints: ${e.id}`);
    if(!Number.isFinite(e.seconds)||e.seconds<=0||!Number.isFinite(e.walkingSeconds)||e.walkingSeconds<0||e.walkingSeconds>e.seconds)errors.push(`Invalid costs: ${e.id}`);
    if(a&&b&&a.floor!==b.floor&&!['lift','stairs','escalator','ramp'].includes(e.kind))errors.push(`Unsupported floor transition: ${e.id}`);
    if(a&&b&&a.paidArea!==b.paidArea&&e.kind!=='gate')errors.push(`Unmodelled fare gate: ${e.id}`);
    if(!e.source||!['verified','fixture','incomplete'].includes(e.verification))errors.push(`Missing connection evidence: ${e.id}`);
  }
  return errors;
}

export function findFacilityPath(layout,{from,to,profile={stepFree:true},statuses={},allowFixtures=false,walkingLimitSeconds=Infinity,now=Date.now(),offline=false,allowUnknownStatus=false}={}){
  const errors=validateFacilityGraph(layout);
  const fail=reason=>({feasible:false,reason,nodes:[],edges:[],seconds:null,walkingSeconds:null,verifiedAccessible:false,fixture:Boolean(layout?.fixture)});
  if(errors.length)return fail(errors.join('; '));
  if(layout.fixture&&!allowFixtures)return fail('This is training geometry, not a real walking route.');
  if(!layout.nodes.some(n=>n.id===from)||!layout.nodes.some(n=>n.id===to))return fail('No checked connection from this checkpoint to the requested entrance.');
  if(typeof walkingLimitSeconds!=='number'||walkingLimitSeconds<0||Number.isNaN(walkingLimitSeconds))return fail('Invalid remaining walking allowance.');
  const checkedNodes=new Set(layout.nodes.filter(n=>n.verification==='verified'||allowFixtures&&layout.fixture&&n.verification==='fixture').map(n=>n.id));
  if(!checkedNodes.has(from)||!checkedNodes.has(to))return fail('The checkpoint or destination entrance has not been verified.');
  const stepFree=profile.stepFree!==false,allowed=layout.edges.filter(e=>{
    if(!checkedNodes.has(e.from)||!checkedNodes.has(e.to))return false;
    if(e.verification!=='verified'&&!(allowFixtures&&layout.fixture&&e.verification==='fixture'))return false;
    if(stepFree&&(e.stepFree!==true||['stairs','escalator'].includes(e.kind)))return false;
    if(e.kind==='gate'&&(profile.allowFareGates===false||stepFree&&e.accessibleGate!==true))return false;
    if(e.access==='private'||e.minimumWidthCm!=null&&profile.minimumWidthCm>e.minimumWidthCm)return false;
    const status=e.facilityId?facilityStatus(statuses[e.facilityId],now,offline):null;
    if(status?.status==='reported-unavailable')return false;
    if(status&&!status.usable&&!allowUnknownStatus)return false;
    return true;
  });
  // Pareto labels preserve the slower but shorter-walking candidate needed by a
  // hard walking budget. A single shortest-time label per vertex is incorrect.
  const labels=new Map(),queue=[{node:from,seconds:0,walking:0,path:[],nodes:[from]}];labels.set(from,[queue[0]]);
  while(queue.length){
    queue.sort((a,b)=>a.seconds-b.seconds||a.walking-b.walking);const current=queue.shift();
    if(!labels.get(current.node)?.includes(current))continue;
    if(current.node===to){
      const statusWarnings=current.path.filter(e=>e.facilityId).map(e=>facilityStatus(statuses[e.facilityId],now,offline)).filter(s=>s.status!=='verified-available');
      return {feasible:true,nodes:current.nodes,edges:current.path,seconds:current.seconds,walkingSeconds:current.walking,facilityIds:[...new Set(current.path.map(e=>e.facilityId).filter(Boolean))],crossesFareGate:current.path.some(e=>e.kind==='gate'),gateCrossings:current.path.filter(e=>e.kind==='gate').length,fixture:Boolean(layout.fixture),verifiedAccessible:stepFree&&!layout.fixture&&statusWarnings.length===0,statusWarnings,reason:layout.fixture?'Training path only':statusWarnings.length?'Checked connections; current facility operation is not verified':'Checked path and current facility evidence'};
    }
    for(const edge of allowed){
      const next=edge.from===current.node?edge.to:edge.bidirectional&&edge.to===current.node?edge.from:null;
      if(!next||current.nodes.includes(next))continue;
      const candidate={node:next,seconds:current.seconds+edge.seconds,walking:current.walking+edge.walkingSeconds,path:[...current.path,{...edge,from:current.node,to:next}],nodes:[...current.nodes,next]};
      if(candidate.walking>walkingLimitSeconds)continue;
      const existing=labels.get(next)??[];
      if(existing.some(l=>l.seconds<=candidate.seconds&&l.walking<=candidate.walking))continue;
      labels.set(next,[...existing.filter(l=>!(candidate.seconds<=l.seconds&&candidate.walking<=l.walking)),candidate]);queue.push(candidate);
    }
  }
  return fail('No supported feasible path meets the access, facility-status and walking constraints. Ask station staff for assistance.');
}

export function pathInstructions(layout,path){
  if(!path?.feasible)return [path?.reason??'No prepared directions'];
  const name=id=>layout.nodes.find(n=>n.id===id)?.label??id;
  return path.edges.map(e=>`${e.kind==='lift'?'Take':e.kind==='gate'?'Pass through':'Continue via'} ${e.facilityId??e.kind} from ${name(e.from)} to ${name(e.to)}${e.kind==='gate'?' · fare-gate crossing; re-entry charges must be checked':''}.`);
}

export function compareFacilityPaths(layout,options,previousStatuses,nextStatuses){
  const original=findFacilityPath(layout,{...options,statuses:previousStatuses}),revised=findFacilityPath(layout,{...options,statuses:nextStatuses});
  return {original,revised,changed:JSON.stringify(original.edges.map(e=>e.id))!==JSON.stringify(revised.edges.map(e=>e.id)),addedSeconds:original.feasible&&revised.feasible?revised.seconds-original.seconds:null,addedWalkingSeconds:original.feasible&&revised.feasible?revised.walkingSeconds-original.walkingSeconds:null,message:!revised.feasible?'No supported feasible alternative. Contact station assistance.':`Revised path uses ${revised.facilityIds.join(', ')||'passages'}.`};
}
