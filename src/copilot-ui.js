import {FIXTURE_LAYOUT,fixtureStatuses} from './facility-data.js';
import {findFacilityPath,pathInstructions} from './facility-engine.js';
import {validateJourney as validateV1} from './journey-state.js';
import {JOURNEY_KEY,startJourney,transition,confirmCheckpoint,setPermissions,setApproximateLocation,acceptDetour,stopAction,journeyCard,restoreActive,migrateActive,saveActive,routeFromLegacy,makePlan,validatePlan,proposeRoute,acceptRoute} from './journey-v2.js';
import {SharingClient,enablePush,disablePush} from './sharing-client.js';
import {mountFacilities} from './facility-ui.js';
import {mountPersonal} from './personal-ui.js';
import {mountExpenditure,fareEstimateHTML} from './fare-ui.js';
import {estimatePlanFare} from './fares.js';
import {getAppLocation,locationDescription} from './location-assistance.js';
import {createOfflineReadiness,OFFLINE_LIMITS} from './offline-readiness.js';
import {addStreetMap} from './network-map.js';
import {publicStationLabel,publicInstruction,itineraryGuidance,checkpointChoices,renderItineraryTimeline} from './itinerary-display.js';
import {readPresentationPreferences,reducedGuidanceMotion} from './presentation-preferences.js';
import {indoorNoticeHTML} from './station-guide.js';
import {icon} from './icons.js';
import {mountLocationSettings,drawLocationMarker} from './location-ui.js';
import {estimateLocationProgress,requiresIndoorConfirmation} from './location-progress.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=s=>`${String(Math.floor(s/3600)%24).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}${s>=86400?' (+1 day)':''}`;
export function mountCompanion({getSelected=()=>null,getPlaces=()=>[],onSelectPlan=()=>{},onEndpoint=()=>{},name=id=>id,getMap=()=>null,getFareOptions=()=>({}),getRoutingContext=()=>null,getLocationContext=()=>({}),getPresentation=null,mode='real',host:mountHost=null,sectionHosts={},showHeader=true,showDock=true}={}){
  if(document.querySelector('#companion'))return;
  for(const href of ['/src/copilot.css','/src/itinerary-display.css','/src/guidance.css','/src/location.css']){const style=document.createElement('link');style.rel='stylesheet';style.href=href;document.head.append(style);}
  const host=document.createElement('section');host.id='companion';host.className='copilot';host.setAttribute('aria-label','Journey companion');if(mountHost)mountHost.append(host);else document.querySelector('#app').after(host);
  host.innerHTML=`<p class="eyebrow">YOUR JOURNEY COMPANION</p><h2>Prepare, travel, stay connected.</h2><p>Use the journey you selected above. Saved places, assistance, sharing and spending stay together.</p><nav aria-label="Companion tools"><a href="#companion-plan">Prepare</a><a href="#companion-facilities">Station &amp; toilets</a><a href="#companion-sharing">Caregiver</a><a href="#companion-places">Saved places</a><a href="#companion-fares">Spending</a></nav><p id="companion-message" role="status" aria-live="polite"></p>
  <section id="companion-plan" class="companion-panel"><h3 id="confirmation-heading">Confirm your trip</h3><button id="review-selected" class="primary" ${showHeader?'':'hidden'}>Review selected journey</button><div id="companion-preview"></div><div id="companion-active"></div></section>
  <section id="companion-map-panel" class="companion-panel"><h3>Journey map</h3><div id="companion-map" aria-label="OpenStreetMap journey and toilet locations"></div><p id="companion-map-note">Geographic overview. Indoor diagrams have a separate coverage label.</p></section>
  <section id="companion-facilities" class="companion-panel"></section><section id="companion-sharing" class="companion-panel"></section><section id="companion-places" class="companion-panel"></section><section id="companion-fares" class="companion-panel"></section>`;
  const dock=document.createElement('aside');dock.className='ongoing-card';dock.hidden=true;dock.setAttribute('aria-label','Ongoing journey');document.body.append(dock);
  const $=id=>document.getElementById(id);
  const sections={review:$('companion-plan'),current:$('companion-active'),map:$('companion-map-panel'),facilities:$('companion-facilities'),sharing:$('companion-sharing'),saved:$('companion-places'),spending:$('companion-fares')};
  // Move the existing controllers, never mount a second copy for another screen.
  if(sectionHosts.review){host.prepend(sections.current);sections.current.classList.add('companion-panel');}
  for(const [key,target]of Object.entries(sectionHosts))if(sections[key]&&target)target.append(sections[key]);
  if(!showHeader)for(const node of [...host.children])if(node.matches('p.eyebrow,h2,nav')||node.tagName==='P'&&node.id!=='companion-message')node.remove();
  let deviceStorage;try{deviceStorage=window.localStorage;}catch{deviceStorage={getItem:()=>null,setItem:()=>{throw Error('Browser storage unavailable');},removeItem:()=>{throw Error('Browser storage unavailable');}};}
  let active=migrateActive(deviceStorage,validateV1,name).state,prepared=null,preparedContext=null,shareView=null,map=null,mapLayers=null,externalMap=false,facilities,personal,spending,toiletMarkers=[],storageEnabled=true,locationState={collecting:false,reason:''};
  const sharing=new SharingClient(deviceStorage);const incoming=sharing.useFragment();
  function message(text){$('companion-message').textContent=text;window.dispatchEvent(new CustomEvent('copilot:message',{detail:{text}}));}
  function revealSection(section){const element=sections[section];for(let node=element?.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;window.dispatchEvent(new CustomEvent('copilot:open-section',{detail:{section}}));element?.scrollIntoView({block:'start'});}
  const locationAssistance=getAppLocation();
  locationState=locationAssistance.getState();
  const offline=createOfflineReadiness({storage:deviceStorage,key:JOURNEY_KEY,serviceWorker:navigator.serviceWorker,onChange:renderOffline});
  const run=fn=>async()=>{try{await fn();}catch(error){message(error.message);}};
  let privacySync=null;
  function localPrivacy(changes){if(active)commit({...active,revision:active.revision+1,updatedAt:Date.now(),location:null,permissions:{...active.permissions,...changes,geolocation:'stopped'}},{upload:false});}
  function pendingPrivacy(action){if(!sharing.session?.travellerToken)return;if(sharing.session.pendingPrivacyAction==='revoke'&&action!=='revoke')return;sharing.session={...sharing.session,pendingPrivacyAction:action,pendingPrivacyToken:crypto.randomUUID()};sharing.persist();}
  async function syncPrivacy(){
    if(privacySync)return privacySync;
    privacySync=(async()=>{
      while(sharing.session?.pendingPrivacyAction){
        const action=sharing.session.pendingPrivacyAction,id=sharing.session.id,token=sharing.session.pendingPrivacyToken;
        try{
          const result=action==='revoke'?await sharing.revoke():await sharing.permissions({progress:active?.permissions.progress===true,location:false},active?.permissions.paused===true);
          if(sharing.session?.id!==id)return;
          if(sharing.session.pendingPrivacyAction===action&&sharing.session.pendingPrivacyToken===token){delete sharing.session.pendingPrivacyAction;delete sharing.session.pendingPrivacyToken;sharing.persist();}
          shareView={...result,viewedAt:Date.now()};renderSharing();
          message(action==='revoke'?'Caregiver access removed on the server. Old queued locations cannot restart sharing.':['completed','cancelled'].includes(active?.status)?'Trip ended. The sharing service has paused progress and location updates.':'Location collection and geographic sharing stopped. Enable local assistance and caregiver geographic sharing separately if needed.');
        }catch(error){renderSharing();throw Error(`${action==='revoke'?'Caregiver revocation':'Location-sharing stop'} is pending on the server. Collection is stopped on this device. Reconnect or use Retry. ${error.message}`);}
      }
    })();
    try{return await privacySync;}finally{privacySync=null;}
  }
  async function stopLocation(){stopGeo({persist:true});localPrivacy({location:false});pendingPrivacy('stop-location');renderSharing();if(sharing.session?.pendingPrivacyAction)await syncPrivacy();else message('Location collection stopped on this device.');}
  async function revokeAccess(){stopGeo();localPrivacy({revoked:true,progress:false,location:false,paused:true});pendingPrivacy('revoke');renderSharing();await syncPrivacy();}
  function commit(next,{upload=true,locationOnly=false}={}){
    // Generic checkpoints lack the confirmed civil time/walking budget needed by
    // the timetable comparator. A previous routing seed must not outlive them.
    if(!locationOnly&&active?.id===next?.id&&active?.routingContext&&JSON.stringify(next.routingContext)===JSON.stringify(active.routingContext)){
      const routeShape=route=>JSON.stringify({id:route.id,steps:route.steps,legacyRoute:route.legacyRoute,accessibility:route.accessibility});
      if(routeShape(next.route)!==routeShape(active.route))next={...next,routingContext:null};
      else if(JSON.stringify(next.progress)!==JSON.stringify(active.progress)||next.status!==active.status)next={...next,routingContext:{...next.routingContext,revision:next.routingContext.revision+1,progress:{...next.routingContext.progress,kind:'unknown'},proposal:null}};
    }
    const started=next?.id!==active?.id,endedNow=['completed','cancelled'].includes(next.status)&&next.status!==active?.status;active=next;if(started){storageEnabled=true;clearPrepared();}else if(endedNow)renderPreview();
    if(started&&locationState.usable&&active.status==='started')active=setApproximateLocation(active,locationState.position);
    if(storageEnabled&&!saveActive(deviceStorage,active))message('Device storage unavailable. Keep this tab open; guidance has not been saved.');
    if(locationOnly){renderLocationStatus();drawMap();}else{renderActive();facilities?.refresh();}
    offline.setTrip(active);
    window.dispatchEvent(new CustomEvent('copilot:state-changed',{detail:{active,started,locationOnly}}));
    if(upload&&active&&sharing.session?.travellerToken)sharing.update(active).catch(e=>message(`Sharing not updated: ${e.message}. Reconnect and refresh before retrying.`));
  }
  function selectedJourney(){const selected=getSelected();if(!selected?.route&&!selected?.plan)throw Error('Choose a feasible journey in the planner first.');const plan=selected.plan?structuredClone(selected.plan):routeFromLegacy(selected.route,selected.input,{name,mode,source:mode==='replay'?'Labelled replay assumptions':'Imported timetable / estimated station access; see source coverage'});const places=getPlaces();for(const key of ['origin','destination']){const found=places.find(x=>x.id===plan[key].id);if(found)plan[key]={...plan[key],...found};}return {plan,routingContext:selected.routingContext??getRoutingContext()};}
  function selectedPlan(){const selection=selectedJourney();preparedContext=selection.routingContext;return selection.plan;}
  function startIssue(plan){
    if(active&&!['completed','cancelled'].includes(active.status))return 'Finish or cancel your current journey before starting another.';
    if(!validatePlan(plan))return 'Choose a valid route with complete endpoints, date and time before starting.';
    if(plan.preferences.stepFree&&plan.route.accessibility!=='verified'&&plan.mode!=='replay')return 'This route has no verified continuous step-free path. It cannot start as accessible guidance. Check suitable access with station staff.';
    return '';
  }
  function planDetails(plan){return `${fareEstimateHTML(plan,getFareOptions())}<p>${esc(plan.route.provenance)}. Accessibility: ${esc(plan.route.accessibility)}.</p><p>Preferences: ${esc(plan.preferences.fareCategory)} fare category${plan.preferences.stepFree?' · verified step-free path required':''}.</p>${plan.stops.length?`<p>${plan.stops.length} planned stop(s); recheck usable paths before departure.</p>`:''}`;}
  function inspectSelected(){try{const {plan}=selectedJourney();return {plan,issue:startIssue(plan),details:planDetails(plan)};}catch(error){return {plan:null,issue:error.message,details:''};}}
  let starting=false;
  // All selected/prepared starts commit synchronously before optional side effects.
  // A second activation observes the active trip, even during a UI refresh.
  function startPlan(plan,routingContext){
    if(starting)throw Error('Your journey is already starting.');
    const issue=startIssue(plan);if(issue)throw Error(issue);
    starting=true;
    try{const next=startJourney(plan);if(routingContext)next.routingContext=structuredClone(routingContext);commit(next);message('Journey started.');return next;}
    finally{starting=false;}
  }
  function startSelected(){const {plan,routingContext}=selectedJourney();return startPlan(plan,routingContext);}
  function locationEstimate(){return estimateLocationProgress(active,locationState.usable?locationState.position:null,{...getLocationContext(),name});}
  function renderLocationStatus(){
    const status=$('location-status');if(status)status.textContent=locationDescription(locationState.position,locationState);
    const button=$('locate-once');if(button){button.hidden=locationState.enabled;button.textContent=['denied','unavailable'].includes(locationState.status)?'Retry location assistance':'Enable location assistance';}
    if($('clear-location'))$('clear-location').hidden=!locationState.enabled;
    const estimate=locationEstimate(),box=$('location-estimate');
    if(box){box.textContent=estimate.status==='estimated'?`${estimate.label}: ${estimate.current}. Location estimate; accepted checkpoints are unchanged.`:'';box.hidden=active?.status!=='started'||estimate.status!=='estimated';box.dataset.estimated=String(estimate.status==='estimated');}
    const suppress=active?.status==='started'&&locationState.usable&&!requiresIndoorConfirmation(active,active.progress.stepIndex);
    const primary=$('guidance-primary');if(primary)primary.hidden=suppress&&primary.dataset.action==='checkpoint';
    if($('guidance-current-step'))$('guidance-current-step').hidden=suppress;
    if($('location-recovery'))$('location-recovery').hidden=!suppress;
    if(showHeader&&$('trip-position')?.tagName==='DETAILS'&&suppress&&!$('trip-position').matches(':focus-within'))$('trip-position').open=false;
  }

  function renderOffline(state){const box=$('trip-offline');if(!box)return;box.innerHTML=`<p id="offline-readiness" role="status" data-ready="${state.ready}"><strong>${esc(state.reason)}</strong>${state.savedAt?` · Saved ${esc(new Date(state.savedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}))} SGT`:''}</p><p class="muted">${esc(OFFLINE_LIMITS)}</p>${active?`${state.durable?'<button id="remove-offline-trip">Remove saved trip from this device</button>':'<button id="save-offline-trip">Save current trip on this device</button>'}<button id="check-offline-trip">Check offline availability</button>`:''}`;
    $('check-offline-trip')?.addEventListener('click',()=>offline.verify());
    $('save-offline-trip')?.addEventListener('click',()=>{storageEnabled=true;commit(active,{upload:false});offline.verify();});
    $('remove-offline-trip')?.addEventListener('click',()=>{try{deviceStorage.removeItem(JOURNEY_KEY);deviceStorage.removeItem('commute-copilot-active-journey-v1');if(deviceStorage.getItem(JOURNEY_KEY)!==null)throw Error();storageEnabled=false;offline.setTrip(active);message('Saved trip removed. Guidance remains in this tab until it closes; Saved Routes and caregiver permissions are unchanged.');}catch{message('The saved trip could not be removed. Check browser storage access and retry.');offline.storageChanged();}});
  }
  function fareText(plan){try{const fare=estimatePlanFare(plan,getFareOptions());return fare?.totalCents!=null?`Estimated SGD ${(fare.totalCents/100).toFixed(2)} · ${fare.explanation??fare.reason??'see fare assumptions'}`:fare?.reason??'Fare unavailable: official distance required; enter actual charged amount after completion.';}catch{return 'Fare unavailable for this itinerary; official distance and transfer validation required.';}}
  function clearPrepared(){prepared=null;preparedContext=null;renderPreview();renderSharing();window.dispatchEvent(new CustomEvent('copilot:prepared-cleared'));}
  function renderPreview(){
    const p=prepared,ongoing=active&&!['completed','cancelled'].includes(active.status);
    $('review-selected').hidden=!showHeader||!!p||!!ongoing;
    $('confirmation-heading').hidden=!p&&(!showHeader||!!ongoing);
    if(!p){$('companion-preview').innerHTML='';return;}
    $('companion-preview').innerHTML=`<article class="c-route"><h4>${esc(publicStationLabel(p.origin.label??p.origin.id))} → ${esc(publicStationLabel(p.destination.label??p.destination.id))}</h4><p>${esc(p.mode==='replay'?'LABELLED REPLAY · ':'')}${esc(p.departureDate)} ${esc(p.departureTime)} SGT · planned arrival ${time(p.route.arrivalSeconds)}</p>
    ${p.preferences.stepFree&&p.route.accessibility!=='verified'&&p.mode!=='replay'?'<aside class="wip-banner"><strong>Work in progress — step-free coverage</strong><p>This route has no verified continuous step-free path. It cannot start as accessible guidance. Check suitable access with station staff.</p></aside>':''}


    ${ongoing?'<p class="c-note">Finish or cancel your current trip before starting this one.</p>':'<button id="start-companion" class="primary journey-start">Start journey</button>'}${renderItineraryTimeline(p.route,{name})}
    <details class="confirmation-details"><summary>Fare, accessibility &amp; route sources</summary>${planDetails(p)}</details></article>`;
    $('start-companion')?.addEventListener('click',run(()=>startPlan(prepared,preparedContext)));
    renderSharing();
  }
  function openFacilities(view='layout'){facilities?.open(active?.progress?.checkpoint?.stationId??active?.plan.origin.stationId??prepared?.origin?.stationId??prepared?.origin?.id??null,view);revealSection('facilities');}
  function scrollToCurrent(){
    const target=$('current-summary')??$('companion-active');
    const sheet=target.closest('.panel-scroll');
    target.tabIndex=-1;target.focus({preventScroll:true});
    const behavior=reducedGuidanceMotion((getPresentation?.()??readPresentationPreferences(deviceStorage)),{systemReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches})?'instant':'smooth';
    if(sheet&&getComputedStyle(sheet).overflowY!=='visible')sheet.scrollTo({top:0,behavior});else target.scrollIntoView({block:'start',behavior});
  }
  $('review-selected').onclick=run(()=>{prepared=selectedPlan();renderPreview();});
  function renderActive(){
    const simple=(getPresentation?.()??readPresentationPreferences(deviceStorage)).simpleGuidance,card=journeyCard(active,{online:navigator.onLine,visible:!document.hidden,name});document.body.classList.toggle('simple-guidance',simple);dock.hidden=!card||!showDock;document.body.classList.toggle('has-companion-trip',!!card&&showDock);
    if(card&&locationState.usable)card.warnings=card.warnings.filter(w=>!w.startsWith('Position unknown'));
    if(!card){$('companion-active').innerHTML='<h3>No current trip</h3><p>Plan a route, review its directions, then choose Start Journey.</p>';return;}
    const ended=['completed','cancelled'].includes(active.status);if(showHeader&&!prepared){$('review-selected').hidden=!ended;$('confirmation-heading').hidden=!ended;}
    const statusLabel={started:'Trip in progress',paused:'Trip paused',completed:'Trip completed',cancelled:'Trip cancelled'}[active.status];
    const openDetails=new Set([...$('companion-active').querySelectorAll('details[open]')].map(node=>node.id));
    if(!showHeader&&$('trip-position')&&!$('trip-position').hidden)openDetails.add('trip-position');
    const disclosure=id=>(showHeader&&!simple)||openDetails.has(id)?'open':'';
    const positionContext=JSON.stringify([active.id,active.route.id,active.routeRevisions.length,active.progress.stepIndex,active.progress.confirmedAt]);
    if($('trip-position')?.dataset.context!==positionContext)openDetails.delete('trip-position');
    const pendingStep=$('trip-position')?.dataset.context===positionContext&&openDetails.has('trip-position')?$('checkpoint-step')?.value:null;
    const positionFocus=pendingStep!==null&&['checkpoint-step','confirm-step'].includes(document.activeElement?.id)?document.activeElement.id:null;
    const positionChoices=checkpointChoices(active.route,{name,currentStepIndex:active.progress.stepIndex});
    const selectedStep=positionChoices.some(choice=>String(choice.stepIndex)===pendingStep)?pendingStep:String(active.progress.stepIndex);
    const positionPicker=`${active.progress.confirmedAt?`<p class="muted">Last confirmed: ${esc(publicInstruction(active.progress.checkpoint?.label??'current step'))} at ${esc(new Date(active.progress.confirmedAt).toLocaleTimeString('en-SG',{timeZone:'Asia/Singapore'}))} SGT.</p>`:''}<label for="checkpoint-step">Where are you on this journey?</label><div class="checkpoint-controls"><select id="checkpoint-step" aria-describedby="checkpoint-help">${positionChoices.map(choice=>`<option value="${choice.stepIndex}" ${String(choice.stepIndex)===selectedStep?'selected':''}>${esc(choice.label)}</option>`).join('')}</select><button type="button" id="confirm-step" class="checkpoint-confirm" aria-label="Confirm my current step" title="Confirm my current step">${icon('check',20)}</button></div><p id="checkpoint-help" class="muted">Your map location does not confirm boarding or arrival.</p>`;
    $('companion-active').innerHTML=`${showHeader?`<div class="trip-heading"><p class="eyebrow">${esc(statusLabel)}</p><h3>${esc(publicStationLabel(active.plan.origin.label??active.plan.origin.id))} → ${esc(publicStationLabel(active.plan.destination.label??active.plan.destination.id))}</h3></div>`:''}${active.plan.mode==='replay'?'<p class="c-note"><strong>Demo journey</strong> · excluded from personal spending</p>':''}
    ${!ended?`${showHeader?`<div class="trip-guidance"><p class="muted">Step ${active.progress.stepIndex+1} of ${active.route.steps.length} · estimated arrival ${time(card.arrivalSeconds)} SGT</p><h4>${active.status==='paused'?'Paused':'Current step'}</h4><p class="trip-current-step">${esc(card.current)}</p><p><strong>Next:</strong> ${esc(card.next)}</p></div>`:''}
    <p id="location-estimate" class="location-estimate" role="status"></p><details id="location-recovery" class="location-recovery" hidden><summary>Correct my step</summary><button type="button" id="recover-step" class="secondary">Choose current step</button></details><div class="trip-actions"><button id="journey-finish" class="secondary">${icon("stop",20)}<span>End trip</span></button><button id="journey-pause">${icon(active.status==="paused"?"play":"pause",20)}<span>${active.status==='paused'?'Resume':'Pause'} trip</span></button><button id="journey-cancel" class="trip-cancel" aria-expanded="false" aria-controls="cancel-trip-confirmation">${icon("close",20)}<span>Cancel trip</span></button></div>
    <div id="cancel-trip-confirmation" class="c-note cancel-trip-confirmation" role="group" aria-labelledby="cancel-trip-title" hidden><h4 id="cancel-trip-title">Cancel this trip?</h4><p>This ends guidance and stops location collection on this device. It will not be recorded as a completed journey or added to Journey spending. Your saved routes stay available.</p>${sharing.session?.travellerToken?'<p>Your caregiver may still see the last received update until this device reconnects. Cancelling does not remove their access to the shared trip.</p>':''}<button id="keep-current-trip" class="primary">Keep current trip</button><button id="confirm-journey-cancel" class="trip-cancel">Yes, cancel trip</button></div>
    ${showHeader?`<details id="trip-position" data-context="${esc(positionContext)}" ${disclosure('trip-position')}><summary>Update my current step</summary>${positionPicker}</details>`:`<section id="trip-position" class="current-step-picker" data-context="${esc(positionContext)}" aria-label="Update my current step" ${openDetails.has('trip-position')?'':'hidden'}>${positionPicker}</section>`}
    <details id="trip-location" ${disclosure('trip-location')}><summary>Location settings</summary><p>One foreground location session is used across the app. Indoor floors and boarding need your confirmation.</p><button id="locate-once">Enable location assistance</button><button id="clear-location">Stop location collection</button><p id="location-status"></p></details>`:`${showHeader?`<p class="trip-ended-message">${active.status==='completed'?'You confirmed arrival. Location collection and further sharing have stopped on this device.':'This trip was cancelled. Location collection and further sharing have stopped on this device. It was not added to completed journeys or Journey spending.'}</p>`:''}${active.status==='completed'?'<button id="retry-fare" class="primary">View or record journey spending</button>':''}${sharing.session?.travellerToken?'<p class="muted">Your caregiver may still see the last received update until this device reconnects. Their access to the shared trip is unchanged.</p>':''}`}

    ${active.proposal&&!ended?`<div class="c-note"><h4>Proposed route change</h4><p>${esc(active.proposal.reason)}. Arrival ${time(active.route.arrivalSeconds)} → ${time(active.proposal.route.arrivalSeconds)}; walking change ${Math.round((active.proposal.route.walkingSeconds-active.route.walkingSeconds)/60)} min.</p><button id="accept-proposal">Accept revised route</button><button id="decline-proposal">Keep current route</button></div>`:''}
    <details id="trip-details" ${disclosure('trip-details')}><summary>Trip details, fare &amp; offline access</summary><h4>Fare estimate</h4>${fareEstimateHTML(active,getFareOptions())}<h4>Saved instructions &amp; offline access</h4><div id="trip-offline"></div><h4>Your route</h4>${renderItineraryTimeline(active.route,{name,currentStepIndex:active.progress.stepIndex})}<details><summary>Route sources &amp; revision</summary><p>Route revision ${active.revision}. ${esc(active.route.provenance)}</p></details></details>`;
    if(!ended){
      const area=$('companion-active'),actions=document.createElement('div');actions.className='guidance-primary-actions';
      const labels={checkpoint:'Confirm my current step','station-checkpoint':'Confirm a station checkpoint','reached-toilet':'I have reached the toilet','resume-detour':'Resume from my toilet stop','station-help':'Ask staff for help','review-route':'Review changed directions',resume:'Resume trip',finish:'End trip'};
      const updateAction=!showHeader&&card.primaryAction==='checkpoint';
      const pickerAttributes=`aria-controls="trip-position" aria-expanded="${openDetails.has('trip-position')}"`;
      actions.innerHTML=`<button type="button" id="guidance-primary" data-action="${esc(card.primaryAction)}" class="primary" ${updateAction?pickerAttributes:''}>${esc(updateAction?'Update my current step':labels[card.primaryAction]??'Confirm my current step')}</button>${!showHeader&&!updateAction?`<button type="button" id="guidance-current-step" class="secondary" ${pickerAttributes}>Update my current step</button>`:''}`;
      area.querySelector('.trip-actions').before(actions);
      if(showHeader&&card.indoorNotice){const notice=document.createElement('div');notice.innerHTML=indoorNoticeHTML(card);actions.before(notice);notice.querySelector('[data-open-station-guide]').onclick=()=>openFacilities('layout');}
      const nextText=area.querySelector('.trip-guidance p:last-child');if(nextText)nextText.classList.add('guidance-next');
      if(!showHeader)actions.after($('trip-position'));
      const togglePosition=()=>{
        const picker=$('trip-position');
        if(showHeader)picker.open=true;
        else{picker.hidden=!picker.hidden;$(updateAction?'guidance-primary':'guidance-current-step')?.setAttribute('aria-expanded',String(!picker.hidden));if(picker.hidden)return;}
        $('checkpoint-step').scrollIntoView({block:'nearest',behavior:'instant'});$('checkpoint-step').focus({preventScroll:true});
      };
      $('guidance-primary').onclick=run(()=>{
        if(card.primaryAction==='resume'){$('journey-pause').click();return;}
        if(card.primaryAction==='finish'){$('journey-finish').click();return;}
        if(card.primaryAction==='reached-toilet'||card.primaryAction==='resume-detour'){commit(stopAction(active,card.primaryAction==='reached-toilet'?'reached':'resume'));scrollToCurrent();return;}
        if(['station-checkpoint','station-help'].includes(card.primaryAction)){openFacilities('layout');return;}
        if(card.primaryAction==='review-route'){const proposal=$('accept-proposal');if(proposal){proposal.scrollIntoView({block:'center',behavior:'instant'});proposal.focus();}else openFacilities('layout');return;}
        togglePosition();
      });
      $('guidance-current-step')?.addEventListener('click',togglePosition);$('recover-step')?.addEventListener('click',togglePosition);
    }
    const expanded=dock.querySelector('details')?.open;
    dock.innerHTML=`<details ${expanded?'open':''}><summary><span class="arrival">${ended?esc(active.status):'Est. '+time(card.arrivalSeconds)}</span><strong>${esc(card.current)}</strong><span class="next">Next: ${esc(card.next)}</span></summary><p>Step ${active.progress.stepIndex+1} of ${active.route.steps.length} · route revision ${card.revision}${active.routeRevisions.length?' · journey updated':''}</p>${card.warnings.map(w=>`<p class="freshness">${esc(w)}</p>`).join('')}<button data-layout>Station layout &amp; toilets</button><button data-details>Journey actions</button></details>`;
    dock.querySelector('[data-layout]').onclick=()=>openFacilities('layout');dock.querySelector('[data-details]').onclick=()=>$('companion-active').scrollIntoView();
    if(!ended){$('confirm-step').onclick=run(()=>{const choice=checkpointChoices(active.route,{name,currentStepIndex:active.progress.stepIndex}).find(c=>String(c.stepIndex)===$('checkpoint-step').value);if(!choice)throw Error('Choose a current step from this journey.');const stepIndex=choice.stepIndex,next=confirmCheckpoint(active,{stepIndex,kind:active.route.steps[stepIndex].type==='ride'?'onboard':'checkpoint',label:choice.label});if(!showHeader)$('trip-position').hidden=true;commit(next);scrollToCurrent();});
      $('journey-pause').onclick=run(()=>{commit(transition(active,active.status==='paused'?'resume':'pause'));});
      $('journey-cancel').onclick=()=>{$('cancel-trip-confirmation').hidden=false;$('journey-cancel').setAttribute('aria-expanded','true');$('keep-current-trip').focus();};
      $('keep-current-trip').onclick=()=>{$('cancel-trip-confirmation').hidden=true;$('journey-cancel').setAttribute('aria-expanded','false');$('journey-cancel').focus();};
      $('confirm-journey-cancel').onclick=run(async()=>{stopGeo();commit(transition(active,'cancel'));pendingPrivacy('stop-location');renderSharing();message('Trip cancelled. Location collection and further sharing have stopped on this device. Your saved routes are still available.');if(sharing.session?.pendingPrivacyAction)await syncPrivacy();if(sharing.session?.travellerToken&&!sharing.session.accessRevoked)await sharing.update(active);});
      $('journey-finish').onclick=run(async()=>{stopGeo();commit(transition(active,'finish'));const result=spending?.complete(active);pendingPrivacy('stop-location');renderSharing();message(result?.ok?'Trip completed. Open Journey spending to check or enter the charged fare.':'Trip completed, but spending could not be saved: '+result?.error);if(sharing.session?.pendingPrivacyAction)await syncPrivacy();if(sharing.session?.travellerToken&&!sharing.session.accessRevoked)await sharing.update(active);});
      $('locate-once').onclick=run(()=>locationAssistance.start());$('clear-location').onclick=run(stopLocation);
    }
    $('retry-fare')?.addEventListener('click',()=>{const r=spending?.complete(active);message(r?.ok?'Enter or check the charged fare in Journey spending.':r?.error);revealSection('spending');});
    $('accept-proposal')?.addEventListener('click',run(()=>commit(acceptRoute(active))));$('decline-proposal')?.addEventListener('click',()=>commit({...active,proposal:null}));renderLocationStatus();renderOffline(offline.getState());drawMap();
    if(positionFocus)$(positionFocus)?.focus({preventScroll:true});
  }
  function stopGeo({persist=false}={}){locationAssistance.stop(undefined,{persist});if(active)active={...active,permissions:{...active.permissions,geolocation:'stopped'}};}
  function currentSharePlan(){try{if(getSelected())return selectedJourney().plan;}catch{}return prepared??(active&&!['completed','cancelled'].includes(active.status)?{...active.plan,route:active.route,stops:active.stops}:null);}
  function renderPlanShare(){
    const owner=!!sharing.session?.editorToken,plan=shareView?.sharedPlan;
    $('companion-sharing').innerHTML=`<h3>Shared trip</h3>${plan?`<h4>${esc(plan.origin?.label??plan.origin?.id)} → ${esc(plan.destination?.label??plan.destination?.id)}</h4>`:''}<p>Recipients can view only this shared plan.</p><div class="plan-share-actions">${owner?'<button id="copy-plan-link" class="primary">Copy recipient link</button><button id="send-plan-link">Share recipient link</button><button id="qr-plan-link">Show QR</button><button id="update-plan-link">Update shared trip</button><button id="delete-plan-link">Delete shared link</button>':''}<button id="refresh-plan-link">Refresh trip</button></div><div id="plan-share-qr"></div>`;
    $('refresh-plan-link').onclick=run(refreshShare);
    if(!owner)return;
    const link=sharing.links().viewer;
    $('copy-plan-link').onclick=run(async()=>{await navigator.clipboard.writeText(link);message('Read-only recipient link copied.');});
    $('send-plan-link').onclick=run(async()=>{if(navigator.share)await navigator.share({title:'Shared trip',url:link});else await navigator.clipboard.writeText(link);});
    $('qr-plan-link').onclick=run(async()=>{const {default:qrcode}=await import('/vendor/qrcode.mjs');const qr=qrcode(0,'M');qr.addData(link);qr.make();$('plan-share-qr').innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true});});
    $('update-plan-link').onclick=run(async()=>{const plan=currentSharePlan();if(!plan)throw Error('Plan a trip first.');await sharing.read();await sharing.propose(plan);await refreshShare();message('The shared link now shows your current planned trip.');});
    $('delete-plan-link').onclick=run(async()=>{await sharing.delete();shareView=null;renderSharing();message('Shared link removed.');});
  }
  function renderSharing(){if(sharing.session?.purpose==='plan-view'){renderPlanShare();return;}const s=sharing.session,p=active?.permissions;const ended=!active||['completed','cancelled'].includes(active.status);$('companion-sharing').innerHTML=`<h3>Caregiver preparation &amp; sharing</h3>${!s&&(currentSharePlan())?'<button id="prepare-link" class="primary">Create recipient link</button>':''}<p>Share a read-only view of your current trip, including its addresses and route.</p>
    ${s?`<p>Role: ${esc(s.role)} · ${esc(shareView?.status??'awaiting refresh')} · server revision ${esc(s.revision)}.</p><button id="refresh-share">Refresh shared trip</button><button id="delete-share">Delete shared data</button>${s.editorToken?'<button id="propose-plan">Propose currently reviewed plan</button>':''}<div id="share-links"></div><div id="shared-view"></div>${s.role==='traveller'?`<div class="permissions"><p><strong>Separate permissions</strong> · ${s.accessRevoked?'ACCESS REMOVED ON SERVER':s.pendingPrivacyAction==='revoke'?'REVOCATION PENDING · collection stopped on this device':s.pendingPrivacyAction==='stop-location'?'LOCATION STOP PENDING ON SERVER · collection stopped on this device':p?.paused?'SHARING PAUSED':'sharing controlled below'}</p>${s.pendingPrivacyAction?'<button id="retry-privacy">Retry pending privacy change</button>':''}<label><input id="share-progress" type="checkbox" ${p?.progress?'checked':''} ${ended||p?.revoked?'disabled':''}> Share progress and accepted route changes</label><label><input id="share-location" type="checkbox" ${p?.location?'checked':''} ${ended||p?.revoked?'disabled':''}> Share geographic location (accuracy and timestamp)</label><button id="apply-sharing" ${ended||p?.revoked?'disabled':''}>Apply permissions</button><button id="pause-sharing" ${ended||p?.revoked?'disabled':''}>${p?.paused?'Resume':'Pause'} sharing</button><button id="revoke-sharing" ${s.accessRevoked?'disabled':''}>${s.pendingPrivacyAction==='revoke'?'Retry removing':'Remove'} caregiver access</button></div>`:''}<button id="enable-push">Enable journey notifications</button><button id="disable-push">Disable notifications</button>`:'<p>No shared trip on this device. Review the selected journey, then create a recipient link.</p>'}
    `;
    $('prepare-link')?.addEventListener('click',run(async()=>{if(sharing.session)throw Error('Manage the existing shared trip before creating another link. Pending privacy changes must finish first.');const plan=currentSharePlan();if(!plan)throw Error('Choose and confirm a planned journey first.');await sharing.create(plan,{purpose:"plan-view"});shareView=await sharing.read();renderSharing();message('Recipient link created. It shows only this shared trip, with no editing or journey controls.');}));
    if(!s)return;const links=sharing.links();$('share-links').innerHTML=Object.entries(links).filter(([,url])=>url).map(([key,url])=>`<p><button data-copy="${key}">Copy ${key==='invite'?'recipient':'caregiver view'} link</button><button data-share="${key}">Share ${key} link</button><button data-qr="${key}">Show ${key} QR</button></p>`).join('')+'<div class="qr" id="share-qr"></div>';
    sections.sharing.querySelectorAll('[data-copy]').forEach(b=>b.onclick=run(async()=>{await navigator.clipboard.writeText(links[b.dataset.copy]);message('Link copied. Keep recipient and caregiver links separate.');}));
    sections.sharing.querySelectorAll('[data-share]').forEach(b=>b.onclick=run(async()=>{if(navigator.share)await navigator.share({title:'Commute Copilot trip',url:links[b.dataset.share]});else{await navigator.clipboard.writeText(links[b.dataset.share]);message('System share unavailable; link copied.');}}));
    sections.sharing.querySelectorAll('[data-qr]').forEach(b=>b.onclick=run(async()=>{const {default:qrcode}=await import('/vendor/qrcode.mjs');const qr=qrcode(0,'M');qr.addData(links[b.dataset.qr]);qr.make();$('share-qr').innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true});}));
    $('refresh-share').onclick=run(refreshShare);$('delete-share').onclick=run(async()=>{await sharing.delete();stopGeo();if(active)commit({...active,permissions:{...active.permissions,revoked:true,progress:false,location:false},location:null},{upload:false});shareView=null;renderSharing();});
    $('propose-plan')?.addEventListener('click',run(async()=>{if(!prepared)throw Error('Review a proposed plan first.');await sharing.propose(prepared);await refreshShare();message('Proposed edit saved. Traveller must review and accept it.');}));
    $('apply-sharing')?.addEventListener('click',run(async()=>{const consent={progress:$('share-progress').checked,location:$('share-location').checked};if(sharing.session.pendingPrivacyAction)await syncPrivacy();await sharing.permissions(consent,false);commit(setPermissions(active,{...consent,paused:false},Date.now(),{preserveLocalLocation:locationState.collecting}));renderSharing();}));
    $('pause-sharing')?.addEventListener('click',run(async()=>{const paused=!active.permissions.paused;await sharing.permissions({progress:active.permissions.progress,location:active.permissions.location},paused);commit(setPermissions(active,{paused},Date.now(),{preserveLocalLocation:locationState.collecting}));renderSharing();}));
    $('revoke-sharing')?.addEventListener('click',run(revokeAccess));$('retry-privacy')?.addEventListener('click',run(syncPrivacy));
    $('enable-push').onclick=run(async()=>{await enablePush(s);message('Notification subscription registered. External delivery depends on server configuration and browser support.');});$('disable-push').onclick=run(async()=>{await disablePush(s);message('Notifications disabled.');});renderSharedView();
  }
  function renderSharedView(){if(!shareView||!$('shared-view'))return;const p=shareView.acceptedPlan??shareView.proposedPlan;const recipient=sharing.session.role==='recipient';$('shared-view').innerHTML=`${p?`<h4>${esc(publicStationLabel(p.origin?.label??p.origin?.id))} → ${esc(publicStationLabel(p.destination?.label??p.destination?.id))}</h4><p>${esc(p.departureDate)} ${esc(p.departureTime)} · ${p.mode==='replay'?'LABELLED REHEARSAL':'planned journey'}</p>${renderItineraryTimeline(p.route,{name})}`:'<p>Progress and route details are not currently authorised.</p>'}<p>Last checked ${shareView.viewedAt?esc(new Date(shareView.viewedAt).toISOString()):'unknown'} · ${esc(shareView.locationState??'location not shared')}. Foreground refresh only; this is the last received state.</p><p>Consent: progress ${shareView.consent?.progress?'on':'off'}; location ${shareView.consent?.location?'on':'off'}${shareView.sharingPaused?' · paused':''}.</p>${shareView.progress?`<p>Latest authorised update: ${esc(shareView.progress.status)} · checkpoint ${esc(publicInstruction(shareView.progress.checkpoint?.label??'not confirmed'))} · route revision ${esc(shareView.progress.routeRevision)} · estimated arrival ${typeof shareView.progress.eta==='number'?time(shareView.progress.eta):esc(shareView.progress.eta??'unavailable')} · updated ${esc(new Date(shareView.progress.updatedAt).toISOString())}</p>`:''}${shareView.location?`<p>Latest approximate location: ${esc(shareView.location.latitude)}, ${esc(shareView.location.longitude)} · ±${esc(shareView.location.accuracy)} m · ${esc(new Date(shareView.location.timestamp).toISOString())}. Last known; no underground floor inference.</p>`:''}${recipient&&(!active||['completed','cancelled'].includes(active.status))?'<button id="accept-invite" class="primary">Accept this trip · sharing stays off</button>':''}${sharing.session.role==='traveller'&&shareView.proposedPlan&&JSON.stringify(shareView.proposedPlan.route)!==JSON.stringify(active?.plan.route)?'<button id="review-edit">Review caregiver proposal</button>':''}`;
    $('accept-invite')?.addEventListener('click',run(async()=>{if(active&&!['completed','cancelled'].includes(active.status))throw Error('Finish or cancel the current journey before accepting this invitation.');if(!validatePlan(p))throw Error('Unsupported shared plan.');const next=startJourney(p);const paired=await sharing.accept();next.sharing={shareId:paired.id,planId:p.id};commit(next,{upload:false});await refreshShare();message('Trip accepted. Progress and geographic sharing are both off.');}));
    const recoveryPlan=shareView.acceptedPlan,s=sharing.session;
    if(s.role==='traveller'&&shareView.id===s.id&&validatePlan(recoveryPlan)&&!['completed','cancelled'].includes(shareView.status)&&!s.accessRevoked&&(!active||['completed','cancelled'].includes(active.status))&&active?.plan.id!==recoveryPlan.id){
      const button=document.createElement('button');button.id='start-accepted-trip';button.className='primary';button.textContent='Start accepted trip';$('shared-view').append(button);
      button.onclick=run(async()=>{if(sharing.session.id!==shareView.id||sharing.session.role!=='traveller'||shareView.acceptedPlan?.id!==recoveryPlan.id)throw Error('The paired trip changed; refresh and review it again.');if(active&&!['completed','cancelled'].includes(active.status))throw Error('Finish or cancel the current journey first.');const next=startJourney(recoveryPlan);await sharing.permissions({progress:false,location:false},false);next.sharing={shareId:sharing.session.id,planId:recoveryPlan.id};commit(next,{upload:false});renderSharing();message('Accepted trip started on this device. Progress and geographic sharing are both off.');});
    }
    $('review-edit')?.addEventListener('click',run(()=>{const p=shareView.proposedPlan;if(!validatePlan(p))throw Error('Invalid proposed plan.');if(p.destination.id!==active.plan.destination.id)throw Error('The proposed destination differs. Finish or cancel this trip before accepting a new destination.');commit(proposeRoute(active,p.route,'Caregiver proposal · review before accepting'),{upload:false});$('companion-active').scrollIntoView();}));
  }
  async function refreshShare(){try{shareView=await sharing.read();if(shareView)shareView.viewedAt=Date.now();renderSharing();}catch(e){if(e.status===404||e.status===403){shareView=null;renderSharing();}throw e;}}
  function fixtureStart(layout){preparedContext=null;if(active&&!['completed','cancelled'].includes(active.status))throw Error('Finish or cancel the current journey before starting the rehearsal.');const id=layout?.layoutId??layout?.id??'fixture-interchange';const fixturePath=findFacilityPath(FIXTURE_LAYOUT,{from:FIXTURE_LAYOUT.defaultFrom,to:FIXTURE_LAYOUT.defaultTo,profile:{stepFree:true},statuses:fixtureStatuses('none'),allowFixtures:true});const fixtureSteps=pathInstructions(FIXTURE_LAYOUT,fixturePath).map((text,i)=>({id:'fixture-step-'+i,text,durationSeconds:fixturePath.edges[i].seconds,facilityId:fixturePath.edges[i].facilityId}));const now=new Date(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(now);prepared=makePlan({origin:{id:'fixture-origin',label:'Rehearsal entrance',stationId:id},destination:{id:'fixture-destination',label:'Rehearsal destination entrance',stationId:id},date,departureTime:'10:00',mode:'replay',preferences:{stepFree:true,walkingLimitMinutes:60},route:{id:'fixture-corridor',departureSeconds:36000,arrivalSeconds:36000+fixturePath.seconds,walkingSeconds:fixturePath.walkingSeconds,facilityPathSeconds:fixturePath.seconds,facilityPathWalkingSeconds:fixturePath.walkingSeconds,accessibility:'fixture',provenance:'Synthetic connected graph for workflow testing; not a real floor plan',steps:fixtureSteps}});renderPreview();window.dispatchEvent(new CustomEvent('copilot:prepared',{detail:{plan:prepared}}));message('Rehearsal prepared. Review and start it, or create a recipient link for a second browser.');}
  facilities=mountFacilities({host:$('companion-facilities'),getJourney:()=>(active&&!['completed','cancelled'].includes(active.status)?active:null)??(prepared?{plan:prepared,route:prepared.route,progress:{kind:'unknown',checkpoint:null},stops:prepared.stops}:null),onStartFixture:fixtureStart,onAcceptDetour:preview=>{try{if(active&&!['completed','cancelled'].includes(active.status)){commit(acceptDetour(active,preview));message('Toilet detour accepted. The original destination is retained.');}else if(prepared){prepared.stops=[{type:'toilet',facilityId:preview.toiletId,preview}];renderPreview();message('Planned toilet stop saved. Recheck conditions and accept its path when starting.');}else throw Error('Review a trip first.');}catch(e){message(e.message);}},onCheckpoint:checkpoint=>{try{if(active&&!['completed','cancelled'].includes(active.status)){commit(confirmCheckpoint(active,{...checkpoint,nodeId:checkpoint.nodeId??checkpoint.id}));scrollToCurrent();}}catch(e){message(e.message);}},onStopAction:action=>{try{commit(stopAction(active,action));}catch(e){message(e.message);}},onFacilityChange:change=>{if(active){const blocked=change.detourAssessment?!change.detourAssessment.feasible:active.detour?.blocked;let next={...active,revision:active.revision+1,facilityScenario:change.scenario,facilityBlocked:change.comparison?.revised?.feasible===false,detour:active.detour?{...active.detour,blocked}:null};const path=change.comparison?.revised;if(change.fixture&&active.route.facilityPathSeconds!=null&&path?.feasible&&change.comparison.changed&&!active.detour){const route={...active.route,steps:pathInstructions(FIXTURE_LAYOUT,path).map((text,i)=>({id:'revised-facility-'+i,text,durationSeconds:path.edges[i].seconds,facilityId:path.edges[i].facilityId})),arrivalSeconds:active.route.arrivalSeconds-active.route.facilityPathSeconds+path.seconds,walkingSeconds:active.route.walkingSeconds-active.route.facilityPathWalkingSeconds+path.walkingSeconds,facilityPathSeconds:path.seconds,facilityPathWalkingSeconds:path.walkingSeconds};next=proposeRoute(next,route,'Labelled facility incident · alternative uses '+path.facilityIds.join(', '));next.facilityReview=true;}commit(next);if(blocked)message('The accepted toilet path is no longer usable. Cancel it and review a replacement; the original destination is retained.');}},onMarkers:markers=>drawMap(markers)});
  personal=mountPersonal({host:$('companion-places'),showJourneys:showHeader,storage:deviceStorage,getPlan:()=>prepared??active?.plan,places:getPlaces(),onSelectPlan:plan=>{clearPrepared();onSelectPlan(plan);message('Saved endpoints selected with a current date/time. Recalculate and review the route and facilities before starting.');},onEndpoint});
  spending=mountExpenditure({host:$('companion-fares'),storage:deviceStorage,getJourney:()=>active,getFareOptions});
  async function initMap(){const supplied=getMap();if(supplied&&!showHeader){map=supplied;externalMap=true;$('companion-map').hidden=true;$('companion-map-note').hidden=true;sections.map.hidden=true;mapLayers=L.layerGroup().addTo(map);drawMap();return;}if(!showHeader){sections.map.hidden=true;return;}if(!window.L){await new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href='/vendor/leaflet.css';document.head.append(css);const script=document.createElement('script');script.src='/vendor/leaflet.js';script.onload=resolve;script.onerror=reject;document.head.append(script);});}map=L.map($('companion-map'),{scrollWheelZoom:false}).setView([1.315,103.87],12);addStreetMap(map,{onStatus:state=>{$('companion-map-note').textContent=state.status==='ready'?'Street map overview. Indoor diagrams have a separate coverage label.':state.message;}});mapLayers=L.layerGroup().addTo(map);drawMap();}
  function drawMap(markers){
    if(markers)toiletMarkers=markers;
    if(!mapLayers)return;
    mapLayers.clearLayers();
    // The main map owns route and position layers. Facility pins belong only
    // to the standalone companion map; their details remain in Station guidance.
    if(externalMap)return;
    const points=[];
    const add=(lat,lng,label,onSelect)=>{
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      points.push([lat,lng]);
      const marker=L.marker([lat,lng],{title:label,alt:label,icon:L.divIcon({className:'companion-marker',html:'<span aria-hidden="true">●</span>',iconSize:[28,28],iconAnchor:[14,14]})}).bindPopup(document.createTextNode(label)).addTo(mapLayers);
      if(onSelect)marker.on('click',onSelect);
    };
    for(const point of [active?.plan.origin,active?.plan.destination])if(point)add(point.lat,point.lng,point.label??point.id);
    for(const point of toiletMarkers??[])add(point.lat??point.position?.lat??point.coordinates?.[1],point.lng??point.position?.lng??point.lon??point.coordinates?.[0],point.label??point.name??point.id,point.onSelect);
    const devicePoint=drawLocationMarker(mapLayers,locationState);if(devicePoint)points.push(devicePoint);
    if(points.length)map.fitBounds(points,{padding:[25,25],maxZoom:17,animate:!reducedGuidanceMotion((getPresentation?.()??readPresentationPreferences(deviceStorage)),{systemReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches})});
  }
  initMap().catch(()=>{$('companion-map-note').textContent='Map unavailable. Text journey and facility instructions remain usable.';});
  window.addEventListener('hashchange',()=>{if(sharing.useFragment())refreshShare().then(()=>revealSection('sharing')).catch(e=>message('Shared trip unavailable: '+e.message));});
  window.addEventListener('offline',()=>{renderActive();offline.verify();message('Offline. Location assistance can still receive a browser fix. Sharing and live reports cannot update; check offline availability below.');});window.addEventListener('online',()=>{renderActive();offline.verify();if(sharing.session)refreshShare().then(()=>syncPrivacy()).then(()=>active&&sharing.update(active)).catch(e=>message('Reconnect sharing: '+e.message));});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){active={...active,permissions:{...active.permissions,geolocation:'stopped'}};if(storageEnabled)saveActive(deviceStorage,active);}renderActive();if(!document.hidden)offline.verify();});

  window.addEventListener('storage',event=>{if(event.key===JOURNEY_KEY||event.key===null)offline.storageChanged();});
  window.visualViewport?.addEventListener('resize',()=>dock.classList.toggle('keyboard-open',visualViewport.height<window.innerHeight*.7));
  window.addEventListener('copilot:legacy-accepted',e=>{try{if((!active||['completed','cancelled'].includes(active.status))&&e.detail?.action!=='accept')return;prepared=routeFromLegacy(e.detail.route,e.detail.input,{name,mode:e.detail.input.fixture?'replay':mode});let next;if(active&&!['completed','cancelled'].includes(active.status)){if(active.plan.destination.id!==prepared.destination.id)throw Error('Finish or cancel the active trip before replacing its destination.');next=active.route.id===prepared.route.id?{...active}:acceptRoute(proposeRoute(active,prepared.route,'Accepted from route comparison'));}else next=startJourney(prepared);const p=e.detail.state?.progress;next.routingContext=e.detail.state;if(p)next=confirmCheckpoint(next,{stepIndex:Math.min(p.legIndex,next.route.steps.length-1),kind:p.kind,label:'Manually confirmed '+p.kind});commit(next);renderPreview();}catch(err){message(err.message);}});
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='push-subscription-expired')message('Notification subscription expired. Enable notifications again to register a new subscription.');if(event.data?.type==='journey-notification')refreshShare().catch(e=>message(e.message));});
  let lastPosition=null;
  locationAssistance.subscribe(state=>{
    locationState=state;
    if(active?.status==='started'&&state.position&&state.position!==lastPosition){lastPosition=state.position;commit(setApproximateLocation(active,state.position),{locationOnly:true});}
    else{
      const stoppedSharing=state.status==='stopped'&&active?.permissions.location;
      if(active&&(active.location||stoppedSharing)){
        lastPosition=null;
        commit({...active,revision:active.revision+1,updatedAt:Date.now(),location:null,permissions:{...active.permissions,geolocation:['denied','unavailable'].includes(state.status)?state.status:'stopped',...(stoppedSharing?{location:false}:{})}},{upload:false,locationOnly:true});
        if(stoppedSharing){pendingPrivacy('stop-location');renderSharing();if(sharing.session?.pendingPrivacyAction)syncPrivacy().catch(error=>message(error.message));}
      }else{renderLocationStatus();drawMap();}
    }
  });
  if(showHeader){const settings=document.createElement('section');settings.className='companion-panel';host.prepend(settings);mountLocationSettings(settings,{service:locationAssistance,onStop:run(stopLocation)});}
  renderPreview();renderActive();renderSharing();offline.setTrip(active);offline.verify();if(incoming||sharing.session)refreshShare().then(()=>{if(incoming)revealSection('sharing');if(navigator.onLine)return syncPrivacy().then(()=>['completed','cancelled'].includes(active?.status)&&sharing.session?.travellerToken&&!sharing.session.accessRevoked?sharing.update(active):null);}).catch(e=>message('Shared trip unavailable: '+e.message));
  // Foreground refresh only; this is not background location or push delivery.
  setInterval(()=>{if(!document.hidden){renderLocationStatus();offline.storageChanged();if(navigator.onLine&&sharing.session?.role==='caregiver')refreshShare().catch(()=>{});}},15000);
  return {stopLocation,refreshSharing:renderSharing,getLocationEstimate:locationEstimate,sections,clearPrepared,openFacilities,inspectSelected,startSelected,getActive:()=>active,getPrepared:()=>prepared,getCard:()=>journeyCard(active,{online:navigator.onLine,visible:!document.hidden,name}),update:commit,setPrepared:(plan,{routingContext=null}={})=>{prepared=structuredClone(plan);preparedContext=routingContext?structuredClone(routingContext):null;renderPreview();window.dispatchEvent(new CustomEvent('copilot:prepared',{detail:{plan:prepared}}));},refresh:()=>{personal?.refresh();renderActive();map?.invalidateSize();offline.storageChanged();},review:()=>{prepared=selectedPlan();renderPreview();return prepared;}};
}
