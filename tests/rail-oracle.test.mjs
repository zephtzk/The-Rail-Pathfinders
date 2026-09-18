import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailRouter } from '../src/rail-engine.js';

// Independent, deliberately slow event-state shortest-path oracle. It expands
// every possible boarding and onboard event instead of scanning connections or
// sharing the production engine's Pareto frontiers. Integer walking resources
// are part of the state, so a later arrival with less walking stays distinct.
function oracle(network, query) {
  const start = 8 * 3600, end = start + query.searchHorizonSeconds;
  const exit = network.assumptions.exitSeconds, limit = query.walkingLimitMinutes * 60;
  const states = [], best = new Map();
  const key = (state) => state.kind === 'ready' ? `ready:${state.stop}:${state.walk}` : `aboard:${state.trip}:${state.index}:${state.walk}`;
  const offer = (state) => {
    if (state.time + exit > end || state.walk + exit > limit) return;
    const id = key(state);
    if ((best.get(id) ?? Infinity) <= state.time) return;
    best.set(id, state.time); states.push(state);
  };
  offer({ kind: 'ready', stop: 'p0', walk: network.assumptions.accessSeconds, time: start + network.assumptions.accessSeconds });
  let arrival = Infinity;
  while (states.length) {
    states.sort((a, b) => b.time - a.time);
    const current = states.pop();
    if (best.get(key(current)) !== current.time) continue;
    if (current.kind === 'ready') {
      for (const edge of network.transfers.filter((edge) => edge.fromStopId === current.stop)) offer({ ...current, stop: edge.toStopId, time: current.time + edge.seconds, walk: current.walk + edge.walkSeconds });
      for (let trip = 0; trip < network.trips.length; trip++) {
        const times = network.trips[trip].stopTimes;
        for (let index = 0; index < times.length - 1; index++) {
          if (times[index][0] !== current.stop || times[index][3] === false || times[index][2] < current.time) continue;
          offer({ kind: 'aboard', trip, index: index + 1, time: times[index + 1][1], walk: current.walk });
        }
      }
    } else {
      const times = network.trips[current.trip].stopTimes, stop = times[current.index];
      if (stop[4] !== false) {
        if (stop[0] === 'p5') arrival = Math.min(arrival, current.time + exit);
        for (const edge of network.transfers.filter((edge) => edge.fromStopId === stop[0])) offer({ kind: 'ready', stop: edge.toStopId, time: current.time + edge.seconds, walk: current.walk + edge.walkSeconds });
      }
      if (current.index + 1 < times.length) offer({ ...current, index: current.index + 1, time: times[current.index + 1][1] });
    }
  }
  return arrival;
}

function randomNetwork(seed) {
  let value = seed;
  const rand = (max) => { value = (Math.imul(1664525, value) + 1013904223) >>> 0; return value % max; };
  const stations = [0, 1, 2, 4, 5].map((id) => ({ id: `s${id}`, name: `Station ${id}`, stopIds: id === 2 ? ['p2', 'p3'] : [`p${id}`] }));
  const stops = stations.flatMap((station) => station.stopIds.map((id) => ({ id, stationId: station.id })));
  const transfers = stops.map((stop) => ({ fromStopId: stop.id, toStopId: stop.id, seconds: 30 + rand(4) * 30, walkSeconds: 0, provenance: 'reference same-platform constraint', assumed: true }));
  transfers.push(...[['p2', 'p3'], ['p3', 'p2']].map(([fromStopId, toStopId]) => ({ fromStopId, toStopId, seconds: 60 + rand(4) * 30, walkSeconds: 60, provenance: 'reference verified-platform connection', assumed: true })));
  const trips = [];
  for (let i = 0; i < 35; i++) {
    const stopTimes = [];
    let time = 8 * 3600 + rand(45) * 60, previous = -1;
    const size = 2 + rand(4);
    for (let index = 0; index < size; index++) {
      let stop = rand(6);
      if (stop === previous) stop = (stop + 1) % 6;
      const dwell = rand(3) * 30;
      stopTimes.push([`p${stop}`, time, time + dwell, rand(5) !== 0, rand(5) !== 0]);
      time += dwell + 60 + rand(5) * 30;
      previous = stop;
    }
    trips.push({ id: `t${i}`, routeId: 'r', serviceId: 'daily', directionId: rand(2), stopTimes });
  }
  return {
    schemaVersion: 1, timeZone: 'Asia/Singapore', stations, stops, routes: [{ id: 'r', name: 'Reference rail' }], trips, transfers,
    services: [{ id: 'daily', startDate: '2026-09-18', endDate: '2026-09-18', weekdays: [5], exceptions: {} }],
    coverage: { startDate: '2026-09-18', endDate: '2026-09-18' }, assumptions: { accessSeconds: 60, exitSeconds: 60 },
  };
}

test('100 seeded event networks agree with an independent earliest-arrival oracle', () => {
  const input = { originId: 's0', destinationId: 's5', date: '2026-09-18', departureTime: '08:00', searchHorizonSeconds: 3600, preference: 'fastest', walkingLimitMinutes: 4 };
  for (let seed = 1; seed <= 100; seed++) {
    const network = randomNetwork(seed);
    const expected = oracle(network, input);
    const actual = createRailRouter(network).route(input);
    assert.equal(actual.recommended?.arrivalSeconds ?? Infinity, expected, `Event network seed ${seed}, engine status ${actual.status}`);
    if (actual.recommended) {
      assert.equal(actual.recommended.totalSeconds, actual.recommended.legs.reduce((sum, leg) => sum + leg.durationSeconds, 0));
      assert.ok(actual.recommended.walkingSeconds <= input.walkingLimitMinutes * 60);
    }
  }
});
