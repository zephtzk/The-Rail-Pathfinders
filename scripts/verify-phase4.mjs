import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import worker from '../dist/server/index.js';
import {createMultimodalRouter} from '../src/multimodal-engine.js';
import {acceptJourney,compareJourney,confirmProgress,ingestEvents} from '../src/journey-state.js';
const out=process.env.CAPTURE_DIR??'docs/evidence/phase4',results=[];await mkdir(out,{recursive:true});
const check=(name,value)=>{assert.ok(value,name);results.push({name,status:'PASS'});};
const paths=['rail-network','bus-network','walking-links'],bytes=await Promise.all(paths.map(p=>readFile(`public/data/${p}.json`)));
for(const [i,name] of paths.entries())for(const compression of ['gzip','identity','gzip;q=0']){
 const response=await worker.fetch(new Request(`http://localhost/data/${name}.json`,{headers:{'Accept-Encoding':compression}}),{},{}),body=Buffer.from(await response.arrayBuffer());
 assert.deepEqual(compression==='gzip'?gunzipSync(body):body,bytes[i]);check(`${name} correct bytes and encoding ${compression}`,response.headers.get('Content-Encoding')===(compression==='gzip'?'gzip':null));
}
for(const endpoint of ['/api/notices','/api/status']){const response=await worker.fetch(new Request(`http://localhost${endpoint}`),{},{}),body=await response.json();check(`${endpoint} honest no-secret and no-store`,body.notices.error==='not_configured'&&response.headers.get('Cache-Control')==='no-store');}
const code=await readFile('dist/server/index.js','utf8');check('delivered Worker has no transient local credential probe',!code.includes('__local_bus_acquisition_')&&!code.includes('__phase4_'));
const identity=JSON.parse(await readFile('dist/client/data/application-build.json'));
const httpIdentity=await (await worker.fetch(new Request('http://localhost/data/application-build.json'),{},{})).json();assert.deepEqual(identity,httpIdentity);check('HTTP application identity matches built artifact',true);
const data=bytes.map(b=>JSON.parse(b)),start=performance.now(),router=createMultimodalRouter(...data);
const input={originId:'DT14',destinationId:'NS22',date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:20,preference:'fastest',maxExtraMinutes:15};
const route=router.route(input).recommended,state=acceptJourney(route,input,'benchmark');compareJourney(state,router);const coldMs=performance.now()-start;
const scenarios=['undisrupted','synthetic-cancelled','confirmed-missed-connection'];
function prepare(routing,q,scenario,now){
 const r=routing.route(q).recommended;assert.ok(r,'benchmark route exists');let s=acceptJourney(r,q,'benchmark',now);
 const index=r.legs.findIndex(l=>l.type==='ride'&&l.mode==='rail'),leg=r.legs[index];assert.ok(leg,'benchmark has a rail ride');
 if(scenario==='synthetic-cancelled')s=ingestEvents(s,[{id:'benchmark-cancel',revision:1,evidence:'synthetic',effect:'cancelled',build:s.build,tripId:leg.tripId,routeId:leg.routeId,directionId:leg.directionId,serviceDate:leg.serviceDate,impactStartSeconds:leg.startSeconds,impactEndSeconds:leg.endSeconds,sourceTime:new Date(now).toISOString(),retrievedAt:new Date(now).toISOString(),validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+90000).toISOString()}],routing.network,now);
 if(scenario==='confirmed-missed-connection')s=confirmProgress(s,{kind:'waiting',legIndex:index,confirmedSeconds:leg.startSeconds+60,walkedSeconds:r.legs.slice(0,index).reduce((n,l)=>n+(l.walkingSeconds??0),0)},now);
 return s;
}
function validateComparison(s,c,scenario){
 assert.ok(c.alternative,'comparison includes feasible alternative');
 assert.ok(c.alternative.walkingSeconds+s.progress.walkedSeconds<=Number(s.input.walkingLimitMinutes)*60,'original walking allowance respected');
 if(scenario==='undisrupted'){assert.equal(c.status,'continue');return;}
 assert.equal(c.status,'offer');assert.equal(c.continuing.feasible,false);
 if(scenario==='synthetic-cancelled'){
  assert.equal(c.checked[0]?.applicable,true);assert.equal(c.relevant.length,1);
  const e=s.events[0];assert.ok(!c.alternative.legs.some(l=>l.tripId===e.tripId&&l.serviceDate===e.serviceDate),'cancelled trip excluded');
 }else assert.match(c.continuing.reason,/missed/);
}
const coldScenarios=[];
for(const scenario of scenarios){const begin=performance.now(),routing=createMultimodalRouter(...data),now=Date.now(),s=prepare(routing,input,scenario,now),c=compareJourney(s,routing,now);const ms=performance.now()-begin;validateComparison(s,c,scenario);coldScenarios.push({scenario,indexRouteEventAndComparisonMs:ms,status:c.status});}
const samples=[];
for(const scenario of scenarios)for(const [originId,destinationId] of [['DT14','NS22'],['bus:75009','DT14'],['DT14','bus:75009'],['NS9','CG2']])for(let i=0;i<5;i++){
 const q={...input,originId,destinationId},now=Date.now(),s=prepare(router,q,scenario,now),begin=performance.now(),c=compareJourney(s,router,now),ms=performance.now()-begin;
 validateComparison(s,c,scenario);samples.push({scenario,originId,destinationId,ms,status:c.status});
}
const scenarioMetrics=scenarios.map(scenario=>{const times=samples.filter(s=>s.scenario===scenario).map(s=>s.ms).sort((a,b)=>a-b);const p95=times[Math.ceil(times.length*.95)-1];check(`${scenario} comparison warm p95 <=1000ms`,p95<=1000);return {scenario,samples:times.length,warmP95Ms:p95};});
const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1],compressed=bytes.reduce((n,b)=>n+gzipSync(b,{level:9}).length,0);
check('complete comparison warm p95 <=1000ms',p95<=1000);check('routing data gzip <=3MiB',compressed<=3*1024*1024);
const evidence={recordedAt:new Date().toISOString(),evidenceClass:'local complete Worker and Node comparison benchmark; no WAN/physical-device inference',sourceBase:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),applicationBuild:identity,workerSha256:createHash('sha256').update(code).digest('hex'),node:process.version,zlib:process.versions.zlib,cpu:os.cpus()[0].model,targets:{startupBrowserMs:3000,warmComparisonP95Ms:1000,firstResultHeapBytes:150*1024*1024,compressedDataBytes:3*1024*1024,automaticStartupLiveRequests:0,noticeMinimumRefreshMs:60000,busMinimumRefreshMs:30000,upstreamTimeoutMs:6000},coldIndexRouteAndComparisonMs:coldMs,coldScenarios,scenarioMetrics,warmP95Ms:p95,compressedBytes:compressed,processMemory:process.memoryUsage(),samples,results};
await writeFile(out+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({checks:results.length,application:identity.applicationSha256,worker:evidence.workerSha256,warmP95Ms:p95,compressedBytes:compressed}));
