import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailRouter } from '../src/rail-engine.js';

const sec = (hhmm) => { const [hour, minute] = hhmm.split(':').map(Number); return hour * 3600 + minute * 60; };
const st = (id, time, pickup = true, dropOff = true) => [id, sec(time), sec(time), pickup, dropOff];
const makeTrip = (id, routeId, directionId, times, serviceId = 'daily') => ({ id, routeId, serviceId, directionId, headsign: times.at(-1)[0], stopTimes: times });
function referenceNetwork() {
  const membership = { A: ['a'], X: ['xr', 'xb'], Y: ['yb', 'yg'], D: ['d'], U: ['u'], V: ['v'] };
  const stations = Object.entries(membership).map(([id, stopIds]) => ({ id, name: `Station ${id}`, lat: 1, lon: 103, stopIds }));
  const stops = stations.flatMap((station) => station.stopIds.map((id) => ({ id, stationId: station.id, name: id, lat: 1, lon: 103 })));
  return {
    schemaVersion: 1, timeZone: 'Asia/Singapore', stations, stops,
    routes: ['red', 'blue', 'green', 'direct'].map((id) => ({ id, name: id, shortName: id, color: '112233' })),
    services: [{ id: 'daily', startDate: '2026-09-01', endDate: '2026-09-30', weekdays: [0, 1, 2, 3, 4, 5, 6], exceptions: {} }],
    trips: [
      makeTrip('red-out', 'red', 0, [st('a', '08:05'), st('xr', '08:15')]),
      makeTrip('blue-out', 'blue', 0, [st('xb', '08:20'), st('yb', '08:30')]),
      makeTrip('green-out', 'green', 0, [st('yg', '08:35'), st('d', '08:45')]),
      makeTrip('direct-out', 'direct', 0, [st('a', '08:10'), st('d', '08:55')]),
      makeTrip('green-back', 'green', 1, [st('d', '09:05'), st('yg', '09:15')]),
      makeTrip('blue-back', 'blue', 1, [st('yb', '09:20'), st('xb', '09:30')]),
      makeTrip('red-back', 'red', 1, [st('xr', '09:35'), st('a', '09:45')]),
      makeTrip('isolated', 'red', 0, [st('u', '08:05'), st('v', '08:15')]),
    ],
    transfers: [
      { fromStopId: 'xr', toStopId: 'xb', seconds: 240, walkSeconds: 180, provenance: 'reference:independently-specified-x-connection', assumed: true },
      { fromStopId: 'xb', toStopId: 'xr', seconds: 240, walkSeconds: 180, provenance: 'reference:independently-specified-x-connection', assumed: true },
      { fromStopId: 'yb', toStopId: 'yg', seconds: 180, walkSeconds: 120, provenance: 'reference:independently-specified-y-connection', assumed: true },
      { fromStopId: 'yg', toStopId: 'yb', seconds: 180, walkSeconds: 120, provenance: 'reference:independently-specified-y-connection', assumed: true },
    ],
    coverage: { startDate: '2026-09-01', endDate: '2026-09-30' },
    assumptions: { accessSeconds: 120, exitSeconds: 120 },
  };
}
const query = { originId: 'A', destinationId: 'D', date: '2026-09-18', departureTime: '08:00', deadlineTime: '10:00', walkingLimitMinutes: 12, preference: 'fastest', maxExtraMinutes: 15 };
const clone = (value) => structuredClone(value);

