import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_INCIDENTS_KEY, DEMO_INCIDENT_LIMIT, loadIncidentLog, createIncidentDraft,
  saveIncident, updateIncident, resolveIncident, clearIncidentLog,
} from '../src/demo-incidents.js';

const now = Date.parse('2026-09-19T09:00:00+08:00');
function setup(initial = null) {
  const values = new Map(initial === null ? [] : [[DEMO_INCIDENTS_KEY, initial]]);
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const eventTarget = new EventTarget(), events = [];
  eventTarget.addEventListener('demo:incidents-changed', event => events.push(event.detail));
  return {storage, eventTarget, now, values, events};
}
const draft = (scenario = 'planned') => createIncidentDraft(scenario, {now});

test('drafts use the Singapore day at UTC boundaries and keep the demo corridor explicit', () => {
  const planned = createIncidentDraft('planned', {now: Date.parse('2026-09-18T20:00:00Z')});
  assert.equal(planned.startsAt, '2026-09-19T08:00:00+08:00');
  assert.equal(planned.endsAt, '2026-09-19T10:00:00+08:00');
  assert.equal(planned.type, 'closure');
  assert.equal(planned.severity, 'severe');
  assert.equal(planned.from, 'EW8_A');
  assert.equal(planned.to, 'EW9_A');
  assert.match(planned.details, /Demo:.*not a live service notice/);
  const disruption = createIncidentDraft('disruption', {date: '2027-01-02'});
  assert.equal(disruption.type, 'delay');
  assert.equal(disruption.delayMinutes, 22);
  assert.equal(disruption.severity, 'major');
  assert.equal(disruption.startsAt, '2027-01-02T08:00:00+08:00');
  assert.throws(() => createIncidentDraft('live', {now}), /scenario/);
  assert.throws(() => createIncidentDraft('planned', {date: '2026-02-30'}), /valid Singapore/);
});

test('save persists only public incident fields and controls identity, demo provenance and lifecycle', () => {
  const opts = setup();
  const incident = saveIncident({...draft(), id: 'forged', schemaVersion: 9, demo: false, source: 'official', status: 'resolved', revision: 99, createdAt: 'forged', updatedAt: 'forged', resolvedAt: 'forged', trip: {home: 'Private address'}, coordinates: [1, 2]}, opts);
  assert.match(incident.id, /^demo-/);
  assert.equal(incident.schemaVersion, 1);
  assert.equal(incident.demo, true);
  assert.equal(incident.source, 'demo');
  assert.equal(incident.status, 'active');
  assert.equal(incident.revision, 1);
  assert.equal(incident.createdAt, '2026-09-19T09:00:00+08:00');
  assert.equal(incident.updatedAt, incident.createdAt);
  assert.equal(incident.resolvedAt, null);
  assert.equal('trip' in incident, false);
  assert.equal('coordinates' in incident, false);
  assert.deepEqual(loadIncidentLog(opts), [incident]);
  assert.deepEqual(opts.events, [{incidents: [incident]}]);
  assert.equal(JSON.parse(opts.values.get(DEMO_INCIDENTS_KEY)).schemaVersion, 1);
});

test('update preserves immutable identity and provenance, persists edits and increments revision', () => {
  const opts = setup(), original = saveIncident(draft(), opts);
  const updated = updateIncident(original.id, {title: '  Revised works  ', type: 'delay', delayMinutes: 7, id: 'forged', demo: false, source: 'live', status: 'resolved', revision: 888, createdAt: 'forged', resolvedAt: 'forged', privateTrip: 'secret'}, {...opts, now: now + 60000});
  assert.equal(updated.title, 'Revised works');
  assert.equal(updated.type, 'delay');
  assert.equal(updated.delayMinutes, 7);
  assert.equal(updated.id, original.id);
  assert.equal(updated.createdAt, original.createdAt);
  assert.equal(updated.updatedAt, '2026-09-19T09:01:00+08:00');
  assert.equal(updated.revision, 2);
  assert.equal(updated.status, 'active');
  assert.equal(updated.resolvedAt, null);
  assert.equal(updated.demo, true);
  assert.equal(updated.source, 'demo');
  assert.equal('privateTrip' in updated, false);
  assert.deepEqual(opts.events.at(-1), {incidents: [updated]});
});

test('resolve is persistent, idempotent and cannot be reversed by an ordinary edit', () => {
  const opts = setup(), saved = saveIncident(draft(), opts);
  const resolved = resolveIncident(saved.id, {...opts, now: now + 60000});
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.resolvedAt, '2026-09-19T09:01:00+08:00');
  assert.equal(resolved.revision, 2);
  assert.deepEqual(resolveIncident(saved.id, {...opts, now: now + 120000}), resolved);
  const edited = updateIncident(saved.id, {title: 'Works complete', status: 'active', resolvedAt: null}, {...opts, now: now + 180000});
  assert.equal(edited.status, 'resolved');
  assert.equal(edited.resolvedAt, resolved.resolvedAt);
  assert.equal(edited.revision, 3);
  assert.deepEqual(loadIncidentLog(opts), [edited]);
});

