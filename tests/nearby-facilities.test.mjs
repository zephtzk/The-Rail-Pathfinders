import test from 'node:test';
import assert from 'node:assert/strict';
import {NEARBY_RADIUS_METERS, nearbyFacilities, formatFacilityDistance, nearbyFacilityStatus} from '../src/nearby-facilities-model.js';
import {normalizeFacilitiesMaintenance, createFacilityAdapter} from '../server/facility-adapter.js';
import {FIXTURE_LAYOUT, COVERAGE_REGISTRY} from '../src/facility-data.js';

const now = Date.parse('2026-09-19T04:00:00Z');
const iso = value => new Date(value).toISOString();
const center = {lat: 1.3, lng: 103.85};
const lift = {id: 'mapped-lift', name: 'Station lift', kind: 'lift', providerLiftId: 'B1L01', stationCode: 'EW12', position: center};
const toilet = {id: 'toilet', name: 'Toilet', kind: 'toilet', position: center};
const snapshot = (records = [], options = {}) => ({...normalizeFacilitiesMaintenance({value: records}), fetchedAt: iso(now), ...options});
const maintenance = {StationCode: 'EW12', LiftID: 'B1L01'};
const status = (facility = lift, feed = snapshot(), options = {}) => nearbyFacilityStatus(facility, feed, {now, ...options});

test('nearby discovery uses an inclusive fixed 1 km radius and sorts distances without changing input', () => {
  assert.equal(NEARBY_RADIUS_METERS, 1000);
  const atDistance = (id, meters) => ({...toilet, id, position: {lat: center.lat + meters / 6371000 * 180 / Math.PI, lng: center.lng}});
  const entries = [atDistance('outside', 1000.01), atDistance('far', 999.99), atDistance('near', 50), {...lift}];
  const before = structuredClone(entries);
  const result = nearbyFacilities(entries, center);
  assert.deepEqual(result.map(item => item.id), ['mapped-lift', 'near', 'far']);
  assert.ok(result[1].distanceMeters > 49.99 && result[1].distanceMeters < 50.01);
  assert.deepEqual(entries, before);
  assert.equal(nearbyFacilities([atDistance('edge', 1000)], center).length, 1);
  assert.equal(nearbyFacilities(entries, center, {radiusMeters: 0}).length, 1);
});

test('facility filtering accepts only lifts/toilets and validated numeric coordinates', () => {
  const invalid = [null, {...lift, kind: 'escalator'}, {...lift, position: null}, {...lift, position: {lat: '1.3', lng: 103.85}}, {...lift, position: {lat: 91, lng: 103.85}}, {...lift, position: {lat: 1.3, lng: Infinity}}];
  assert.deepEqual(nearbyFacilities(invalid, center), []);
  assert.deepEqual(nearbyFacilities([lift, toilet], center, {kind: 'toilet'}).map(item => item.id), ['toilet']);
  for (const invalidCenter of [null, {}, {lat: NaN, lng: 103.85}, {lat: 1.3, lng: 181}]) assert.deepEqual(nearbyFacilities([lift], invalidCenter), []);
  for (const radiusMeters of [-1, NaN, Infinity, '1000']) assert.deepEqual(nearbyFacilities([lift], center, {radiusMeters}), []);
});

test('fixtures are excluded even if coordinates are accidentally added to them', () => {
  const fixtures = [...FIXTURE_LAYOUT.facilities, ...FIXTURE_LAYOUT.toilets].map(item => ({...item, position: center}));
  for (const flags of [{fixture: true}, {verification: 'fixture'}, {evidence: 'fixture'}, {stationId: 'fixture-interchange'}, {coverage: 'fixture'}, {source: {verification: 'fixture'}}, {source: {name: 'Authored training fixture'}}]) fixtures.push({...lift, ...flags});
  assert.deepEqual(nearbyFacilities(fixtures, center), []);
  const real = COVERAGE_REGISTRY.stations.flatMap(station => station.toilets).map(item => ({...item, kind: 'toilet'}));
  assert.equal(nearbyFacilities(real, {lat: 1.3014362, lng: 103.8571167}).length, 1);
});

