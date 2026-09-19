// Demo incidents are local authoring data. They must never impersonate a live feed.
export const DEMO_INCIDENTS_KEY = 'commute-copilot-demo-incidents-v1';
export const DEMO_INCIDENT_LIMIT = 100;

const SCHEMA_VERSION = 1;
const SINGAPORE_OFFSET = 8 * 60 * 60 * 1000;
const editableFields = ['scenario', 'title', 'type', 'severity', 'service', 'scope', 'from', 'to', 'direction', 'startsAt', 'endsAt', 'delayMinutes', 'details'];
const clone = value => structuredClone(value);
const emptyLog = () => ({schemaVersion: SCHEMA_VERSION, incidents: []});

function text(value, name, limit, required = true) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (required && !value.trim())) {
    throw Error(`${name} must be ${required ? 'a non-empty string' : 'text'} of at most ${limit} characters.`);
  }
  return value.trim();
}

function choice(value, values, name) {
  if (!values.includes(value)) throw Error(`Choose a valid ${name}.`);
  return value;
}

function singaporeTimestamp(value, name = 'Incident time') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?\+08:00$/.test(value)) {
    throw Error(`${name} must be a valid Singapore date and time with +08:00 offset.`);
  }
  const canonical = value.length === 22 ? `${value.slice(0, 16)}:00+08:00` : value;
  const stamp = Date.parse(canonical);
  if (!Number.isFinite(stamp) || new Date(stamp + SINGAPORE_OFFSET).toISOString().slice(0, 19) !== canonical.slice(0, 19)) {
    throw Error(`${name} must be a valid Singapore date and time.`);
  }
  return canonical;
}

function nowTimestamp(options) {
  const value = typeof options.now === 'function' ? options.now() : options.now ?? Date.now();
  const stamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(stamp) || !Number.isFinite(new Date(stamp + SINGAPORE_OFFSET).getTime())) throw Error('A valid current time is required.');
  const local = new Date(stamp + SINGAPORE_OFFSET).toISOString().slice(0, 19);
  return singaporeTimestamp(`${local}+08:00`, 'Current time');
}

function fields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Enter valid demo incident details.');
  const type = choice(input.type, ['closure', 'delay', 'cancellation'], 'incident type');
  const scope = choice(input.scope, ['service', 'segment'], 'route scope');
  const result = {
    scenario: choice(input.scenario, ['planned', 'disruption'], 'demo scenario'),
    title: text(input.title, 'Incident title', 120),
    type,
    severity: choice(input.severity, ['minor', 'major', 'severe'], 'severity'),
    service: text(input.service, 'Service', 40),
    scope,
    from: '',
    to: '',
    direction: choice(input.direction, ['both', 'forward', 'reverse'], 'direction'),
    startsAt: singaporeTimestamp(input.startsAt, 'Start time'),
    endsAt: singaporeTimestamp(input.endsAt, 'End time'),
    delayMinutes: 0,
    details: text(input.details ?? '', 'Incident details', 2000, false),
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9 /-]*$/.test(result.service)) throw Error('Enter a rail line or bus service code.');
  if (Date.parse(result.endsAt) <= Date.parse(result.startsAt)) throw Error('End time must be after start time.');
  if (scope === 'segment') {
    result.from = text(input.from, 'From stop ID', 64);
    result.to = text(input.to, 'To stop ID', 64);
    if (![result.from, result.to].every(value => /^(?:[A-Za-z0-9_-]+|bus:\d{5})$/.test(value))) throw Error('Use public stop IDs for the affected segment.');
    if (result.from === result.to) throw Error('Choose two different stops for the affected segment.');
  }
  if (type === 'delay') {
    if (!Number.isInteger(input.delayMinutes) || input.delayMinutes < 1 || input.delayMinutes > 180) throw Error('Delay must be a whole number from 1 to 180 minutes.');
    result.delayMinutes = input.delayMinutes;
  }
  return result;
}

function validateStoredIncident(value) {
  if (!value || value.schemaVersion !== SCHEMA_VERSION || value.demo !== true || value.source !== 'demo') throw Error('Invalid demo provenance.');
  const normalized = fields(value);
  if (editableFields.some(key => value[key] !== normalized[key])) throw Error('Invalid stored demo incident details.');
  const knownFields = [...editableFields, 'id', 'schemaVersion', 'demo', 'source', 'status', 'revision', 'createdAt', 'updatedAt', 'resolvedAt'];
  if (Object.keys(value).some(key => !knownFields.includes(key))) throw Error('Unrecognized stored demo incident details.');
  const id = text(value.id, 'Incident ID', 100);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !Number.isSafeInteger(value.revision) || value.revision < 1) throw Error('Invalid demo incident identity.');
  const status = choice(value.status, ['active', 'resolved'], 'incident status');
  const createdAt = singaporeTimestamp(value.createdAt, 'Creation time');
  const updatedAt = singaporeTimestamp(value.updatedAt, 'Update time');
  const resolvedAt = status === 'resolved' ? singaporeTimestamp(value.resolvedAt, 'Resolution time') : null;
  if (status === 'active' && value.resolvedAt !== null) throw Error('Invalid demo incident lifecycle.');
  if (Date.parse(updatedAt) < Date.parse(createdAt) || (resolvedAt && (Date.parse(resolvedAt) < Date.parse(createdAt) || Date.parse(resolvedAt) > Date.parse(updatedAt)))) throw Error('Invalid demo incident lifecycle.');
  return {id, schemaVersion: SCHEMA_VERSION, demo: true, source: 'demo', ...normalized, status, revision: value.revision, createdAt, updatedAt, resolvedAt};
}