test('mutations load current stored data and do not discard another tab’s additions', () => {
  const opts = setup(), first = saveIncident(draft(), opts);
  const anotherTab = {...opts, eventTarget: new EventTarget()};
  const second = saveIncident(draft('disruption'), anotherTab);
  updateIncident(first.id, {title: 'Edited from the first tab'}, opts);
  assert.deepEqual(loadIncidentLog(opts).map(item => item.id), [first.id, second.id]);
  assert.equal(opts.events.at(-1).incidents.length, 2);
});

test('returned data and event data cannot modify the persisted incident log', () => {
  const opts = setup(), saved = saveIncident(draft(), opts);
  saved.title = 'Changed return value';
  opts.events[0].incidents[0].title = 'Changed event';
  const loaded = loadIncidentLog(opts);
  loaded[0].title = 'Changed loaded value';
  assert.equal(loadIncidentLog(opts)[0].title, 'Planned track works');
});

test('scope and type changes clear irrelevant segment IDs and delay values', () => {
  const opts = setup(), saved = saveIncident(draft('disruption'), opts);
  const changed = updateIncident(saved.id, {scope: 'service', service: '22', type: 'cancellation'}, opts);
  assert.equal(changed.from, '');
  assert.equal(changed.to, '');
  assert.equal(changed.delayMinutes, 0);
  assert.equal(changed.service, '22');
});

test('public bus routing IDs survive save, edit and load', () => {
  const opts = setup();
  const saved = saveIncident({...draft('disruption'), service: '36', from: 'bus:01012', to: 'bus:01013'}, opts);
  assert.equal(saved.from, 'bus:01012');
  assert.equal(saved.to, 'bus:01013');
  const edited = updateIncident(saved.id, {to: 'bus:01019'}, opts);
  assert.equal(edited.to, 'bus:01019');
  assert.deepEqual(loadIncidentLog(opts), [edited]);
  for (const from of ['bus:1234', 'bus:abcde', 'bus:01012:private']) {
    assert.throws(() => updateIncident(saved.id, {from}, opts), /public stop IDs/);
  }
});

test('invalid form data fails without writes or change events', () => {
  const invalid = [
    {scenario: 'real'}, {title: ''}, {title: 'x'.repeat(121)}, {details: 'x'.repeat(2001)},
    {type: 'flood'}, {severity: 'critical'}, {service: ''}, {service: '<script>'},
    {scope: 'route'}, {direction: 'up'}, {from: ''}, {to: 'EW8_A'}, {from: 'Private address'},
    {startsAt: '2026-02-30T08:00+08:00'}, {startsAt: '2026-09-19T24:00+08:00'},
    {startsAt: '2026-09-19T08:60+08:00'}, {startsAt: '2026-09-19T08:00:60+08:00'},
    {startsAt: '2026-09-19T08:00Z'}, {startsAt: '2026-09-19T08:00+09:00'},
    {startsAt: '2026-09-19T08:00'}, {endsAt: '2026-09-19T08:00+08:00'},
    {endsAt: '2026-09-18T10:00+08:00'}, {type: 'delay', delayMinutes: 0},
    {type: 'delay', delayMinutes: 181}, {type: 'delay', delayMinutes: 1.5}, {type: 'delay', delayMinutes: '22'},
  ];
  for (const patch of invalid) {
    const opts = setup();
    assert.throws(() => saveIncident({...draft(), ...patch}, opts), undefined, JSON.stringify(patch));
    assert.equal(opts.values.size, 0);
    assert.equal(opts.events.length, 0);
  }
});

test('valid leap dates, overnight times and minimum and maximum delays are accepted', () => {
  const opts = setup();
  const first = saveIncident({...draft('disruption'), startsAt: '2028-02-29T23:00+08:00', endsAt: '2028-03-01T01:00+08:00', delayMinutes: 1}, opts);
  assert.equal(first.startsAt, '2028-02-29T23:00:00+08:00');
  assert.equal(updateIncident(first.id, {delayMinutes: 180}, opts).delayMinutes, 180);
});

test('corrupt and future schema logs load safely but are preserved on every mutation', () => {
  for (const raw of ['{broken', JSON.stringify({schemaVersion: 2, incidents: []}), JSON.stringify({schemaVersion: 1, incidents: [{}]})]) {
    const opts = setup(raw);
    assert.deepEqual(loadIncidentLog(opts), []);
    for (const mutate of [() => saveIncident(draft(), opts), () => updateIncident('id', {title: 'edit'}, opts), () => resolveIncident('id', opts), () => clearIncidentLog(opts)]) {
      assert.throws(mutate, /Existing data has been preserved/);
      assert.equal(opts.values.get(DEMO_INCIDENTS_KEY), raw);
    }
    assert.equal(opts.events.length, 0);
  }
});