test('distance formatting is readable and never invents a distance for invalid input', () => {
  assert.equal(formatFacilityDistance(56.7), '57 m');
  assert.equal(formatFacilityDistance(1000), '1.0 km');
  for (const value of [NaN, -1, undefined, '50']) assert.equal(formatFacilityDistance(value), 'Distance unknown');
});

test('fresh exact station plus lift ID maintenance match is reported as unavailable', () => {
  const result = status(lift, snapshot([maintenance]));
  assert.equal(result.label, 'Reported maintenance');
  assert.equal(result.tone, 'unavailable');
  assert.equal(result.stale, false);
  assert.equal(result.sourceTime, null);
  assert.equal(result.fetchedAt, iso(now));
  assert.match(result.sourceUrl, /FacilitiesMaintenance$/);
});

test('a station or description alone never maps an outage to an arbitrary lift', () => {
  for (const entry of [{StationCode: 'EW12', LiftDesc: 'Station lift'}, {...maintenance, StationCode: 'EW13'}, {...maintenance, LiftID: 'different'}]) {
    const result = status(lift, snapshot([entry]));
    assert.notEqual(result.tone, 'unavailable');
    assert.notEqual(result.tone, 'available');
  }
  assert.match(status(lift, snapshot([{StationCode: 'EW12', LiftDesc: 'Station lift'}])).detail, /has not been matched/);
});

test('generic outdoor lifts cannot borrow a station feed status', () => {
  const result = status({...lift, stationCode: undefined, providerLiftId: undefined}, snapshot([maintenance]));
  assert.equal(result.label, 'Status unknown');
  assert.match(result.detail, /operation of this lift is unconfirmed/);
  assert.equal(result.fetchedAt, null);
});

test('station notices warn about unmatched lifts without declaring that lift unavailable', () => {
  const entranceLift = {...lift, providerLiftId: undefined, stationCode: 'DT14', stationCodes: ['DT14', 'EW12']};
  const result = status(entranceLift, snapshot([maintenance]));
  assert.equal(result.label, 'Station maintenance notice');
  assert.equal(result.tone, 'warning');
  assert.equal(result.stale, false);
  assert.match(result.detail, /operation is unknown/);
  assert.equal(result.fetchedAt, iso(now));
  assert.equal(status(entranceLift, snapshot([{...maintenance, StationCode: 'DT14', LiftID: null}])).label, 'Station maintenance notice');
  const stale = status(entranceLift, snapshot([maintenance]), {offline: true});
  assert.equal(stale.label, 'Last station notice · stale');
  assert.equal(stale.stale, true);
  assert.equal(stale.tone, 'warning');
});

test('secondary station codes cannot turn provider-ID coincidence into an exact lift match', () => {
  const entranceLift = {...lift, stationCode: 'DT14', stationCodes: ['DT14', 'EW12']};
  assert.equal(status(entranceLift, snapshot([maintenance])).label, 'Station maintenance notice');
  assert.equal(status(entranceLift, snapshot([{...maintenance, StationCode: 'DT14'}])).label, 'Reported maintenance');
});

test('fresh absence never means operating and partial results cannot establish absence', () => {
  assert.equal(status().label, 'Operation unconfirmed');
  assert.equal(status().tone, 'unknown');
  for (const options of [{status: 'partial'}, {complete: false}, {possiblyTruncated: true}, {invalidRecords: 1}]) {
    const result = status(lift, snapshot([], options));
    assert.equal(result.tone, 'unknown');
    assert.match(result.detail, /incomplete/);
  }
});

test('last lift maintenance remains unavailable when stale, offline or dated in the future', () => {
  for (const options of [{fetchedAt: iso(now - 900001)}, {fetchedAt: iso(now + 1)}, {fetchedAt: 'invalid'}, {status: 'unavailable', stale: true}, {status: 'partial'}, {sourceTime: iso(now + 1)}]) {
    const result = status(lift, snapshot([maintenance], options));
    assert.equal(result.tone, 'unavailable');
    assert.equal(result.stale, true);
    assert.match(result.label, /stale/);
  }
  assert.equal(status(lift, snapshot([maintenance]), {offline: true}).stale, true);
  assert.equal(status(lift, snapshot([maintenance], {fetchedAt: iso(now - 900000)})).stale, false);
});