test('reference arithmetic: two interchanges, all five journey components, exact arrival', () => {
  const result = createRailRouter(referenceNetwork()).route(query);
  assert.equal(result.status, 'ok');
  const route = result.recommended;
  // Independent timetable calculation: 08:00 + 2 access + 3 wait + 10 red
  // + 4 interchange + 1 wait + 10 blue + 3 interchange + 2 wait + 10 green
  // + 2 exit = 08:47. Walking is 2 + 3 + 2 + 2 = 9 minutes.
  assert.equal(route.arrivalSeconds, sec('08:47'));
  assert.equal(route.totalSeconds, 47 * 60);
  assert.equal(route.accessSeconds, 120);
  assert.equal(route.waitSeconds, 6 * 60);
  assert.equal(route.rideSeconds, 30 * 60);
  assert.equal(route.transferSeconds, 7 * 60);
  assert.equal(route.exitSeconds, 120);
  assert.equal(route.walkingSeconds, 9 * 60);
  assert.equal(route.transferWalkSeconds, 5 * 60);
  assert.equal(route.transfers, 2);
  assert.equal(route.totalSeconds, route.accessSeconds + route.waitSeconds + route.rideSeconds + route.transferSeconds + route.exitSeconds);
  assert.equal(route.legs.reduce((total, leg) => total + leg.durationSeconds, 0), route.totalSeconds);
  assert.equal(route.assumptions.filter((text) => text.startsWith('Assumed transfer')).length, 2);
  for (let i = 1; i < route.legs.length; i++) assert.equal(route.legs[i].startSeconds, route.legs[i - 1].endSeconds);
  assert.deepEqual(route.legs.filter((leg) => leg.type === 'ride').map((leg) => leg.tripId), ['red-out', 'blue-out', 'green-out']);
});

test('same connected reference network routes in the opposite direction with two transfers', () => {
  const result = createRailRouter(referenceNetwork()).route({ ...query, originId: 'D', destinationId: 'A', departureTime: '09:00' });
  assert.equal(result.status, 'ok');
  assert.equal(result.recommended.arrivalSeconds, sec('09:47'));
  assert.equal(result.recommended.transfers, 2);
  assert.ok(result.recommended.legs.filter((leg) => leg.type === 'ride').every((leg) => leg.directionId === 1));
});

test('preferences select nondominated alternatives inside the additional-time limit', () => {
  const router = createRailRouter(referenceNetwork());
  for (const preference of ['fewer-transfers', 'less-walking']) {
    const route = router.route({ ...query, preference }).recommended;
    assert.equal(route.transfers, 0);
    assert.equal(route.arrivalSeconds, sec('08:57'));
    assert.equal(route.walkingSeconds, 4 * 60);
    assert.equal(router.route({ ...query, preference, maxExtraMinutes: 9 }).recommended.transfers, 2);
  }
  const quieter = router.route({ ...query, preference: 'quieter' }).recommended;
  assert.equal(quieter.arrivalSeconds, sec('08:47'));
  assert.equal(quieter.crowding, null);
  assert.ok(quieter.assumptions.some((text) => text.includes('crowding is unavailable')));
});

test('walking bound is inclusive and includes station access and exit', () => {
  const router = createRailRouter(referenceNetwork());
  assert.equal(router.route({ ...query, walkingLimitMinutes: 9 }).recommended.transfers, 2);
  assert.equal(router.route({ ...query, walkingLimitMinutes: 8 }).recommended.transfers, 0);
  assert.equal(router.route({ ...query, walkingLimitMinutes: 3 }).status, 'no-feasible');
});

test('nearby or co-station platforms never create a transfer edge', () => {
  const network = referenceNetwork();
  network.trips = network.trips.filter((trip) => trip.routeId !== 'direct');
  network.transfers = [];
  assert.equal(createRailRouter(network).route(query).status, 'disconnected');
});

test('minimum interchange time prevents boarding before the full allowance finishes', () => {
  const network = referenceNetwork();
  network.transfers.find((edge) => edge.fromStopId === 'xr').seconds = 6 * 60;
  const result = createRailRouter(network).route(query);
  assert.equal(result.recommended.transfers, 0);
  assert.equal(result.recommended.arrivalSeconds, sec('08:57'));
  network.trips = network.trips.filter((trip) => trip.routeId !== 'direct');
  assert.equal(createRailRouter(network).route(query).status, 'no-feasible');
});

