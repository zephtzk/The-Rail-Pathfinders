import {NEARBY_FACILITIES,FACILITIES_COVERAGE} from './nearby-facilities-data.js';
import {NEARBY_RADIUS_METERS,nearbyFacilities,nearbyFacilityStatus,formatFacilityDistance} from './nearby-facilities-model.js';
import {suggestEndpoints} from './planner-model.js';
import {addStreetMap} from './network-map.js';
import {icon} from './icons.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(value))+' SGT':'Not supplied';
const sourceLink=source=>/^https:\/\//.test(source?.url??'')?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name??'Source')}</a>`:esc(source?.name??'Source unavailable');

/** Nearby discovery is separate from journey guidance: it never changes an accepted trip. */
export function mountNearbyFacilities(host,{getPlaces=()=>[],fetcher=globalThis.fetch,geolocation=globalThis.navigator?.geolocation,now=Date.now}={}){
  if(!document.querySelector('link[data-nearby-facilities-css]')){
    const style=document.createElement('link');style.rel='stylesheet';style.href='/src/nearby-facilities.css';style.dataset.nearbyFacilitiesCss='true';document.head.append(style);
  }
  let active=false,center=null,kind='all',mode='list',snapshot=null,loading=false,checked=false,attemptedAt=null,request=null,requestEpoch=0,locationEpoch=0,locationTimer=null,locating=false,map=null,markers=null,tiles=null,mapFailed=false,selectedId=null,results=[],suggestions=[],suggestionIndex=-1,freshness='';
  const online=()=>navigator.onLine!==false;
  const $=id=>host.querySelector(`#nearby-${id}`);
  host.classList.add('nearby-facilities');
  host.innerHTML=`<div class="nf-intro"><span class="nf-radius">${icon('location',18)} Within 1 km</span><p>Find listed lifts and toilets, nearest first. Distances are straight-line estimates; a pin does not establish an accessible walking route.</p></div>
    <div class="nf-actions"><button type="button" class="primary" id="nearby-locate">${icon('location',18)} Locate me</button><button type="button" class="secondary" id="nearby-refresh">Refresh status</button></div>
    <p id="nearby-location-message" class="nf-note" role="status">Your location is requested only when you tap Locate me. It stays in this tab.</p>
    <details id="nearby-manual" class="nf-manual"><summary>Choose an area manually</summary><label for="nearby-query">Station, bus-stop name or code</label><input id="nearby-query" autocomplete="off" placeholder="For example, Bugis or 01112" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="nearby-suggestions"><div id="nearby-suggestions" class="nf-suggestions" role="listbox" aria-label="Search areas" hidden></div><p id="nearby-search-note" class="nf-note">Select a suggestion to search within 1 km of that place.</p></details>
    <div id="nearby-center" class="nf-center" hidden></div>
    <div class="nf-toolbar"><div class="segmented" role="group" aria-label="Facility type"><button type="button" data-nf-kind="all" aria-pressed="true">All</button><button type="button" data-nf-kind="lift" aria-pressed="false">Lifts</button><button type="button" data-nf-kind="toilet" aria-pressed="false">Toilets</button></div><div class="segmented" role="group" aria-label="Facility view"><button type="button" data-nf-mode="list" aria-pressed="true">List</button><button type="button" data-nf-mode="map" aria-pressed="false">Map</button></div></div>
    <p id="nearby-feed" class="nf-feed" role="status"></p><p id="nearby-count" class="nf-count" role="status"></p>
    <div id="nearby-map-panel" hidden><div id="nearby-map" class="nf-map" aria-label="Nearby facilities map"></div><p class="nf-map-legend">Blue T: toilet · purple L: lift · circle: 1 km search area</p><p id="nearby-map-note" class="nf-note" role="status"></p><button id="nearby-map-retry" type="button" class="quiet" hidden>Retry street map</button><div id="nearby-selected"></div></div>
    <div id="nearby-results"></div>
    <details class="nf-coverage"><summary>Sources &amp; coverage</summary><p>${esc(FACILITIES_COVERAGE.description)}</p><p>Location directory checked ${esc(FACILITIES_COVERAGE.checkedAt)}. Refresh status checks the available maintenance service; it does not update the packaged location directory.</p>${(FACILITIES_COVERAGE.sources??[]).map(source=>`<p>${sourceLink(source)}${source.sourceTime?` · source dated ${esc(source.sourceTime)}`:''}</p>`).join('')}${(FACILITIES_COVERAGE.limitations??[]).map(note=>`<p>${esc(note)}</p>`).join('')}<p>The LTA service covers reported station lift maintenance only. It has no toilet status and does not confirm operation when a report is absent. This public prototype may have no live maintenance connection. Check signs or staff before relying on a facility.</p></details>`;

  function closeSuggestions(){suggestionIndex=-1;$('suggestions').hidden=true;$('query').setAttribute('aria-expanded','false');$('query').removeAttribute('aria-activedescendant');}
  function stopLocating(){locationEpoch++;clearTimeout(locationTimer);locating=false;$('locate').disabled=false;$('locate').innerHTML=`${icon('location',18)} ${center?.method==='device'?'Locate again':'Locate me'}`;}
  function setCenter(point){stopLocating();center=point;selectedId=null;closeSuggestions();render();if(mode==='map')drawMap(true);}
  function choose(point){
    $('query').value=point.label;$('manual').open=false;
    $('location-message').textContent='Manual area selected. This is the search centre, not your current location.';
    setCenter({lat:point.lat,lng:point.lng,label:point.label,method:'manual',at:now()});
    $('center').tabIndex=-1;$('center').focus({preventScroll:true});$('center').scrollIntoView({block:'nearest'});
  }
  function search(){
    const query=$('query').value.trim();suggestionIndex=-1;
    suggestions=query?suggestEndpoints(getPlaces().filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)),query,8):[];
    $('suggestions').innerHTML=suggestions.map((point,index)=>`<button type="button" role="option" aria-selected="false" id="nearby-option-${index}" data-nf-place="${index}"><strong>${esc(point.label)}</strong><small>${esc(point.kind==='bus'?`Bus stop ${(point.codes??[]).join(' / ')}`:point.detail)}</small></button>`).join('');
    $('suggestions').hidden=!suggestions.length;$('query').setAttribute('aria-expanded',String(!!suggestions.length));$('query').removeAttribute('aria-activedescendant');
    $('search-note').textContent=query&&!suggestions.length?(getPlaces().length?'No matching station or bus stop. Try another name or code.':'Place search is still loading. Try again after routes load, or use Locate me.'):'Select a suggestion to search within 1 km of that place.';
  }
  $('query').addEventListener('input',search);
  $('query').addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp'].includes(event.key)&&suggestions.length){event.preventDefault();suggestionIndex=suggestionIndex<0?(event.key==='ArrowDown'?0:suggestions.length-1):(suggestionIndex+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;$('suggestions').hidden=false;$('query').setAttribute('aria-expanded','true');$('query').setAttribute('aria-activedescendant',`nearby-option-${suggestionIndex}`);$('suggestions').querySelectorAll('[role=option]').forEach((option,index)=>{option.setAttribute('aria-selected',String(index===suggestionIndex));if(index===suggestionIndex)option.scrollIntoView({block:'nearest'});});}
    if(event.key==='Enter'){event.preventDefault();if(suggestionIndex>=0&&suggestions[suggestionIndex])choose(suggestions[suggestionIndex]);}
    if(event.key==='Escape')closeSuggestions();
  });
  $('suggestions').addEventListener('click',event=>{const button=event.target.closest('[data-nf-place]');if(button)choose(suggestions[Number(button.dataset.nfPlace)]);});

  $('locate').onclick=()=>{
    if(locating)return;locating=true;const epoch=++locationEpoch;$('locate').disabled=true;$('locate').textContent='Locating…';$('location-message').textContent='Waiting for your device location…';
    function fail(message){if(epoch!==locationEpoch)return;stopLocating();$('location-message').textContent=message+(center?' The previous search area is still shown.':'');$('manual').open=true;$('query').focus({preventScroll:true});}
    if(!geolocation){fail('Device location is unavailable. Choose an area manually.');return;}
    locationTimer=setTimeout(()=>fail('Location timed out. Try again or choose an area manually.'),14000);
    geolocation.getCurrentPosition(position=>{
      if(epoch!==locationEpoch)return;
      const {latitude:lat,longitude:lng,accuracy}=position.coords;
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0){fail('The device returned an unusable location. Choose an area manually.');return;}
      const measured=Number(position.timestamp);
      if(!Number.isFinite(measured)||measured>now()+10000||now()-measured>5*60000){fail('The device returned an old location. Try again or choose an area manually.');return;}
      $('location-message').textContent=`Location found, accuracy about ${Math.round(accuracy)} m.${accuracy>250?' This is a broad estimate; choose an area manually for a more useful search.':''}`;
      setCenter({lat,lng,accuracy,label:'Your device location',method:'device',at:measured});
    },error=>fail(error.code===1?'Location permission was denied. Choose an area manually.':error.code===3?'Location timed out. Try again or choose an area manually.':'Your location could not be found. Choose an area manually.'),{enableHighAccuracy:true,maximumAge:0,timeout:12000});
  };

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
    const openSources=new Set([...host.querySelectorAll('.nf-card details[open]')].map(detail=>detail.closest('[data-facility-id]').dataset.facilityId));
    results=center?nearbyFacilities(NEARBY_FACILITIES,center,{kind}):[];
    $('refresh').disabled=loading;$('refresh').textContent=loading?'Checking…':'Refresh status';
    $('feed').textContent=feedText();$('feed').dataset.offline=String(!online());
    $('center').hidden=!center;
    if(center){const old=center.method==='device'&&now()-center.at>5*60000;$('center').innerHTML=`<strong>${esc(center.label)}</strong><span>1 km radius · nearest first${center.method==='device'?` · located ${esc(time(new Date(center.at).toISOString()))}`:' · manual search area'}</span>${old?'<p class="nf-stale">Location is over 5 minutes old. Use Locate again if you have moved.</p>':''}`;}
    $('count').textContent=center?`${results.length} listed ${kind==='all'?'facilities':kind==='lift'?'lifts':'toilets'} within 1 km. Site pins and distances may be approximate.`:'Choose your location or a manual area to see nearby facilities.';
    const empty=center?`<div class="nf-empty"><h2>No listed ${kind==='all'?'facilities':kind==='lift'?'lifts':'toilets'} within 1 km</h2><p>This directory has partial coverage. This does not mean there are no facilities nearby.</p><button type="button" class="secondary" data-nf-change-area>Choose another area</button></div>`:'<div class="nf-empty"><h2>A useful stop, close by</h2><p>Locate yourself or choose a station or bus stop above. Your journey stays in place.</p></div>';
    $('results').innerHTML=results.length?results.map(facility=>card(facility)).join(''):empty;
    $('results').hidden=mode!=='list';$('map-panel').hidden=mode!=='map';
    $('results').setAttribute('aria-busy',String(loading));
    host.querySelectorAll('[data-nf-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.nfKind===kind)));
    host.querySelectorAll('[data-nf-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.nfMode===mode)));
    renderSelected();host.querySelectorAll('.nf-card details').forEach(detail=>{detail.open=openSources.has(detail.closest('[data-facility-id]').dataset.facilityId);});if(mode==='map'&&active)drawMap();freshness=freshnessKey();
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
    map.invalidateSize();markers.clearLayers();
    if(!center)return;
    const circle=L.circle([center.lat,center.lng],{radius:NEARBY_RADIUS_METERS,color:'#174f9e',weight:2,fillOpacity:.045,interactive:false}).addTo(markers);
    L.circleMarker([center.lat,center.lng],{radius:7,color:'#fff',weight:3,fillColor:'#174f9e',fillOpacity:1}).bindTooltip(document.createTextNode(center.label)).addTo(markers);
    for(const facility of results){
      const marker=L.marker([facility.position.lat,facility.position.lng],{title:`${facility.name} · ${formatFacilityDistance(facility.distanceMeters)}`,icon:L.divIcon({className:`nf-map-pin nf-pin-${facility.kind}${facility.id===selectedId?' nf-pin-selected':''}`,html:`<span>${facility.kind==='toilet'?'T':'L'}</span>`,iconSize:[32,36],iconAnchor:[16,34]})}).addTo(markers);
      const element=marker.getElement(),selectMarker=()=>{selectedId=facility.id;renderSelected();drawMap();const card=$('selected').querySelector('article');card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'nearest',behavior:'instant'});};
      element?.setAttribute('aria-label',`${facility.kind==='lift'?'Lift':'Toilet'}: ${facility.name}, ${formatFacilityDistance(facility.distanceMeters)}`);
      element?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();selectMarker();}});
      marker.on('click',selectMarker);
    }
    if(fit||drawMap.center!==center){map.fitBounds(circle.getBounds(),{padding:[20,20],animate:false});drawMap.center=center;}
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
  function freshnessKey(){return JSON.stringify([feedText(),center?.method==='device'&&now()-center.at>5*60000,results.map(facility=>nearbyFacilityStatus(facility,snapshot,{now:now(),offline:!online()}).label)]);}
  const timer=setInterval(()=>{if(active&&!document.hidden&&freshness!==freshnessKey())render();},30000);
  window.addEventListener('online',connection);window.addEventListener('offline',connection);
  render();
  return {setActive(value){active=value;if(value){render();if(!checked||!snapshot)refresh();}else{if(locating)$('location-message').textContent='Location request stopped. Tap Locate me to try again.';stopLocating();requestEpoch++;request?.abort();request=null;loading=false;}},destroy(){clearInterval(timer);stopLocating();requestEpoch++;request?.abort();window.removeEventListener('online',connection);window.removeEventListener('offline',connection);tiles?.remove();map?.remove();}};
}
