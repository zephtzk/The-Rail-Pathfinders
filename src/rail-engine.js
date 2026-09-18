/**
 * Scheduled, station-to-station rail routing. No UI, geographic inference, live
 * predictions, or predefined journeys are used here. Times are local timetable
 * seconds relative to the query's civil midnight, including values above 86400.
 *
 * A multi-label connection scan retains arrival / boardings / walking Pareto
 * frontiers. A passenger may continue aboard a trip, but changing trains always
 * requires an imported transfer edge, including a same-platform change.
 */
const DAY = 86400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function civilDay(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return NaN;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value / 86400000 : NaN;
}
function dayString(day) { return new Date(day * 86400000).toISOString().slice(0, 10); }
function timeSeconds(time) {
  const match = typeof time === 'string' && TIME_RE.exec(time);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : NaN;
}
function indexById(items, kind) {
  if (!Array.isArray(items)) throw new Error(`Rail network ${kind} must be an array.`);
  const result = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || result.has(item.id)) throw new Error(`Missing or duplicate ${kind} identifier: ${item?.id}`);
    result.set(item.id, item);
  }
  return result;
}
function requireSeconds(value, context) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid nonnegative seconds for ${context}.`);
}
function dominates(a, b) { return a.time <= b.time && a.boardings <= b.boardings && a.walk <= b.walk; }
function insert(frontier, label) {
  if (frontier.some((other) => dominates(other, label))) return false;
  for (let i = frontier.length - 1; i >= 0; i--) if (dominates(label, frontier[i])) frontier.splice(i, 1);
  frontier.push(label);
  return true;
}
function append(previous, leg) { return { previous, leg }; }
function lowerBound(list, time) {
  let low = 0, high = list.length;
  while (low < high) { const mid = (low + high) >>> 1; if (list[mid].departure < time) low = mid + 1; else high = mid; }
  return low;
}
function activeOn(service, day, date) {
  if (Object.prototype.hasOwnProperty.call(service.exceptions || {}, date)) return service.exceptions[date] === true;
  return day >= civilDay(service.startDate) && day <= civilDay(service.endDate) && service.weekdays.includes(new Date(day * 86400000).getUTCDay());
}
function materialize(chain) {
  const legs = [];
  for (let node = chain; node; node = node.previous) legs.push(node.leg);
  legs.reverse();
  const merged = [];
  for (const leg of legs) {
    const previous = merged.at(-1);
    if (leg.type === 'ride' && previous?.type === 'ride' && previous.tripId === leg.tripId && previous.serviceDate === leg.serviceDate && previous.toStopId === leg.fromStopId) {
      previous.toStopId = leg.toStopId;
      previous.endSeconds = leg.endSeconds;
      previous.durationSeconds = previous.endSeconds - previous.startSeconds;
      previous.stopIds.push(...leg.stopIds.slice(1));
    } else merged.push({ ...leg, ...(leg.stopIds ? { stopIds: [...leg.stopIds] } : {}) });
  }
  return merged;
}

export function createRailRouter(network) {
  if (!network || network.schemaVersion !== 1) throw new Error('Unsupported rail network schema; expected schemaVersion 1.');
  const stations = indexById(network.stations, 'station');
  const stops = indexById(network.stops, 'stop');
  const routes = indexById(network.routes, 'route');
  const services = indexById(network.services, 'service');
  const trips = indexById(network.trips, 'trip');
  const stationStops = new Map([...stations.keys()].map((id) => [id, []]));
  const transferEdges = new Map([...stops.keys()].map((id) => [id, []]));
  const topology = new Map([...stops.keys()].map((id) => [id, new Set()]));
  const accessDefault = network.assumptions?.accessSeconds ?? 120;
  const exitDefault = network.assumptions?.exitSeconds ?? 120;
  requireSeconds(accessDefault, 'access allowance');
  requireSeconds(exitDefault, 'exit allowance');
  let maxTripSeconds = 0;
  for (const stop of stops.values()) {
    if (!stations.has(stop.stationId)) throw new Error(`Unknown station ${stop.stationId} for stop ${stop.id}.`);
    stationStops.get(stop.stationId).push(stop.id);
  }
  for (const station of stations.values()) {
    if (station.accessSeconds !== undefined) requireSeconds(station.accessSeconds, `station ${station.id} access`);
    if (station.exitSeconds !== undefined) requireSeconds(station.exitSeconds, `station ${station.id} exit`);
    if (station.stopIds && (station.stopIds.length !== stationStops.get(station.id).length || station.stopIds.some((id) => stops.get(id)?.stationId !== station.id))) throw new Error(`Inconsistent stop membership for station ${station.id}.`);
  }
  for (const service of services.values()) {
    if (!Number.isFinite(civilDay(service.startDate)) || !Number.isFinite(civilDay(service.endDate)) || service.startDate > service.endDate || !Array.isArray(service.weekdays) || service.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error(`Invalid calendar for service ${service.id}.`);
    for (const [date, active] of Object.entries(service.exceptions || {})) if (!Number.isFinite(civilDay(date)) || typeof active !== 'boolean') throw new Error(`Invalid calendar exception for service ${service.id}.`);
  }
  for (const trip of trips.values()) {
    if (!routes.has(trip.routeId) || !services.has(trip.serviceId)) throw new Error(`Unknown route or service for trip ${trip.id}.`);
    if (trip.directionId === undefined || trip.directionId === null) throw new Error(`Missing direction for trip ${trip.id}.`);
    if (!Array.isArray(trip.stopTimes) || trip.stopTimes.length < 2) throw new Error(`Trip ${trip.id} needs at least two stop times.`);
    let lastDeparture = -1;
    for (const [stopId, arrival, departure, pickup, dropOff] of trip.stopTimes) {
      if (!stops.has(stopId)) throw new Error(`Unknown stop ${stopId} in trip ${trip.id}.`);
      requireSeconds(arrival, `trip ${trip.id} arrival`);
      requireSeconds(departure, `trip ${trip.id} departure`);
      if (arrival < lastDeparture || departure < arrival) throw new Error(`Nonmonotonic stop times in trip ${trip.id}.`);
      if ((pickup !== undefined && typeof pickup !== 'boolean') || (dropOff !== undefined && typeof dropOff !== 'boolean')) throw new Error(`Pickup/drop-off flags must be booleans in trip ${trip.id}.`);
      lastDeparture = departure;
      maxTripSeconds = Math.max(maxTripSeconds, departure);
    }
    for (let i = 1; i < trip.stopTimes.length; i++) {
      if (trip.stopTimes[i][1] <= trip.stopTimes[i - 1][2]) throw new Error(`Trip ${trip.id} must have positive running time between stops.`);
      topology.get(trip.stopTimes[i - 1][0]).add(trip.stopTimes[i][0]);
    }
  }
  for (const edge of network.transfers || []) {
    if (!stops.has(edge.fromStopId) || !stops.has(edge.toStopId)) throw new Error('Transfer references an unknown stop.');
    requireSeconds(edge.seconds, 'transfer');
    requireSeconds(edge.walkSeconds, 'transfer walking');
    if (edge.walkSeconds > edge.seconds || !edge.provenance || edge.validated === false) throw new Error('A transfer needs provenance and a valid total/walking allowance.');
    transferEdges.get(edge.fromStopId).push(edge);
    topology.get(edge.fromStopId).add(edge.toStopId);
  }
  const coverage = { ...network.coverage, timeZone: network.timeZone, stationCount: stations.size, stopCount: stops.size, routeCount: routes.size, tripCount: trips.size };
  if (!Number.isFinite(civilDay(coverage.startDate)) || !Number.isFinite(civilDay(coverage.endDate)) || coverage.startDate > coverage.endDate) throw new Error('Rail network must declare valid service-date coverage.');
  const cachedDays = new Map();

  function dayConnections(day) {
    const date = dayString(day);
    if (cachedDays.has(date)) return cachedDays.get(date);
    const activeServices = new Set([...services.values()].filter((service) => activeOn(service, day, date)).map((service) => service.id));
    const connections = [];
    for (const trip of trips.values()) {
      if (!activeServices.has(trip.serviceId)) continue;
      for (let i = 1; i < trip.stopTimes.length; i++) {
        const from = trip.stopTimes[i - 1], to = trip.stopTimes[i];
        connections.push({ trip, index: i, from: from[0], to: to[0], departure: from[2], arrival: to[1], pickup: from[3] !== false, dropOff: to[4] !== false });
      }
    }
    connections.sort((a, b) => a.departure - b.departure || a.arrival - b.arrival || a.trip.id.localeCompare(b.trip.id) || a.index - b.index);
    if (cachedDays.size >= 8) cachedDays.delete(cachedDays.keys().next().value);
    cachedDays.set(date, connections);
    return connections;
  }

  function connected(originStops, destinationStops) {
    const seen = new Set(originStops), queue = [...originStops], targets = new Set(destinationStops);
    for (let i = 0; i < queue.length; i++) {
      if (targets.has(queue[i])) return true;
      for (const next of topology.get(queue[i])) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    return false;
  }

  function route(input = {}) {
    const started = performance.now();
    const errors = [];
    const diagnostics = { algorithm: 'Pareto connection scan', connectionsScanned: 0, labelsCreated: 0, serviceDates: [], elapsedMs: 0 };
    const result = (status, message, code = status, journeys = []) => {
      diagnostics.elapsedMs = performance.now() - started;
      return { status, errors: message ? [{ code, message }] : [], routes: journeys, recommended: status === 'ok' ? journeys[0] || null : null, coverage, diagnostics };
    };
    const originId = input.originId ?? input.origin;
    const destinationId = input.destinationId ?? input.destination;
    if (!stations.has(originId) || !stations.has(destinationId)) return result('unsupported-station', 'Choose both stations from the imported, validated rail coverage. Unlisted stations and address-to-address journeys are not supported.');
    const date = input.date, day = civilDay(date);
    const departure = timeSeconds(input.departureTime ?? input.departure);
    const walkingMinutes = Number(input.walkingLimitMinutes ?? input.walkingLimit ?? 20);
    const detourMinutes = Number(input.maxExtraMinutes ?? input.detourLimit ?? 15);
    const preference = input.preference ?? 'fastest';
    if (!Number.isFinite(day) || !Number.isFinite(departure)) errors.push('Use a valid service query date and a departure time in HH:MM format.');
    if (!Number.isFinite(walkingMinutes) || walkingMinutes < 0 || !Number.isFinite(detourMinutes) || detourMinutes < 0) errors.push('Walking and additional journey time limits must be nonnegative numbers.');
    if (!['fastest', 'fewer-transfers', 'less-walking', 'quieter'].includes(preference)) errors.push('Choose a supported routing preference.');
    let deadline = null;
    const deadlineTime = input.deadlineTime ?? input.deadline;
    if (deadlineTime !== undefined && deadlineTime !== null && deadlineTime !== '') {
      const deadlineDay = civilDay(input.deadlineDate || date), clock = timeSeconds(deadlineTime);
      deadline = (deadlineDay - day) * DAY + clock;
      if (!Number.isFinite(deadline) || deadline < departure) errors.push('The arrival deadline must be at or after departure. Set the deadline date explicitly for a journey after midnight.');
      if (deadline - departure > 2 * DAY) errors.push('Arrival deadlines more than 48 hours after departure are outside this planner’s search limit.');
    }
    const requestedHorizon = input.searchHorizonSeconds ?? 6 * 3600;
    if (!Number.isFinite(requestedHorizon) || requestedHorizon <= 0 || requestedHorizon > 2 * DAY) errors.push('Search horizon must be positive and no longer than 48 hours.');
    if (errors.length) return result('invalid-input', errors.join(' '));
    // Coverage describes service dates. A final service day's 24:xx trips remain
    // usable on the following civil date; no following service is invented.
    const firstCovered = civilDay(coverage.startDate), lastCovered = civilDay(coverage.endDate);
    const carryover = day > lastCovered && (day - lastCovered) * DAY + departure <= maxTripSeconds;
    if (day < firstCovered || (day > lastCovered && !carryover)) return result('unsupported-date', `The imported timetable covers service dates ${coverage.startDate} through ${coverage.endDate}. Select a supported date; no timetable is inferred outside that range.`);
    if (originId === destinationId) return result('same-station', 'Origin and destination are the same station; no rail journey is needed.');
    const origin = stations.get(originId), destination = stations.get(destinationId);
    const originStops = stationStops.get(originId), destinationStops = stationStops.get(destinationId);
    if (!connected(originStops, destinationStops)) return result('disconnected', 'These stations have no directed rail path connected by validated interchanges in the imported network. Nearby map lines or stations do not establish a connection.');
    const access = origin.accessSeconds ?? accessDefault, exit = destination.exitSeconds ?? exitDefault;
    const maxWalk = walkingMinutes * 60;
    if (access + exit > maxWalk) return result('no-feasible', `The assumed station access and exit alone require ${(access + exit) / 60} minutes of walking, exceeding the ${walkingMinutes}-minute limit.`, 'walking-limit');
    const horizon = departure + Math.max(requestedHorizon, deadline === null ? 0 : deadline - departure);
    diagnostics.searchEndSeconds = horizon;
    diagnostics.carryoverOnly = carryover;
    const connections = [];
    // Query coverage can begin on the import date while a source calendar has
    // already begun. Its previous service day's 24:xx trips are still real.
    const oldest = day - Math.floor(maxTripSeconds / DAY);
    const newest = Math.min(lastCovered, day + Math.floor(horizon / DAY));
    for (let serviceDay = oldest; serviceDay <= newest; serviceDay++) {
      const offset = (serviceDay - day) * DAY;
      const scheduled = dayConnections(serviceDay);
      let used = false;
      for (let i = lowerBound(scheduled, departure - offset); i < scheduled.length; i++) {
        const connection = scheduled[i];
        if (connection.departure + offset > horizon) break;
        if (connection.arrival + offset + exit > horizon) continue;
        connections.push({ ...connection, departure: connection.departure + offset, arrival: connection.arrival + offset, serviceDate: dayString(serviceDay), occurrence: `${serviceDay}:${connection.trip.id}` });
        used = true;
      }
      if (used) diagnostics.serviceDates.push(dayString(serviceDay));
    }
    connections.sort((a, b) => a.departure - b.departure || a.arrival - b.arrival || a.occurrence.localeCompare(b.occurrence) || a.index - b.index);
    if (!connections.length) return result('no-service', 'No scheduled rail services operate in the searched time window on the covered service calendars. The last service may already have departed.', 'no-scheduled-service');
    const ready = new Map([...stops.keys()].map((id) => [id, []]));
    const arrived = new Map([...stops.keys()].map((id) => [id, []]));
    const aboard = new Map();
    const targetSet = new Set(destinationStops);
    const candidates = [];
    let boardingsAtOrigin = 0;

    function considerDestination(label) {
      if (!targetSet.has(label.stop) || label.boardings === 0 || label.time + exit > horizon || label.walk + exit > maxWalk) return;
      insert(candidates, { ...label, time: label.time + exit, walk: label.walk + exit, chain: append(label.chain, { type: 'exit', fromStopId: label.stop, toStopId: label.stop, startSeconds: label.time, endSeconds: label.time + exit, durationSeconds: exit, walkingSeconds: exit, assumed: true }) });
    }
    function relaxTransfers(startLabel) {
      const queue = [startLabel];
      for (let i = 0; i < queue.length; i++) {
        const label = queue[i];
        for (const edge of transferEdges.get(label.stop)) {
          const time = label.time + edge.seconds, walk = label.walk + edge.walkSeconds;
          if (time + exit > horizon || walk + exit > maxWalk) continue;
          const next = { ...label, stop: edge.toStopId, time, walk, chain: append(label.chain, { type: 'transfer', fromStopId: edge.fromStopId, toStopId: edge.toStopId, startSeconds: label.time, endSeconds: time, durationSeconds: edge.seconds, walkingSeconds: edge.walkSeconds, allowanceSeconds: edge.seconds - edge.walkSeconds, provenance: edge.provenance, assumed: edge.assumed === true }) };
          if (insert(ready.get(next.stop), next)) { diagnostics.labelsCreated++; queue.push(next); considerDestination(next); }
        }
      }
    }
    for (const stop of originStops) {
      const initial = { stop, time: departure + access, walk: access, boardings: 0, chain: append(null, { type: 'access', fromStopId: stop, toStopId: stop, startSeconds: departure, endSeconds: departure + access, durationSeconds: access, walkingSeconds: access, assumed: true }) };
      ready.get(stop).push(initial);
      relaxTransfers(initial);
    }
    for (const connection of connections) {
      diagnostics.connectionsScanned++;
      const { trip } = connection;
      const continuing = (aboard.get(connection.occurrence) || []).filter((label) => label.segment === connection.index - 1);
      const choices = [];
      for (const label of continuing) insert(choices, label);
      if (connection.pickup) for (const label of ready.get(connection.from)) {
        if (label.time > connection.departure) continue;
        if (label.boardings === 0) boardingsAtOrigin++;
        const chain = label.time < connection.departure ? append(label.chain, { type: 'wait', fromStopId: connection.from, toStopId: connection.from, startSeconds: label.time, endSeconds: connection.departure, durationSeconds: connection.departure - label.time }) : label.chain;
        insert(choices, { ...label, time: connection.departure, boardings: label.boardings + 1, chain, segment: connection.index - 1, newlyBoarded: true });
      }
      const riding = [];
      for (const label of choices) {
        const start = label.newlyBoarded ? connection.departure : label.time;
        const next = { stop: connection.to, time: connection.arrival, walk: label.walk, boardings: label.boardings, segment: connection.index, chain: append(label.chain, { type: 'ride', fromStopId: connection.from, toStopId: connection.to, startSeconds: start, endSeconds: connection.arrival, durationSeconds: connection.arrival - start, tripId: trip.id, routeId: trip.routeId, serviceId: trip.serviceId, serviceDate: connection.serviceDate, directionId: trip.directionId, headsign: trip.headsign, stopIds: [connection.from, connection.to] }) };
        insert(riding, next);
      }
      aboard.set(connection.occurrence, riding);
      if (connection.dropOff) for (const label of riding) {
        considerDestination(label);
        if (insert(arrived.get(label.stop), label)) { diagnostics.labelsCreated++; relaxTransfers(label); }
      }
    }
    diagnostics.boardingsFromOrigin = boardingsAtOrigin;
    if (!candidates.length) {
      if (!boardingsAtOrigin) return result('no-service', 'No train can be boarded from this origin after its station access allowance in the searched window. Check the service date, departure time, or last train.', 'no-origin-service');
      return result('no-feasible', 'No journey satisfies the walking limit and validated interchange times within the search window. A connection may be missed, require more walking, or have no remaining service.');
    }
    const journeys = candidates.map((label) => {
      const legs = materialize(label.chain);
      const sum = (type, key = 'durationSeconds') => legs.filter((leg) => leg.type === type).reduce((value, leg) => value + (leg[key] || 0), 0);
      const rideLegs = legs.filter((leg) => leg.type === 'ride');
      const assumptions = [
        `Station access: ${access} seconds; station exit: ${exit} seconds. These are station-level allowances, not validated address or entrance walking routes.`,
        ...legs.filter((leg) => leg.type === 'transfer' && leg.assumed).map((leg) => `Assumed transfer allowance ${leg.fromStopId} → ${leg.toStopId}: ${leg.durationSeconds} seconds total, including ${leg.walkingSeconds} seconds walking.`),
      ];
      if (preference === 'quieter') assumptions.push('Comparable measured crowding is unavailable; quieter preference falls back to fastest arrival without claiming a quieter train.');
      return {
        id: rideLegs.map((leg) => `${leg.serviceDate}/${leg.tripId}/${leg.fromStopId}/${leg.toStopId}`).join('|'),
        originId, destinationId, date, departureSeconds: departure, arrivalSeconds: label.time, totalSeconds: label.time - departure,
        accessSeconds: sum('access'), waitSeconds: sum('wait'), rideSeconds: sum('ride'), transferSeconds: sum('transfer'), transferWalkSeconds: sum('transfer', 'walkingSeconds'), exitSeconds: sum('exit'), walkingSeconds: label.walk, transfers: Math.max(0, label.boardings - 1),
        deadlineSeconds: deadline, deadlineMet: deadline === null || label.time <= deadline, deadlineBufferSeconds: deadline === null ? null : deadline - label.time,
        crowding: null, legs, assumptions, preferenceScore: 0,
      };
    });
    journeys.sort((a, b) => a.arrivalSeconds - b.arrivalSeconds || a.transfers - b.transfers || a.walkingSeconds - b.walkingSeconds || a.id.localeCompare(b.id));
    const timely = deadline === null ? journeys : journeys.filter((journey) => journey.deadlineMet);
    if (!timely.length) return result('deadline', `No feasible rail journey meets the arrival deadline. The earliest feasible arrival is ${Math.floor(journeys[0].arrivalSeconds / DAY) ? `day +${Math.floor(journeys[0].arrivalSeconds / DAY)} ` : ''}${String(Math.floor(journeys[0].arrivalSeconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(journeys[0].arrivalSeconds / 60) % 60).padStart(2, '0')}.`, 'impossible-deadline', journeys);
    const earliest = timely[0].arrivalSeconds;
    const acceptable = timely.filter((journey) => journey.arrivalSeconds <= earliest + detourMinutes * 60);
    const key = preference === 'fewer-transfers' ? 'transfers' : preference === 'less-walking' ? 'walkingSeconds' : 'arrivalSeconds';
    acceptable.sort((a, b) => a[key] - b[key] || a.arrivalSeconds - b.arrivalSeconds || a.transfers - b.transfers || a.walkingSeconds - b.walkingSeconds || a.id.localeCompare(b.id));
    for (const journey of acceptable) journey.preferenceScore = journey[key];
    return result('ok', null, null, acceptable);
  }

  return { route, coverage };
}