test('a train change on one stop requires an explicit same-stop allowance', () => {
  const network = referenceNetwork();
  network.trips = [
    makeTrip('first', 'red', 0, [st('a', '08:05'), st('xr', '08:15')]),
    makeTrip('second', 'red', 0, [st('xr', '08:16'), st('d', '08:26')]),
  ];
  network.transfers = [];
  assert.equal(createRailRouter(network).route(query).status, 'no-feasible');
  network.transfers.push({ fromStopId: 'xr', toStopId: 'xr', seconds: 60, walkSeconds: 0, provenance: 'reference:validated-same-platform', assumed: true });
  assert.equal(createRailRouter(network).route(query).recommended.arrivalSeconds, sec('08:28'));
  network.transfers[0].seconds = 61;
  assert.equal(createRailRouter(network).route(query).status, 'no-feasible');
});

test('remaining aboard preserves dwell, direction, pickup/dropoff restrictions and one boarding', () => {
  const network = referenceNetwork();
  network.transfers = [];
  network.trips = [makeTrip('through', 'red', 0, [st('a', '08:05'), ['xr', sec('08:15'), sec('08:18'), false, false], st('d', '08:28')])];
  const router = createRailRouter(network);
  const route = router.route(query).recommended;
  assert.equal(route.transfers, 0);
  assert.equal(route.rideSeconds, 23 * 60);
  assert.equal(route.arrivalSeconds, sec('08:30'));
  assert.deepEqual(route.legs.find((leg) => leg.type === 'ride').stopIds, ['a', 'xr', 'd']);
  assert.equal(router.route({ ...query, originId: 'X', departureTime: '08:10' }).status, 'no-service');
  assert.equal(router.route({ ...query, destinationId: 'X' }).status, 'no-feasible');
});

test('calendar weekdays and added / cancelled exceptions control service', () => {
  const network = referenceNetwork();
  network.services[0].weekdays = [1, 2, 3, 4, 5];
  network.services[0].exceptions = { '2026-09-18': false, '2026-09-19': true };
  const router = createRailRouter(network);
  assert.equal(router.route(query).status, 'no-service');
  assert.equal(router.route({ ...query, date: '2026-09-19' }).status, 'ok');
  assert.equal(router.route({ ...query, date: '2026-09-20' }).status, 'no-service');
  assert.equal(router.route({ ...query, date: '2026-09-21' }).status, 'ok');
});

test('previous service day after-midnight trips use that day’s calendar and identity', () => {
  const network = referenceNetwork();
  network.services[0].exceptions = { '2026-09-19': false };
  network.trips = [makeTrip('late', 'red', 0, [st('a', '24:10'), st('d', '24:35')])];
  const result = createRailRouter(network).route({ ...query, date: '2026-09-19', departureTime: '00:00', deadlineTime: '01:00' });
  assert.equal(result.status, 'ok');
  assert.equal(result.recommended.arrivalSeconds, sec('00:37'));
  assert.equal(result.recommended.legs.find((leg) => leg.type === 'ride').serviceDate, '2026-09-18');
});

test('first supported civil date still uses a preceding raw calendar service day', () => {
  const network = referenceNetwork();
  network.coverage.startDate = '2026-09-18';
  network.trips = [makeTrip('late', 'red', 0, [st('a', '24:10'), st('d', '24:35')])];
  const router = createRailRouter(network);
  const result = router.route({ ...query, departureTime: '00:00', deadlineTime: '01:00' });
  assert.equal(result.status, 'ok');
  assert.equal(result.recommended.legs.find((leg) => leg.type === 'ride').serviceDate, '2026-09-17');
  assert.equal(router.route({ ...query, date: '2026-09-17' }).status, 'unsupported-date');
});

test('explicit next-day deadline permits boarding the next service day', () => {
  const network = referenceNetwork();
  network.trips = [makeTrip('early', 'red', 0, [st('a', '00:10'), st('d', '00:35')])];
  const router = createRailRouter(network);
  const result = router.route({ ...query, departureTime: '23:55', deadlineTime: '01:00', deadlineDate: '2026-09-19' });
  assert.equal(result.status, 'ok');
  assert.equal(result.recommended.arrivalSeconds, sec('24:37'));
  assert.equal(result.recommended.legs.find((leg) => leg.type === 'ride').serviceDate, '2026-09-19');
  assert.equal(router.route({ ...query, departureTime: '23:55', deadlineTime: '01:00' }).status, 'invalid-input');
});

