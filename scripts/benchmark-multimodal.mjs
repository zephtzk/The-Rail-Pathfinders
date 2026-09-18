import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import os from 'node:os';
import {createMultimodalRouter} from '../src/multimodal-engine.js';
const paths=['rail-network','bus-network','walking-links'],bytes=await Promise.all(paths.map(p=>readFile(`public/data/${p}.json`)));
const start=performance.now(),[rail,bus,walking]=bytes.map(b=>JSON.parse(b));
const router=createMultimodalRouter(rail,bus,walking);
const pairs=[['bus:75009','DT14'],['DT14','bus:75009'],['bus:75009','bus:75059'],['bus:75009','bus:81119'],['bus:81111','bus:75009'],['bus:99009','NS22'],['NS22','bus:99009'],['NS9','CG2']];
const base={date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:20,preference:'fastest',maxExtraMinutes:15};
const first=router.route({...base,originId:pairs[0][0],destinationId:pairs[0][1]}),cold=performance.now()-start;
const samples=[];
for(let repetition=0;repetition<3;repetition++)for(const [originId,destinationId] of pairs){const t=performance.now(),r=router.route({...base,originId,destinationId});samples.push({originId,destinationId,ms:performance.now()-t,status:r.status,arrivalSeconds:r.recommended?.arrivalSeconds});}
const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b),compressed=bytes.reduce((s,b)=>s+gzipSync(b,{level:9}).length,0);
const result={recordedAt:new Date().toISOString(),evidenceClass:'Node desktop; no physical-device inference',runtime:process.version,cpu:os.cpus()[0].model,
 targetsSetBeforeMeasurement:{warmP95Ms:1000,coldBrowserMs:3000,compressedCombinedBytes:3*1024*1024,browserHeapBytes:150*1024*1024},
 data:paths.map((name,i)=>({name,bytes:bytes[i].length,gzipBytes:gzipSync(bytes[i],{level:9}).length,sha256:createHash('sha256').update(bytes[i]).digest('hex')})),compressedCombinedBytes:compressed,coldParseIndexFirstQueryMs:cold,firstStatus:first.status,warmP95Ms:sorted[Math.ceil(sorted.length*.95)-1],samples,processMemory:process.memoryUsage()};
await mkdir('docs/evidence/phase3',{recursive:true});await writeFile('docs/evidence/phase3/benchmark.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({coldMs:cold,warmP95Ms:result.warmP95Ms,compressedBytes:compressed,statuses:[...new Set(samples.map(s=>s.status))]}));
if(result.warmP95Ms>1000||compressed>3*1024*1024)process.exitCode=1;
