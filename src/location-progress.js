import {itineraryStepLabel} from './itinerary-display.js';
import {indoorCoverageForStep} from './station-guidance-data.js';

// Presentation estimates never become canonical checkpoints, sharing progress,
// fare events or journey transitions. These bounds also apply to map assistance.
export const LOCATION_PROGRESS_LIMITS=Object.freeze({maxAgeMs:60000,maxAccuracyMeters:50,pathAllowanceMeters:12,boundaryBufferMeters:15,connectionGapMeters:30});
const sourceOf=step=>step?.source??step??{};
const typeOf=step=>step?.type??sourceOf(step).type;
const coordinate=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const activeDetour=active=>active?.detour&&!['resumed','cancelled'].includes(active.detour.status);
const rail=step=>String(sourceOf(step).mode??step?.mode??'').toLowerCase()==='rail';
const distanceBetween=(a,b)=>{
  const radians=Math.PI/180,scale=6371008.8*radians;
  return Math.hypot((a[0]-b[0])*scale,(a[1]-b[1])*scale*Math.cos((a[0]+b[0])/2*radians));
};

/** Whether location must leave an explicit enclosed/boarding confirmation.
 * This deliberately includes waiting and riding: proximity cannot prove boarding.
 */
export function requiresIndoorConfirmation(active,stepIndex=active?.progress?.stepIndex??0){
  if(activeDetour(active))return true;
  const steps=active?.route?.steps??[],step=steps[stepIndex];
  if(!step)return false;
  const source=sourceOf(step),type=typeOf(step);
  if(['ride','wait','interchange'].includes(type)||source.estimatedBay||step.facilityId||indoorCoverageForStep(step))return true;
  const endpoints=[step.fromStopId??source.fromStopId,step.toStopId??source.toStopId].filter(Boolean);
  if(['access','transfer','exit'].includes(type)&&(!endpoints.length||!endpoints.every(id=>String(id).startsWith('bus:'))))return true;
  // OneMap walks can contain an unverified rail entrance/exit even without IDs.
  if(active.route.provider==='onemap'&&type==='walk'){
    for(const direction of [-1,1]){
      const adjacent=stepIndex+direction;
      if(rail(steps[adjacent])||typeOf(steps[adjacent])==='wait'&&rail(steps[adjacent+direction]))return true;
    }
  }
  return false;
}

/** Local tangent-plane projection; route geometry is geographic, never a floor.
 * Returns null for missing points rather than joining across a missing vertex.
 */
export function projectLocationToPath(position,points){
  const origin=[position?.latitude,position?.longitude];
  if(!coordinate(origin)||!Array.isArray(points)||points.length<2||!points.every(coordinate))return null;
  const radians=Math.PI/180,scale=6371008.8*radians,longitudeScale=scale*Math.cos(origin[0]*radians);
  if(Math.abs(longitudeScale)<1)return null;
  const xy=points.map(p=>[(p[1]-origin[1])*longitudeScale,(p[0]-origin[0])*scale]);
  let totalMeters=0;
  const projections=[];
  for(let index=0;index<xy.length-1;index++){
    const a=xy[index],b=xy[index+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(!length)continue;
    const fraction=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(length*length)));
    const x=a[0]+fraction*dx,y=a[1]+fraction*dy;
    projections.push({distanceMeters:Math.hypot(x,y),alongMeters:totalMeters+fraction*length,segmentIndex:index,point:[origin[0]+y/scale,origin[1]+x/longitudeScale]});
    totalMeters+=length;
  }
  if(!projections.length)return null;
  const nearest=projections.reduce((best,p)=>p.distanceMeters<best.distanceMeters?p:best);
  const uncertainty=Math.max(0,Number.isFinite(position.accuracy)?position.accuracy:0)+LOCATION_PROGRESS_LIMITS.pathAllowanceMeters;
  // A loop/crossing can place one fix at distant positions along the same path.
  const ambiguous=projections.some(p=>p.distanceMeters<=uncertainty&&Math.abs(p.alongMeters-nearest.alongMeters)>Math.max(30,2*uncertainty));
  return {...nearest,totalMeters,remainingMeters:totalMeters-nearest.alongMeters,fraction:nearest.alongMeters/totalMeters,ambiguous};
}

function reviewedExterior(step,walking){
  const source=sourceOf(step),link=walking?.links?.find(item=>item.id===source.pathId);
  if(!link||link.enabled!==true||link.evidenceLevel!=='map-supported'||!link.sourceUrls?.length)return null;
  const from=step.fromStopId??source.fromStopId,to=step.toStopId??source.toStopId,bus=`bus:${link.busStopId}`;
  const busToRail=from===bus&&link.railPlatformIds?.includes(to),railToBus=to===bus&&link.railPlatformIds?.includes(from);
  if(!busToRail&&!railToBus||busToRail&&!['bidirectional','bus-to-rail'].includes(link.directionality)||railToBus&&!['bidirectional','rail-to-bus'].includes(link.directionality))return null;
  const points=link.path?.waypoints?.map(p=>[p.lat,p.lon??p.lng]);
  if(!points||points.length<2||!points.every(coordinate))return null;
  return {points:railToBus?[...points].reverse():points,exteriorOnly:true};
}

