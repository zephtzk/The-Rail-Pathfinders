import {getAppLocation,locationDescription} from './location-assistance.js';

export function compactLocationStatus(state){
  if(state.usable)return `Location on · ±${Math.round(state.position.accuracy)} m`;
  if(state.position)return `Low location accuracy · ±${Math.round(state.position.accuracy)} m`;
  if(state.status==='denied')return 'Location denied · Settings to retry';
  if(state.status==='unavailable')return 'Location unavailable · Settings to retry';
  if(state.status==='suspended')return 'Location paused while hidden';
  if(!state.enabled)return 'Location off · enable in Settings';
  if(/stale/i.test(state.reason))return 'Location stale · manual correction available';
  if(/timed out/i.test(state.reason))return 'Location timed out · manual correction available';
  return 'Locating… · manual areas available';
}

export function locationEstimateExplanation(estimate){
  const reasons={
    'missing-location':'Waiting for a fresh, accurate location. Correct your step if needed.',
    'stale-location':'The location is stale. Correct your step if needed.',
    'low-accuracy':'The location is too broad to identify a step.',
    'off-route':'Your location does not clearly match the accepted path.',
    'no-supported-geometry':'This route has no verified outdoor trace for a step estimate.',
    'ambiguous-location':'More than one part of the route could match your location.',
    'near-step-boundary':'You may be near a step change; the next step is not yet clear.',
    'confirmation-required':'Confirm indoor transfers, waiting and boarding yourself.',
    'sequentially-ambiguous':'Confirm the intervening travel steps before an outdoor estimate can continue.',
    'fix-before-confirmation':'Waiting for a location measured after your correction.',
    'accepted-guidance-needs-review':'Follow your accepted stop guidance or review the affected path.',
    'rehearsal':'Device location does not advance a fictional rehearsal.'
  };
  return reasons[estimate.reason]??'Use manual step correction when needed.';
}

export function mountLocationSettings(host,{service=getAppLocation(),onStop=()=>service.stop()}={}){
  host.innerHTML='<h2>Location assistance</h2><p data-location-status role="status"></p><p>Uses your device location while this page is visible, including before a trip. Caregiver sharing is a separate choice. Indoor floors and boarding need your confirmation.</p><button type="button" class="secondary" data-location-enable>Enable location assistance</button><button type="button" class="secondary" data-location-stop>Stop location assistance</button>';
  host.querySelector('[data-location-enable]').onclick=()=>service.start();
  let actionError='';
  host.querySelector('[data-location-stop]').onclick=async()=>{actionError='';try{await onStop();}catch(error){actionError=error?.message??'Location stopped on this device. The sharing update is pending.';host.querySelector('[data-location-status]').textContent=actionError;}};
  const refresh=state=>{
    host.querySelector('[data-location-status]').textContent=actionError||locationDescription(state.position,state);
    const enable=host.querySelector('[data-location-enable]');enable.hidden=state.enabled;
    enable.textContent=['denied','unavailable'].includes(state.status)?'Retry location assistance':'Enable location assistance';
    host.querySelector('[data-location-stop]').hidden=!state.enabled;
  };
  return service.subscribe(refresh);
}

export function drawLocationMarker(layers,state){
  if(!state.usable||!state.position)return null;
  const p=state.position,point=[p.latitude,p.longitude];
  L.circle(point,{radius:p.accuracy,color:'#174f9e',weight:1,fillOpacity:.14,interactive:false}).addTo(layers);
  L.circleMarker(point,{radius:8,color:'#fff',weight:3,fillColor:'#174f9e',fillOpacity:1,className:'device-location-dot'})
    .bindTooltip(document.createTextNode(`Your approximate position · ±${Math.round(p.accuracy)} m`)).addTo(layers);
  return point;
}
