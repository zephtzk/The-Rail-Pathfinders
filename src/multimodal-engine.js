import {createRailRouter} from './rail-engine.js';

export const busId = code => `bus:${code}`;
const clockSeconds = value => { const parts = String(value).split(':').map(Number); return parts[0]*3600 + parts[1]*60; };

// Published headways support a waiting assumption, not exact vehicle departures.
export function createMultimodalRouter(rail, bus, walking, {busOnly = false, closedRailRouteIds = []} = {}) {
  if (bus.schemaVersion !== 1 || !Array.isArray(bus.patterns) || !Array.isArray(walking.links)) throw Error('Unsupported pilot data schema');
  const originalStops = new Map(bus.stops.map(stop => [stop.id,stop]));
  const patterns = bus.patterns.filter(pattern => pattern.timingSupported !== false).map(pattern => ({...pattern,stops:pattern.stops.map(stop => ({...stop,stopId:busId(stop.stopId)}))}));
  const busStops = bus.stops.map(stop => ({...stop,id:busId(stop.id),stationId:busId(stop.id),name:`${stop.id} · ${stop.name}`,mode:'bus'}));
  const stations = busStops.map(stop => ({...stop,stopIds:[stop.id],accessSeconds:0,exitSeconds:0}));
  const unverifiedBays = new Set((bus.assumptions?.unverifiedBayStopCodes ?? []).map(busId));
  const transfers = busStops.filter(stop=>!unverifiedBays.has(stop.id)).map(stop => ({fromStopId:stop.id,toStopId:stop.id,seconds:60,walkSeconds:0,assumed:true,provenance:'Same roadside physical bus stop: assumed 60 seconds to change buses; no street crossing inferred.'}));
  for (const link of walking.links.filter(link => link.enabled)) {
    if (!originalStops.has(link.busStopId) || !link.sourceUrls?.length || !link.railPlatformIds?.length || !Number.isFinite(link.externalSeconds) || link.externalSeconds < 0 || link.railAllowanceSeconds !== 120) throw Error(`Invalid pedestrian link ${link.id}`);
    const seconds = link.externalSeconds + link.railAllowanceSeconds;
    for (const platform of link.railPlatformIds) {
      if (!rail.stops.some(stop => stop.id === platform && stop.stationId === link.railStationId)) throw Error(`Unmatched pedestrian rail endpoint ${platform}`);
      const edge = {seconds,walkSeconds:seconds,assumed:true,validated:true,external:true,pathId:link.id,
        provenance:`${link.id}: ${link.entrance}; ${link.externalSeconds}s exterior map-supported walk + 120s unverified indoor allowance. ${link.sourceUrls.join(' ')}`};
      if (link.directionality === 'bidirectional' || link.directionality === 'bus-to-rail') transfers.push({...edge,fromStopId:busId(link.busStopId),toStopId:platform});
      if (link.directionality === 'bidirectional' || link.directionality === 'rail-to-bus') transfers.push({...edge,fromStopId:platform,toStopId:busId(link.busStopId)});
    }
  }
  const supportedDate = date => date >= bus.coverage.validFrom && date <= bus.coverage.validThrough && [1,2,3,4,5].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !(bus.coverage.excludedDates ?? []).includes(date);
  const windowStart = bus.coverage.earliestSeconds ?? 34200, windowEnd = bus.coverage.latestSeconds ?? 59400;
  const bounds = (pattern,index) => pattern.stops[index].firstLast.WD;
  const wait = pattern => pattern.waitSeconds ?? (pattern.headways?.AM_Offpeak_Freq?.[1] * 60);
  const frequency = {
    patterns,
    assumptions:[`Bus wait assumes the published weekday off-peak maximum headway, not an exact departure or a guaranteed upper bound.`,
      `Bus riding assumes route distance at ${bus.assumptions?.rideSpeedKph ?? 18} km/h plus ${bus.assumptions?.dwellSecondsPerStop ?? 30} seconds per traversed stop; traffic and dwell are unmeasured.`,
      'Every bus boarding and alighting must stay inside the pilot window and per-stop first/last bounds. First-bus rows are not used as one through-trip timetable.',
      'External path plus one indoor station allowance is charged once per bus/rail transfer; station-level access/exit applies only at journey endpoints. Accessibility is unknown.'],
    boarding(pattern,index,ready,date) {
      if (!supportedDate(date)) return null;
      const [first,last] = bounds(pattern,index) ?? [];
      const waiting = wait(pattern);
      if (!Number.isFinite(first) || !Number.isFinite(last) || !Number.isFinite(waiting) || waiting <= 0) return null;
      const estimate = Math.max(ready,windowStart,first) + waiting;
      return estimate <= Math.min(last,windowEnd) ? estimate : null;
    },
    riding(pattern,from,to) {
      // DataMall distances are in kilometres. Integer metres avoid rounding an
      // exact model duration up a second because 19.1 - 9.5 is 9.600000000000001.
      const meters = Math.round(pattern.stops[to].distanceKm*1000) - Math.round(pattern.stops[from].distanceKm*1000);
      return Math.ceil(meters * 3.6 / (bus.assumptions?.rideSpeedKph ?? 18) + (to-from)*(bus.assumptions?.dwellSecondsPerStop ?? 30) - 1e-9);
    },
    canAlight(pattern,index,time,date) {
      const [first,last] = bounds(pattern,index) ?? [];
      return supportedDate(date) && Number.isFinite(first) && Number.isFinite(last) && time >= Math.max(first,windowStart) && time <= Math.min(last,windowEnd);
    }
  };
  const network = {...rail,stations:[...rail.stations,...stations],stops:[...rail.stops,...busStops],
    routes:[...rail.routes,...patterns.map(p=>({id:p.id,name:`Bus ${p.serviceNo} · direction ${p.direction}`,shortName:`Bus ${p.serviceNo}`,color:'b36b13'}))],
    trips:busOnly ? [] : rail.trips.filter(trip=>!closedRailRouteIds.includes(trip.routeId)),transfers:[...rail.transfers,...transfers],frequency};
  const router = createRailRouter(network);
  return {network,route(input) {
    if ((input.originId?.startsWith('bus:') || input.destinationId?.startsWith('bus:') || busOnly) && (!supportedDate(input.date) || clockSeconds(input.departureTime) < windowStart || clockSeconds(input.departureTime) >= windowEnd)) {
      return {status:'unsupported-bus-window',routes:[],recommended:null,errors:[{message:`Bus estimates support ordinary weekdays ${bus.coverage.validFrom}–${bus.coverage.validThrough}, 09:30–16:30 only. Weekends, holidays, peak and overnight bus travel are not validated. The separate rail planner retains its wider dates.`}]};
    }
    const result = router.route(input);
    if (closedRailRouteIds.length) for (const route of result.routes) route.assumptions.push(`SYNTHETIC DISRUPTION FIXTURE: rail routes ${closedRailRouteIds.join(', ')} removed for this search. Not a live closure; no mid-journey rerouting.`);
    if (result.errors?.length && input.originId?.startsWith('bus:')) for (const error of result.errors) error.message = error.message.replaceAll('rail journey','pilot journey').replaceAll('No train','No supported bus or train');
    return result;
  }};
}