function storageFor(options) {
  try {
    const storage = options.storage ?? globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw Error();
    return storage;
  } catch {
    throw Error('Demo incident storage is unavailable. Allow browser storage before saving incidents.');
  }
}

function readLog(options) {
  const storage = storageFor(options);
  try {
    const raw = storage.getItem(DEMO_INCIDENTS_KEY);
    if (raw === null) return {storage, state: emptyLog()};
    const value = JSON.parse(raw);
    if (!value || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.incidents) || value.incidents.length > DEMO_INCIDENT_LIMIT) throw Error();
    const incidents = value.incidents.map(validateStoredIncident);
    if (new Set(incidents.map(incident => incident.id)).size !== incidents.length) throw Error();
    return {storage, state: {schemaVersion: SCHEMA_VERSION, incidents}};
  } catch {
    throw Error('The demo incident log cannot be read. Existing data has been preserved; repair browser storage before changing it.');
  }
}

function notify(incidents, options) {
  const target = options.eventTarget ?? globalThis.window;
  if (!target?.dispatchEvent) return;
  const detail = {incidents: clone(incidents)};
  const EventClass = target.CustomEvent ?? globalThis.CustomEvent;
  if (EventClass) target.dispatchEvent(new EventClass('demo:incidents-changed', {detail}));
  else if (globalThis.Event) {
    const event = new Event('demo:incidents-changed');
    Object.defineProperty(event, 'detail', {value: detail});
    target.dispatchEvent(event);
  }
}

function mutate(options, apply) {
  const {storage, state} = readLog(options);
  const result = apply(state.incidents);
  // Validate the complete prospective log before touching persistent data.
  state.incidents = state.incidents.map(validateStoredIncident);
  const raw = JSON.stringify(state);
  try {
    storage.setItem(DEMO_INCIDENTS_KEY, raw);
    if (storage.getItem(DEMO_INCIDENTS_KEY) !== raw) throw Error();
  } catch {
    throw Error('Could not save the demo incident log. Browser storage may be full or blocked.');
  }
  notify(state.incidents, options);
  return clone(result);
}

function findIncident(incidents, id) {
  const incident = incidents.find(item => item.id === id);
  if (!incident) throw Error('This demo incident no longer exists. Reload the incident log.');
  return incident;
}

function nextTimestamp(incident, options) {
  const now = nowTimestamp(options);
  // A local clock adjustment must not make lifecycle timestamps inconsistent.
  return Date.parse(now) >= Date.parse(incident.updatedAt) ? now : incident.updatedAt;
}

export function loadIncidentLog(options = {}) {
  try { return clone(readLog(options).state.incidents); }
  catch (error) { if (options.strict) throw error; return []; }
}

export function createIncidentDraft(scenario, options = {}) {
  choice(scenario, ['planned', 'disruption'], 'demo scenario');
  const date = options.date ?? nowTimestamp(options).slice(0, 10);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Choose a valid Singapore incident date.');
  return fields({
    scenario,
    title: scenario === 'planned' ? 'Planned track works' : 'Disruption during travel',
    type: scenario === 'planned' ? 'closure' : 'delay',
    severity: scenario === 'planned' ? 'severe' : 'major',
    service: 'EW', scope: 'segment', from: 'EW8_A', to: 'EW9_A', direction: 'both',
    startsAt: `${date}T08:00:00+08:00`, endsAt: `${date}T10:00:00+08:00`,
    delayMinutes: scenario === 'planned' ? 0 : 22,
    details: scenario === 'planned'
      ? 'Demo: planned track works between Paya Lebar and Aljunied. This is an editable simulated incident, not a live service notice.'
      : 'Demo: a simulated 22-minute delay between Paya Lebar and Aljunied during travel. This is an editable simulated incident, not a live service notice.',
  });
}

export function saveIncident(input, options = {}) {
  const values = fields(input);
  const at = nowTimestamp(options);
  return mutate(options, incidents => {
    if (incidents.length >= DEMO_INCIDENT_LIMIT) throw Error(`The demo incident log is full (${DEMO_INCIDENT_LIMIT} incidents). Clear the log before adding another incident.`);
    const id = `demo-${globalThis.crypto.randomUUID()}`;
    const incident = {id, schemaVersion: SCHEMA_VERSION, demo: true, source: 'demo', ...values, status: 'active', revision: 1, createdAt: at, updatedAt: at, resolvedAt: null};
    incidents.push(incident);
    return incident;
  });
}

export function updateIncident(id, patch, options = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('Enter valid demo incident changes.');
  return mutate(options, incidents => {
    const incident = findIncident(incidents, id);
    const allowed = Object.fromEntries(editableFields.filter(key => Object.hasOwn(patch, key)).map(key => [key, patch[key]]));
    Object.assign(incident, fields({...incident, ...allowed}), {updatedAt: nextTimestamp(incident, options), revision: incident.revision + 1});
    return incident;
  });
}

export function resolveIncident(id, options = {}) {
  return mutate(options, incidents => {
    const incident = findIncident(incidents, id);
    if (incident.status !== 'resolved') {
      const at = nextTimestamp(incident, options);
      Object.assign(incident, {status: 'resolved', resolvedAt: at, updatedAt: at, revision: incident.revision + 1});
    }
    return incident;
  });
}

export function clearIncidentLog(options = {}) {
  return mutate(options, incidents => { incidents.splice(0); return []; });
}
