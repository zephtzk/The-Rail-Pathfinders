import {icon} from './icons.js';
import {railBadgeStyle} from './rail-service-style.js';

// Presentation only. Canonical steps/legs, checkpoint indices and stop IDs are never
// changed here: rerouting and detours still consume the original accepted route.
const LINE_NAMES = Object.freeze({
  CC:'Circle Line', CCL:'Circle Line', EW:'East West Line', EWL:'East West Line',
  NS:'North South Line', NSL:'North South Line', NE:'North East Line', NEL:'North East Line',
  DT:'Downtown Line', DTL:'Downtown Line', TE:'Thomson-East Coast Line', TEL:'Thomson-East Coast Line',
  BP:'Bukit Panjang LRT', PG:'Punggol LRT', SK:'Sengkang LRT',
});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = value => Number.isFinite(value) && value >= 0;
const sourceOf = step => step?.source ?? step ?? {};
const typeOf = step => step?.type ?? sourceOf(step).type;
const stepsOf = route => Array.isArray(route?.steps) ? route.steps : route?.legs ?? [];

export function publicStationLabel(value) {
  return String(value ?? '')
    .replace(/\b((?:CC|CE|EW|CG|NS|NE|DT|TE|BP|SE|SW|PE|PW|JS|JE|JW)\d+)_[A-Z0-9]+\b/g, '$1')
    .replace(/\bbus:(\d{5})\b/g, '$1');
}

export function publicLineName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Train';
  return LINE_NAMES[raw.split('_')[0]] ?? raw.replaceAll('_', ' ');
}

/** Humanise saved labels too, including plans received without the network loaded. */
export function publicInstruction(value) {
  return publicStationLabel(value)
    .replace(/\b(?:CCL(?:_[A-Z0-9]+)*|EWL(?:_[A-Z0-9]+)*|NSL|NEL|DTL|TEL)\b/g, publicLineName)
    .replace(/\b(CC|EW|NS|NE|DT|TE) Line\b/g, (_, line) => publicLineName(line));
}

function endpoint(step, end, name) {
  const source = sourceOf(step), key = end === 'from' ? 'fromStopId' : 'toStopId';
  if(source[end+'Label'])return publicStationLabel(source[end+'Label']);
  const id = step?.[key] ?? source[key] ?? source.stops?.[end === 'from' ? 0 : source.stops.length - 1];
  if (id && name) {
    const resolved = name(id);
    if (resolved && resolved !== id) return publicStationLabel(resolved);
  }
  // routeFromLegacy persists the original names in text, so saved/shared plans do
  // not become anonymous platform codes when the receiver has no name resolver.
  const pair = String(step?.text ?? source.text ?? '').match(/^[^:]+:\s*(.+?)\s*→\s*(.+)$/);
  if (pair) return publicStationLabel(pair[end === 'from' ? 1 : 2]);
  return publicStationLabel(id ?? step?.stationId ?? source.station ?? 'this stop');
}

function service(step) {
  const source = sourceOf(step);
  return source.mode === 'bus' || source.serviceNo ? `Bus ${source.serviceNo ?? source.serviceId ?? ''}`.trim()
    : publicLineName(source.routeId ?? source.line);
}

function adjacentRide(steps, index, direction) {
  for (let i = index + direction; i >= 0 && i < steps.length; i += direction) {
    if (typeOf(steps[i]) === 'ride') return steps[i];
  }
  return null;
}

function sameNamedPlace(from, to) {
  const withoutCode = label => label.replace(/\s*\((?:(?:CC|CE|EW|CG|NS|NE|DT|TE|BP|SE|SW|PE|PW)\d+|\d{5})\)\s*$/, '').trim();
  return withoutCode(from) === withoutCode(to);
}

function transferLabel(step, {name, steps, index}) {
  const from = endpoint(step, 'from', name), to = endpoint(step, 'to', name);
  const before = adjacentRide(steps, index, -1), after = adjacentRide(steps, index, 1);
  const change = before && after ? `${service(before)} → ${service(after)}` : after ? `to ${service(after)}` : 'connections';
  // A same-station transfer remains a transfer, even between identical public
  // station labels, platforms or two buses at one physical stop.
  return sameNamedPlace(from, to) ? `Change ${change} at ${from}` : `Walk from ${from} to ${to}${after ? ` · change to ${service(after)}` : ''}`;
}

