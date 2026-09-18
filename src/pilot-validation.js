const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.length > 0;
const seconds = value => Number.isFinite(value) && value >= 0;
const stopCode = value => typeof value === 'string' && /^\d{5}$/.test(value);
const day = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
};
const time = value => typeof value === 'string' && /^\d\d:\d\d$/.test(value) && Number(value.slice(0,2)) < 24 && Number(value.slice(3)) < 60;
export const validPilotTimestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && day(value.slice(0,10)) && time(value.slice(11,16)) && Number(value.slice(17,19)) < 60 && Number.isFinite(Date.parse(value));
const numericInput = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && seconds(Number(value));

// Saved guidance can be shown without routing data, so validate every nested
// field the renderer uses instead of trusting a version number alone.
export function validateSavedPilot(saved) {
  if (!object(saved) || saved.schemaVersion !== 1 || !validPilotTimestamp(saved.savedAt) || !string(saved.build) || !object(saved.input) || !object(saved.route)) return null;
  const input = saved.input, route = saved.route;
  if (!string(input.originId) || !string(input.destinationId) || !day(input.date) || !time(input.departureTime) || !numericInput(input.walkingLimitMinutes) || !numericInput(input.maxExtraMinutes)) return null;
  if (!['fastest','fewer-transfers','less-walking','quieter'].includes(input.preference) || !['mixed','bus-only'].includes(input.mode) || !['none','ewl'].includes(input.fixture)) return null;
  if (input.deadlineTime && (!time(input.deadlineTime) || !day(input.deadlineDate))) return null;
  if (input.deadlineDate !== undefined && input.deadlineDate !== '' && !day(input.deadlineDate)) return null;
  if (input.deadlineTime !== undefined && input.deadlineTime !== '' && !time(input.deadlineTime)) return null;
  if (!Array.isArray(saved.labels) || !saved.labels.length || saved.labels.length > 5000 || saved.labels.some(entry => !Array.isArray(entry) || entry.length !== 2 || !string(entry[0]) || !string(entry[1]))) return null;
  const labels = new Map(saved.labels);
  if (labels.size !== saved.labels.length || !labels.has(input.originId) || !labels.has(input.destinationId)) return null;
  if (!string(route.id) || route.originId !== input.originId || route.destinationId !== input.destinationId || route.date !== input.date || typeof route.estimated !== 'boolean' || !string(route.timing)) return null;
  const totals = ['departureSeconds','arrivalSeconds','totalSeconds','accessSeconds','waitSeconds','rideSeconds','transferSeconds','transferWalkSeconds','exitSeconds','walkingSeconds','transfers'];
  if (totals.some(key => !seconds(route[key])) || !Number.isInteger(route.transfers) || route.arrivalSeconds-route.departureSeconds !== route.totalSeconds) return null;
  if (route.departureSeconds !== Number(input.departureTime.slice(0,2))*3600+Number(input.departureTime.slice(3))*60) return null;
  if (!Array.isArray(route.assumptions) || route.assumptions.some(value => typeof value !== 'string') || !Array.isArray(route.legs) || !route.legs.length || route.legs.length > 1000) return null;
  const sums = {access:0,wait:0,ride:0,transfer:0,exit:0};
  let previous = route.departureSeconds, walking = 0, transferWalking = 0, rides = 0;
  for (const leg of route.legs) {
    if (!object(leg) || !Object.hasOwn(sums,leg.type) || !seconds(leg.startSeconds) || !seconds(leg.endSeconds) || !seconds(leg.durationSeconds) || leg.startSeconds !== previous || leg.endSeconds-leg.startSeconds !== leg.durationSeconds || !labels.has(leg.fromStopId) || !labels.has(leg.toStopId)) return null;
    previous = leg.endSeconds; sums[leg.type] += leg.durationSeconds;
    if (['access','transfer','exit'].includes(leg.type)) {
      if (!seconds(leg.walkingSeconds) || leg.walkingSeconds > leg.durationSeconds) return null;
      walking += leg.walkingSeconds;
      if (leg.type === 'transfer') transferWalking += leg.walkingSeconds;
    }
    if (leg.type === 'ride') {
      rides++;
      if (!['rail','bus'].includes(leg.mode) || !['scheduled','frequency-estimated'].includes(leg.timing) || !string(leg.tripId) || !string(leg.routeId) || !day(leg.serviceDate) || !Array.isArray(leg.stopIds) || leg.stopIds.length < 2 || leg.stopIds.some(id => !labels.has(id)) || leg.stopIds[0] !== leg.fromStopId || leg.stopIds.at(-1) !== leg.toStopId) return null;
      if (leg.mode === 'bus' && (!string(leg.patternId) || !string(leg.serviceNo) || !Number.isInteger(leg.directionId) || !Number.isInteger(leg.fromSequence) || !Number.isInteger(leg.toSequence) || leg.fromSequence < 1 || leg.toSequence <= leg.fromSequence || !Number.isInteger(leg.visitNumber) || leg.visitNumber < 1)) return null;
    }
  }
  if (!rides || previous !== route.arrivalSeconds || route.transfers !== rides-1 || walking !== route.walkingSeconds || transferWalking !== route.transferWalkSeconds || walking > Number(input.walkingLimitMinutes)*60) return null;
  for (const [type,field] of [['access','accessSeconds'],['wait','waitSeconds'],['ride','rideSeconds'],['transfer','transferSeconds'],['exit','exitSeconds']]) if (sums[type] !== route[field]) return null;
  if (route.estimated !== route.legs.some(leg => leg.type === 'ride' && leg.mode === 'bus')) return null;
  const expectedDeadline = input.deadlineTime ? (Date.parse(`${input.deadlineDate}T00:00:00Z`)-Date.parse(`${input.date}T00:00:00Z`))/1000+Number(input.deadlineTime.slice(0,2))*3600+Number(input.deadlineTime.slice(3))*60 : null;
  if (route.deadlineSeconds !== expectedDeadline) return null;
  if (route.deadlineSeconds === null) { if (route.deadlineBufferSeconds !== null || route.deadlineMet !== true) return null; }
  else if (!seconds(route.deadlineSeconds) || route.deadlineBufferSeconds !== route.deadlineSeconds-route.arrivalSeconds || route.deadlineMet !== (route.arrivalSeconds <= route.deadlineSeconds) || !route.deadlineMet) return null;
  return saved;
}

