import {createRailRouter} from './rail-engine.js';

export const busId = code => `bus:${code}`;
const clockSeconds = value => { const parts = String(value).split(':').map(Number); return parts[0]*3600 + parts[1]*60; };
const DAY = 86400;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days*86400000).toISOString().slice(0,10);

// Service-day clocks are independent of browser timezone. A Saturday 00:10
// query may still be using Friday's WD span; do not borrow Saturday's last bus.
export function createBusTiming(bus) {
  const calendar = bus.coverage.calendarMode === 'service-day';
  const dayTypeCache = new Map(), shiftedDates = new Map(), validDates = new Map(), normalizedSpans = new WeakMap();
  const shiftDate = (date,offset) => {
    let offsets = shiftedDates.get(date);
    if (!offsets) {
      if (shiftedDates.size >= 32) shiftedDates.clear();
      offsets = new Map();
      shiftedDates.set(date,offsets);
    }
    if (!offsets.has(offset)) offsets.set(offset,addDays(date,offset));
    return offsets.get(offset);
  };
  const validDate = date => {
    if (validDates.has(date)) return validDates.get(date);
    const valid = typeof date === 'string' && /^\d{4}-\d\d-\d\d$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) === date;
    if (validDates.size >= 32) validDates.clear();
    validDates.set(date,valid);
    return valid;
  };
  const dayType = date => {
    if (dayTypeCache.has(date)) return dayTypeCache.get(date);
    if (!validDate(date) || date < bus.coverage.validFrom || date > bus.coverage.validThrough || (bus.coverage.excludedDates ?? []).includes(date)) return null;
    if ((bus.coverage.holidays ?? []).includes(date)) return bus.coverage.holidayDayType ?? null;
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!(bus.coverage.weekdays ?? [1,2,3,4,5]).includes(day)) return null;
    const kind = calendar ? day === 0 ? 'SUN' : day === 6 ? 'SAT' : 'WD' : 'WD';
    if (dayTypeCache.size >= 32) dayTypeCache.clear();
    dayTypeCache.set(date,kind);
    return kind;
  };
  const supportedDate = date => validDate(date) && (dayType(date) !== null || (calendar && dayType(addDays(date,-1)) !== null));
  const windowStart = bus.coverage.earliestSeconds ?? 34200, windowEnd = bus.coverage.latestSeconds ?? 59400;
  const spanForDay = (pattern,index,kind) => {
    if (kind && pattern.dayTimingExclusions?.[kind]) return null;
    const raw = kind && pattern.stops[index].firstLast[kind];
    if (!raw) return null;
    let first = raw[0], last = raw[1];
    const originFirst = pattern.stops[0].firstLast[kind]?.[0];
    // A genuinely late-starting service can reach downstream stops after
    // midnight. Ordinary early-starting/partial first buses are not shifted.
    if (originFirst >= 18*3600 && first < 6*3600) {
      if (normalizedSpans.has(raw)) return normalizedSpans.get(raw);
      first += DAY;
      if (last < first) last += DAY;
      const normalized = [first,last];
      normalizedSpans.set(raw,normalized);
      return normalized;
    }
    return raw;
  };
  const spans = (pattern,index,serviceDate) => spanForDay(pattern,index,dayType(serviceDate));
  let maxServiceSeconds = 0;
  for (const pattern of bus.patterns) if (pattern.timingSupported !== false) for (let i=0;i<pattern.stops.length;i++) for (const kind of ['WD','SAT','SUN']) {
    const span = spanForDay(pattern,i,kind);
    if (span) maxServiceSeconds = Math.max(maxServiceSeconds,span[1]);
  }
  return {calendar,dayType,supportedDate,windowStart,windowEnd,maxServiceSeconds,
    boarding(pattern,index,ready,date,alightIndex = null,rideSeconds = 0,output = null) {
      if (!validDate(date) || !Number.isFinite(ready) || pattern.timingSupported === false) return null;
      if (!calendar) {
        const span = spans(pattern,index,date);
        if (!span) return null;
        const first = span[0], last = span[1];
        const waiting = pattern.waitSeconds ?? pattern.headways?.AM_Offpeak_Freq?.[1]*60;
        const estimate = Math.max(ready,windowStart,first) + waiting;
        return Number.isFinite(estimate) && waiting > 0 && estimate <= Math.min(last,windowEnd) ? estimate : null;
      }
      let found = false, bestSeconds = 0, bestServiceDate = null, bestOffsetSeconds = 0, bestDayType = null, bestBasis = null, bestHeadwayField = null;
      const current = Math.floor(ready/DAY);
      for (let offset = current-1; offset <= current+1; offset++) {
        const serviceDate = shiftDate(date,offset), kind = dayType(serviceDate), span = spanForDay(pattern,index,kind);
        if (!span) continue;
        const first = span[0], last = span[1], offsetSeconds = offset*DAY, localReady = ready-offsetSeconds;
        const alightSpan = alightIndex === null ? null : spanForDay(pattern,alightIndex,kind);
        if (alightIndex !== null && !alightSpan) continue;
        if (localReady > last) continue;
        const bands = bus.assumptions.headwayBands ?? [];
        // A published first arrival remains useful for short/peak services at
        // any hour. It is a single bound, never a fabricated repeating trip.
        if (localReady <= first) {
          const seconds = first+offsetSeconds;
          if (first <= last && (!alightSpan || (first+rideSeconds >= alightSpan[0] && first+rideSeconds <= alightSpan[1])) && (!found || seconds < bestSeconds)) {
            found = true;
            bestSeconds = seconds;
            bestServiceDate = serviceDate;
            bestOffsetSeconds = offsetSeconds;
            bestDayType = kind;
            bestBasis = 'published-first-arrival';
            bestHeadwayField = null;
          }
        }
        for (const band of bands) {
          const wait = pattern.headways?.[band.field]?.[1]*60;
          if (!Number.isFinite(wait) || wait <= 0) continue;
          const departure = Math.max(localReady,first,band.startSeconds,alightSpan ? alightSpan[0]-rideSeconds-wait : -Infinity)+wait;
          const seconds = departure+offsetSeconds;
          if (departure < band.endSeconds && departure <= last && (!alightSpan || (departure+rideSeconds >= alightSpan[0] && departure+rideSeconds <= alightSpan[1])) && (!found || seconds < bestSeconds)) {
            found = true;
            bestSeconds = seconds;
            bestServiceDate = serviceDate;
            bestOffsetSeconds = offsetSeconds;
            bestDayType = kind;
            bestBasis = 'published-headway-estimate';
            bestHeadwayField = band.field;
          }
        }
      }
      if (!found) return null;
      // Router-private callers may reuse separate base/retry output slots.
      // Ordinary callers retain a fresh result whose fields never change later.
      const result = output ?? {seconds:0,serviceDate:null,offsetSeconds:0,dayType:null,basis:null,headwayField:null};
      result.seconds = bestSeconds;
      result.serviceDate = bestServiceDate;
      result.offsetSeconds = bestOffsetSeconds;
      result.dayType = bestDayType;
      result.basis = bestBasis;
      result.headwayField = bestHeadwayField;
      return result;
    },
    canAlight(pattern,index,time,date,boarding) {
      const serviceDate = boarding?.serviceDate ?? date;
      const span = spans(pattern,index,serviceDate);
      if (!span) return false;
      const first = span[0], last = span[1];
      const localTime = time-(boarding?.offsetSeconds ?? 0);
      return Number.isFinite(first) && Number.isFinite(last) && localTime >= Math.max(first,windowStart) && localTime <= Math.min(last,windowEnd);
    }
  };
}

