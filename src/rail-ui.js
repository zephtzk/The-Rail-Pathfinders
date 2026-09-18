import {fareEstimateHTML} from './fare-ui.js';
import {mountCompanion} from './copilot-ui.js';
import {createRailRouter} from './rail-engine.js';
import {legacyPlannerInput,legacyPlannerSettings} from './legacy-planner-preferences.js';
import {mountDatePickers} from './date-picker.js';

// Presentation owns form state and rendering. The routing engine owns every timing decision.
const SAVE_KEY = 'commute-copilot-rail-guidance-v1';
const app = document.querySelector('#app');
let network, manifest, router, result, selectedRoute, submittedInput, lookup, companion, dirty = false;
let planningPreferences = legacyPlannerSettings();
let datePickers;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const minutes = seconds => {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds), m = Math.floor(total / 60), s = total % 60;
  return s ? `${m}m ${s}s` : `${m} min`;
};
const clock = seconds => {
  if (!Number.isFinite(seconds)) return '—';
  const day = Math.floor(seconds / 86400), time = ((seconds % 86400) + 86400) % 86400;
  return `${String(Math.floor(time / 3600)).padStart(2,'0')}:${String(Math.floor(time % 3600 / 60)).padStart(2,'0')}${time % 60 ? `:${String(Math.floor(time % 60)).padStart(2,'0')}` : ''}${day ? ` (${day > 0 ? '+' : ''}${day} day${Math.abs(day) === 1 ? '' : 's'})` : ''}`;
};
const textValue = value => typeof value === 'string' ? value : value?.description ?? value?.message ?? JSON.stringify(value);
const sourceName = () => manifest?.source?.publisher ?? 'Imported rail timetable';
const version = () => manifest?.source?.version ?? manifest?.buildId ?? 'Recorded in import manifest';

function makeLookup() {
  const stations = [...network.stations].sort((a,b) => a.name.localeCompare(b.name));
  const names = new Map();
  for (const station of stations) names.set(station.name, (names.get(station.name) ?? 0) + 1);
  lookup = {
    stations: new Map(stations.map(station => [station.id,station])),
    stops: new Map(network.stops.map(stop => [stop.id,stop])),
    routes: new Map(network.routes.map(route => [route.id,route])),
    trips: new Map((network.trips ?? []).map(trip => [trip.id,trip])),
    sorted: stations,
    labels: new Map(stations.map(station => [station.id,`${station.name}${names.get(station.name) > 1 ? ` (${station.id})` : ''}`]))
  };
}
const stationLabel = id => lookup.labels.get(id) ?? id;
const stopLabel = id => {
  const stop = lookup.stops.get(id);
  return stop ? lookup.stations.get(stop.stationId)?.name ?? stop.name : id ?? '';
};
const routeLabel = id => lookup.routes.get(id)?.shortName ?? lookup.routes.get(id)?.name ?? id;
const routeColor = id => {
  const color = lookup.routes.get(id)?.color ?? '23786a';
  return /^#?[a-f\d]{6}$/i.test(color) ? `#${color.replace('#','')}` : '#23786a';
};
const linePill = id => `<span class="line-pill"><i style="background:${routeColor(id)}" aria-hidden="true"></i>${escape(routeLabel(id))}</span>`;

function shell() {
  app.innerHTML = `<header class="rail-header"><a class="rail-brand" href="/"><img src="/icon.svg" width="36" height="36" alt=""><span>Commute <strong>Copilot</strong></span></a><a class="replay-link" href="/replay.html">Original corridor replay <span aria-hidden="true">↗</span></a></header>
    <div class="schedule-banner"><span class="schedule-dot" aria-hidden="true"></span><strong>Scheduled rail journeys</strong><span>Timetable snapshot · no live disruption or crowding adjustment</span><span id="connection-state"></span></div>
    <main id="main"><p class="notice"><a href="/multimodal.html">Try the bus &amp; walking pilot</a> · services 2, 23 and 28, limited weekday estimates and reviewed pedestrian connections.</p><div class="rail-heading"><div><p class="eyebrow">YOUR NEXT CONNECTION</p><h1>Across the rail network.</h1><p>Choose your stations. Find a journey that fits your day.</p></div><a class="coverage-shortcut" href="#coverage">View validated coverage <span aria-hidden="true">↓</span></a></div>
      <div id="load-state" class="notice" role="status">Loading the imported rail timetable…</div>
      <div class="planner-layout"><section id="planner" class="panel planner-panel" aria-labelledby="planner-title"></section><section id="journey" class="journey-panel" tabindex="-1" aria-label="Journey results" aria-live="polite"></section></div>
      <section id="coverage" class="panel coverage-panel" aria-labelledby="coverage-title"></section>
      <footer><p>Station-to-station rail planning only. Bus and address-to-address journeys are not supported.</p><p><a href="/replay.html#live-panel">Original corridor replay &amp; live notices</a> · All times in <span id="time-zone">the timetable’s local time zone</span></p></footer>
    </main><div id="rail-toast" role="status" aria-live="polite"></div>`;
  renderConnection();
}

