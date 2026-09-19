import {singaporeNow} from './personal.js';

const stopCode = id => String(id ?? '').replace(/^bus:/, '');
const serviceOrder = new Intl.Collator('en', {numeric:true, sensitivity:'base'});

// Terminals come from service metadata, never the ends of a sampled route segment.
export function busDirectionLabel(pattern, stops = []) {
  return directionLabel(pattern, new Map(stops.map(stop => [stopCode(stop.id), stop.name])));
}
function directionLabel(pattern, names) {
  const origin = names.get(stopCode(pattern.originCode)), destination = names.get(stopCode(pattern.destinationCode));
  const service = `Bus ${pattern.serviceNo}`;
  if (pattern.loop || (pattern.originCode && pattern.originCode === pattern.destinationCode)) {
    return `${service} · loop${origin ? ` from ${origin}` : ''}${pattern.loopDescription?.trim() ? ` via ${pattern.loopDescription.trim()}` : ''}`;
  }
  if (origin && destination) return `${service} · ${origin} → ${destination}`;
  if (destination) return `${service} · towards ${destination}`;
  if (origin) return `${service} · from ${origin} · destination name unavailable`;
  return `${service} · terminal names unavailable`;
}

// Static source metadata, including listed services whose timing is unsupported.
// The route engine still decides eligibility for the selected date and time.
export function busStopDetails(bus, routingId) {
  if (!String(routingId ?? '').startsWith('bus:')) return null;
  const code = stopCode(routingId);
  const stop = (bus.stops ?? []).find(item => stopCode(item.id) === code);
  if (!stop) return null;
  const names = new Map((bus.stops ?? []).map(item => [stopCode(item.id), item.name]));
  const services = [];
  for (const pattern of bus.patterns ?? []) {
    const visits = [];
    for (const [index, visit] of (pattern.stops ?? []).entries()) {
      if (stopCode(visit.stopId) !== code) continue;
      visits.push({
        sequence:visit.sequence ?? index + 1,
        visitNumber:visit.visitNumber ?? visits.length + 1,
        terminatesHere:index === pattern.stops.length - 1 && stopCode(pattern.destinationCode) === code,
      });
    }
    if (!visits.length) continue;
    services.push({
      patternId:pattern.id, serviceNo:String(pattern.serviceNo), direction:pattern.direction,
      operator:pattern.operator, directionLabel:directionLabel(pattern, names),
      loop:Boolean(pattern.loop || (pattern.originCode && pattern.originCode === pattern.destinationCode)),
      originCode:pattern.originCode, destinationCode:pattern.destinationCode,
      originName:names.get(stopCode(pattern.originCode)), destinationName:names.get(stopCode(pattern.destinationCode)),
      timingSupported:pattern.timingSupported !== false, visits,
    });
  }
  services.sort((a,b) => serviceOrder.compare(a.serviceNo,b.serviceNo) || serviceOrder.compare(String(a.direction ?? ''),String(b.direction ?? '')) || serviceOrder.compare(a.operator ?? '',b.operator ?? ''));
  return {stopCode:code,name:stop.name,roadName:stop.roadName ?? '',services};
}

export function endpointCatalog(network, bus, personal = {places:[]}) {
  const directions = new Map(), services = new Map(), timingStops = new Set();
  const names = new Map((bus.stops ?? []).map(stop => [stopCode(stop.id), stop.name]));
  for (const pattern of bus.patterns ?? []) {
    const label = directionLabel(pattern, names);
    for (const stop of pattern.stops) {
      const key = `bus:${stopCode(stop.stopId)}`;
      if (!directions.has(key)) {directions.set(key, new Set());services.set(key, new Set());}
      directions.get(key).add(label);
      services.get(key).add(String(pattern.serviceNo));
      if(pattern.timingSupported!==false)timingStops.add(key);
    }
  }
  const base = network.stations.map(s => {
    const isBus=s.id.startsWith('bus:');
    const codes=isBus?[s.id.slice(4)]:[...new Set([s.id,...(s.stopIds??[])].map(id=>id.split('_')[0]))];
    return {id:s.id,routingId:s.id,codes,label:s.name,lat:s.lat,lng:s.lon ?? s.lng,stationId:s.id,sourceId:`lta:${s.id}`,coverage:isBus&&!timingStops.has(s.id)?'listed':'supported',accessibility:'unknown',kind:isBus?'bus':'train',
      detail:isBus?[...(services.get(s.id)??[])].sort(serviceOrder.compare).join(', '):`${codes.join(' / ')} · Rail station`,
      ...(isBus?{stopCode:codes[0],roadName:s.roadName ?? '',searchText:[...(directions.get(s.id)??[]),s.roadName].filter(Boolean).join(' · ')}:{}),
    };
  });
  return [...(personal.places ?? []).map(p=>({...p,kind:'saved',routingId:p.routingId ?? p.stationId,detail:`Saved place · ${base.find(s=>s.id===(p.routingId??p.stationId))?.label ?? 'connection unverified'}`})),...base];
}