test('empty expired, missing or future-dated feeds stay unknown and explicitly stale', () => {
  for (const fetchedAt of [iso(now - 900001), iso(now + 1), null, 'malformed']) {
    const result = status(lift, snapshot([], {fetchedAt}));
    assert.equal(result.label, 'Unknown / stale');
    assert.equal(result.stale, true);
  }
});

test('unconfigured and failed checks report unknown without replaying training data', () => {
  const unconfigured = status(lift, {status: 'unavailable', records: [], error: 'not_configured', fetchedAt: null});
  assert.match(unconfigured.detail, /unavailable on this installation/);
  assert.equal(unconfigured.tone, 'unknown');
  assert.equal(status(lift, {status: 'unavailable', error: 'network', records: []}).tone, 'unknown');
  assert.match(nearbyFacilityStatus(lift, null, {now}).detail, /not been checked/);
});

test('the real adapter retains last unavailable reports after upstream failure', async () => {
  let at = now, fail = false;
  const adapter = createFacilityAdapter({clock: () => at, fetcher: async () => fail ? new Response('', {status: 503}) : Response.json({value: [maintenance]})});
  const first = await adapter({LTA_ACCOUNT_KEY: 'test-key'});
  fail = true; at += 60001;
  const failed = await adapter({LTA_ACCOUNT_KEY: 'test-key'});
  const result = nearbyFacilityStatus(lift, failed, {now: at});
  assert.equal(result.tone, 'unavailable');
  assert.equal(result.stale, true);
  assert.equal(result.fetchedAt, first.fetchedAt);
});

test('toilets never inherit lift maintenance status or status from their location timestamp', () => {
  for (const feed of [snapshot([maintenance]), snapshot(), null]) {
    const result = status({...toilet, stationCode: 'EW12', providerLiftId: 'B1L01', source: {sourceTime: iso(now), checkedAt: iso(now)}}, feed);
    assert.equal(result.label, 'Availability unknown');
    assert.equal(result.tone, 'unknown');
    assert.equal(result.fetchedAt, null);
  }
  assert.match(status(toilet, snapshot(), {offline: true}).detail, /Offline/);
});

const report = options => ({status: 'verified-available', evidence: 'operator', fetchedAt: iso(now), sourceTime: iso(now), validUntil: iso(now + 60000), source: {url: 'https://example.org/operator-report'}, ...options});

test('only fresh explicitly sourced operator/survey reports may say reported operating or open', () => {
  assert.equal(status({...lift, report: report()}).label, 'Reported operating');
  assert.equal(status({...toilet, report: report({evidence: 'survey'})}).label, 'Reported open');
  for (const options of [{source: null}, {source: {url: 'javascript:alert(1)'}}, {evidence: 'fixture'}, {evidence: 'unverified'}]) {
    assert.equal(status({...toilet, report: report(options)}).label, 'Availability unknown');
  }
});

test('positive sourced reports expire and never remain operating offline or with malformed timestamps', () => {
  for (const options of [{validUntil: iso(now)}, {validUntil: 'invalid'}, {fetchedAt: iso(now + 1)}, {fetchedAt: iso(now - 900001)}, {sourceTime: null}, {sourceTime: iso(now + 1)}, {sourceTime: iso(now - 900001)}]) {
    const result = status({...toilet, report: report(options)});
    assert.equal(result.label, 'Unknown / stale');
    assert.equal(result.stale, true);
  }
  assert.equal(status({...toilet, report: report()}, snapshot(), {offline: true}).label, 'Unknown / stale');
});

test('sourced closures survive expiry and an exact maintenance report takes precedence over operating claims', () => {
  const result = status({...toilet, report: report({status: 'reported-unavailable', fetchedAt: iso(now - 3600000)})});
  assert.equal(result.tone, 'unavailable');
  assert.equal(result.stale, true);
  assert.equal(status({...lift, report: report()}, snapshot([maintenance])).label, 'Reported maintenance');
});
