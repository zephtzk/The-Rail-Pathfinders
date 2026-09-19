import {createSearchArena} from './search-arena.js';
import {demoConnectionClosed} from './demo-closures.js';

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
function dominates(a, b) { return a.time <= b.time && a.boardings <= b.boardings && a.walk <= b.walk && (!a.externalSinceRide || b.externalSinceRide); }
function dominatedBy(frontier,time,boardings,walk,externalSinceRide) {
  for (let i=0,n=frontier.used ?? frontier.length;i<n;i++) {
    const other=frontier[i];
    if (other.time<=time && other.boardings<=boardings && other.walk<=walk && (!other.externalSinceRide || externalSinceRide)) return true;
  }
  return false;
}
function insert(frontier, label) {
  if (dominatedBy(frontier,label.time,label.boardings,label.walk,label.externalSinceRide)) return false;
  // Compact in stable order without a callback or an allocated splice result.
  let kept=0;
  const count=frontier.used ?? frontier.length;
  for (let i=0;i<count;i++) if (!dominates(label,frontier[i])) frontier[kept++]=frontier[i];
  frontier[kept++]=label;
  if (frontier.used === undefined) frontier.length=kept;
  else { for(let i=kept;i<count;i++) frontier[i]=null; frontier.used=kept; }
  return true;
}
function lowerBound(list, time, departureAt) {
  let low = 0, high = list.length;
  while (low < high) { const mid = (low + high) >>> 1; if (departureAt(list[mid]) < time) low = mid + 1; else high = mid; }
  return low;
}
function activeOn(service, day, date) {
  if (Object.prototype.hasOwnProperty.call(service.exceptions || {}, date)) return service.exceptions[date] === true;
  return day >= civilDay(service.startDate) && day <= civilDay(service.endDate) && service.weekdays.includes(new Date(day * 86400000).getUTCDay());
}
function materialize(chain,arena) {
  const legs = [];
  for (let node = chain; node; node = arena.previous(node)) legs.push(arena.leg(node));
  legs.reverse();
  const merged = [];
  for (let leg of legs) {
    // Search chains retain source references and indices, not repeated public
    // strings and intermediate-stop arrays for every provisional label.
    if (leg.type === 'bus-ride') {
      const {pattern,fromIndex,toIndex,startSeconds,endSeconds,serviceDate,boardingBasis,headwayField} = leg;
      const boarding=pattern.stops[fromIndex],alight=pattern.stops[toIndex];
      leg={type:'ride',mode:'bus',timing:'frequency-estimated',fromStopId:boarding.stopId,toStopId:alight.stopId,startSeconds,endSeconds,durationSeconds:endSeconds-startSeconds,
        tripId:`estimate:${pattern.id}:${fromIndex}:${startSeconds}`,routeId:pattern.id,serviceId:pattern.serviceNo,serviceNo:pattern.serviceNo,operator:pattern.operator,serviceDate,directionId:pattern.direction,
        boardingBasis,headwayField,patternId:pattern.id,fromSequence:boarding.sequence,toSequence:alight.sequence,visitNumber:boarding.visitNumber,headsign:pattern.destinationCode,stopIds:pattern.stops.slice(fromIndex,toIndex+1).map(s=>s.stopId)};
    } else if (leg.type === 'rail-ride') {
      const {trip,fromStopId,toStopId,startSeconds,endSeconds,serviceDate}=leg;
      leg={type:'ride',mode:'rail',timing:'scheduled',fromStopId,toStopId,startSeconds,endSeconds,durationSeconds:endSeconds-startSeconds,tripId:trip.id,routeId:trip.routeId,serviceId:trip.serviceId,serviceDate,directionId:trip.directionId,headsign:trip.headsign,stopIds:[fromStopId,toStopId]};
    }
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
  // Optional frequency edges are query-time estimates, never fabricated GTFS trips.
  const frequency = network.frequency;
  const busOccurrences = new Map();
  for (const pattern of frequency?.patterns ?? []) {
    for (let i = 0; i < pattern.stops.length - 1; i++) {
      const occurrence = pattern.stops[i];
      if (!stops.has(occurrence.stopId) || !stops.has(pattern.stops[i + 1].stopId)) throw Error('Unknown frequency stop');
      if (occurrence.distanceSegment !== pattern.stops[i + 1].distanceSegment) continue;
      if (!busOccurrences.has(occurrence.stopId)) busOccurrences.set(occurrence.stopId, []);
      busOccurrences.get(occurrence.stopId).push({pattern,index:i});
      topology.get(occurrence.stopId).add(pattern.stops[i + 1].stopId);
    }
  }
  const accessDefault = network.assumptions?.accessSeconds ?? 120;
  const exitDefault = network.assumptions?.exitSeconds ?? 120;
  requireSeconds(accessDefault, 'access allowance');
  requireSeconds(exitDefault, 'exit allowance');
  let maxTripSeconds = frequency?.maxServiceSeconds ?? 0;
  for (const stop of stops.values()) {
    if (!stations.has(stop.stationId)) throw new Error(`Unknown station ${stop.stationId} for stop ${stop.id}.`);
    stationStops.get(stop.stationId).push(stop.id);
  }
  for (const station of stations.values()) {
    if (station.accessSeconds !== undefined) requireSeconds(station.accessSeconds, `station ${station.id} access`);
    if (station.exitSeconds !== undefined) requireSeconds(station.exitSeconds, `station ${station.id} exit`);
    if (station.stopIds && (station.stopIds.length !== stationStops.get(station.id).length || station.stopIds.some((id) => stops.get(id)?.stationId !== station.id))) throw new Error(`Inconsistent stop membership for station ${station.id}.`);
    // Share an already validated, identically ordered immutable membership list.
    if (station.stopIds?.every((id,i)=>id===stationStops.get(station.id)[i])) stationStops.set(station.id,station.stopIds);
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
  // Packed source references avoid duplicating all connection fields for every
  // calendar combination. Source trips and stop times remain immutable.
  const tripList = [...trips.values()];
  const connectionCount = tripList.reduce((n,trip)=>n+trip.stopTimes.length-1,0);
  const connectionTrips = new Uint32Array(connectionCount), connectionSegments = new Uint32Array(connectionCount);
  const tripFirstConnection = new Uint32Array(tripList.length+1);
  let cursor=0;
  for (let t=0;t<tripList.length;t++) {
    tripFirstConnection[t]=cursor;
    for(let i=1;i<tripList[t].stopTimes.length;i++) { connectionTrips[cursor]=t;connectionSegments[cursor++]=i; }
  }
  tripFirstConnection[tripList.length]=cursor;
  const departureAt = id => tripList[connectionTrips[id]].stopTimes[connectionSegments[id]-1][2];
  const arrivalAt = id => tripList[connectionTrips[id]].stopTimes[connectionSegments[id]][1];
  function sourceConnection(id,slot) {
    const trip=tripList[connectionTrips[id]],index=connectionSegments[id],from=trip.stopTimes[index-1],to=trip.stopTimes[index];
    slot.trip=trip;slot.index=index;slot.from=from[0];slot.to=to[0];slot.departure=from[2];slot.arrival=to[1];slot.pickup=from[3]!==false;slot.dropOff=to[4]!==false;
    return slot;
  }
  function dayConnections(day) {
    const date = dayString(day);
    const activeServices = new Set([...services.values()].filter((service) => activeOn(service, day, date)).map((service) => service.id));
    const calendarKey = JSON.stringify([...activeServices].sort());
    if (cachedDays.has(calendarKey)) return cachedDays.get(calendarKey);
    let count=0;
    for(let t=0;t<tripList.length;t++) if(activeServices.has(tripList[t].serviceId)) count+=tripFirstConnection[t+1]-tripFirstConnection[t];
    const connections = new Uint32Array(count);
    let next=0;
    for(let t=0;t<tripList.length;t++) if(activeServices.has(tripList[t].serviceId)) {
      for(let id=tripFirstConnection[t];id<tripFirstConnection[t+1];id++) connections[next++]=id;
    }
    connections.sort((a,b)=>departureAt(a)-departureAt(b) || arrivalAt(a)-arrivalAt(b) || tripList[connectionTrips[a]].id.localeCompare(tripList[connectionTrips[b]].id) || connectionSegments[a]-connectionSegments[b]);
    if (cachedDays.size >= 4) cachedDays.delete(cachedDays.keys().next().value);
    cachedDays.set(calendarKey, connections);
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

  const arena = createSearchArena();
  // Stop frontiers keep their backing storage across synchronous queries.
  // `used` bounds the live entries; clearing references does not discard capacity.
  const frontierMap = () => new Map([...stops.keys()].map(id=>{const entries=[];entries.used=0;return [id,entries];}));
  const ready = frontierMap(), arrived = frontierMap();
  function clearFrontiers() {
    for (const map of [ready,arrived]) for (const entries of map.values()) {
      entries.fill(null,0,entries.used);entries.used=0;
    }
  }
  const append = (previous,leg) => arena.chain(previous,leg);
  function route(input = {}, {disableFrequency = false, arrivalBoundSeconds = Infinity} = {}) {
    clearFrontiers();
    arena.reset();
    const started = performance.now();
    const errors = [];
    const diagnostics = { algorithm: 'Pareto connection scan', connectionsScanned: 0, frequencyExpansions: 0, labelsCreated: 0, serviceDates: [], elapsedMs: 0 };
    const result = (status, message, code = status, journeys = []) => {
      clearFrontiers();
      arena.release();
      diagnostics.elapsedMs = performance.now() - started;
      return { status, errors: message ? [{ code, message }] : [], routes: journeys, recommended: status === 'ok' ? journeys[0] || null : null, coverage, diagnostics };
    };
    if (input.signal?.aborted) return result('cancelled','The route search was cancelled.');
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
    if (originId === destinationId && !input.progressSeed) return result('same-station', 'Origin and destination are the same station; no rail journey is needed.');
    const origin = stations.get(originId), destination = stations.get(destinationId);
    const seed = input.progressSeed;
    if (seed && (!stops.has(seed.stopId) || stops.get(seed.stopId).stationId !== originId || typeof seed.canBoard !== 'boolean' || typeof seed.externalSinceRide !== 'boolean' || typeof seed.hasBoarded !== 'boolean')) return result('invalid-input', 'Confirm an exact supported stop/platform and boarding state.');
    const originStops = seed ? [seed.stopId] : stationStops.get(originId), destinationStops = stationStops.get(destinationId);
    if (!connected(originStops, destinationStops)) return result('disconnected', 'These stations have no directed rail path connected by validated interchanges in the imported network. Nearby map lines or stations do not establish a connection.');
    const access = seed ? 0 : origin.accessSeconds ?? accessDefault, exit = destination.exitSeconds ?? exitDefault;
    const maxWalk = walkingMinutes * 60;
    if (access + exit > maxWalk) return result('no-feasible', `The assumed station access and exit alone require ${(access + exit) / 60} minutes of walking, exceeding the ${walkingMinutes}-minute limit.`, 'walking-limit');
    const horizon = departure + Math.max(requestedHorizon, deadline === null ? 0 : deadline - departure);
    diagnostics.searchEndSeconds = horizon;
    diagnostics.carryoverOnly = carryover;
    // Merge the few service-day streams lazily. Copying and sorting every
    // connection in the horizon retained tens of thousands of objects even
    // when the destination cutoff stopped the scan much earlier.
    const connectionStreams = [];
    const oldest = day - Math.floor(maxTripSeconds / DAY);
    const newest = Math.min(lastCovered, day + Math.floor(horizon / DAY));
    const excluded = input.excludedConnections ?? [];
    function advanceStream(stream) {
      stream.current = null;
      for (; stream.index < stream.scheduled.length;) {
        const connection = sourceConnection(stream.scheduled[stream.index++],stream.slot);
        if (connection.departure + stream.offset > horizon) break;
        if (connection.arrival + stream.offset + exit > horizon) continue;
        if (excluded.some(e => e.tripId === connection.trip.id && e.serviceDate === stream.serviceDate && (e.impactStartSeconds===undefined || (connection.arrival>=e.impactStartSeconds && connection.departure<=e.impactEndSeconds)) && (!e.fromStopId || (e.fromStopId === connection.from && e.toStopId === connection.to)))) continue;
        if (demoConnectionClosed(input.demoClosures,connection.trip.routeId,connection.from,connection.to,connection.departure+stream.offset,connection.arrival+stream.offset)) continue;
        connection.departure+=stream.offset;connection.arrival+=stream.offset;
        connection.serviceDate=stream.serviceDate;
        if (!stream.occurrences.has(connection.trip)) stream.occurrences.set(connection.trip,`${stream.serviceDay}:${connection.trip.id}`);
        connection.occurrence=stream.occurrences.get(connection.trip);
        stream.current=connection; // Reused only after its synchronous scan finishes.
        break;
      }
    }
    for (let serviceDay = oldest; serviceDay <= newest; serviceDay++) {
      const offset = (serviceDay - day) * DAY;
      if (departure - offset > maxTripSeconds) continue;
      const scheduled = dayConnections(serviceDay);
      const stream = {scheduled,index:lowerBound(scheduled,departure-offset,departureAt),offset,serviceDay,serviceDate:dayString(serviceDay),current:null,occurrences:new Map(),slot:{trip:null,index:0,from:null,to:null,departure:0,arrival:0,pickup:false,dropOff:false,serviceDate:null,occurrence:null}};
      advanceStream(stream);
      if (stream.current) { connectionStreams.push(stream); diagnostics.serviceDates.push(stream.serviceDate); }
    }
    let scannedStream = null;
    const connectionOrder = (a,b) => a.departure-b.departure || a.arrival-b.arrival || a.occurrence.localeCompare(b.occurrence) || a.index-b.index;
    function nextConnection() {
      if (scannedStream) advanceStream(scannedStream);
      let next = null;
      for (let i=0;i<connectionStreams.length;i++) {
        const stream=connectionStreams[i];
        if (stream.current && (!next || connectionOrder(stream.current,next.current)<0)) next=stream;
      }
      scannedStream=next;
      return next?.current ?? null;
    }
    if (!connectionStreams.length && !frequency?.patterns.length && !seed) return result('no-service', 'No scheduled rail services operate in the searched time window on the covered service calendars. The last service may already have departed.', 'no-scheduled-service');
    const aboard = new Map();
    const targetSet = new Set(destinationStops);
    const candidates = [];
    let boardingsAtOrigin = 0;
    let stopped = null;
    // Bound work, never truncate the Pareto frontier and pretend it is optimal.
    // The worker can also be terminated to interrupt synchronous CPU work.
    const maxSearchWork = Math.min(2000000,Math.max(1,Number(input.maxSearchWork) || 2000000));
    let cutoff = Math.min(horizon,Number.isFinite(arrivalBoundSeconds) && arrivalBoundSeconds >= departure ? arrivalBoundSeconds : Infinity);
    const searchCutoff = () => cutoff;
    const interrupted = () => {
      if (input.signal?.aborted) stopped = 'cancelled';
      else if (diagnostics.frequencyExpansions + diagnostics.connectionsScanned > maxSearchWork) stopped = 'search-limit';
      return stopped !== null;
    };

    function considerDestination(label) {
      // Rail endpoints retain their station-level allowance. Do not enter and
      // immediately exit an unverified indoor path solely to finish at a station.
      if (frequency && !destinationId.startsWith('bus:') && label.externalSinceRide) return;
      if (!targetSet.has(label.stop) || (label.boardings === 0 && !seed?.hasBoarded) || label.time + exit > horizon || label.walk + exit > maxWalk) return;
      insert(candidates, { stop:label.stop,boardings:label.boardings,externalSinceRide:label.externalSinceRide,time: label.time + exit, walk: label.walk + exit, chain: append(label.chain, { type: 'exit', fromStopId: label.stop, toStopId: label.stop, startSeconds: label.time, endSeconds: label.time + exit, durationSeconds: exit, walkingSeconds: exit, assumed: true }) });
      cutoff = Math.min(cutoff,label.time+exit+detourMinutes*60);
    }
    // Separate scratch values keep a later-alighting retry from changing the
    // base boarding used by other stops. Public legs copy their scalar fields.
    const boardingOutput = {}, alightBoardingOutput = {}, demoBoardingOutput = {};
    function relaxTransfers(startLabel, initiallyReady = false) {
      const queue = [startLabel], boardingFlags = [initiallyReady];
      for (let i = 0; i < queue.length; i++) {
        if (interrupted()) return;
        const label = queue[i], canBoard = boardingFlags[i];
        queue[i] = null; // Processed dominated labels must not live until the closure ends.
        if (label.time + exit > searchCutoff()) continue;
        // Later arrivals can dominate entries still waiting in this closure's
        // queue. They must not continue spawning redundant downstream labels.
        if (label !== startLabel && !(canBoard ? ready : arrived).get(label.stop).includes(label)) continue;
        const edges=transferEdges.get(label.stop);
        for (let edgeIndex=0;edgeIndex<edges.length;edgeIndex++) {
          const edge=edges[edgeIndex];
          if (edge.external && label.boardings === 0 && !seed?.hasBoarded && !originId.startsWith('bus:')) continue;
          // Two exterior paths cannot create an unreviewed walk through a station.
          if (edge.external && label.externalSinceRide) continue;
          const time = label.time + edge.seconds, walk = label.walk + edge.walkSeconds;
          if (time + exit > searchCutoff() || walk + exit > maxWalk) continue;
          if (dominatedBy(ready.get(edge.toStopId),time,label.boardings,walk,label.externalSinceRide || edge.external)) continue;
          const next = arena.label(edge.toStopId,time,walk,label.boardings,label.externalSinceRide || edge.external,arena.transfer(label.chain,edge,label.time,time));
          if (insert(ready.get(next.stop), next)) { diagnostics.labelsCreated++; queue.push(next); boardingFlags.push(true); considerDestination(next); }
        }
        if (!canBoard || !frequency || disableFrequency) continue;
        const occurrences=busOccurrences.get(label.stop);
        if (!occurrences) continue;
        for (let occurrenceIndex=0;occurrenceIndex<occurrences.length;occurrenceIndex++) {
          const {pattern,index}=occurrences[occurrenceIndex];
          const busBoarding = frequency.boarding(pattern,index,label.time,date,null,0,boardingOutput);
          const departureEstimate = typeof busBoarding === 'number' ? busBoarding : busBoarding?.seconds ?? null;
          if (departureEstimate === null || departureEstimate > searchCutoff() || departureEstimate < label.time) continue;
          if (label.boardings === 0) boardingsAtOrigin++;
          let waitChain = null;
          for (let j = index + 1; j < pattern.stops.length; j++) {
            diagnostics.frequencyExpansions++;
            if ((diagnostics.frequencyExpansions & 127) === 0 && interrupted()) return;
            const alight = pattern.stops[j];
            const duration = frequency.riding(pattern,index,j);
            let rideBoarding = busBoarding, rideDeparture = departureEstimate, time = rideDeparture + duration;
            if (time + exit > searchCutoff()) break; // monotonic route distance and dwell
            if (!Number.isFinite(duration) || duration <= 0) continue;
            if (!frequency.canAlight(pattern,j,time,date,rideBoarding)) {
              // A known first bus may reach this stop before its independent
              // first-arrival bound under our distance model. Earlier callers
              // can wait for a later supported band; do not discard that path.
              rideBoarding = frequency.boardingForAlight?.(pattern,index,j,label.time,date,duration,alightBoardingOutput);
              if (!rideBoarding) continue;
              rideDeparture = rideBoarding.seconds;
              time = rideDeparture+duration;
              if (time+exit > searchCutoff() || !frequency.canAlight(pattern,j,time,date,rideBoarding)) continue;
            }
            // Rejected alightings allocate neither a label nor a predicate
            // closure; full-network searches can reject millions of these.
            // A temporary closure may postpone a frequency ride. Retry from the
            // matching closure's expiry using the ordinary headway/service-day
            // rules; never invent an exact bus at the instant service resumes.
            if (input.demoClosures?.length) {
              const scoped = input.demoClosures.filter(rule=>rule.demo===true&&rule.routeId===pattern.id&&(!rule.edges||pattern.stops.slice(index,j).some((stop,k)=>rule.edges.some(edge=>edge[0]===stop.stopId&&edge[1]===pattern.stops[index+k+1].stopId))));
              let supported = true;
              for (let retry=0;retry<=scoped.length;retry++) {
                const overlaps = scoped.filter(rule=>rideDeparture<rule.endSeconds&&time>rule.startSeconds);
                if (!overlaps.length) break;
                const readyAfterClosure = Math.max(label.time,...overlaps.map(rule=>rule.endSeconds));
                if (retry===scoped.length||!Number.isFinite(readyAfterClosure)||readyAfterClosure+duration+exit>searchCutoff()) {supported=false;break;}
                diagnostics.frequencyExpansions++;
                if (interrupted()) return;
                rideBoarding = frequency.boarding(pattern,index,readyAfterClosure,date,null,0,demoBoardingOutput);
                rideDeparture = typeof rideBoarding==='number'?rideBoarding:rideBoarding?.seconds??null;
                if (rideDeparture===null||rideDeparture<readyAfterClosure) {supported=false;break;}
                time = rideDeparture+duration;
                if (!frequency.canAlight(pattern,j,time,date,rideBoarding)) {
                  rideBoarding = frequency.boardingForAlight?.(pattern,index,j,readyAfterClosure,date,duration,demoBoardingOutput);
                  rideDeparture = typeof rideBoarding==='number'?rideBoarding:rideBoarding?.seconds??null;
                  if (rideDeparture===null||rideDeparture<readyAfterClosure) {supported=false;break;}
                  time = rideDeparture+duration;
                }
                if (time+exit>searchCutoff()||!frequency.canAlight(pattern,j,time,date,rideBoarding)) {supported=false;break;}
              }
              if (!supported) continue;
            }
            if (dominatedBy(arrived.get(alight.stopId),time,label.boardings+1,label.walk,false)) continue;
            const next = arena.label(alight.stopId,time,label.walk,label.boardings+1,false,null);
            if (rideDeparture === departureEstimate && waitChain === null) waitChain = departureEstimate > label.time ? arena.wait(label.chain,label.stop,label.time,departureEstimate,true) : label.chain;
            const rideWaitChain = rideDeparture === departureEstimate ? waitChain : arena.wait(label.chain,label.stop,label.time,rideDeparture,true);
            next.chain=arena.busRide(rideWaitChain,pattern,index,j,rideDeparture,time,rideBoarding?.serviceDate ?? date,rideBoarding?.basis ?? 'published-headway-estimate',rideBoarding?.headwayField ?? 'AM_Offpeak_Freq');
            considerDestination(next);
            if (insert(arrived.get(next.stop),next)) { diagnostics.labelsCreated++; queue.push(next); boardingFlags.push(false); }
          }
        }
      }
    }
    for (const stop of originStops) {
      const initial = { stop, time: departure + access, walk: access, boardings: 0, chain: append(null, { type: 'access', fromStopId: stop, toStopId: stop, startSeconds: departure, endSeconds: departure + access, durationSeconds: access, walkingSeconds: access, assumed: true }) };
      initial.externalSinceRide = seed?.externalSinceRide ?? false;
      if (!seed || seed.canBoard) insert(ready.get(stop),initial);
      if(seed) considerDestination(initial);
      relaxTransfers(initial, !seed || seed.canBoard);
    }
    for (let connection=nextConnection();connection;connection=nextConnection()) {
      if (interrupted()) break;
      if (connection.departure > searchCutoff()) break;
      diagnostics.connectionsScanned++;
      const { trip } = connection;
      const continuing = (aboard.get(connection.occurrence) || []).filter((label) => label.segment === connection.index - 1);
      const choices = [];
      for (const label of continuing) insert(choices, label);
      const boardingFrontier=ready.get(connection.from);
      if (connection.pickup) for (let labelIndex=0;labelIndex<boardingFrontier.used;labelIndex++) {
        const label=boardingFrontier[labelIndex];
        if (label.time > connection.departure) continue;
        if (label.boardings === 0) boardingsAtOrigin++;
        if (dominatedBy(choices,connection.departure,label.boardings+1,label.walk,label.externalSinceRide)) continue;
        const chain = label.time < connection.departure ? arena.wait(label.chain,connection.from,label.time,connection.departure,false) : label.chain;
        insert(choices,arena.label(label.stop,connection.departure,label.walk,label.boardings+1,label.externalSinceRide,chain,connection.index-1,true));
      }
      const riding = [];
      for (const label of choices) {
        if (dominatedBy(riding,connection.arrival,label.boardings,label.walk,false)) continue;
        const start = label.newlyBoarded ? connection.departure : label.time;
        const next = arena.label(connection.to,connection.arrival,label.walk,label.boardings,false,arena.railRide(label.chain,trip,connection.from,connection.to,start,connection.arrival,connection.serviceDate),connection.index);
        insert(riding, next);
      }
      if (connection.index < trip.stopTimes.length-1) aboard.set(connection.occurrence, riding);
      else aboard.delete(connection.occurrence);
      if (connection.dropOff) for (const label of riding) {
        considerDestination(label);
        if (insert(arrived.get(label.stop), label)) { diagnostics.labelsCreated++; relaxTransfers(label); }
      }
    }
    if (stopped) return result(stopped,stopped === 'cancelled' ? 'The route search was cancelled.' : 'This search exceeded the bounded planning work limit. Try a shorter journey or departure window; no partial route was accepted.');
    diagnostics.boardingsFromOrigin = boardingsAtOrigin;
    if (!candidates.length) {
      if (!boardingsAtOrigin) return result('no-service', 'No train can be boarded from this origin after its station access allowance in the searched window. Check the service date, departure time, or last train.', 'no-origin-service');
      return result('no-feasible', 'No journey satisfies the walking limit and validated interchange times within the search window. A connection may be missed, require more walking, or have no remaining service.');
    }
    const journeys = candidates.map((label) => {
      const legs = materialize(label.chain,arena);
      const sum = (type, key = 'durationSeconds') => legs.filter((leg) => leg.type === type).reduce((value, leg) => value + (leg[key] || 0), 0);
      const rideLegs = legs.filter((leg) => leg.type === 'ride');
      const assumptions = [
        `Station access: ${access} seconds; station exit: ${exit} seconds. These are station-level allowances, not validated address or entrance walking routes.`,
        ...legs.filter((leg) => leg.type === 'transfer' && leg.assumed).map((leg) => `Assumed transfer allowance ${leg.fromStopId} → ${leg.toStopId}: ${leg.durationSeconds} seconds total, including ${leg.walkingSeconds} seconds walking.`),
      ];
      if (preference === 'quieter') assumptions.push('Comparable measured crowding is unavailable; quieter preference falls back to fastest arrival without claiming a quieter train.');
      const estimated = rideLegs.some(leg => leg.mode === 'bus');
      if (estimated) assumptions.push(...frequency.assumptions, 'Arrival and rail-connection feasibility depend on estimated bus timing; deadline outcomes are not guaranteed. No live arrivals changed this itinerary.');
      return {
        id: rideLegs.map((leg) => `${leg.serviceDate}/${leg.tripId}/${leg.fromStopId}/${leg.toStopId}`).join('|'),
        originId, destinationId, date, departureSeconds: departure, arrivalSeconds: label.time, totalSeconds: label.time - departure,
        accessSeconds: sum('access'), waitSeconds: sum('wait'), rideSeconds: sum('ride'), transferSeconds: sum('transfer'), transferWalkSeconds: sum('transfer', 'walkingSeconds'), exitSeconds: sum('exit'), walkingSeconds: label.walk, transfers: Math.max(0, label.boardings - 1),
        deadlineSeconds: deadline, deadlineMet: deadline === null || label.time <= deadline, deadlineBufferSeconds: deadline === null ? null : deadline - label.time,
        crowding: null, legs, assumptions, preferenceScore: 0, estimated, timing:estimated ? 'frequency-estimated + scheduled rail where used' : 'scheduled',
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
