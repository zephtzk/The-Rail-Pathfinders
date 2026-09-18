import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import os from 'node:os';
import {createRailRouter} from '../src/rail-engine.js';
import {checkRailImport} from './check-rail-import.mjs';

const manifest=await checkRailImport();
// Targets chosen before measurement. Desktop CPU only; mobile hardware is separate.
const targets={warmP95Ms:500,coldParseIndexAndFirstQueryMs:2000,networkGzipBytes:2.5*1024*1024};
const bytes=await readFile('public/data/rail-network.json');
const started=performance.now(),network=JSON.parse(bytes),router=createRailRouter(network);
const query=(origin,destination,extra={})=>({origin,destination,date:'2026-09-19',departure:'08:10',deadline:'11:00',walkingLimit:30,preference:'fastest',...extra});
const cases=[query('DT32','DT14'),query('DT14','DT32'),query('NS5','NE18'),query('NE18','NS5'),query('NS23','PE6'),query('PE6','NS23'),query('TE1','CG2'),query('CG2','TE1'),query('BP2','NE18'),query('NE18','BP2'),query('CC29','EW24'),query('EW24','CC29'),query('BP2','BP3',{date:'2026-09-20'}),query('DT32','DT14',{departure:'23:50',deadlineDate:'2026-09-20',deadline:'01:00'}),query('NS5','NE18',{walkingLimit:4}),query('DT32','DT14',{deadline:'08:11'})];
const first=router.route(cases[0]);
const coldMs=performance.now()-started;
const samples=[],outcomes=[];
for(let round=0;round<4;round++)for(const input of cases){
 const start=performance.now(),result=router.route(input),ms=performance.now()-start;
 samples.push(ms);
 if(round===0)outcomes.push({input,status:result.status,arrivalSeconds:result.recommended?.arrivalSeconds??result.routes[0]?.arrivalSeconds??null,transfers:result.recommended?.transfers??null,walkSeconds:result.recommended?.walkingSeconds??null});
}
samples.sort((a,b)=>a-b);
const p95=samples[Math.ceil(samples.length*.95)-1];
const gzipBytes=gzipSync(bytes,{level:9,mtime:0}).length;
const report={recordedAt:new Date().toISOString(),evidenceClass:'desktop Node benchmark, not phone or network latency',runtime:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,buildId:manifest.buildId,targets,measurements:{queries:samples.length,coldParseIndexAndFirstQueryMs:coldMs,warmMedianMs:samples[Math.floor(samples.length/2)],warmP95Ms:p95,warmMaxMs:samples.at(-1),networkBytes:bytes.length,networkGzipBytes:gzipBytes,sourceArchiveBytes:manifest.source.archiveBytes,processRssBytes:process.memoryUsage().rss},checks:{cold:coldMs<=targets.coldParseIndexAndFirstQueryMs,warm:p95<=targets.warmP95Ms,size:gzipBytes<=targets.networkGzipBytes},firstStatus:first.status,cases:outcomes};
await mkdir('docs/evidence/phase2',{recursive:true});
await writeFile('docs/evidence/phase2/benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({measurements:report.measurements,checks:report.checks},null,2));
if(Object.values(report.checks).some(value=>!value))process.exitCode=1;