// Explain only causes established by the result code or returned route timings.
// A missing connection in this prototype does not establish a real-world outage.
export function plannerFeedback(result, input = {}, {railCoverage = {}, busCoverage = {}} = {}) {
  const code = result.errors?.[0]?.code ?? result.status;
  const feedback = (kind, title, message) => ({kind, title, message});
  const limitation = (title, message) => feedback('coverage', `Work in progress — ${title}`, message);
  if (result.status === 'unsupported-bus-window') return limitation('bus coverage', busCoverage.calendarMode === 'service-day' ? `Bus data covers ${busCoverage.validFrom} to ${busCoverage.validThrough}. Weekday, Saturday and Sunday stop spans are checked separately, including previous-day services after midnight. Some services, holidays and frequency periods remain unverified. Choose a covered date or try rail stations. This is a prototype data limit, not a statement that buses are not running.` : `Bus estimates are available on ordinary weekdays${busCoverage.validFrom && busCoverage.validThrough ? ` from ${busCoverage.validFrom} to ${busCoverage.validThrough}` : ''}, ${clock(busCoverage.earliestSeconds ?? 34200)}–${clock(busCoverage.latestSeconds ?? 59400)} SGT. Try a time in that window or choose rail stations. This is a prototype data limit, not a statement that buses are not running.`);
  if (result.status === 'search-limit') return limitation('planning limit','This search reached the bounded planning limit. Try a shorter journey or departure window. No partial result was selected and your accepted trip is unchanged.');
  if (result.status === 'cancelled') return feedback('search','Search cancelled','Your accepted trip is unchanged. Start another search when ready.');
  if (result.status === 'unsupported-date') return limitation('timetable dates', `Choose a date${railCoverage.startDate && railCoverage.endDate ? ` between ${railCoverage.startDate} and ${railCoverage.endDate}` : ' within the imported timetable range'}. Timetables outside that range have not been imported.`);
  if (result.status === 'unsupported-station') return limitation('station coverage', 'Choose a station or bus stop from the suggestions. Addresses and unlisted stops do not yet have verified routing connections.');
  if (result.status === 'disconnected') return limitation('connecting routes', 'These places are not connected by the routes and interchanges included in this prototype. Try another supported station or stop, or check an operator journey planner for other connections.');
  if (code === 'walking-limit') return feedback('constraint', 'Your walking allowance is too short', `${result.errors[0].message} Increase the walking limit in Settings or choose different stations.`);
  if (result.status === 'invalid-input') return feedback('constraint', 'Check your journey details', result.errors?.map(error=>error.message).join(' ') || 'Check the departure date, time and arrival deadline. Times are in Singapore time (SGT).');
  if (result.status === 'same-station') return feedback('constraint', 'Choose a different destination', 'Your starting point and destination are the same.');
  if (code === 'impossible-deadline' || (result.routes?.length && result.routes.every(route=>route.deadlineMet===false))) return feedback('constraint', 'The available routes arrive after your deadline', 'Try leaving earlier or choose a later arrival deadline. Bus arrival times are estimates.');
  if (result.status === 'no-service') return feedback('search', 'No supported departure found at this time', 'The imported services offer no boarding from your start within this search window. Try an earlier departure or another covered date. Check the operator for services outside this prototype’s coverage.');
  return feedback('search', 'We couldn’t find a supported connection', `Try another departure time or date, or increase your ${Number.isFinite(Number(input.walkingLimitMinutes)) ? `${Number(input.walkingLimitMinutes)}-minute ` : ''}walking allowance in Settings. You can also try another listed station or stop. The search did not identify one exact cause; a real-world route may exist beyond this prototype’s data.`);
}
export function suggestEndpoints(catalog,query,limit=10) {
  const q=String(query).trim().toLowerCase();
  const rank=p=>(p.codes??[p.routingId]).some(c=>c?.toLowerCase()===q)?2:Number(p.label.toLowerCase().startsWith(q));
  return catalog.filter(p=>!q||`${p.label} ${p.routingId??''} ${p.detail} ${p.searchText??''}`.toLowerCase().includes(q)).sort((a,b)=>rank(b)-rank(a)).slice(0,limit);
}
export function resolveEndpoint(catalog,id,network) {
  const p=catalog.find(p=>p.id===id);
  if(!p || !network.stations.some(s=>s.id===p.routingId))throw Error('Choose a supported station or bus stop from the suggestions. This address or saved place has no verified routing connection.');
  return p;
}
export function timeInput({timeMode='leave-now',date,departureTime,deadlineDate,deadlineTime},now=Date.now()) {
  const current=singaporeNow(now);
  if(timeMode==='leave-now')return {timeMode,date:current.departureDate,departureTime:current.departureTime};
  if(!['depart-later','arrive-by'].includes(timeMode))throw Error('Choose a supported time mode.');
  const validDate=v=>{const parsed=new Date(v+'T12:00:00Z');return /^\d{4}-\d\d-\d\d$/.test(v??'')&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v;};
  const validTime=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v??'');
  if(!validDate(date)||!validTime(departureTime))throw Error('Choose a valid departure date and time in Singapore.');
  if(timeMode==='arrive-by'&&(!validDate(deadlineDate)||!validTime(deadlineTime)))throw Error('Choose the arrival deadline date and time.');
  return {timeMode,date,departureTime,...(timeMode==='arrive-by'?{deadlineDate,deadlineTime}:{})};
}
export const clock=s=>`${String(Math.floor(s/3600)%24).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}${s>=86400?` (+${Math.floor(s/86400)} day)`:''}`;