export function itineraryStepLabel(step, {name, steps = [], index = steps.indexOf(step)} = {}) {
  if (!step) return '';
  const type = typeOf(step), source = sourceOf(step);
  // Authored facility/rehearsal instructions contain meaningful directions that
  // should not be reconstructed from absent platform endpoints.
  if (!source.fromStopId && !step.fromStopId && (step.text || source.text)) return publicInstruction(step.text ?? source.text);
  const from = endpoint(step, 'from', name), to = endpoint(step, 'to', name);
  const busStop = String(step.fromStopId ?? source.fromStopId ?? '').startsWith('bus:');
  if (type === 'access') return `Start at ${to}${busStop ? ' bus stop' : ' · follow signs to your platform'}`;
  if (type === 'wait') {
    const next = adjacentRide(steps, index, 1);
    return `Wait at ${from}${next ? ` for ${service(next)}` : ' for your connection'}`;
  }
  if (type === 'ride') return `Ride ${service(step)} from ${from} to ${to}`;
  if (type === 'transfer') return transferLabel(step, {name, steps, index});
  if (type === 'exit') return busStop ? `Finish at ${from} bus stop` : `Leave the station at ${from}`;
  if (type === 'walk') return `Walk from ${from} to ${to}`;
  return publicInstruction(step.text ?? source.text ?? `${from} → ${to}`);
}

function atOneStop(step) {
  const source = sourceOf(step), from = step.fromStopId ?? source.fromStopId, to = step.toStopId ?? source.toStopId;
  return from && from === to ? from : null;
}

function secondsOf(step) {
  const source = sourceOf(step);
  return finite(step.durationSeconds) ? step.durationSeconds : finite(source.durationSeconds) ? source.durationSeconds
    : finite(source.minutes) ? (source.minutes + (source.delay ?? 0)) * 60 : null;
}

function timesOf(step, cursor) {
  const source = sourceOf(step), durationSeconds = secondsOf(step);
  const startSeconds = finite(source.startSeconds) ? source.startSeconds : finite(source.start) ? source.start * 60 : cursor;
  const endSeconds = finite(source.endSeconds) ? source.endSeconds : finite(source.end) ? source.end * 60
    : finite(startSeconds) && finite(durationSeconds) ? startSeconds + durationSeconds : null;
  return {startSeconds, endSeconds, durationSeconds};
}

/** Every original index occurs exactly once in the returned canonicalIndices. */
export function itineraryDisplay(route, {name} = {}) {
  const steps = stepsOf(route), groups = [];
  let cursor = finite(route?.departureSeconds) ? route.departureSeconds : null;
  steps.forEach((step, index) => {
    const source = sourceOf(step), type = typeOf(step), times = timesOf(step, cursor);
    cursor = times.endSeconds;
    const label = itineraryStepLabel(step, {name, steps, index});
    const phase = {stepIndex:index, type:type ?? 'instruction', label, ...times, assumed:source.assumed === true};
    const previous = groups.at(-1), stop = atOneStop(step);
    // Only waiting at the very same canonical stop can join access or a real
    // transfer. Never collapse rides, transfers or the separate alighting/exit.
    const canGroup = type === 'wait' && stop && previous && ['access','wait','transfer'].includes(previous.kind)
      && previous.toStopId === stop && (previous.kind === 'transfer' || previous.fromStopId === stop);
    if (canGroup) {
      previous.canonicalIndices.push(index);
      previous.endIndex = index;
      previous.endSeconds = times.endSeconds;
      previous.durationSeconds = finite(previous.durationSeconds) && finite(times.durationSeconds) ? previous.durationSeconds + times.durationSeconds : null;
      previous.phases.push(phase);
      return;
    }
    const from = endpoint(step, 'from', name), to = endpoint(step, 'to', name);
    const badge = type === 'ride' ? service(step) : null;
    groups.push({
      kind:type ?? 'instruction', canonicalIndices:[index], startIndex:index, endIndex:index,
      fromStopId:step.fromStopId ?? source.fromStopId ?? null, toStopId:step.toStopId ?? source.toStopId ?? null,
      from, to, title:label, badge, icon:type === 'ride' ? source.mode === 'bus' ? 'bus' : 'train' : type === 'transfer' ? 'transfer' : type === 'wait' ? 'clock' : type === 'walk' ? 'walk' : 'pin',
      lineTone:type === 'ride' ? toneFor(service(step)) : '',
      serviceStyle:type === 'ride' && source.mode !== 'bus' && !source.serviceNo ? railBadgeStyle(source.routeId ?? source.line) : '',
      timing:source.timing ?? null, ...times, phases:[phase],
    });
  });
  for (const group of groups) {
    if (group.kind === 'access' && group.phases.length > 1) group.title = `Start at ${group.to}`;
  }
  return groups;
}

