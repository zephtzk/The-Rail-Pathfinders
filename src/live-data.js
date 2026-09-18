// Existing corridor only; these are line-specific station codes, not a network import.
export const LIVE_STATIONS = [
  ...['Tampines','Simei','Tanah Merah','Bedok','Kembangan','Eunos','Paya Lebar','Aljunied','Kallang','Lavender','Bugis'].map((name,i)=>({code:`EW${i+2}`,line:'EWL',name})),
  ...['Promenade','Nicoll Highway','Stadium','Mountbatten','Dakota','Paya Lebar'].map((name,i)=>({code:`CC${i+4}`,line:'CCL',name})),
  {code:'DT14',line:'DTL',name:'Bugis'},{code:'DT15',line:'DTL',name:'Promenade'}
];
export const LIVE_LINES = ['EWL','CCL','DTL'];
export function stationTokens(value) {
  return typeof value==='string' ? [...new Set(value.toUpperCase().match(/\b(?:EW|CC|DT|NS|NE|TE|CG|CE|BP|SE|SW|PE|PW)\d+\b/g)??[])] : [];
}
export function offsetTime(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)return null;
  const ms=Date.parse(value);return Number.isFinite(ms)?ms:null;
}
export function crowdFreshness(row,now=Date.now()) {
  if(!row||!['l','m','h','NA'].includes(row.level))return 'unknown';
  const start=offsetTime(row.startTime),end=offsetTime(row.endTime);
  if(start===null||end===null||end<=start)return 'unknown';
  if(start>now)return 'future';
  if(now>=end)return 'expired';
  if(row.level==='NA'||row.conflict)return 'unknown';
  return 'current';
}
export function noticeRelevance(segment) {
  const line=typeof segment?.Line==='string'?segment.Line.toUpperCase():null;
  // Separators documented for explicit station lists. Ranges/prose cannot prove exclusion.
  const raw=segment?.Stations,explicit=typeof raw==='string'&&/^(?:[A-Z]{2}\d+)(?:\s*[,|;/]\s*[A-Z]{2}\d+)*$/i.test(raw.trim());
  const codes=explicit?stationTokens(raw):[];
  const matches=codes.filter(code=>LIVE_STATIONS.some(s=>s.code===code&&s.line===line));
  if(matches.length)return {relevance:'corridor',codes:matches,line};
  if(['NSL','NEL','TEL','BPL','SLRT','PLRT','CEL','CGL'].includes(line)&&!codes.some(code=>LIVE_STATIONS.some(s=>s.code===code)))return {relevance:'elsewhere',codes:[],line};
  if(raw)return {relevance:'unmapped',codes:[],line:LIVE_LINES.includes(line)?line:null};
  if(LIVE_LINES.includes(line))return {relevance:'line',codes:[],line};
  if(line&&['NSL','NEL','TEL','BPL','SLRT','PLRT','CEL','CGL'].includes(line))return {relevance:'elsewhere',codes:[],line};
  return {relevance:'unmapped',codes:[],line:null};
}

const snapshotPick=(obj,fields)=>Object.fromEntries(fields.filter(k=>obj?.[k]!==undefined&&[null,'string','number','boolean'].includes(obj[k]===null?null:typeof obj[k])).map(k=>[k,typeof obj[k]==='string'?obj[k].slice(0,2000):obj[k]]));
const snapshotMeta=['status','error','httpStatus','retrievedAt','attemptedAt','nextRefreshAt'];
const snapshotStrings=value=>Array.isArray(value)?value.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,80)):[];
export function liveSnapshot(value) {
  if(value?.schemaVersion!==1||!value.notices||!Array.isArray(value.crowding?.lines))return null;
  try{
    const p=JSON.parse(JSON.stringify(value));if(JSON.stringify(p).length>180000)return null;
    const notices={...snapshotPick(p.notices,[...snapshotMeta,'serviceStatus','sourceTime','expiresAt','missingFields','invalidRecords','limits']),
      missingFields:snapshotStrings(p.notices.missingFields),
      items:(p.notices.items??[]).slice(0,100).map(x=>snapshotPick(x,['id','text','sourceTime','expiresAt','relevance'])),
      segments:(p.notices.segments??[]).slice(0,100).map(x=>({...snapshotPick(x,['direction','stationIdentifiers','startsAt','endsAt','routeImpact']),...noticeRelevance({Line:x.line,Stations:x.stationIdentifiers})}))};
    return {schemaVersion:1,...snapshotPick(p,['status','checkedAt','clientReceivedAt','source','message']),notices,
      crowding:{...snapshotPick(p.crowding,['status']),lines:p.crowding.lines.filter(l=>LIVE_LINES.includes(l?.line)).slice(0,3).map(l=>({...snapshotPick(l,[...snapshotMeta,'line','receivedRecords','invalidRecords','unmappedRecords','source']),missingCodes:snapshotStrings(l.missingCodes),
        records:(l.records??[]).slice(0,30).filter(r=>LIVE_STATIONS.some(s=>s.code===r.code&&s.line===l.line)).map(r=>snapshotPick(r,['code','name','line','reportedStation','level','startTime','endTime','observationTime','conflict']))}))},routing:{status:'replay'}};
  }catch{return null;}
}