test('stored live provenance, duplicate IDs and invalid lifecycle cannot be laundered into demo data', () => {
  const originalOpts = setup(), saved = saveIncident(draft(), originalOpts);
  for (const incidents of [[{...saved, demo: false}], [{...saved, source: 'official'}], [saved, saved], [{...saved, revision: 0}], [{...saved, resolvedAt: saved.createdAt}], [{...saved, status: 'resolved', resolvedAt: null}], [{...saved, delayMinutes: 4}], [{...saved, privateTrip: 'Do not silently destroy unknown stored fields'}]]) {
    const raw = JSON.stringify({schemaVersion: 1, incidents}), opts = setup(raw);
    assert.deepEqual(loadIncidentLog(opts), []);
    assert.throws(() => saveIncident(draft(), opts), /preserved/);
    assert.equal(opts.values.get(DEMO_INCIDENTS_KEY), raw);
  }
});

test('blocked, full or silently failing storage never emits a successful change event', () => {
  const opts = setup();
  opts.storage.setItem = () => { throw Error('QuotaExceeded'); };
  assert.throws(() => saveIncident(draft(), opts), /Could not save/);
  assert.deepEqual(opts.events, []);
  opts.storage.setItem = () => {};
  assert.throws(() => saveIncident(draft(), opts), /Could not save/);
  assert.deepEqual(opts.events, []);
  opts.storage.getItem = () => { throw Error('SecurityError'); };
  assert.deepEqual(loadIncidentLog(opts), []);
  assert.throws(() => saveIncident(draft(), opts), /cannot be read/);
  assert.deepEqual(opts.events, []);
});

test('strict loading exposes corrupt or blocked storage to the UI while the default remains safe', () => {
  const corrupt = setup('{invalid');
  assert.deepEqual(loadIncidentLog(corrupt), []);
  assert.throws(() => loadIncidentLog({...corrupt, strict: true}), /Existing data has been preserved/);
  const blocked = setup();
  blocked.storage.getItem = () => { throw Error('SecurityError'); };
  assert.deepEqual(loadIncidentLog(blocked), []);
  assert.throws(() => loadIncidentLog({...blocked, strict: true}), /cannot be read/);
  assert.throws(() => loadIncidentLog({storage: {}, strict: true}), /storage is unavailable/);
  assert.deepEqual(loadIncidentLog({...setup(), strict: true}), []);
});

test('failed update validation and unknown incident IDs leave the log intact', () => {
  const opts = setup(), saved = saveIncident(draft(), opts), raw = opts.values.get(DEMO_INCIDENTS_KEY);
  assert.throws(() => updateIncident(saved.id, {to: saved.from}, opts), /different stops/);
  assert.throws(() => updateIncident('missing', {title: 'lost'}, opts), /no longer exists/);
  assert.throws(() => resolveIncident('missing', opts), /no longer exists/);
  assert.equal(opts.values.get(DEMO_INCIDENTS_KEY), raw);
  assert.equal(opts.events.length, 1);
});

test('clear persists an empty log and notifies consumers', () => {
  const opts = setup();
  saveIncident(draft(), opts);
  assert.deepEqual(clearIncidentLog(opts), []);
  assert.deepEqual(loadIncidentLog(opts), []);
  assert.deepEqual(opts.events.at(-1), {incidents: []});
  assert.deepEqual(JSON.parse(opts.values.get(DEMO_INCIDENTS_KEY)), {schemaVersion: 1, incidents: []});
});

test('the log has a fixed bound and does not evict existing incidents silently', () => {
  const opts = setup(), original = saveIncident(draft(), opts);
  const incidents = Array.from({length: DEMO_INCIDENT_LIMIT}, (_, index) => ({...original, id: `demo-${index}`}));
  const raw = JSON.stringify({schemaVersion: 1, incidents});
  opts.values.set(DEMO_INCIDENTS_KEY, raw);
  assert.equal(loadIncidentLog(opts).length, 100);
  assert.throws(() => saveIncident(draft(), opts), /log is full/);
  assert.equal(opts.values.get(DEMO_INCIDENTS_KEY), raw);
  assert.equal(opts.events.length, 1);
});

test('clock rollback does not invalidate existing records and function clocks are supported', () => {
  const opts = setup(), saved = saveIncident(draft(), {...opts, now: () => now});
  const resolved = resolveIncident(saved.id, {...opts, now: now - 60000});
  assert.equal(resolved.updatedAt, saved.updatedAt);
  assert.equal(resolved.resolvedAt, saved.updatedAt);
  assert.deepEqual(loadIncidentLog(opts), [resolved]);
});
