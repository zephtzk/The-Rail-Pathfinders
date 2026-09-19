import {NEARBY_FACILITIES,FACILITIES_COVERAGE} from './nearby-facilities-data.js';
import {NEARBY_RADIUS_METERS,nearbyFacilities,nearbyFacilityStatus,formatFacilityDistance} from './nearby-facilities-model.js';
import {suggestEndpoints} from './planner-model.js';
import {addStreetMap} from './network-map.js';
import {icon} from './icons.js';
import {getAppLocation,usableLocation} from './location-assistance.js';
import {compactLocationStatus} from './location-ui.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(value))+' SGT':'Not supplied';
const sourceLink=source=>/^https:\/\//.test(source?.url??'')?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name??'Source')}</a>`:esc(source?.name??'Source unavailable');

/** Nearby discovery is separate from journey guidance: it never changes an accepted trip. */
export function mountNearbyFacilities(host,{getPlaces=()=>[],fetcher=globalThis.fetch,locationService=getAppLocation(),now=Date.now}={}){
  if(!document.querySelector('link[data-nearby-facilities-css]')){
    const style=document.createElement('link');style.rel='stylesheet';style.href='/src/nearby-facilities.css';style.dataset.nearbyFacilitiesCss='true';document.head.append(style);
  }
  let active=false,center=null,kind='all',mode='list',snapshot=null,loading=false,checked=false,attemptedAt=null,request=null,requestEpoch=0,map=null,markers=null,tiles=null,mapFailed=false,selectedId=null,results=[],suggestions=[],suggestionIndex=-1,freshness='',manualOverride=false,locationState=locationService.getState();
  const online=()=>navigator.onLine!==false;
  const $=id=>host.querySelector(`#nearby-${id}`);
  host.classList.add('nearby-facilities');
  host.innerHTML=`<div class="nf-intro"><span class="nf-radius">${icon('location',18)} Within 1 km</span><p>Find listed lifts and toilets, nearest first. Distances are straight-line estimates; a pin does not establish an accessible walking route.</p></div>
    <div class="nf-actions"><button type="button" class="secondary" id="nearby-refresh">Refresh status</button></div>
    <p id="nearby-location-message" class="nf-note" role="status"></p>
    <details id="nearby-manual" class="nf-manual"><summary>Choose an area manually</summary><label for="nearby-query">Station, bus-stop name or code</label><input id="nearby-query" autocomplete="off" placeholder="For example, Bugis or 01112" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="nearby-suggestions"><div id="nearby-suggestions" class="nf-suggestions" role="listbox" aria-label="Search areas" hidden></div><p id="nearby-search-note" class="nf-note">Select a suggestion to search within 1 km of that place.</p><button id="nearby-device-area" type="button" class="quiet" hidden>Use device area</button></details>
    <div id="nearby-center" class="nf-center" hidden></div>
    <div class="nf-toolbar"><div class="segmented" role="group" aria-label="Facility type"><button type="button" data-nf-kind="all" aria-pressed="true">All</button><button type="button" data-nf-kind="lift" aria-pressed="false">Lifts</button><button type="button" data-nf-kind="toilet" aria-pressed="false">Toilets</button></div><div class="segmented" role="group" aria-label="Facility view"><button type="button" data-nf-mode="list" aria-pressed="true">List</button><button type="button" data-nf-mode="map" aria-pressed="false">Map</button></div></div>
    <p id="nearby-feed" class="nf-feed" role="status"></p><p id="nearby-count" class="nf-count" role="status"></p>
    <div id="nearby-map-panel" hidden><div id="nearby-map" class="nf-map" aria-label="Nearby facilities map"></div><p class="nf-map-legend">Blue T: toilet · purple L: lift · circle: 1 km search area</p><p id="nearby-map-note" class="nf-note" role="status"></p><button id="nearby-map-retry" type="button" class="quiet" hidden>Retry street map</button><div id="nearby-selected"></div></div>
    <div id="nearby-results"></div>
    <details class="nf-coverage"><summary>Sources &amp; coverage</summary><p>${esc(FACILITIES_COVERAGE.description)}</p><p>Location directory checked ${esc(FACILITIES_COVERAGE.checkedAt)}. Refresh status checks the available maintenance service; it does not update the packaged location directory.</p>${(FACILITIES_COVERAGE.sources??[]).map(source=>`<p>${sourceLink(source)}${source.sourceTime?` · source dated ${esc(source.sourceTime)}`:''}</p>`).join('')}${(FACILITIES_COVERAGE.limitations??[]).map(note=>`<p>${esc(note)}</p>`).join('')}<p>The LTA service covers reported station lift maintenance only. It has no toilet status and does not confirm operation when a report is absent. This public prototype may have no live maintenance connection. Check signs or staff before relying on a facility.</p></details>`;

  function closeSuggestions(){suggestionIndex=-1;$('suggestions').hidden=true;$('query').setAttribute('aria-expanded','false');$('query').removeAttribute('aria-activedescendant');}
  function setCenter(point){center=point;selectedId=null;closeSuggestions();render();if(mode==='map')drawMap(true);}
  function choose(point){
    manualOverride=true;$('query').value=point.label;$('manual').open=false;
    setCenter({lat:point.lat,lng:point.lng,label:point.label,method:'manual',at:now()});
    $('center').tabIndex=-1;$('center').focus({preventScroll:true});$('center').scrollIntoView({block:'nearest'});
  }
  function search(){
    const query=$('query').value.trim();suggestionIndex=-1;
    suggestions=query?suggestEndpoints(getPlaces().filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)),query,8):[];
    $('suggestions').innerHTML=suggestions.map((point,index)=>`<button type="button" role="option" aria-selected="false" id="nearby-option-${index}" data-nf-place="${index}"><strong>${esc(point.label)}</strong><small>${esc(point.kind==='bus'?`Bus stop ${(point.codes??[]).join(' / ')}`:point.detail)}</small></button>`).join('');
    $('suggestions').hidden=!suggestions.length;$('query').setAttribute('aria-expanded',String(!!suggestions.length));$('query').removeAttribute('aria-activedescendant');
    $('search-note').textContent=query&&!suggestions.length?(getPlaces().length?'No matching station or bus stop. Try another name or code.':'Place search is still loading. Try again after routes load.'):'Select a suggestion to search within 1 km of that place.';
  }
  $('query').addEventListener('input',search);
  $('query').addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp'].includes(event.key)&&suggestions.length){event.preventDefault();suggestionIndex=suggestionIndex<0?(event.key==='ArrowDown'?0:suggestions.length-1):(suggestionIndex+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;$('suggestions').hidden=false;$('query').setAttribute('aria-expanded','true');$('query').setAttribute('aria-activedescendant',`nearby-option-${suggestionIndex}`);$('suggestions').querySelectorAll('[role=option]').forEach((option,index)=>{option.setAttribute('aria-selected',String(index===suggestionIndex));if(index===suggestionIndex)option.scrollIntoView({block:'nearest'});});}
    if(event.key==='Enter'){event.preventDefault();if(suggestionIndex>=0&&suggestions[suggestionIndex])choose(suggestions[suggestionIndex]);}
    if(event.key==='Escape')closeSuggestions();
  });
  $('suggestions').addEventListener('click',event=>{const button=event.target.closest('[data-nf-place]');if(button)choose(suggestions[Number(button.dataset.nfPlace)]);});

  function usableDevice(){return locationState.usable&&usableLocation(locationState.position,now());}
  function deviceCenter(){const point=locationState.position;return {lat:point.latitude,lng:point.longitude,accuracy:point.accuracy,label:'Your approximate device area',method:'device',at:point.timestamp};}
  function syncLocation(state){
    locationState=state;
    const previousCenter=center;
    if(!manualOverride&&usableDevice())center=deviceCenter();
    // An automatic update never closes an open search, resets a filter, or changes
    // the chosen facility. A manual area remains selected until explicitly reset.
    if(active){render();if(!previousCenter&&center&&mode==='map')drawMap(true);}
  }
  $('device-area').onclick=()=>{if(!usableDevice())return;manualOverride=false;$('manual').open=false;setCenter(deviceCenter());$('center').tabIndex=-1;$('center').focus({preventScroll:true});};

  function feedText(){
    if(loading)return 'Checking available lift-maintenance reports…';
    if(!online())return `Offline. Showing packaged locations${snapshot?.fetchedAt?' and last retrieved lift reports, now stale':''}. Current availability cannot be checked.`;
    if(!checked||!snapshot)return 'Availability has not been checked. Location listings do not establish that facilities are open.';
    if(snapshot?.error==='not_configured')return 'Live lift maintenance is not connected. Toilet availability is unknown. Location listings remain usable.';
    if(snapshot?.status==='unavailable')return `Maintenance service unavailable.${snapshot?.fetchedAt?' Last reports are stale.':''} Attempted ${time(attemptedAt)}. Try Refresh status.`;
    const date=Date.parse(snapshot?.fetchedAt),stale=snapshot?.stale||!Number.isFinite(date)||date>now()||now()-date>15*60000;
    return `${stale?'Stale lift-maintenance reports':snapshot?.status==='partial'?'Partial lift-maintenance reports':'Lift-maintenance reports retrieved'}: ${time(snapshot?.fetchedAt)}. No report does not mean a lift is operating. Toilets have no live status feed.`;
  }
  async function refresh(){
    if(loading)return;
    checked=true;attemptedAt=new Date(now()).toISOString();
    if(!online()){if(snapshot)snapshot={...snapshot,stale:true};render();return;}
    const epoch=++requestEpoch,controller=new AbortController();request=controller;loading=true;render();const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetcher('/api/facilities',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('unavailable');
      const payload=await response.json();
      if(!payload||payload.schemaVersion!==1||!['available','partial','unavailable'].includes(payload.status)||!Array.isArray(payload.records))throw Error('malformed');
      if(epoch!==requestEpoch)return;
      snapshot=payload.status==='unavailable'&&snapshot?.fetchedAt&&!payload.fetchedAt?{...snapshot,status:'unavailable',stale:true,error:payload.error}:payload;
    }catch{if(epoch===requestEpoch)snapshot={...(snapshot??{}),status:'unavailable',stale:true,error:'network'};}
    finally{clearTimeout(timer);if(epoch===requestEpoch){loading=false;request=null;render();}}
  }
  $('refresh').onclick=refresh;

  function card(facility,{onMap=false}={}){
    const status=nearbyFacilityStatus(facility,snapshot,{now:now(),offline:!online()}),source=facility.source,coordinates=facility.coordinateSource;
    return `<article class="nf-card" data-facility-id="${esc(facility.id)}">
      <div class="nf-card-heading"><span class="nf-type nf-${esc(facility.kind)}">${facility.kind==='toilet'?icon('toilet',22):'↕'}</span><div><p class="nf-kind">${facility.kind==='lift'?'Lift':'Toilet'} · ${esc(formatFacilityDistance(facility.distanceMeters))}${facility.coordinateAccuracy==='site'?' · approximate pin':''}</p><h2>${esc(facility.name)}</h2></div></div>
      <p class="nf-location">${esc(facility.locationNote??'Entrance details are not verified.')}</p><span class="nf-status nf-status-${esc(status.tone)}">${esc(status.label)}</span><p class="nf-note">${esc(status.detail)}</p>
      <div class="nf-card-actions"><button type="button" class="quiet" data-nf-${onMap?'list':'map'}="${esc(facility.id)}">${onMap?'Show in list':'Show on map'} ${icon(onMap?'arrow-left':'pin',16)}</button>
        <details><summary>Source &amp; details</summary><p>Facility listing: ${sourceLink(source)}</p><p>Listing source date: ${esc(source?.sourceTime??'Not supplied')}. Directory checked: ${esc(source?.checkedAt??FACILITIES_COVERAGE.checkedAt)}.</p>
          ${coordinates?`<p>Pin coordinates: ${sourceLink(coordinates)}. Coordinate source date: ${esc(coordinates.sourceTime??'Not supplied')}.</p>`:''}
          ${status.fetchedAt?`<p>Status retrieved: ${esc(time(status.fetchedAt))}. Source report time: ${esc(time(status.sourceTime))}.</p>`:''}
          ${status.sourceUrl?`<p>${sourceLink({name:'Status source',url:status.sourceUrl})}</p>`:''}<p>${esc(facility.accessNote??'Opening hours, fees, accessible provision and entrance paths are not verified. Check with the venue.')}</p>
        </details></div></article>`;
  }
  function render(){
    const focused=document.activeElement,focusedCard=focused?.closest('.nf-card'),focusContext=focusedCard&&host.contains(focusedCard)?{id:focusedCard.dataset.facilityId,inMap:$('selected').contains(focusedCard),index:[...focusedCard.querySelectorAll('button,summary,a')].indexOf(focused)}:null;
    const openSources=new Set([...host.querySelectorAll('.nf-card details[open]')].map(detail=>detail.closest('[data-facility-id]').dataset.facilityId));
    results=center?nearbyFacilities(NEARBY_FACILITIES,center,{kind}):[];
    $('refresh').disabled=loading;$('refresh').textContent=loading?'Checking…':'Refresh status';
    $('device-area').hidden=!manualOverride||!usableDevice();
    $('location-message').hidden=!manualOverride&&usableDevice();
    $('location-message').textContent=manualOverride?'Manual search area selected. Your device location does not change this area.':`${compactLocationStatus(locationState)}. Choose an area below.`;
    $('feed').textContent=feedText();$('feed').dataset.offline=String(!online());
    $('center').hidden=!center;
    if(center){const old=center.method==='device'&&!usableDevice();$('center').innerHTML=`<strong>${esc(old?'Last device search area':center.label)}</strong><span>1 km radius · nearest first${center.method==='device'?` · accuracy about ${Math.round(center.accuracy)} m · measured ${esc(time(new Date(center.at).toISOString()))}`:' · manual search area'}</span>${old?'<p class="nf-stale">This search area is no longer a usable current location estimate. Choose an area manually while location assistance recovers.</p>':''}`;}
    $('count').textContent=center?`${results.length} listed ${kind==='all'?'facilities':kind==='lift'?'lifts':'toilets'} within 1 km. Site pins and distances may be approximate.`:locationState.collecting?'Waiting for a usable device location. You can also choose a manual area.':'Choose a station or bus stop above to browse nearby facilities.';
    const empty=center?`<div class="nf-empty"><h2>No listed ${kind==='all'?'facilities':kind==='lift'?'lifts':'toilets'} within 1 km</h2><p>This directory has partial coverage. This does not mean there are no facilities nearby.</p><button type="button" class="secondary" data-nf-change-area>Choose another area</button></div>`:'<div class="nf-empty"><h2>A useful stop, close by</h2><p>Choose a station or bus stop above to browse while device location is unavailable. Your journey stays in place.</p></div>';
    $('results').innerHTML=results.length?results.map(facility=>card(facility)).join(''):empty;
    $('results').hidden=mode!=='list';$('map-panel').hidden=mode!=='map';
    $('results').setAttribute('aria-busy',String(loading));
    host.querySelectorAll('[data-nf-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.nfKind===kind)));
    host.querySelectorAll('[data-nf-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.nfMode===mode)));
    renderSelected();host.querySelectorAll('.nf-card details').forEach(detail=>{detail.open=openSources.has(detail.closest('[data-facility-id]').dataset.facilityId);});if(mode==='map'&&active)drawMap();freshness=freshnessKey();
    if(focusContext){const restored=[...(focusContext.inMap?$('selected'):$('results')).querySelectorAll('.nf-card')].find(card=>card.dataset.facilityId===focusContext.id),target=focusContext.index<0?restored:restored?.querySelectorAll('button,summary,a')[focusContext.index];if(target){if(focusContext.index<0)target.tabIndex=-1;target.focus({preventScroll:true});}else{$('center').tabIndex=-1;$('center').focus({preventScroll:true});}}
  }
  function renderSelected(){const selected=results.find(f=>f.id===selectedId);$('selected').innerHTML=selected?card(selected,{onMap:true}):`<p class="nf-note">${center?(results.length?'Select a T or L marker to read its details.':'No listed facilities in this search area. Try another area or facility type.'):'Choose an area above to display its 1 km search circle.'}</p>`;}
  function drawMap(fit=false){
    if(!active||mode!=='map')return;
    if(!globalThis.L){$('map-note').textContent='Map unavailable. All facility information is available in List.';return;}
    if(!map){
      map=L.map($('map'),{scrollWheelZoom:false}).setView([1.335,103.86],12);
      tiles=addStreetMap(map,{onStatus:state=>{mapFailed=['offline','unavailable'].includes(state.status);$('map-note').textContent=state.status==='ready'?'Street map with approximate facility pins. No walking route is shown.':state.status==='loading'?'Loading street map…':'Street map unavailable. Pins show relative locations; use List for details.';$('map-retry').hidden=!mapFailed;}});
      markers=L.layerGroup().addTo(map);fit=true;
    }
    const focusedMarker=document.activeElement?.closest('#nearby-map .nf-map-pin')?.dataset.facilityId;
    map.invalidateSize();markers.clearLayers();
    if(!center)return;
    const circle=L.circle([center.lat,center.lng],{radius:NEARBY_RADIUS_METERS,color:'#174f9e',weight:2,fillOpacity:.045,interactive:false}).addTo(markers);
    const currentDevice=center.method==='device'&&usableDevice();
    if(currentDevice)L.circle([center.lat,center.lng],{radius:center.accuracy,color:'#174f9e',weight:1,fillOpacity:.12,interactive:false}).addTo(markers);
    L.circleMarker([center.lat,center.lng],{radius:7,color:'#fff',weight:3,fillColor:center.method==='device'&&!currentDevice?'#697586':'#174f9e',fillOpacity:1}).bindTooltip(document.createTextNode(center.method==='device'&&!currentDevice?'Last device search area':center.label)).addTo(markers);
    for(const facility of results){
      const marker=L.marker([facility.position.lat,facility.position.lng],{title:`${facility.name} · ${formatFacilityDistance(facility.distanceMeters)}`,icon:L.divIcon({className:`nf-map-pin nf-pin-${facility.kind}${facility.id===selectedId?' nf-pin-selected':''}`,html:`<span>${facility.kind==='toilet'?'T':'L'}</span>`,iconSize:[32,36],iconAnchor:[16,34]})}).addTo(markers);
      const element=marker.getElement(),selectMarker=()=>{selectedId=facility.id;renderSelected();drawMap();const card=$('selected').querySelector('article');card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'nearest',behavior:'instant'});};
      element?.setAttribute('aria-label',`${facility.kind==='lift'?'Lift':'Toilet'}: ${facility.name}, ${formatFacilityDistance(facility.distanceMeters)}`);
      if(element)element.dataset.facilityId=facility.id;
      element?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();selectMarker();}});
      marker.on('click',selectMarker);
    }
    if(fit)map.fitBounds(circle.getBounds(),{padding:[20,20],animate:false});
    if(focusedMarker)[...$('map').querySelectorAll('.nf-map-pin')].find(marker=>marker.dataset.facilityId===focusedMarker)?.focus({preventScroll:true});
  }
  function setMode(next,id){mode=next;if(id)selectedId=id;render();if(next==='map'){drawMap(true);$('map').tabIndex=0;$('map').focus({preventScroll:true});$('map-panel').scrollIntoView({block:'start',behavior:'instant'});}else if(id){const element=[...$('results').querySelectorAll('[data-facility-id]')].find(el=>el.dataset.facilityId===id);if(element){element.tabIndex=-1;element.focus({preventScroll:true});element.scrollIntoView({block:'start',behavior:'instant'});}}}
  host.addEventListener('click',event=>{
    const type=event.target.closest('[data-nf-kind]'),toggle=event.target.closest('[data-nf-mode]'),showMap=event.target.closest('[data-nf-map]'),showList=event.target.closest('[data-nf-list]');
    if(type){kind=type.dataset.nfKind;selectedId=null;render();}
    if(toggle)setMode(toggle.dataset.nfMode);
    if(showMap)setMode('map',showMap.dataset.nfMap);
    if(showList)setMode('list',showList.dataset.nfList);
    if(event.target.closest('[data-nf-change-area]')){$('manual').open=true;$('query').focus();}
  });
  $('map-retry').onclick=()=>tiles?.retry();
  function connection(){if(snapshot&&!online())snapshot={...snapshot,stale:true};if(active)render();}
  // Re-evaluate expiry without rebuilding a focused card on every timer tick.
  function freshnessKey(){return JSON.stringify([feedText(),usableDevice(),results.map(facility=>nearbyFacilityStatus(facility,snapshot,{now:now(),offline:!online()}).label)]);}
  const timer=setInterval(()=>{if(active&&!document.hidden&&freshness!==freshnessKey())render();},30000);
  window.addEventListener('online',connection);window.addEventListener('offline',connection);
  const unsubscribe=locationService.subscribe(syncLocation);
  render();
  return {setActive(value){active=value;if(value){locationState=locationService.getState();if(!manualOverride&&usableDevice())center=deviceCenter();render();if(!checked||!snapshot)refresh();}else{requestEpoch++;request?.abort();request=null;loading=false;}},destroy(){clearInterval(timer);unsubscribe();requestEpoch++;request?.abort();window.removeEventListener('online',connection);window.removeEventListener('offline',connection);tiles?.remove();map?.remove();}};
}
