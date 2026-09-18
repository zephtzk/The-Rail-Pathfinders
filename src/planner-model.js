import {singaporeNow} from './personal.js';

export function endpointCatalog(network, bus, personal = {places:[]}) {
  const directions = new Map();
  for (const pattern of bus.patterns ?? []) for (const stop of pattern.stops) {
    const key = `bus:${stop.stopId}`, label = `${pattern.serviceNo} direction ${pattern.direction}`;
    directions.set(key, [...new Set([...(directions.get(key) ?? []), label])]);
  }
  const base = network.stations.map(s => {const codes=s.id.startsWith('bus:')?[s.id.slice(4)]:[...new Set([s.id,...(s.stopIds??[]).map(id=>id.split('_')[0])])];return {id:s.id,routingId:s.id,codes,label:s.name,lat:s.lat,lng:s.lon ?? s.lng,stationId:s.id,sourceId:`lta:${s.id}`,coverage:'supported',accessibility:'unknown',kind:s.id.startsWith('bus:')?'bus':'train',detail:s.id.startsWith('bus:')?`${s.roadName ?? ''} · ${(directions.get(s.id)??[]).join(', ')}`:`${codes.join(' / ')} · Rail station`};});
  return [...(personal.places ?? []).map(p=>({...p,kind:'saved',routingId:p.routingId ?? p.stationId,detail:`Saved place · ${p.stationId ?? 'connection unverified'}`})),...base];
}
export function suggestEndpoints(catalog,query,limit=10) {
  const q=String(query).trim().toLowerCase();
  const rank=p=>(p.codes??[p.routingId]).some(c=>c?.toLowerCase()===q)?2:Number(p.label.toLowerCase().startsWith(q));
  return catalog.filter(p=>!q||`${p.label} ${p.routingId??''} ${p.detail}`.toLowerCase().includes(q)).sort((a,b)=>rank(b)-rank(a)).slice(0,limit);
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
  const validDate=v=>/^\d{4}-\d\d-\d\d$/.test(v??'')&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const validTime=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v??'');
  if(!validDate(date)||!validTime(departureTime))throw Error('Choose a valid departure date and time in Singapore.');
  if(timeMode==='arrive-by'&&(!validDate(deadlineDate)||!validTime(deadlineTime)))throw Error('Choose the arrival deadline date and time.');
  return {timeMode,date,departureTime,...(timeMode==='arrive-by'?{deadlineDate,deadlineTime}:{})};
}
export const clock=s=>`${String(Math.floor(s/3600)%24).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}${s>=86400?` (+${Math.floor(s/86400)} day)`:''}`;