function defaults() {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:network.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const coverage = network.coverage;
  const date = today >= coverage.startDate && today <= coverage.endDate ? today : coverage.startDate;
  const find = name => lookup.sorted.find(station => station.name.toLowerCase().replace(/[^a-z]/g,'') === name)?.id;
  return {originId:find('tampines') ?? lookup.sorted[0]?.id, destinationId:find('buonavista') ?? lookup.sorted.at(-1)?.id,
    date,departureTime:'08:00',deadlineDate:date,deadlineTime:'09:30',walkingLimitMinutes:15,preference:'fastest',maxExtraMinutes:15};
}

function formMarkup(input, disabled = false) {
  const options = lookup.sorted.map(station => `<option value="${escape(stationLabel(station.id))}">${escape(station.id)}</option>`).join('');
  return `<div class="panel-heading"><h2 id="planner-title">Plan your journey</h2><span class="tag">Rail only</span></div>
    <p class="help">Any two stations in the imported coverage. Station names must match the list.</p>
    <form id="rail-form"><fieldset ${disabled ? 'disabled' : ''}><legend class="sr-only">Rail journey details</legend>
      <div class="station-fields"><label for="origin">From station</label><input id="origin" name="origin" list="rail-stations" required autocomplete="off" value="${escape(stationLabel(input.originId))}">
      <button id="swap-stations" class="swap-button" type="button" aria-label="Swap origin and destination">⇅</button>
      <label for="destination">To station</label><input id="destination" name="destination" list="rail-stations" required autocomplete="off" value="${escape(stationLabel(input.destinationId))}"></div>
      <datalist id="rail-stations">${options}</datalist>
      <p class="field-note">Not listed? That station is outside validated coverage. <a href="#coverage">See coverage and exclusions.</a></p>
      <div class="form-pair"><label>Travel date<input type="date" name="date" required value="${escape(input.date)}"></label><label>Depart at<input type="time" name="departureTime" required value="${escape(input.departureTime)}"></label></div>
      <div class="form-pair"><label>Arrive-by date<input type="date" name="deadlineDate" value="${escape(input.deadlineDate)}"></label><label>Arrive by <small>(optional)</small><input type="time" name="deadlineTime" value="${escape(input.deadlineTime)}"></label></div>
      <p class="field-note">For arrival after midnight, choose the following date. Clear the arrive-by time to search without a deadline.</p>
      <div class="form-pair"><label>Total walking limit<select name="walkingLimitMinutes">${[...new Set([0,4,5,8,10,12,15,20,30,45,60,Number(input.walkingLimitMinutes)])].sort((a,b)=>a-b).map(n => `<option value="${n}" ${n === Number(input.walkingLimitMinutes) ? 'selected' : ''}>${n} minutes</option>`).join('')}</select></label><label>Preference<select name="preference">${[['fastest','Fastest arrival'],['fewer-transfers','Fewer transfers'],['less-walking','Less walking'],['quieter','Quieter (unavailable)']].map(([value,label]) => `<option value="${value}" ${input.preference === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      <label>Extra time allowed for preferences<select name="maxExtraMinutes">${[...new Set([0,5,10,15,20,30,45,60,Number(input.maxExtraMinutes)])].sort((a,b)=>a-b).map(n => `<option value="${n}" ${n === Number(input.maxExtraMinutes) ? 'selected' : ''}>Up to ${n} minutes</option>`).join('')}</select></label>
      <p class="field-note">Measured against the fastest feasible journey. Walking includes assumed station access, exit and interchange walking.</p>
      <p id="preference-note" class="notice subtle" ${input.preference === 'quieter' ? '' : 'hidden'}>Crowding is unavailable for this timetable. Quieter falls back to fastest arrival.</p>
      <button class="primary plan-button" type="submit">Find rail journeys <span aria-hidden="true">→</span></button>
      <p class="field-note local-time">All times: ${escape(network.timeZone)}. Dates outside coverage are explained when you search.</p>
    </fieldset></form>`;
}

function bindForm() {
  datePickers?.destroy();
  const form = document.querySelector('#rail-form');
  let previousDate = form.elements.date.value;
  form.elements.date.addEventListener('change', () => {
    if (form.elements.deadlineDate.value === previousDate) form.elements.deadlineDate.value = form.elements.date.value;
    previousDate = form.elements.date.value;
    datePickers?.refresh();
  });
  form.addEventListener('submit', event => { event.preventDefault(); search({focus:true}); });
  const changed = () => {
    dirty = true;
    companion?.clearPrepared();
    const note = document.querySelector('#stale-results');
    if (note) note.hidden = false;
    document.querySelector('#preference-note').hidden = form.elements.preference.value !== 'quieter';
  };
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);
  datePickers = mountDatePickers(form);
  document.querySelector('#swap-stations').addEventListener('click', () => {
    [form.elements.origin.value,form.elements.destination.value] = [form.elements.destination.value,form.elements.origin.value];
    form.dispatchEvent(new Event('input'));
  });
}

function parseForm() {
  const data = Object.fromEntries(new FormData(document.querySelector('#rail-form')));
  const resolve = label => lookup.sorted.find(station => stationLabel(station.id).toLowerCase() === label.trim().toLowerCase() || station.id.toLowerCase() === label.trim().toLowerCase())?.id;
  const originId = resolve(data.origin), destinationId = resolve(data.destination);
  const errors = [];
  if (!originId) errors.push({code:'unsupported-station',message:`Origin “${data.origin}” is outside imported coverage. Choose a station from the list.`});
  if (!destinationId) errors.push({code:'unsupported-station',message:`Destination “${data.destination}” is outside imported coverage. Choose a station from the list.`});
  return {errors,input:legacyPlannerInput({originId,destinationId,date:data.date,departureTime:data.departureTime,deadlineDate:data.deadlineTime ? data.deadlineDate : undefined,deadlineTime:data.deadlineTime || undefined,walkingLimitMinutes:Number(data.walkingLimitMinutes),preference:data.preference,maxExtraMinutes:Number(data.maxExtraMinutes)},planningPreferences)};
}

function search({focus = false} = {}) {
  companion?.clearPrepared();
  const parsed = parseForm();
  dirty = false;
  submittedInput = parsed.input;
  try {
    result = parsed.errors.length ? {status:'unsupported-station',errors:parsed.errors,routes:[]} : router.route(submittedInput);
    // Late candidates explain a failed deadline; they are never presented as feasible.
    selectedRoute = result.status === 'ok' ? result.recommended ?? result.routes?.[0] ?? null : null;
    renderResult();
  } catch (error) {
    result = {status:'error',errors:[{code:'routing-error',message:'The imported timetable could not be searched. Reload to try again, or review the recorded coverage.'}],routes:[]};
    selectedRoute = null;
    renderResult();
    console.error('Rail routing failed',error);
  }
  if (focus) document.querySelector('#journey').focus();
}

function renderCoverage() {
  const source = manifest?.source ?? {}, coverage = network.coverage;
  const excludedRoutes = manifest?.completeness?.excludedRoutes ?? [];
  const excludedStops = manifest?.completeness?.excludedStops ?? [];
  const excludedTrips = manifest?.completeness?.excludedTrips ?? [];
  const limitations = manifest?.completeness?.limitations ?? [];
  const unsupportedConnections = manifest?.rules?.unsupportedConnections ?? [];
  const visibleLines = [...new Map(network.routes.map(route => [route.shortName ?? route.id,route])).values()];
  const calendarDetails = (manifest?.routes ?? []).map(route => `<tr><th scope="row">${escape(route.name ?? route.id)}<br><code>${escape(route.id)}</code></th><td>${escape(route.startDate)} – ${escape(route.endDate)}</td><td>${escape(route.tripCount ?? '—')}</td></tr>`).join('');
  document.querySelector('#coverage').innerHTML = `<div class="panel-heading"><div><p class="eyebrow">KNOW THE BOUNDARIES</p><h2 id="coverage-title">Validated imported coverage</h2></div><span class="tag">Schedule snapshot</span></div>
    <div class="coverage-stats"><div><strong>${network.stations.length}</strong><span>selectable rail stations</span></div><div><strong>${network.routes.length}</strong><span>rail service patterns</span></div><div><strong>${escape(coverage.startDate)}</strong><span>first covered date</span></div><div><strong>${escape(coverage.endDate)}</strong><span>last covered date</span></div></div>
    <p class="coverage-description">Choose any station in the list. Coverage dates describe the imported calendars; a particular service may run on fewer dates. A station’s inclusion does not guarantee a train for every date or time.</p>
    <div class="coverage-lines">${visibleLines.map(route => linePill(route.id)).join('')}</div>
    ${unsupportedConnections.length ? `<p class="notice">Unvalidated tap-out transfers are unavailable at ${unsupportedConnections.map(item => `${escape(item.station)} (${escape(item.codes.join(' / '))})`).join(', ')}. You may select these stations as an endpoint; the engine cannot change between the listed lines there.</p>` : ''}
    <dl class="source-facts"><div><dt>Source</dt><dd>${escape(sourceName())}</dd></div><div><dt>Dataset</dt><dd>${escape(source.dataset ?? 'GTFS Schedule (Train)')}</dd></div><div><dt>Snapshot version</dt><dd>${escape(version())}</dd></div><div><dt>Retrieved</dt><dd>${escape(source.retrievedAt ?? 'See source manifest')}</dd></div><div><dt>Import build</dt><dd><code>${escape(manifest?.buildId ?? 'Unavailable')}</code></dd></div><div><dt>Source licence</dt><dd><a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noopener noreferrer">${escape(source.license ?? 'Singapore Open Data Licence v1.0')}</a></dd></div></dl>
    <details class="coverage-details"><summary>Service dates, excluded coverage and import details</summary>
      ${calendarDetails ? `<div class="table-scroll"><table><caption>Service-specific date coverage; exceptions are checked by the routing engine.</caption><thead><tr><th scope="col">Service</th><th scope="col">Calendar dates</th><th scope="col">Trips</th></tr></thead><tbody>${calendarDetails}</tbody></table></div>` : ''}
      ${limitations.length ? `<ul>${limitations.map(item => `<li>${escape(textValue(item))}</li>`).join('')}</ul>` : ''}
      <h3>Excluded services</h3>${excludedRoutes.length ? `<ul>${excludedRoutes.map(item => `<li><strong>${escape(item.name ?? item.id)}</strong>: ${escape(item.reason)}</li>`).join('')}</ul>` : '<p>No services were excluded by the import rules. The source itself may omit services.</p>'}
      <h3>Quarantined trips</h3>${excludedTrips.length ? `<ul>${excludedTrips.map(item => `<li><code>${escape(item.id)}</code>: ${escape(item.reason)}</li>`).join('')}</ul>` : '<p>No individual trips were quarantined by the import rules.</p>'}
      <h3>Excluded station or platform records</h3>${excludedStops.length ? `<p>${excludedStops.length} source records do not provide validated scheduled boarding, including entrance records. They are excluded from the routing graph.</p><details><summary>Show excluded record identifiers</summary><ul>${excludedStops.map(item => `<li><code>${escape(item.id)}</code> · ${escape(item.name ?? item.id)}: ${escape(item.reason)}</li>`).join('')}</ul></details>` : '<p>No stop records were excluded by the import rules. Stations absent from the source are unsupported.</p>'}
      <p>Routing permits only recorded interchange connections. Coordinate proximity and the route diagram never create a walking connection.</p>
      <p><a href="/data/rail-manifest.json">Download import manifest</a> · <a href="/data/rail-network.json">Download validated routing data</a></p>
    </details>
    <details class="coverage-details"><summary>Browse all ${network.stations.length} supported stations</summary><ul class="station-directory">${lookup.sorted.map(station => `<li>${escape(station.name)} <code>${escape(station.id)}</code></li>`).join('')}</ul></details>
    <p class="boundary-note">Station access and exit allowances are assumptions. They are not measured entrance paths, and no step-free or wheelchair-accessible route is established here.</p>`;
  document.querySelector('#time-zone').textContent = network.timeZone;
}

function renderResult({saved = false,savedAt} = {}) {
  const container = document.querySelector('#journey');
  const stale = `<p id="stale-results" class="notice" ${dirty ? '' : 'hidden'}>Journey details changed. Find rail journeys again to update these results.</p>`;
  if (!selectedRoute) {
    const messages = result?.errors?.length ? result.errors : [{message:'No feasible rail journey was found within these constraints.'}];
    container.innerHTML = `${stale}<div class="panel empty-state" tabindex="-1"><span class="empty-icon" aria-hidden="true">↝</span><p class="eyebrow">${escape(result?.status ?? 'NO JOURNEY')}</p><h2>We couldn’t find that journey.</h2>${messages.map(error => `<p>${escape(error.message)}</p>`).join('')}<p class="help">Review the stations, service date, departure, deadline and walking limit. <a href="#coverage">Check imported coverage.</a></p></div>`;
    return;
  }
  const route = selectedRoute;
  const rides = route.legs.filter(leg => leg.type === 'ride');
  const deadline = submittedInput.deadlineTime ? `Arrive by ${escape(submittedInput.deadlineTime)} on ${escape(submittedInput.deadlineDate)}` : 'No arrival deadline';
  container.innerHTML = `${stale}${saved ? `<p class="notice">Saved timetable guidance · saved ${escape(savedAt)}. This is a snapshot, not a refreshed timetable or a live service guarantee.</p>` : ''}
    <article class="route-hero"><div class="hero-top"><span>Scheduled journey</span><span class="hero-date">${escape(submittedInput.date)}</span></div><h2>${escape(stationLabel(submittedInput.originId))} <span aria-hidden="true">→</span> ${escape(stationLabel(submittedInput.destinationId))}</h2>
      <div class="hero-arrival"><div><span>Arrive at station exit</span><strong>${clock(route.arrivalSeconds)}</strong></div><div class="total-time"><strong>${minutes(route.totalSeconds)}</strong><span>total journey</span></div></div>
      <p class="hero-departure">Leave station entrance at <strong>${clock(route.departureSeconds)}</strong> · ${deadline}</p>
      <div class="hero-metrics"><span>${route.transfers} transfer${route.transfers === 1 ? '' : 's'}</span><span>${minutes(route.walkingSeconds)} walking</span><span>${minutes(route.waitSeconds)} waiting</span></div>
    </article>
    ${submittedInput.preference === 'quieter' ? '<p class="notice">Quieter preference is unavailable: these results use fastest arrival. No crowding prediction has been applied.</p>' : ''}
    <p><a href="#companion-plan">Start this journey · caregiver preparation · station &amp; toilet guidance ↓</a></p><div class="route-summary"><div class="route-lines">${rides.map(leg => linePill(leg.routeId)).join('<span aria-hidden="true">→</span>')}</div><button id="save-rail" class="secondary" type="button">Save this guidance</button></div>
    ${fareEstimateHTML({route:{legacyRoute:route,legacyInput:submittedInput},plan:{departureDate:submittedInput.date}})}
    ${routeDiagram(route)}
    <section class="panel instructions" aria-labelledby="directions-title"><div class="panel-heading"><h3 id="directions-title">Your journey, step by step</h3><span class="tag">Scheduled</span></div><ol class="journey-steps">${route.legs.map(leg => renderLeg(leg)).join('')}</ol></section>
    <section class="panel arithmetic"><h3>Where the time goes</h3><dl>${[['Access',route.accessSeconds],['Waiting',route.waitSeconds],['Riding',route.rideSeconds],['Transfers',route.transferSeconds],['Exit',route.exitSeconds]].map(([label,value]) => `<div><dt>${label}</dt><dd>${minutes(value)}</dd></div>`).join('')}<div class="arithmetic-total"><dt>Total</dt><dd>${minutes(route.totalSeconds)}</dd></div></dl><p class="help">Transfer time includes ${minutes(route.transferWalkSeconds)} of walking. Walking total is part of the journey total, not additional time.</p>
      <details><summary>Timing assumptions and interchange evidence</summary><ul>${(route.assumptions?.length ? route.assumptions : [`Station access: ${minutes(route.accessSeconds)} assumed.`,`Station exit: ${minutes(route.exitSeconds)} assumed.`]).map(value => `<li>${escape(textValue(value))}</li>`).join('')}</ul><p>Allowances are planning assumptions, not measured entrance or platform walking times. The timetable does not establish step-free access. Train times are scheduled and may change.</p></details></section>
    ${renderAlternatives()}`;
  document.querySelector('#save-rail').addEventListener('click', saveGuidance);
  for (const button of document.querySelectorAll('[data-rail-route]')) button.addEventListener('click', () => {
    companion?.clearPrepared();
    selectedRoute = result.routes.find(route => route.id === button.dataset.railRoute);
    renderResult();
  });
}

function renderLeg(leg) {
  const duration = minutes(leg.durationSeconds), from = escape(stopLabel(leg.fromStopId)), to = escape(stopLabel(leg.toStopId));
  let title, detail = '', icon;
  if (leg.type === 'ride') {
    const trip = lookup.trips.get(leg.tripId);
    title = `Take ${escape(routeLabel(leg.routeId))} to ${to}`;
    detail = `From ${from}${trip?.headsign ? ` · towards ${escape(trip.headsign)}` : ''}.`;
    icon = '↗';
  } else if (leg.type === 'wait') { title = `Wait for your train${from ? ` at ${from}` : ''}`; icon = '◷'; }
  else if (leg.type === 'transfer') {
    title = `Change trains${from === to ? ` at ${from}` : `: ${from} → ${to}`}`; icon = '⇄';
    const edge = network.transfers?.find(edge => edge.fromStopId === leg.fromStopId && edge.toStopId === leg.toStopId);
    detail = `${edge?.assumed === false ? 'Recorded transfer connection.' : 'Assumed transfer allowance.'} ${edge?.provenance ? escape(textValue(edge.provenance)) : 'Uses an explicit interchange connection in the validated routing data.'}`;
  } else if (leg.type === 'access') { title = `Enter ${to || from} station`; detail = 'Assumed time from station entrance to platform; no entrance walking path is mapped.'; icon = '↓'; }
  else { title = `Exit ${from || to} station`; detail = 'Assumed platform-to-exit time; the journey ends at this station.'; icon = '✓'; }
  const stops = leg.type === 'ride' && leg.stopIds?.length ? `<details><summary>${leg.stopIds.length - 1} stop${leg.stopIds.length === 2 ? '' : 's'} along this ride</summary><p>${leg.stopIds.map(id => escape(stopLabel(id))).join(' → ')}</p><p class="service-id">Service day ${escape(leg.serviceDate)} · direction ${escape(leg.directionId ?? 'recorded in timetable')}<br>Trip ${escape(leg.tripId)} · service ${escape(leg.serviceId)}</p></details>` : '';
  return `<li class="journey-step"><span class="step-marker" aria-hidden="true">${icon}</span><div><div class="step-heading"><h4>${title}</h4><span>${duration}</span></div><p class="leg-clock">${clock(leg.startSeconds)} – ${clock(leg.endSeconds)}</p>${detail ? `<p>${detail}</p>` : ''}${stops}</div></li>`;
}

function routeDiagram(route) {
  const rides = route.legs.filter(leg => leg.type === 'ride');
  const stopIds = [...new Set(rides.flatMap(leg => leg.stopIds ?? [leg.fromStopId,leg.toStopId]))];
  const stops = stopIds.map(id => lookup.stops.get(id)).filter(stop => Number.isFinite(stop?.lat) && Number.isFinite(stop?.lon));
  if (stops.length < 2) return '';
  const lats = stops.map(stop => stop.lat), lons = stops.map(stop => stop.lon), minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const spanLat = Math.max(maxLat - minLat,0.015), spanLon = Math.max(maxLon - minLon,0.015), scale = Math.min(500 / spanLon,170 / spanLat);
  const xy = stop => [300 + (stop.lon - (minLon + maxLon) / 2) * scale,120 - (stop.lat - (minLat + maxLat) / 2) * scale];
  const path = ids => ids.map(id => lookup.stops.get(id)).filter(stop => Number.isFinite(stop?.lat) && Number.isFinite(stop?.lon)).map(stop => xy(stop).join(',')).join(' ');
  const segments = rides.map(leg => `<polyline points="${path(leg.stopIds ?? [leg.fromStopId,leg.toStopId])}" fill="none" stroke="${routeColor(leg.routeId)}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const nodes = stops.map(stop => { const [x,y] = xy(stop); return `<circle cx="${x}" cy="${y}" r="3.3" fill="white" stroke="#1a574f" stroke-width="1.5"><title>${escape(stopLabel(stop.id))}</title></circle>`; }).join('');
  const endpoints = [rides[0]?.fromStopId,rides.at(-1)?.toStopId].map((id,i) => { const stop = lookup.stops.get(id); if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return ''; const [x,y] = xy(stop); return `<circle cx="${x}" cy="${y}" r="9" fill="${i ? '#063c39' : '#fff'}" stroke="#063c39" stroke-width="2"/><text x="${x}" y="${y+3.5}" text-anchor="middle" fill="${i ? '#fff' : '#063c39'}" font-size="10" font-weight="700">${i ? 'B' : 'A'}</text>`; }).join('');
  return `<figure class="panel route-diagram"><div class="panel-heading"><h3>Your rail connections</h3><span class="tag">Schematic</span></div><svg viewBox="0 0 600 240" role="img" aria-label="Schematic of the selected rail journey from ${escape(stationLabel(submittedInput.originId))} to ${escape(stationLabel(submittedInput.destinationId))}">${segments}${nodes}${endpoints}</svg><div class="diagram-key"><span><b>A</b> ${escape(stationLabel(submittedInput.originId))}</span><span><b>B</b> ${escape(stationLabel(submittedInput.destinationId))}</span></div><figcaption>Straight segments connect scheduled stops. This is not track geometry or a walking map. Only validated interchange records connect platforms; no entrance paths are inferred.</figcaption></figure>`;
}

function renderAlternatives() {
  const alternatives = (result?.routes ?? []).filter(route => route.id !== selectedRoute.id);
  if (!alternatives.length) return '<p class="help results-footnote">No other journey was returned within your constraints.</p>';
  return `<section class="panel alternatives"><h3>Other feasible journeys</h3><p class="help">Within your deadline, walking limit and extra-time allowance.</p>${alternatives.map(route => `<article><div><div class="route-lines">${route.legs.filter(leg => leg.type === 'ride').map(leg => linePill(leg.routeId)).join('')}</div><h4>Arrive ${clock(route.arrivalSeconds)} <span>· ${minutes(route.totalSeconds)}</span></h4><p>${route.transfers} transfer${route.transfers === 1 ? '' : 's'} · ${minutes(route.walkingSeconds)} walking</p></div><button class="secondary" type="button" data-rail-route="${escape(route.id)}" aria-label="Show journey arriving ${clock(route.arrivalSeconds)} with ${route.transfers} transfers">View journey</button></article>`).join('')}</section>`;
}

function saveGuidance() {
  if (dirty) { toast('Find rail journeys again before saving your changed details.'); return; }
  const snapshot = {schemaVersion:1,savedAt:new Date().toISOString(),input:submittedInput,route:selectedRoute,manifest,
    network:{schemaVersion:network.schemaVersion,timeZone:network.timeZone,stations:network.stations,stops:network.stops,routes:network.routes,transfers:network.transfers,coverage:network.coverage,assumptions:network.assumptions,trips:(network.trips ?? []).filter(trip => selectedRoute.legs.some(leg => leg.tripId === trip.id)).map(({id,headsign}) => ({id,headsign}))}};
  try { localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot)); toast('Journey guidance saved on this device. Timetable times are not live.'); }
  catch { toast('Could not save guidance on this device. Storage may be unavailable or full.'); }
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const string = value => typeof value === 'string' && value.length > 0;
    const seconds = value => Number.isFinite(value) && value >= 0;
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
    const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!object(saved) || saved.schemaVersion !== 1 || !object(saved.input) || !object(saved.network) || !object(saved.route) || !object(saved.manifest) || !string(saved.savedAt) || !Number.isFinite(Date.parse(saved.savedAt))) return null;
    const data = saved.network, route = saved.route, input = saved.input, metadata = saved.manifest;
    if (!['stations','stops','routes','transfers'].every(key => Array.isArray(data[key])) || !data.stations.length || !object(data.coverage) || !date(data.coverage.startDate) || !date(data.coverage.endDate) || !string(data.timeZone)) return null;
    new Intl.DateTimeFormat('en',{timeZone:data.timeZone});
    if (!['stations','stops','routes'].every(key => data[key].every(item => object(item) && string(item.id) && string(item.name)))) return null;
    const stations = new Set(data.stations.map(item => item.id)), stops = new Set(data.stops.map(item => item.id)), routes = new Set(data.routes.map(item => item.id));
    if (stations.size !== data.stations.length || stops.size !== data.stops.length || routes.size !== data.routes.length) return null;
    if (data.stops.some(stop => !stations.has(stop.stationId)) || data.transfers.some(edge => !object(edge) || !stops.has(edge.fromStopId) || !stops.has(edge.toStopId) || !seconds(edge.seconds) || !seconds(edge.walkSeconds))) return null;
    if (data.trips !== undefined && (!Array.isArray(data.trips) || data.trips.some(trip => !object(trip) || !string(trip.id)))) return null;
    if (!stations.has(input.originId) || !stations.has(input.destinationId) || !date(input.date) || !time(input.departureTime) || (input.deadlineTime && (!time(input.deadlineTime) || !date(input.deadlineDate))) || !seconds(input.walkingLimitMinutes) || !seconds(input.maxExtraMinutes) || !['fastest','fewer-transfers','less-walking','quieter'].includes(input.preference)) return null;
    if (!string(route.id) || !['departureSeconds','arrivalSeconds','totalSeconds','accessSeconds','waitSeconds','rideSeconds','transferSeconds','transferWalkSeconds','exitSeconds','walkingSeconds','transfers'].every(key => seconds(route[key])) || route.arrivalSeconds - route.departureSeconds !== route.totalSeconds) return null;
    if (route.accessSeconds + route.waitSeconds + route.rideSeconds + route.transferSeconds + route.exitSeconds !== route.totalSeconds || route.accessSeconds + route.transferWalkSeconds + route.exitSeconds !== route.walkingSeconds) return null;
    if (!Array.isArray(route.assumptions) || route.assumptions.some(item => typeof item !== 'string') || !Array.isArray(route.legs) || !route.legs.length) return null;
    let last = route.departureSeconds;
    for (const leg of route.legs) {
      if (!object(leg) || !['access','wait','ride','transfer','exit'].includes(leg.type) || !['startSeconds','endSeconds','durationSeconds'].every(key => seconds(leg[key])) || leg.startSeconds !== last || leg.endSeconds - leg.startSeconds !== leg.durationSeconds) return null;
      if ((leg.fromStopId !== undefined && !stops.has(leg.fromStopId)) || (leg.toStopId !== undefined && !stops.has(leg.toStopId))) return null;
      if (leg.type === 'ride' && (!routes.has(leg.routeId) || !date(leg.serviceDate) || !string(leg.tripId) || !Array.isArray(leg.stopIds) || leg.stopIds.some(id => !stops.has(id)))) return null;
      last = leg.endSeconds;
    }
    if (last !== route.arrivalSeconds || metadata.schemaVersion !== 1 || !string(metadata.buildId) || !object(metadata.source) || !object(metadata.completeness) || !object(metadata.rules)) return null;
    if (!Array.isArray(metadata.routes) || metadata.routes.some(item => !object(item))) return null;
    for (const key of ['excludedRoutes','excludedStops','excludedTrips']) if (metadata.completeness[key] !== undefined && (!Array.isArray(metadata.completeness[key]) || metadata.completeness[key].some(item => !object(item)))) return null;
    if (metadata.completeness.limitations !== undefined && !Array.isArray(metadata.completeness.limitations)) return null;
    if (metadata.rules.unsupportedConnections !== undefined && (!Array.isArray(metadata.rules.unsupportedConnections) || metadata.rules.unsupportedConnections.some(item => !object(item) || !string(item.station) || !Array.isArray(item.codes) || item.codes.some(code => !string(code))))) return null;
    return saved;
  } catch { return null; }
}