function routeGeometry(route,walking){
  const result=new Map(),seen=new Set(),duplicates=new Set();
  for(const segment of route.geometry??[]){
    if(!Number.isInteger(segment.stepIndex)||!route.steps[segment.stepIndex])continue;
    if(seen.has(segment.stepIndex)){duplicates.add(segment.stepIndex);continue;}
    seen.add(segment.stepIndex);
    if(segment.kind==='provider'&&Array.isArray(segment.points)&&segment.points.length>=2&&segment.points.every(coordinate))result.set(segment.stepIndex,{points:segment.points,exteriorOnly:false});
  }
  for(const index of duplicates)result.delete(index);
  // Legacy stop-to-stop polylines are schematic. Only the individually reviewed
  // exterior walking trace can support an estimate, using its canonical source.
  if(!route.geometry?.length)route.steps.forEach((step,index)=>{const path=reviewedExterior(step,walking);if(path)result.set(index,path);});
  return result;
}

function continuousOutdoor(active,geometry,from,to){
  for(let index=from;index<=to;index++){
    const path=geometry.get(index),step=active.route.steps[index];
    if(!path||!['walk','access','exit','transfer'].includes(typeOf(step))||requiresIndoorConfirmation(active,index))return false;
    if(index>from){
      const previous=geometry.get(index-1).points.at(-1),next=path.points[0];
      if(distanceBetween(previous,next)>LOCATION_PROGRESS_LIMITS.connectionGapMeters)return false;
    }
  }
  return true;
}

/** Read-only outdoor estimate, anchored to the accepted canonical step.
 * Caller must also require an enabled, visible location session. Never feed this
 * result into confirmCheckpoint, rerouting, detours, sharing or a fare ledger.
 */
export function estimateLocationProgress(active,position,{now=Date.now(),walking,name}={}){
  const steps=active?.route?.steps??[],canonicalStepIndex=active?.progress?.stepIndex??0;
  const base={status:'unavailable',canonicalStepIndex:active?canonicalStepIndex:null,estimatedStepIndex:null,step:null,current:null,label:null,requiresIndoorConfirmation:requiresIndoorConfirmation(active,canonicalStepIndex)};
  const unavailable=reason=>({...base,reason});
  if(!active||active.status!=='started')return unavailable('journey-inactive');
  if(active.plan?.mode==='replay')return unavailable('rehearsal');
  if(activeDetour(active)||active.facilityBlocked||active.facilityReview)return unavailable('accepted-guidance-needs-review');
  if(!Number.isInteger(canonicalStepIndex)||canonicalStepIndex<0||canonicalStepIndex>=steps.length)return unavailable('invalid-canonical-step');
  if(!coordinate([position?.latitude,position?.longitude])||!Number.isFinite(position?.timestamp)||!Number.isFinite(position?.accuracy)||position.accuracy<0)return unavailable('missing-location');
  if(!Number.isFinite(now)||position.timestamp>now+1000||now-position.timestamp>LOCATION_PROGRESS_LIMITS.maxAgeMs)return unavailable('stale-location');
  if(position.accuracy>LOCATION_PROGRESS_LIMITS.maxAccuracyMeters)return unavailable('low-accuracy');
  if(Number.isFinite(active.progress?.confirmedAt)&&position.timestamp<active.progress.confirmedAt)return unavailable('fix-before-confirmation');
  const geometry=routeGeometry(active.route,walking),matches=[];
  const distanceLimit=position.accuracy+LOCATION_PROGRESS_LIMITS.pathAllowanceMeters;
  for(const [stepIndex,path] of geometry){
    const projection=projectLocationToPath(position,path.points);
    if(projection&&projection.distanceMeters<=distanceLimit)matches.push({stepIndex,path,projection});
  }
  if(!matches.length)return unavailable(geometry.size?'off-route':'no-supported-geometry');
  if(matches.length!==1||matches[0].projection.ambiguous)return unavailable('ambiguous-location');
  const match=matches[0],{stepIndex,path,projection}=match;
  const boundary=position.accuracy+LOCATION_PROGRESS_LIMITS.boundaryBufferMeters;
  if(projection.alongMeters<=boundary||projection.remainingMeters<=boundary)return unavailable('near-step-boundary');
  const step=steps[stepIndex],needsConfirmation=requiresIndoorConfirmation(active,stepIndex);
  const sameExterior=stepIndex===canonicalStepIndex&&path.exteriorOnly&&['walk','transfer','access','exit'].includes(typeOf(step));
  if((!sameExterior&&!continuousOutdoor(active,geometry,canonicalStepIndex,stepIndex))||stepIndex<canonicalStepIndex)return unavailable(needsConfirmation?'confirmation-required':'sequentially-ambiguous');
  return {...base,status:'estimated',reason:path.exteriorOnly?'reviewed-exterior':'outdoor-path',estimatedStepIndex:stepIndex,step,current:itineraryStepLabel(step,{name,steps,index:stepIndex}),label:`Estimated outdoor ${path.exteriorOnly?'portion of ':''}step ${stepIndex+1} of ${steps.length}`,requiresIndoorConfirmation:needsConfirmation,projection:{distanceMeters:projection.distanceMeters,alongMeters:projection.alongMeters,remainingMeters:projection.remainingMeters,fraction:projection.fraction},accuracyMeters:position.accuracy,timestamp:position.timestamp};
}
