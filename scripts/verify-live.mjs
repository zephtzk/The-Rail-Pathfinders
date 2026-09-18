// Reads this app's adapter, not DataMall directly. Saves only sanitised contract evidence.
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {crowdFreshness,LIVE_STATIONS} from '../src/live-data.js';
export function summarizeLive(body,now=Date.now()) {
const report={mode:'live-application-adapter',recordedAt:new Date(now).toISOString(),schemaVersion:body.schemaVersion,
  rawPayloadsRetained:false,credentialsRetained:false,noticeTextRetained:false,
  notices:{status:body.notices?.status,httpStatus:body.notices?.httpStatus,error:body.notices?.error,retrievedAt:body.notices?.retrievedAt,
    serviceStatus:body.notices?.serviceStatus,itemCount:body.notices?.items?.length,segmentCount:body.notices?.segments?.length,
    missingFields:body.notices?.missingFields,invalidRecords:body.notices?.invalidRecords,
    sourceTimes:(body.notices?.items??[]).map(a=>a.sourceTime).filter(t=>typeof t==='string'&&/^[0-9T :+.Z-]{8,35}$/.test(t)),
    segmentRelevance:(body.notices?.segments??[]).map(s=>s.relevance)},
  crowding:(body.crowding?.lines??[]).map(l=>({line:l.line,status:l.status,httpStatus:l.httpStatus,error:l.error,retrievedAt:l.retrievedAt,
    receivedRecords:l.receivedRecords,invalidRecords:l.invalidRecords,unmappedRecords:l.unmappedRecords,missingCodes:l.missingCodes,
    expectedCorridorCodes:LIVE_STATIONS.filter(s=>s.line===l.line).map(s=>s.code),
    records:(l.records??[]).map(r=>({code:r.code,reportedStation:r.reportedStation,level:r.level,startTime:r.startTime,endTime:r.endTime,freshness:crowdFreshness(r,now)}))})),
  limits:'One application snapshot. Fresh observations and real disruption/recovery variants may not be present; absence is not a test pass.'};
const succeeded=feed=>feed.httpStatus===200&&feed.error===null&&['available','empty'].includes(feed.status);
report.accessCheck=succeeded(report.notices)&&report.crowding.length===3&&report.crowding.every(succeeded)?'PASS':'BLOCKED';
report.corridorMappingCheck=report.accessCheck==='PASS'&&report.crowding.every(l=>l.missingCodes?.length===0&&l.invalidRecords===0&&l.records.length===l.expectedCorridorCodes.length)?'PASS':'NOT TESTED';
return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
const base=process.env.TEST_BASE_URL??'http://localhost:4173';
const response=await fetch(new URL('/api/status',base),{signal:AbortSignal.timeout(12000)});
if(!response.ok)throw Error('Local adapter request failed');
const report=summarizeLive(await response.json());
await mkdir('test-results/phase1',{recursive:true});
await writeFile('test-results/phase1/live-adapter.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({accessCheck:report.accessCheck,corridorMappingCheck:report.corridorMappingCheck,lines:report.crowding.map(l=>({line:l.line,matched:l.records.length,missing:l.missingCodes})),output:'test-results/phase1/live-adapter.json'}));
}
