import {routeFromLegacy} from './journey-v2.js';

// The router returns the remaining journey. Canonical budgets and fares describe
// the whole accepted trip, including travel already completed before this change.
export function canonicalReroute(context,{name=id=>id,source='Explicitly accepted routing comparison',priorRoute=null}={}) {
  const plan=routeFromLegacy(context.route,context.input,{name,mode:'real',source});
  const carried=context.carriedWalkSeconds??0;
  if(!Number.isFinite(carried)||carried<0||!Number.isSafeInteger(Math.ceil(carried+plan.route.walkingSeconds)))throw Error('The walking already used needs confirmation before accepting a route change.');
  plan.route.walkingSeconds+=carried;
  const completedRide=context.route.legs.slice(0,context.progress?.legIndex??0).some(leg=>leg.type==='ride');
  if(priorRoute?.fareEstimate?.status==='unavailable')plan.route.fareEstimate=structuredClone(priorRoute.fareEstimate);
  else if(context.carriedContext?.hasBoarded||completedRide||context.progress?.kind==='onboard')plan.route.fareEstimate={status:'unavailable',reason:'An accepted route change after boarding needs full fare reassessment, including earlier paid travel. Enter the actual charge after completion.'};
  return plan;
}
