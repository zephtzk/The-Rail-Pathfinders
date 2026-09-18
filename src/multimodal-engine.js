import {createRailRouter} from './rail-engine.js';

export const busId = code => `bus:${code}`;
const clockSeconds = value => { const parts = String(value).split(':').map(Number); return parts[0]*3600 + parts[1]*60; };
const DAY = 86400;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days*86400000).toISOString().slice(0,10);

// Service-day clocks are independent of browser timezone. A Saturday 00:10
// query may still be using Friday's WD span; do not borrow Saturday's last bus.
export function createBusTiming(bus) {
  const calendar = bus.coverage.calendarMode === 'service-day';
  const dayTypeCache = new Map(), shiftedDates = new Map();
  const shiftDate = (date,offset) => {
    const key = `${date}:${offset}`;
    if (!shiftedDates.has(key)) { if (shiftedDates.size >= 32) shiftedDates.clear(); shiftedDates.set(key,addDays(date,offset)); }
    return shiftedDates.get(key);
  };
  const validDate = date => typeof date === 'string' && /^\d{4}-\d\d-\d\d$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) === date;
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
    let [first,last] = raw;
    const originFirst = pattern.stops[0].firstLast[kind]?.[0];
    // A genuinely late-starting service can reach downstream stops after
    // midnight. Ordinary early-starting/partial first buses are not shifted.
    if (originFirst >= 18*3600 && first < 6*3600) { first += DAY; if (last < first) last += DAY; }
    return [first,last];
  };
  const spans = (pattern,index,serviceDate) => spanForDay(pattern,index,dayType(serviceDate));
  let maxServiceSeconds = 0;
  for (const pattern of bus.patterns) if (pattern.timingSupported !== false) for (let i=0;i<pattern.stops.length;i++) for (const kind of ['WD','SAT','SUN']) {
    const span = spanForDay(pattern,i,kind);
    if (span) maxServiceSeconds = Math.max(maxServiceSeconds,span[1]);
  }
  return {calendar,dayType,supportedDate,windowStart,windowEnd,maxServiceSeconds,
    boarding(pattern,index,ready,date,alightIndex = null,rideSeconds = 0) {
      if (!validDate(date) || !Number.isFinite(ready)) return null;
      if (!calendar) {
        const [first,last] = spans(pattern,index,date) ?? [];
        const waiting = pattern.waitSeconds ?? pattern.headways?.AM_Offpeak_Freq?.[1]*60;
        const estimate = Math.max(ready,windowStart,first) + waiting;
        return Number.isFinite(estimate) && waiting > 0 && estimate <= Math.min(last,windowEnd) ? estimate : null;
      }
      let best = null;
      const current = Math.floor(ready/DAY);
      for (let offset = current-1; offset <= current+1; offset++) {
        const serviceDate = shiftDate(date,offset), span = spans(pattern,index,serviceDate);
        if (!span) continue;
        const [first,last] = span, localReady = ready-offset*DAY;
        const alightSpan = alightIndex === null ? null : spans(pattern,alightIndex,serviceDate);
        if (alightIndex !== null && !alightSpan) continue;
        if (localReady > last) continue;
        const consider = (localTime, basis, headwayField = null) => {
          const seconds = localTime+offset*DAY;
          if (alightSpan && (localTime+rideSeconds < alightSpan[0] || localTime+rideSeconds > alightSpan[1])) return;
          if (seconds >= ready && localTime >= first && localTime <= last && (!best || seconds < best.seconds)) best = {seconds,serviceDate,offsetSeconds:offset*DAY,dayType:dayType(serviceDate),basis,headwayField};
        };
        const bands = bus.assumptions.headwayBands ?? [];
        if (first < (bands[0]?.startSeconds ?? 23400) && localReady <= first) consider(first,'published-first-arrival');
        for (const band of bands) {
          const wait = pattern.headways?.[band.field]?.[1]*60;
          if (!Number.isFinite(wait) || wait <= 0) continue;
          const departure = Math.max(localReady,first,band.startSeconds,alightSpan ? alightSpan[0]-rideSeconds-wait : -Infinity)+wait;
          if (departure < band.endSeconds) consider(departure,'published-headway-estimate',band.field);
        }
      }
      return best;
    },
    canAlight(pattern,index,time,date,boarding) {
      const serviceDate = boarding?.serviceDate ?? date;
      const [first,last] = spans(pattern,index,serviceDate) ?? [];
      const localTime = time-(boarding?.offsetSeconds ?? 0);
      return Number.isFinite(first) && Number.isFinite(last) && localTime >= Math.max(first,windowStart) && localTime <= Math.min(last,windowEnd);
    }
  };
}

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
  const timing = createBusTiming(bus);
  const {supportedDate,windowStart,windowEnd} = timing;
  const frequency = {
    patterns,
    ...timing,
    boardingForAlight:(pattern,from,to,ready,date,duration)=>timing.calendar ? timing.boarding(pattern,from,ready,date,to,duration) : null,
    assumptions:[`Bus wait assumes the published applicable dispatch-band maximum headway, not an exact departure or a guaranteed upper bound.`,
      `Bus riding assumes route distance at ${bus.assumptions?.rideSpeedKph ?? 18} km/h plus ${bus.assumptions?.dwellSecondsPerStop ?? 30} seconds per traversed stop; traffic and dwell are unmeasured.`,
      'Every bus boarding and alighting must stay inside reviewed service dates and same-service-day per-stop first/last bounds. First-bus rows are not used as one through-trip timetable.',
      bus.assumptions?.headwayDayScope ?? 'Published headways are planning assumptions.',
      'External path plus one indoor station allowance is charged once per bus/rail transfer; station-level access/exit applies only at journey endpoints. Accessibility is unknown.'],
    riding(pattern,from,to) {
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
    const result = router.route(input);
    if (closedRailRouteIds.length) for (const route of result.routes) route.assumptions.push(`SYNTHETIC DISRUPTION FIXTURE: rail routes ${closedRailRouteIds.join(', ')} removed for this search. Not a live closure; no mid-journey rerouting.`);
    if (result.errors?.length && input.originId?.startsWith('bus:')) for (const error of result.errors) error.message = error.message.replaceAll('rail journey','pilot journey').replaceAll('No train','No supported bus or train');
    return result;
  }};
}