/** Collapse cosmetic phases without moving a confirmed position to another leg. */
export function checkpointChoices(route, {name, currentStepIndex = null} = {}) {
  return itineraryDisplay(route, {name}).map(group => {
    const stepIndex = group.canonicalIndices.includes(currentStepIndex) ? currentStepIndex : group.startIndex;
    let label = group.title;
    if (group.kind === 'access' || group.kind === 'wait') label = `At ${group.to} · before boarding`;
    if (group.kind === 'ride') label = `On ${group.badge} · ${group.from} → ${group.to}`;
    if (group.kind === 'exit') label = `At ${group.from} · ${String(group.fromStopId).startsWith('bus:') ? 'off the bus' : 'leaving the station'}`;
    return {label, stepIndex, canonicalIndices:[...group.canonicalIndices], kind:group.kind === 'ride' ? 'onboard' : 'checkpoint'};
  });
}

/** Current phase remains precise; Next moves to the next display group only. */
export function itineraryGuidance(route, {name, currentStepIndex = 0} = {}) {
  const steps = stepsOf(route), groups = itineraryDisplay(route, {name});
  const groupIndex = groups.findIndex(group => group.canonicalIndices.includes(currentStepIndex));
  if (groupIndex < 0) return {current:'Confirm your current step', next:'Choose the step you have reached'};
  return {
    current:itineraryStepLabel(steps[currentStepIndex], {name, steps, index:currentStepIndex}),
    next:groups[groupIndex + 1]?.title ?? 'Confirm arrival when you have reached your destination',
  };
}

function toneFor(label) {
  return ({'Circle Line':'circle','East West Line':'eastwest','North South Line':'northsouth','North East Line':'northeast','Downtown Line':'downtown','Thomson-East Coast Line':'thomson'})[label]
    ?? (label.startsWith('Bus ') ? 'bus' : 'other');
}

function clock(seconds) {
  if (!finite(seconds)) return '';
  const days = Math.floor(seconds / 86400);
  return `${String(Math.floor(seconds / 3600) % 24).padStart(2,'0')}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}${days ? ` (+${days} day${days > 1 ? 's' : ''})` : ''}`;
}

function duration(seconds) {
  if (!finite(seconds)) return 'Timing unavailable';
  const rounded = Math.round(seconds), minutes = Math.floor(rounded / 60), remainder = rounded % 60;
  return [minutes ? `${minutes} min` : '', remainder || !minutes ? `${remainder} sec` : ''].filter(Boolean).join(' ');
}

/** Escaped HTML with native detail controls; the caller loads itinerary-display.css. */
export function renderItineraryTimeline(route, {name, currentStepIndex = null} = {}) {
  const groups = itineraryDisplay(route, {name});
  if (!groups.length) return '<p class="field-note">Journey directions are unavailable.</p>';
  return `<ol class="transit-timeline" aria-label="Journey timeline">${groups.map(group => {
    const current = group.canonicalIndices.includes(currentStepIndex);
    const timing = `${clock(group.startSeconds)}${finite(group.endSeconds) ? `–${clock(group.endSeconds)}` : ''}`;
    const details = group.phases.length > 1 || group.phases.some(phase => phase.assumed);
    return `<li class="timeline-leg timeline-${esc(group.kind)}${current ? ' is-current' : ''}" data-step-indices="${group.canonicalIndices.join(',')}"${current ? ' aria-current="step"' : ''}>
      <span class="timeline-marker${group.serviceStyle ? ' rail-service-fill' : ''}"${group.serviceStyle ? ` style="${group.serviceStyle}"` : ''} aria-hidden="true">${icon(group.icon,20)}</span>
      <div class="timeline-content">${group.badge ? `<span class="transit-badge line-${group.lineTone}${group.serviceStyle ? ' rail-service-fill' : ''}"${group.serviceStyle ? ` style="${group.serviceStyle}"` : ''}>${esc(group.badge)}</span>` : ''}
      <p class="timeline-title">${esc(group.kind === 'ride' ? `${group.from} → ${group.to}` : group.title)}</p>
      <p class="timeline-time">${esc(timing)}${timing ? ' · ' : ''}${esc(duration(group.durationSeconds))}${group.timing === 'frequency-estimated' ? ' · estimated' : ''}</p>
      ${details ? `<details class="timeline-phases"><summary>${group.phases.length > 1 ? 'Walking & waiting time' : 'Timing details'}</summary><ul>${group.phases.map(phase => `<li><span>${esc(phase.label)}</span><span>${esc(duration(phase.durationSeconds))}${phase.assumed ? ' · allowance' : ''}</span></li>`).join('')}</ul></details>` : ''}
      </div></li>`;
  }).join('')}</ol>`;
}