export function validatePilotArrivals(feed, requestedStop, patterns = []) {
  if (!object(feed) || feed.schemaVersion !== 1 || !stopCode(requestedStop) || feed.stopCode !== requestedStop || !['available','partial','empty','unavailable'].includes(feed.status) || !Array.isArray(feed.predictions) || feed.predictions.length > 300 || feed.providerTimestamp !== null) return false;
  if (feed.status === 'unavailable' ? feed.retrievedAt !== null || feed.predictions.length !== 0 : !validPilotTimestamp(feed.retrievedAt)) return false;
  if (feed.nextRefreshAt !== undefined && !validPilotTimestamp(feed.nextRefreshAt)) return false;
  if (feed.providerHttpDate !== undefined && feed.providerHttpDate !== null && !validPilotTimestamp(feed.providerHttpDate)) return false;
  if ((feed.status === 'empty' && feed.predictions.length) || (feed.status === 'available' && !feed.predictions.length)) return false;
  for (const item of feed.predictions) {
    if (!object(item) || typeof item.serviceNo !== 'string' || !/^[A-Za-z\d]{1,12}$/.test(item.serviceNo) || typeof item.operator !== 'string' || !/^[A-Z]{2,8}$/.test(item.operator) || !['NextBus','NextBus2','NextBus3'].includes(item.slot) || item.stopCode !== requestedStop || !stopCode(item.originCode) || !stopCode(item.destinationCode) || !Number.isInteger(item.visitNumber) || item.visitNumber < 1 || item.visitNumber > 99 || !validPilotTimestamp(item.predictedArrival) || !['vehicle-location-estimate','operator-schedule'].includes(item.predictionBasis) || !['matched','unmatched','ambiguous'].includes(item.matchStatus)) return false;
    const matches = patterns.flatMap(pattern => pattern.serviceNo === item.serviceNo && pattern.operator === item.operator && pattern.originCode === item.originCode && pattern.destinationCode === item.destinationCode ? pattern.stops.filter(stop => stop.stopId === requestedStop && stop.visitNumber === item.visitNumber).map(stop => ({patternId:pattern.id,direction:pattern.direction,sequence:stop.sequence})) : []);
    const expected = matches.length === 1 ? 'matched' : matches.length ? 'ambiguous' : 'unmatched';
    if (item.matchStatus !== expected) return false;
    if (expected === 'matched') {
      if (!object(item.match) || Object.keys(matches[0]).some(key => item.match[key] !== matches[0][key])) return false;
    } else if (item.match !== null) return false;
  }
  return true;
}

export function pilotPredictionState(prediction, feed, now = Date.now(), online = true) {
  if (!online) return 'offline';
  if (!feed || feed.status === 'unavailable') return 'unavailable';
  if (!validPilotTimestamp(feed.retrievedAt) || !validPilotTimestamp(prediction?.predictedArrival)) return 'expired';
  const retrieved = Date.parse(feed.retrievedAt), arrival = Date.parse(prediction.predictedArrival);
  if (now < retrieved-5000 || now-retrieved > 90000 || arrival <= now || arrival-now > 7200000) return 'expired';
  return ['matched','unmatched','ambiguous'].includes(prediction.matchStatus) ? prediction.matchStatus === 'matched' ? 'fresh' : prediction.matchStatus : 'unavailable';
}
