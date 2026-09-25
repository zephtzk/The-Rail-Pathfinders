import {validateActive} from './journey-v2.js';
import {validateEvent} from './journey-state.js';
import {compileDemoClosures, demoRouteAffected} from './demo-closures.js';
import {createMapsWalkingUrl} from './nebula-handoff.js';

const singaporeDate = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const notice = (label, source = 'stale', severity = 'warning') => ({label, severity, source});

// Canonical step sources retain the timetable legs. Never read a proposal,
// planner selection, replay result, GPS estimate or a caregiver's shared plan.
function relevantNotice(active, network, incidents, now, online) {
  const legs = active.route.steps.map(step => step.source);
  if (legs.some(leg => !leg || typeof leg.type !== 'string')) return null;
  const route = {...active.route.legacyRoute, date: active.plan.departureDate, legs};
  const index = active.progress.stepIndex;
  for (const incident of incidents.slice(0, 100)) {
    if (incident?.demo !== true || incident.source !== 'demo' || incident.status !== 'active') continue;
    const effect = compileDemoClosures(incident, network, active.plan.departureDate);
    if (demoRouteAffected(route, effect.impactRules ?? [], network, index)) {
      return notice(active.plan.mode === 'replay'
        ? 'Demo disruption affects this rehearsal · review Disruptions'
        : 'Demo scenario overlaps your route · personal trip unchanged', 'demo');
    }
  }
  if (active.plan.mode !== 'replay') return null;
  for (const event of active.routingContext?.events ?? []) {
    const relevant = legs.slice(index).some(leg => leg.type === 'ride' &&
      event.tripId === leg.tripId && event.serviceDate === leg.serviceDate &&
      String(event.directionId) === String(leg.directionId) &&
      (event.effect !== 'segment-unavailable' || leg.stopIds?.some((id, i) =>
        id === event.fromStopId && leg.stopIds[i + 1] === event.toStopId)));
    if (!relevant) continue;
    const check = validateEvent(event, network, active.routingContext.build, now, online);
    if (event.conflict || !check.applicable) return notice('Demo service state is stale or unconfirmed · review Disruptions');
    if (event.effect !== 'recovered') return notice('Demo disruption affects this rehearsal · review before switching', 'demo');
  }
  return null;
}

/** See docs/companion/JOURNEY-HANDOFF.md. Pure, fail-closed presentation adapter.
 * network is the existing router.network; build is its applicationSha256.
 * now is an injectable wall clock, never used to infer progress or arrival. */
export function deriveNebulaJourneyContext({active = null, network = null, build = null,
  incidents = [], now = Date.now(), online = true} = {}) {
  const result = {notice: null, nextBoarding: null, handoffReason: ''};
  const unavailable = reason => ({...result, handoffReason: reason});
  try {
    if (!active) return unavailable('Start a journey before opening walking directions.');
    if (!validateActive(active)) return unavailable('The saved journey is invalid. Review a new journey.');
    if (['completed', 'cancelled'].includes(active.status) || active.progress.kind === 'arrived')
      return unavailable('This journey has ended. Start a new journey for walking directions.');
    if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime()) ||
        active.updatedAt > now || active.plan.departureDate !== singaporeDate(now)) {
      result.notice = notice('Saved journey date needs review');
      return unavailable('Review a journey dated today before opening walking directions.');
    }
    if (!network || !Array.isArray(network.stops) || !Array.isArray(network.stations) ||
        !Array.isArray(network.trips) || !Array.isArray(network.routes) ||
        typeof build !== 'string' || !build || !active.routingContext ||
        active.routingContext.build !== build ||
        active.plan.departureDate < network.coverage?.startDate ||
        active.plan.departureDate > network.coverage?.endDate) {
      result.notice = notice('Accepted route data needs review');
      return unavailable('Reliable boarding coordinates and matching timetable data are unavailable. Review the accepted route.');
    }
    result.notice = relevantNotice(active, network, Array.isArray(incidents) ? incidents : [], now, online);
    if (!online) result.notice = notice('Offline · service conditions are unconfirmed');
    if (active.status === 'paused') return unavailable('Resume your journey before opening walking directions.');
    const confirmedAt = active.progress.confirmedAt ?? active.startedAt;
    if (confirmedAt > now || now - confirmedAt > 300000)
      return unavailable('Your last confirmed position is over five minutes old or needs review. Confirm your current step first.');
    if (active.facilityBlocked || active.facilityReview ||
        active.detour && !['cancelled', 'resumed'].includes(active.detour.status))
      return unavailable('Finish the station stop or review the changed station path first.');
    const index = active.progress.stepIndex, current = active.route.steps[index];
    if (active.progress.kind === 'onboard' || current.type === 'ride' && active.progress.kind !== 'waiting')
      return unavailable('Confirm alighting or your boarding checkpoint before opening walking directions.');
    if (active.progress.kind === 'unknown' && index !== 0)
      return unavailable('Confirm your current journey step before opening walking directions.');
    const step = active.route.steps.slice(index).find(item => item.type === 'ride');
    if (!step) return unavailable('There is no remaining boarding point on this accepted journey.');
    const stopId = step.fromStopId ?? step.source?.fromStopId;
    const stop = network.stops.find(item => item.id === stopId);
    const station = stop && network.stations.find(item => item.id === stop.stationId);
    const bus = step.source?.mode === 'bus';
    // Rail platform coordinates in this import are station positions, not
    // surveyed entrances. Never choose a nearest station or a polyline point.
    const point = bus ? stop : station;
    const url = point && createMapsWalkingUrl({lat: point.lat, lng: point.lon});
    if (!url) return unavailable('Reliable coordinates for the accepted boarding point are unavailable. Use the saved instructions or ask staff.');
    const label = `${point.name ?? stopId} · ${bus ? 'mapped bus stop position; bay unverified' : 'approximate station position; entrance unverified'}`;
    result.nextBoarding = {lat: point.lat, lng: point.lon, label, stopId,
      precision: bus ? 'stop-position' : 'station-centroid', url};
    result.handoffReason = 'Walking destination only. Check the entrance and accessibility with station staff; Nebula keeps your accepted journey.';
    return result;
  } catch {
    return unavailable('Journey or incident data could not be checked. Review your accepted trip before opening walking directions.');
  }
}