// Published headways support a waiting assumption, not exact vehicle departures.
export function createMultimodalRouter(rail, bus, walking, {busOnly = false, closedRailRouteIds = []} = {}) {
  if (bus.schemaVersion !== 1 || !Array.isArray(bus.patterns) || !Array.isArray(walking.links)) throw Error('Unsupported pilot data schema');
  const originalStops = new Map(bus.stops.map(stop => [stop.id,stop]));
  const stopIds = new Map(bus.stops.map(stop => [stop.id,busId(stop.id)]));
  const patterns = bus.patterns.filter(pattern => pattern.timingSupported !== false).map(pattern => ({...pattern,stops:pattern.stops.map(stop => ({...stop,stopId:stopIds.get(stop.stopId) ?? busId(stop.stopId)}))}));
  // A physical bus stop is also its station-level endpoint. Share the same
  // immutable routing node rather than duplicate thousands of equal objects.
  const busStops = bus.stops.map(stop => {const id=stopIds.get(stop.id);return {...stop,id,stationId:id,name:`${stop.id} · ${stop.name}`,mode:'bus',stopIds:[id],accessSeconds:0,exitSeconds:0};});
  const stations = busStops;
  const unverifiedBays = new Set((bus.assumptions?.unverifiedBayStopCodes ?? []).map(busId));
  const estimatedBays = bus.assumptions?.allowEstimatedBayTransfers === true;
  const baySeconds = bus.assumptions?.bayTransferSeconds ?? 300;
  if (estimatedBays && (!Number.isFinite(baySeconds) || baySeconds <= 0)) throw Error('Invalid estimated bus-bay transfer allowance');
  const transfers = busStops.filter(stop=>estimatedBays || !unverifiedBays.has(stop.id)).map(stop => {
    const bay = unverifiedBays.has(stop.id);
    return {fromStopId:stop.id,toStopId:stop.id,seconds:bay ? baySeconds : 60,walkSeconds:bay ? baySeconds : 0,assumed:true,estimatedBay:bay,
      provenance:bay ? `Estimated ${baySeconds/60}-minute change between boarding/alighting bays at the same bus-stop code. Follow terminal signs and confirm the boarding bay; the internal path and accessibility are unverified.` : 'Same roadside physical bus stop: assumed 60 seconds to change buses; no street crossing inferred.'};
  });
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
  const timing = createBusTiming(bus);
  const {supportedDate,windowStart,windowEnd} = timing;
  const frequency = {
    patterns,
    ...timing,
    boardingForAlight:(pattern,from,to,ready,date,duration,output=null)=>timing.calendar ? timing.boarding(pattern,from,ready,date,to,duration,output) : null,
    assumptions:[`Bus wait assumes the published applicable dispatch-band maximum headway, not an exact departure or a guaranteed upper bound.`,
      `Bus riding assumes route distance at ${bus.assumptions?.rideSpeedKph ?? 18} km/h plus ${bus.assumptions?.dwellSecondsPerStop ?? 30} seconds per traversed stop; traffic and dwell are unmeasured.`,
      'Every bus boarding and alighting must stay inside reviewed service dates and same-service-day per-stop first/last bounds. First-bus rows are not used as one through-trip timetable.',
      bus.assumptions?.headwayDayScope ?? 'Published headways are planning assumptions.',
      ...(estimatedBays ? [`Changes at a possible terminal use an estimated ${baySeconds/60}-minute walking allowance at the same stop code. Confirm the boarding bay on site; no indoor path or step-free access is established.`] : []),
      'External path plus one indoor station allowance is charged once per bus/rail transfer; station-level access/exit applies only at journey endpoints. Accessibility is unknown.'],
    riding(pattern,from,to) {
      // A source distance reset has no usable through-distance. Keep both
      // source segments in the registry, without manufacturing the missing leg.
      if (pattern.stops[from].distanceSegment !== pattern.stops[to].distanceSegment) return Infinity;
      // DataMall distances are in kilometres. Integer metres avoid rounding an
      // exact model duration up a second because 19.1 - 9.5 is 9.600000000000001.
      const meters = Math.round(pattern.stops[to].distanceKm*1000) - Math.round(pattern.stops[from].distanceKm*1000);
      return Math.ceil(meters * 3.6 / (bus.assumptions?.rideSpeedKph ?? 18) + (to-from)*(bus.assumptions?.dwellSecondsPerStop ?? 30) - 1e-9);
    }
  };
  const network = {...rail,stations:[...rail.stations,...stations],stops:[...rail.stops,...busStops],
    routes:[...rail.routes,...patterns.map(p=>({id:p.id,name:`Bus ${p.serviceNo} · direction ${p.direction}`,shortName:`Bus ${p.serviceNo}`,color:'0054a6'}))],
    trips:busOnly ? [] : rail.trips.filter(trip=>!closedRailRouteIds.includes(trip.routeId)),transfers:[...rail.transfers,...transfers],frequency};
  const router = createRailRouter(network);
  return {network,route(input) {
    const beyondCarryover = timing.calendar && input.date > bus.coverage.validThrough && clockSeconds(input.departureTime) > frequency.maxServiceSeconds-DAY;
    if ((input.originId?.startsWith('bus:') || input.destinationId?.startsWith('bus:') || busOnly) && (!supportedDate(input.date) || beyondCarryover || clockSeconds(input.departureTime) < windowStart || clockSeconds(input.departureTime) >= windowEnd)) {
      return {status:'unsupported-bus-window',routes:[],recommended:null,errors:[{message:timing.calendar ? `Bus source coverage is ${bus.coverage.validFrom}–${bus.coverage.validThrough}, with per-stop weekday/Saturday/Sunday operating spans and previous-day carryover. Unsupported holidays and missing frequency periods remain unavailable; this is not a complete timetable.` : `Bus estimates support ordinary weekdays ${bus.coverage.validFrom}–${bus.coverage.validThrough}, 09:30–16:30 only. Weekends, holidays, peak and overnight bus travel are not validated. The separate rail planner retains its wider dates.`}]};
    }
    // Find a feasible all-rail incumbent first for rail endpoints. Its arrival
    // plus the caller's detour budget is a safe upper bound for every useful
    // mixed alternative. This avoids exploring hours of buses before the
    // chronological rail scan reaches an already available destination.
    let arrivalBoundSeconds = Infinity, railPrepass = null;
    if (!busOnly && !input.progressSeed && input.maxSearchWork === undefined && input.originId && input.destinationId && !input.originId.startsWith('bus:') && !input.destinationId.startsWith('bus:')) {
      const railResult = router.route(input,{disableFrequency:true});
      railPrepass = railResult.diagnostics;
      if (railResult.routes.length) arrivalBoundSeconds = Math.min(...railResult.routes.map(r=>r.arrivalSeconds)) + Number(input.maxExtraMinutes ?? input.detourLimit ?? 15)*60;
    }
    const result = router.route(input,{arrivalBoundSeconds});
    if (railPrepass) result.diagnostics.railPrepass = railPrepass;
    if (closedRailRouteIds.length) for (const route of result.routes) route.assumptions.push(`SYNTHETIC DISRUPTION FIXTURE: rail routes ${closedRailRouteIds.join(', ')} removed for this search. Not a live closure; no mid-journey rerouting.`);
    if (result.errors?.length && input.originId?.startsWith('bus:')) for (const error of result.errors) error.message = error.message.replaceAll('rail journey','pilot journey').replaceAll('No train','No supported bus or train');
    return result;
  }};
}