let toastTimer;
function toast(message) {
  const node = document.querySelector('#rail-toast');
  node.textContent = message; node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'),5000);
}
function renderConnection() {
  const node = document.querySelector('#connection-state');
  if (node) node.textContent = navigator.onLine ? '' : 'Offline · cached timetable only';
}

async function start() {
  shell();
  try {
    const responses = await Promise.all([fetch('/data/rail-network.json'),fetch('/data/rail-manifest.json')]);
    if (responses.some(response => !response.ok)) throw new Error('The network or import manifest is unavailable.');
    [network,manifest] = await Promise.all(responses.map(response => response.json()));
    if (network.schemaVersion !== 1 || !network.stations?.length || !network.trips?.length) throw new Error('Unsupported or empty routing data.');
    router = createRailRouter(network); makeLookup();
    const saved = readSaved();
    const input = saved && lookup.stations.has(saved.input.originId) && lookup.stations.has(saved.input.destinationId) ? saved.input : defaults();
    planningPreferences = legacyPlannerInput(input,planningPreferences);
    document.querySelector('#planner').innerHTML = formMarkup(input);
    bindForm(); renderCoverage();
    const load = document.querySelector('#load-state');
    load.className = 'coverage-banner';
    load.innerHTML = `<strong>${network.stations.length} stations · ${network.routes.length} rail service patterns</strong><span>Validated dates ${escape(network.coverage.startDate)} – ${escape(network.coverage.endDate)} · ${escape(sourceName())} snapshot</span>`;
    search();
    if (saved) {
      if (saved.manifest.buildId === manifest.buildId) {
        const matchingRoute = result?.status === 'ok' && result.routes.find(route => route.id === saved.route.id);
        if (matchingRoute) {
          selectedRoute = matchingRoute;
          renderResult({saved:true,savedAt:saved.savedAt});
        } else load.insertAdjacentHTML('afterend','<p class="notice">Your saved journey is unavailable for the current constraints. The results have been recalculated from the imported timetable.</p>');
      } else load.insertAdjacentHTML('afterend','<p class="notice">The imported timetable has changed since you saved your journey. These results have been recalculated; review the new times and coverage before saving again.</p>');
    }
  } catch (error) {
    const saved = readSaved();
    document.querySelector('#load-state').textContent = saved ? 'The routing timetable could not be loaded. Showing your saved guidance below; a new search requires the validated network.' : 'The routing timetable could not be loaded, and there is no usable saved journey. Reconnect and reload to load the validated network.';
    document.querySelector('#load-state').classList.add('error');
    if (saved) {
      network = saved.network; manifest = saved.manifest; submittedInput = saved.input; selectedRoute = saved.route;
      result = {status:'saved',routes:[selectedRoute]}; makeLookup();
      document.querySelector('#planner').innerHTML = formMarkup(submittedInput,true);
      datePickers?.destroy();
      datePickers = mountDatePickers(document.querySelector('#rail-form'));
      renderCoverage(); renderResult({saved:true,savedAt:saved.savedAt});
    } else {
      document.querySelector('#planner').innerHTML = '<h2 id="planner-title">Rail data unavailable</h2><p class="help">Coverage is not yet loaded, so station choices and routes cannot be verified.</p><button id="reload-data" class="primary" type="button">Reload timetable</button>';
      document.querySelector('#reload-data').addEventListener('click',() => location.reload());
      document.querySelector('#coverage').innerHTML = '<h2 id="coverage-title">Coverage unavailable</h2><p>The network and its source manifest must load together before a new journey can be planned.</p>';
    }
    console.warn('Rail timetable unavailable:',error.message);
  }
  companion=mountCompanion({getSelected:()=>dirty?null:({route:selectedRoute,input:submittedInput}),name:id=>lookup?.labels.get(id)??stopLabel(id),getPlaces:()=>network?.stations.map(s=>({id:s.id,label:s.name,lat:s.lat,lng:s.lon??s.lng,sourceId:'lta:'+s.id,stationId:s.id,coverage:'supported',accessibility:'unknown'}))??[],onSelectPlan:p=>{const f=document.querySelector('#rail-form');if(!f)return;planningPreferences=legacyPlannerInput({},p.preferences);f.elements.origin.value=stationLabel(p.origin.stationId??p.origin.id);f.elements.destination.value=stationLabel(p.destination.stationId??p.destination.id);f.elements.date.value=p.departureDate;f.elements.date.dispatchEvent(new Event('change',{bubbles:true}));f.elements.departureTime.value=p.departureTime;f.elements.deadlineTime.value='';for(const key of ['walkingLimitMinutes','preference','maxExtraMinutes'])if(p.preferences?.[key]!=null){const field=f.elements[key],value=String(p.preferences[key]);if(![...field.options].some(option=>option.value===value))field.add(new Option(value,value));field.value=value;}f.dispatchEvent(new Event('input'));f.scrollIntoView();},onEndpoint:(endpoint,place)=>{const f=document.querySelector('#rail-form');if(f){f.elements[endpoint].value=stationLabel(place.stationId??place.id);f.dispatchEvent(new Event('input'));}}});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

window.addEventListener('online',renderConnection);
window.addEventListener('offline',renderConnection);
start();
