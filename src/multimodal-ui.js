import {fareEstimateHTML} from './fare-ui.js';
import {mountCompanion} from './copilot-ui.js';
import {mountJourney} from './journey-ui.js';
import {createMultimodalRouter} from './multimodal-engine.js';
import {validateSavedPilot,validatePilotArrivals,pilotPredictionState} from './pilot-validation.js';
import {legacyPlannerInput,legacyPlannerSettings} from './legacy-planner-preferences.js';
import {mountDatePickers} from './date-picker.js';
let datePickers;

const app = document.querySelector('#app'), SAVE = 'commute-copilot-pilot-guidance-v1';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = seconds => `${String(Math.floor(seconds/3600)%24).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(Math.floor(seconds)%60).padStart(2,'0')}${seconds>=86400?' (+1 day)':''}`;
const duration = seconds => `${Math.floor(seconds/60)}m ${seconds%60}s`;
let arrivalEpoch=0,lastArrivalGood=null,busReconnectTimer;const ARRIVAL_SAVE='commute-copilot-bus-last-known-v1';
let rail,bus,walking,manifest,railManifest,router,lookup,build,route,input,result,feed,liveStop,companion,dirty=false;
let planningPreferences=legacyPlannerSettings();
const name = id => lookup?.get(id) ?? id;
function readSaved() { try { return validateSavedPilot(JSON.parse(localStorage.getItem(SAVE))); } catch { return null; } }
function connection() { arrivalEpoch++; if(!navigator.onLine && feed)feed={...feed,status:'unavailable',error:'offline'}; document.querySelector('#pilot-connection').textContent = navigator.onLine ? '' : 'Offline · cached data and timing assumptions; no current arrivals'; renderLive(); }
function shell() {
  app.innerHTML=`<header class="rail-header"><a class="rail-brand" href="/"><img src="/icon.svg" width="36" height="36" alt=""><span>Commute <strong>Copilot</strong></span></a><a href="/">Scheduled rail planner ↗</a></header>
  <div class="schedule-banner"><strong>Bus & walking pilot</strong><span>Estimated buses · scheduled rail · map-supported exterior paths</span><span id="pilot-connection"></span></div>
  <main id="main"><div class="rail-heading"><div><p class="eyebrow">REVIEWED SINGAPORE BUS PATTERNS</p><h1>More stops. Clear limits.</h1><p>Plan between supported stops and stations. Know what each time assumes.</p></div><a href="#pilot-coverage">Pilot coverage ↓</a></div>
  <p id="pilot-status" class="notice" role="status">Loading rail, bus and walking data…</p><div class="planner-layout"><section id="pilot-planner" class="panel planner-panel"></section><section id="pilot-journey" class="journey-panel" aria-live="polite" tabindex="-1"></section></div>
  <section id="active-journey" class="panel coverage-panel"></section><section id="pilot-live" class="panel coverage-panel"></section><section id="pilot-coverage" class="panel coverage-panel"></section>
  <footer><p><a href="/">Scheduled rail planner</a> · <a href="/replay.html">Original corridor replay & Phase 1 live information</a></p><p>All times Asia/Singapore. Accessibility and indoor facilities remain unverified.</p></footer></main>`;
  connection();
}
function form(initial) {
  datePickers?.destroy();
  planningPreferences=legacyPlannerInput(initial,planningPreferences);
  const fields = [['originId','From stop or station'],['destinationId','To stop or station']];
  document.querySelector('#pilot-planner').innerHTML=`<div class="panel-heading"><h2>Plan your journey</h2><span class="tag">Pilot</span></div><form id="pilot-form"><fieldset><legend class="sr-only">Pilot journey details</legend>
  ${fields.map(([key,label])=>`<label>${label}<input name="${key}" list="pilot-places" required autocomplete="off" value="${escape(name(initial[key]))}"></label>`).join('')}<datalist id="pilot-places">${[...lookup].filter(([id])=>router.network.stations.some(s=>s.id===id)).map(([id,label])=>`<option value="${escape(label)}">${escape(id)}</option>`).join('')}</datalist>
  <div class="form-pair"><label>Travel date<input type="date" name="date" required value="${initial.date}"></label><label>Depart at<input type="time" name="departureTime" required value="${initial.departureTime}"></label></div>
  <div class="form-pair"><label>Arrive-by date<input type="date" name="deadlineDate" value="${initial.deadlineDate||initial.date}"></label><label>Arrive by (optional)<input type="time" name="deadlineTime" value="${initial.deadlineTime||''}"></label></div>
  <label>Total walking limit<select name="walkingLimitMinutes">${[...new Set([0,4,5,8,10,15,20,30,45,60,Number(initial.walkingLimitMinutes)])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${n===Number(initial.walkingLimitMinutes)?'selected':''}>${n} minutes</option>`).join('')}</select></label>
  <label>Preference<select name="preference">${[['fastest','Fastest arrival'],['fewer-transfers','Fewer transfers'],['less-walking','Less walking'],['quieter','Quieter (comparison unavailable)']].map(([v,t])=>`<option value="${v}" ${v===initial.preference?'selected':''}>${t}</option>`).join('')}</select></label>
  <label>Extra time for preferences<select name="maxExtraMinutes">${[...new Set([0,5,10,15,30,60,Number(initial.maxExtraMinutes)])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${n===Number(initial.maxExtraMinutes)?'selected':''}>${n} minutes</option>`).join('')}</select></label>
  <label>Modes<select name="mode"><option value="mixed">Bus + rail</option><option value="bus-only" ${initial.mode==='bus-only'?'selected':''}>Bus only</option></select></label>
  <label>Demonstration<select name="fixture"><option value="none">Normal pilot</option><option value="ewl" ${initial.fixture==='ewl'?'selected':''}>Synthetic fixture: EWL unavailable</option></select></label>
  <p class="field-note">Bus source dates: ${escape(bus.coverage.validFrom)}–${escape(bus.coverage.validThrough)}. Weekday, Saturday and Sunday stop hours are checked separately, including overnight carryover. Missing periods and unreviewed services remain unavailable. Clear the deadline for an unconstrained search.</p><button class="primary" type="submit">Find pilot journeys →</button></fieldset></form>`;
  const f=document.querySelector('#pilot-form'); let previous=f.elements.date.value;
  f.elements.date.addEventListener('change',()=>{if(f.elements.deadlineDate.value===previous)f.elements.deadlineDate.value=f.elements.date.value;previous=f.elements.date.value;datePickers?.refresh();});
  const changed=()=>{dirty=true;companion?.clearPrepared();document.querySelector('#pilot-status').textContent='Journey details changed. Search again before saving.';};
  f.addEventListener('input',changed);f.addEventListener('change',changed);
  datePickers=mountDatePickers(f);
  f.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(f));for(const key of ['originId','destinationId'])data[key]=[...lookup].find(([id,label])=>label.toLowerCase()===data[key].trim().toLowerCase()||id===data[key])?.[0]??data[key]; search(data);});
}
let routerKey='';
function search(data,restoreId) {
  companion?.clearPrepared();
  data=legacyPlannerInput(data,planningPreferences);input=data; dirty=false;
  const key=`${data.mode}:${data.fixture}`;
  if(key!==routerKey) { router=createMultimodalRouter(rail,bus,walking,{busOnly:data.mode==='bus-only',closedRailRouteIds:data.fixture==='ewl'?['EWL']:[]});routerKey=key; }
  result=router.route(data);route=result.status==='ok'?(result.routes.find(r=>r.id===restoreId)??result.recommended):null;
  arrivalEpoch++;feed=null;lastArrivalGood=null;liveStop=null;
  document.querySelector('#pilot-status').textContent=route?'Calculated locally from pinned data. Bus times are estimates; allow a margin for connections and deadlines.':result.errors.map(e=>e.message).join(' ');
  render();
}
function render(saved=false) {
  const el=document.querySelector('#pilot-journey');
  if(!route){el.innerHTML='<div class="panel empty-state"><h2>No supported journey found</h2><p>Review the coverage window, stop direction, deadline and walking allowance above.</p></div>';renderLive();return;}
  const r=route;
  el.innerHTML=`${saved?'<p class="notice">Saved pilot guidance · retained estimate, not current service information.</p>':''}${input.fixture==='ewl'?'<p class="notice">SYNTHETIC DISRUPTION FIXTURE · EWL removed for this search. This is not a live closure or automatic rerouting.</p>':''}
  <article class="route-hero"><div class="hero-top"><span>${r.estimated?'Estimated multimodal journey':'Scheduled rail journey'}</span><span>${escape(input.date)}</span></div><h2>${escape(name(r.originId))} → ${escape(name(r.destinationId))}</h2><div class="hero-arrival"><div><span>${r.estimated?'Estimated arrival · not guaranteed':'Scheduled arrival'}</span><strong>${clock(r.arrivalSeconds)}</strong></div><div class="total-time"><strong>${duration(r.totalSeconds)}</strong><span>total journey</span></div></div><div class="hero-metrics"><span>${r.transfers} transfers</span><span>${duration(r.walkingSeconds)} walking</span></div></article>
  <div class="route-summary"><p>${r.deadlineSeconds===null?'No arrival deadline.':`${r.estimated?'Estimated':'Scheduled'} deadline margin: ${duration(r.deadlineBufferSeconds)}. ${r.estimated?'A late bus can invalidate the rail connection.':''}`}</p><button class="secondary" id="save-pilot">Save pilot guidance</button></div>
  ${fareEstimateHTML({route:{legacyRoute:r,legacyInput:input},plan:{departureDate:input.date}},{busNetwork:bus})}<section class="panel instructions"><h3>Your journey, step by step</h3><ol class="journey-steps">${r.legs.filter(l=>l.durationSeconds).map(l=>`<li class="journey-step"><span class="step-marker" aria-hidden="true">${l.mode==='bus'?'B':l.type==='ride'?'R':'↝'}</span><div><h4>${escape(l.type==='ride'?`${l.mode==='bus'?'Bus '+l.serviceNo+' direction '+l.directionId:l.routeId}: ${name(l.fromStopId)} → ${name(l.toStopId)}`:l.type==='transfer'?`Transfer: ${name(l.fromStopId)} → ${name(l.toStopId)}`:l.type==='wait'?`Wait for ${l.mode==='bus'?'bus (frequency estimate)':'scheduled train'}`:l.type==='access'?'Station access allowance':'Station exit allowance')}</h4><p>${l.timing==='frequency-estimated'?'Estimated ':''}${clock(l.startSeconds)}–${clock(l.endSeconds)} · ${duration(l.durationSeconds)}</p>${l.pathId?`<p><a href="#path-${escape(l.pathId)}">Review pedestrian path ${escape(l.pathId)}</a> · exterior walk plus one 2-minute indoor allowance.</p>`:''}${l.type==='ride'?`<details><summary>Stops and source identity</summary><p>${l.stopIds.map(id=>escape(name(id))).join(' → ')}</p><p>${l.mode==='bus'?`Frequency estimate · pattern ${escape(l.patternId)} · boarding sequence ${l.fromSequence}, visit ${l.visitNumber} · alighting sequence ${l.toSequence}`:`Scheduled trip ${escape(l.tripId)} · service day ${escape(l.serviceDate)}`}</p></details>`:''}</div></li>`).join('')}</ol></section>
  <section class="panel arithmetic"><h3>Where the time goes</h3><dl>${[['Access',r.accessSeconds],['Waiting',r.waitSeconds],['Riding',r.rideSeconds],['Transfers',r.transferSeconds],['Exit',r.exitSeconds],['Total',r.totalSeconds]].map(([label,seconds])=>`<div><dt>${label}</dt><dd>${duration(seconds)}</dd></div>`).join('')}</dl><p>Walking is included in these components, never added twice.</p><details><summary>Timing assumptions</summary><ul>${r.assumptions.map(a=>`<li>${escape(a)}</li>`).join('')}</ul></details></section>
  ${(result?.routes??[]).filter(a=>a.id!==r.id).slice(0,10).map((a,i)=>`<p><button class="secondary" data-route="${escape(a.id)}">Alternative ${i+1}: ${a.estimated?'estimate ':''}${clock(a.arrivalSeconds)}, ${a.transfers} transfers, ${duration(a.walkingSeconds)} walking</button></p>`).join('')}`;
  document.querySelector('#save-pilot').addEventListener('click',()=>{if(dirty){document.querySelector('#pilot-status').textContent='Search again before saving changed details.';return;}try{localStorage.setItem(SAVE,JSON.stringify({schemaVersion:1,savedAt:new Date().toISOString(),input,route,build,labels:[...lookup]}));document.querySelector('#pilot-status').textContent='Pilot guidance saved on this device. No live predictions were saved.';}catch{document.querySelector('#pilot-status').textContent='Device storage unavailable; guidance was not saved.';}});
  for(const button of el.querySelectorAll('[data-route]'))button.addEventListener('click',()=>{companion?.clearPrepared();route=result.routes.find(r=>r.id===button.dataset.route);arrivalEpoch++;feed=null;lastArrivalGood=null;liveStop=null;render();});
  renderLive();
}
function renderLive() {
  const el=document.querySelector('#pilot-live');if(!el)return;
  const first=route?.legs.find(l=>l.mode==='bus'&&l.type==='ride');
  if(!first){el.innerHTML='<h2>Current bus arrivals</h2><p>Select a journey containing a bus to inspect its boarding stop.</p>';return;}
  const stop=first.fromStopId.replace('bus:',''),now=Date.now();
  if(!feed&&!lastArrivalGood&&bus)try{const cached=JSON.parse(localStorage.getItem(ARRIVAL_SAVE));if(validatePilotArrivals(cached,stop,bus.patterns)&&cached.status!=='unavailable'){lastArrivalGood=cached;feed={...cached,status:'unavailable',error:'saved_snapshot'};}}catch{}
  const state=p=>pilotPredictionState(p,feed,now,navigator.onLine);
  const blocked=!navigator.onLine||(feed&&Date.parse(feed.nextRefreshAt)>now);
  el.innerHTML=`<h2>Current bus arrivals · ${escape(stop)}</h2><p>Optional current information at this boarding stop, separate from travel date ${escape(input.date)}. These predictions never alter the itinerary or predict downstream arrival times.</p><button id="refresh-bus" class="secondary" ${blocked?'disabled':''}>Check current arrivals</button><p>Refresh at most every 30 seconds. No automatic polling.</p>
  ${!navigator.onLine?'<p class="notice">Offline · no current arrivals. Previously retrieved predictions are not current.</p>':''}
  ${feed?`<p>Last successful retrieval: ${escape(feed.lastSuccessfulRetrievalAt??lastArrivalGood?.retrievedAt??feed.retrievedAt??'none')}; source validity: not supplied; retry: ${escape(feed.nextRefreshAt??'manual')}. Status: ${escape(feed.status)}${feed.error?' · '+escape(feed.error):''}. Retrieved: ${escape(feed.retrievedAt??'unavailable')}. Provider observation timestamp: unavailable. HTTP response date: ${escape(feed.providerHttpDate??'unavailable')}.</p>${feed.status==='empty'?'<p>Valid empty response. No prediction supplied; this does not prove there is no service.</p>':''}<ul>${feed.predictions.map(p=>`<li>Service ${escape(p.serviceNo)} · ${escape(state(p))} · predicted arrival ${escape(p.predictedArrival)} · ${escape(p.predictionBasis)} · ${p.match?`direction ${p.match.direction}, stop occurrence ${p.match.sequence}`:'direction/variant match unavailable; advisory only'}</li>`).join('')}</ul>`:'<p>No live request made. Timetable and frequency estimates work without a key.</p>'}`;
  document.querySelector('#refresh-bus').addEventListener('click',async()=>{
    const button=document.querySelector('#refresh-bus');button.disabled=true;button.textContent='Checking…';liveStop=stop;const epoch=++arrivalEpoch;
    try{const response=await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(stop)}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('unavailable');const data=await response.json();if(!validatePilotArrivals(data,stop,bus?.patterns))throw Error('malformed');if(liveStop===stop&&epoch===arrivalEpoch&&navigator.onLine&&(!lastArrivalGood?.retrievedAt||!data.retrievedAt||Date.parse(data.retrievedAt)>=Date.parse(lastArrivalGood.retrievedAt))){feed=data;if(data.status!=='unavailable'){lastArrivalGood=data;try{localStorage.setItem(ARRIVAL_SAVE,JSON.stringify(data));}catch{}}else if(lastArrivalGood)feed={...data,predictions:lastArrivalGood.predictions};}}catch(error){if(liveStop===stop&&epoch===arrivalEpoch)feed={status:'unavailable',error:error.message==='malformed'?'malformed':'network_or_timeout',predictions:lastArrivalGood?.predictions??[],retrievedAt:null,nextRefreshAt:new Date(Date.now()+30000).toISOString()};}renderLive();
  });
}
function coverage() {
  const enabled=walking.links.filter(l=>l.enabled);
  document.querySelector('#pilot-coverage').innerHTML=`<h2>Coverage and evidence</h2><p><strong>${bus.availability?.routableStopCount??0} bus stops · ${bus.availability?.routablePatternCount??0} routable directional patterns · ${bus.availability?.routableServiceNumberCount??0} exact service numbers</strong>. Wider validated rail remains available. The compiled source registry includes ${bus.patterns.length} patterns; patterns without usable day and frequency timing are held out. Imported island-wide records do not imply island-wide multimodal support.</p><p>Bus estimates use source dates ${escape(bus.coverage.validFrom)}–${escape(bus.coverage.validThrough)}. WD/SAT/SUN first and last arrivals constrain each service day, including previous-day carryover after midnight. Missing frequency bands, unreviewed holidays, fixed-trip and ambiguous route records remain excluded. The manifest lists every included and excluded pattern.</p><p>Waiting uses the applicable published maximum headway as an assumption. Before 06:30 only a published first arrival is usable; no early frequency is inferred. Weekend frequency is an uncalibrated use of generic published bands. Riding uses distance at 18 km/h plus 30 seconds per traversed stop. These are uncalibrated planning estimates and can miss connections. Crowding comparisons are unavailable.</p><p>Data build: <code>${escape(build)}</code>. Bus retrieval: ${escape(manifest.source?.retrievedAt??manifest.retrievedAt??'see manifest')}.</p>
  <p>Rail and bus data: Land Transport Authority (LTA), Singapore · <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noopener">Singapore Open Data Licence v1.0</a>. Walking map data: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors, ODbL</a>. Operator locality maps retain their original rights. No official endorsement is implied.</p>
  <p><a href="/data/bus-manifest.json">Bus import manifest</a> · <a href="/data/bus-network.json">Pilot bus data</a> · <a href="/data/walking-links.json">Pedestrian evidence ledger</a> · <a href="/data/rail-manifest.json">Rail provenance</a></p>
  <h3>Enabled pedestrian paths</h3>${enabled.map(l=>`<article id="path-${escape(l.id)}"><h4>${escape(l.id)} · stop ${escape(l.busStopId)} ↔ ${escape(l.entrance)}</h4><p>${escape(l.description??l.pathDescription??'Review the path ledger for the mapped route and limitations.')}</p><p>${l.externalDistanceMeters} m exterior distance assumption · ${l.externalSeconds}s exterior walking + ${l.railAllowanceSeconds}s indoor allowance. ${escape(l.directionality)}. Map-supported, not field surveyed. Accessibility unknown.</p><p>${(l.sourceUrls??[]).map((url,i)=>`<a href="${escape(url)}" target="_blank" rel="noopener">Path source ${i+1}</a>`).join(' · ')}</p></article>`).join('')}<p>No opposite-side street crossing, address access or proximity-based link is inferred. Newton, Tampines and Bukit Panjang tap-out rail connections remain omitted. Two exterior paths cannot create an unreviewed shortcut through a station.</p>`;
}
async function start() {
  shell();const saved=readSaved();
  try{
    const names=['rail-network','bus-network','walking-links','bus-manifest','rail-manifest'];
    [rail,bus,walking,manifest,railManifest]=await Promise.all(names.map(async n=>{const response=await fetch(`/data/${n}.json`);if(!response.ok)throw Error('Data unavailable');return response.json();}));

    build=`${railManifest.buildId}:${manifest.networkSha256}:${walking.version}`;
    router=createMultimodalRouter(rail,bus,walking);routerKey='mixed:none';
    const stationLabels=new Map();for(const s of router.network.stations)stationLabels.set(s.name,(stationLabels.get(s.name)??0)+1);
    lookup=new Map([...router.network.stops.map(s=>[s.id,`${s.name??s.id} (${s.id})`]),...router.network.stations.map(s=>[s.id,`${s.name}${stationLabels.get(s.name)>1?' ('+s.id+')':''}`])]);
    const initial=saved?.input??{originId:'bus:75009',destinationId:'DT14',date:bus.coverage.validFrom,departureTime:'10:00',deadlineDate:bus.coverage.validFrom,deadlineTime:'12:30',walkingLimitMinutes:20,preference:'fastest',maxExtraMinutes:15,mode:'mixed',fixture:'none'};
    form(initial);coverage();search(initial,saved?.build===build?saved.route.id:undefined);
    const progressRouter=createMultimodalRouter(rail,bus,walking);
    mountJourney({host:document.querySelector('#active-journey'),getSelected:()=>dirty?null:({route,input}),getRouter:activeInput=>activeInput?.mode==='bus-only'||activeInput?.fixture==='ewl'?createMultimodalRouter(rail,bus,walking,{busOnly:activeInput?.mode==='bus-only',closedRailRouteIds:activeInput?.fixture==='ewl'?['EWL']:[]}):progressRouter,getBuild:()=>build,name});
    if(saved?.build===build&&route?.id===saved.route.id)render(true);
    else if(saved)document.querySelector('#pilot-status').textContent+=' Data or selected feasibility changed; guidance was recalculated. Review before saving.';
  }catch(error){
    document.querySelector('#pilot-status').textContent='Pilot data unavailable. New pilot searches require cached rail, bus, walking and provenance files. Reconnect and reload.';
    if(saved){route=saved.route;input=saved.input;build=saved.build;lookup=new Map(saved.labels);render(true);}else document.querySelector('#pilot-journey').textContent='No saved pilot guidance.';
    mountJourney({host:document.querySelector('#active-journey'),getSelected:()=>null,getRouter:()=>null,getBuild:()=>build,name});
    console.warn('Pilot data could not be loaded:',error.message);
  }
  companion=mountCompanion({getSelected:()=>dirty?null:({route,input}),name,getFareOptions:()=>({busNetwork:bus}),getPlaces:()=>router?.network.stations.map(s=>({id:s.id,label:s.name,lat:s.lat,lng:s.lon??s.lng,sourceId:'lta:'+s.id,stationId:s.id,coverage:'supported',accessibility:'unknown'}))??[],onSelectPlan:p=>{form({...input,...p.preferences,originId:p.origin.stationId??p.origin.id,destinationId:p.destination.stationId??p.destination.id,date:p.departureDate,departureTime:p.departureTime,deadlineTime:''});dirty=true;document.querySelector('#pilot-form').scrollIntoView();},onEndpoint:(endpoint,p)=>{const f=document.querySelector('#pilot-form');f.elements[endpoint+'Id'].value=name(p.stationId??p.id);f.dispatchEvent(new Event('input'));dirty=true;}});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
window.addEventListener('online',()=>{connection();clearTimeout(busReconnectTimer);if(liveStop||lastArrivalGood){const retry=Math.max(Date.now(),Date.parse(feed?.nextRefreshAt)||Date.now());busReconnectTimer=setTimeout(()=>{if(navigator.onLine){renderLive();document.querySelector('#refresh-bus:not(:disabled)')?.click();}},Math.min(300000,retry-Date.now()));}});window.addEventListener('offline',()=>{clearTimeout(busReconnectTimer);connection();});
setInterval(renderLive,10000);
start();