test('last imported service day retains its midnight spillover without inventing next-day service', () => {
  const network = referenceNetwork();
  network.trips = [makeTrip('late', 'red', 0, [st('a', '24:10'), st('d', '24:35')])];
  const router = createRailRouter(network);
  const result = router.route({ ...query, date: '2026-10-01', departureTime: '00:00', deadlineTime: '01:00' });
  assert.equal(result.status, 'ok');
  assert.equal(result.diagnostics.carryoverOnly, true);
  assert.equal(result.recommended.legs.find((leg) => leg.type === 'ride').serviceDate, '2026-09-30');
  assert.equal(router.route({ ...query, date: '2026-10-01', departureTime: '08:00' }).status, 'unsupported-date');
});

test('last-service misses, disconnected stations, unsupported dates and stations are explicit', () => {
  const router = createRailRouter(referenceNetwork());
  assert.equal(router.route({ ...query, departureTime: '10:30', deadlineTime: '12:00' }).status, 'no-service');
  assert.equal(router.route({ ...query, destinationId: 'U' }).status, 'disconnected');
  assert.equal(router.route({ ...query, destinationId: 'unknown' }).status, 'unsupported-station');
  assert.equal(router.route({ ...query, date: '2027-01-01' }).status, 'unsupported-date');
  assert.equal(router.route({ ...query, destinationId: 'A' }).status, 'same-station');
});

test('deadline includes exit time; late candidates are explained and never recommended', () => {
  const router = createRailRouter(referenceNetwork());
  assert.equal(router.route({ ...query, deadlineTime: '08:47' }).status, 'ok');
  const late = router.route({ ...query, deadlineTime: '08:46' });
  assert.equal(late.status, 'deadline');
  assert.equal(late.recommended, null);
  assert.equal(late.routes[0].deadlineMet, false);
  assert.match(late.errors[0].message, /08:47/);
  assert.equal(router.route({ ...query, deadlineTime: '08:00' }).status, 'deadline');
  assert.equal(router.route({ ...query, deadlineTime: '08:50', preference: 'fewer-transfers' }).recommended.transfers, 2);
});

test('invalid civil dates, time strings, bounds and preferences do not silently normalize', () => {
  const router = createRailRouter(referenceNetwork());
  for (const patch of [{ date: '2026-02-30' }, { departureTime: '24:00' }, { deadlineTime: 'garbage' }, { walkingLimitMinutes: -1 }, { walkingLimitMinutes: NaN }, { maxExtraMinutes: -1 }, { searchHorizonSeconds: Infinity }, { preference: 'teleport' }]) assert.equal(router.route({ ...query, ...patch }).status, 'invalid-input');
});

test('network ingestion fails early for invalid IDs, times, direction or interchange provenance', () => {
  for (const mutate of [
    (network) => network.stops.push(clone(network.stops[0])),
    (network) => { network.trips[0].stopTimes[0][0] = 'missing'; },
    (network) => { network.trips[0].stopTimes[1][1] = 0; },
    (network) => { delete network.trips[0].directionId; },
    (network) => { network.transfers[0].validated = false; },
    (network) => { delete network.transfers[0].provenance; },
    (network) => { network.transfers[0].walkSeconds = 999; },
  ]) { const network = referenceNetwork(); mutate(network); assert.throws(() => createRailRouter(network)); }
});

test('router is deterministic, preserves source data, and reuses service-date indexes', () => {
  const network = referenceNetwork(), original = clone(network), router = createRailRouter(network);
  const first = router.route(query), second = router.route(query);
  assert.deepEqual(first.routes, second.routes);
  assert.deepEqual(network, original);
  assert.ok(second.diagnostics.connectionsScanned > 0);
  assert.ok(second.diagnostics.elapsedMs >= 0);
});
