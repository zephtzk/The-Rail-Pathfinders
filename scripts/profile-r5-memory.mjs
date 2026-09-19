// Reproduce the R5 inside-search memory probe without editing production engines.
// Run serially, after source changes settle:
//   node --expose-gc scripts/profile-r5-memory.mjs
//   node --expose-gc scripts/profile-r5-memory.mjs --output test-results/memory.json
// The ignored engine copies differ only by two reversible diagnostics probes.
// Sampling and retained summaries add overhead. Observed maxima are lower bounds
// on the true peak between probes, not browser/physical-phone measurements.
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const dataNames=['rail-network','bus-network','walking-links'];
const sourceNames=['rail-engine.js','multimodal-engine.js'];
const pairs=[
  ['bus:75009','bus:75059'],['bus:99009','bus:28009'],
  ['bus:28009','bus:59009'],['bus:59009','bus:77009'],
  ['bus:75009','DT14'],['DT14','bus:75009'],
  ['bus:99009','NS22'],['NS9','CG2'],
];
const base={date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:30,maxExtraMinutes:15,preference:'fastest'};
const rounds=3;
const heapTargetBytes=150*1024*1024;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const relative=filename=>path.relative(root,filename).replaceAll('\\','/');
const memoryFields=['rss','heapTotal','heapUsed','external','arrayBuffers'];

function options(){
  const args=process.argv.slice(2);
  if(args.includes('--help')){
    console.log('Usage: node --expose-gc scripts/profile-r5-memory.mjs [--output PATH]\nDefault output: docs/evidence/r5/bus-memory-probe.json\nRuns 24 queries with no explicit GC until all queries finish. Keep other benchmarks stopped.');
    return null;
  }
  if(args.length && (args.length!==2 || args[0]!=='--output' || !args[1] || args[1].startsWith('--')))throw Error('Expected --output PATH or --help.');
  return {output:path.resolve(root,args[1]??'docs/evidence/r5/bus-memory-probe.json')};
}

function instrument(source){
  const lineEnd=source.includes('\r\n')?'\r\n':'\n';
  const injections=[
    {needle:'diagnostics.frequencyExpansions++;',addition:`${lineEnd}            if((diagnostics.frequencyExpansions&1023)===0)globalThis.__r5MemoryProbe?.('frequencyExpansions',diagnostics.frequencyExpansions);`},
    {needle:'diagnostics.connectionsScanned++;',addition:`${lineEnd}      if((diagnostics.connectionsScanned&127)===0)globalThis.__r5MemoryProbe?.('railConnections',diagnostics.connectionsScanned);`},
  ];
  let patched=source;
  for(const {needle,addition} of injections){
    if(patched.split(needle).length-1!==1)throw Error(`Expected exactly one memory probe point: ${needle}`);
    patched=patched.replace(needle,needle+addition);
  }
  let restored=patched;
  for(const {addition} of injections)restored=restored.replace(addition,'');
  if(restored!==source)throw Error('Instrumentation changed source outside its two diagnostic probes.');
  return patched;
}

function statistics(){
  return {probes:0,byKind:{beforeQuery:0,frequencyExpansions:0,railConnections:0,afterQuery:0},sampledMaximum:{rss:0,heapTotal:0,heapUsed:0,external:0,arrayBuffers:0,heapPlusExternal:0},heapHighWaterSample:null};
}
function observe(stats,memory,kind,counter,queryIndex){
  stats.probes++;
  stats.byKind[kind]++;
  if(memory.heapUsed>stats.sampledMaximum.heapUsed)stats.heapHighWaterSample={...memory,kind,counter,queryIndex};
  for(const field of memoryFields)stats.sampledMaximum[field]=Math.max(stats.sampledMaximum[field],memory[field]);
  stats.sampledMaximum.heapPlusExternal=Math.max(stats.sampledMaximum.heapPlusExternal,memory.heapUsed+memory.external);
}

async function main(){
  const config=options();
  if(!config)return;
  if(typeof global.gc!=='function')throw Error('Run this probe with node --expose-gc so retained memory can be measured after all 24 queries.');
  const startedAt=new Date().toISOString();
  const environment={node:process.version,v8:process.versions.v8,platform:process.platform,release:os.release(),arch:process.arch,cpu:os.cpus()[0]?.model??null,logicalCpus:os.cpus().length,totalSystemMemoryBytes:os.totalmem(),runtimeFlags:[...process.execArgv]};
  const scriptSha256=sha256(await readFile(fileURLToPath(import.meta.url)));
  const startupMemory=process.memoryUsage();
  const scratchRoot=path.join(root,'test-results/r5-memory');
  await mkdir(scratchRoot,{recursive:true});
  const scratch=await mkdtemp(path.join(scratchRoot,'profile-'));
  const copiedNames=[...sourceNames];
  try{
    await access(path.join(root,'src/search-arena.js'));
    copiedNames.push('search-arena.js');
  }catch(error){
    if(error.code!=='ENOENT')throw error;
  }
  const source={},instrumentedSources={};
  for(const name of copiedNames){
    const bytes=await readFile(path.join(root,'src',name));
    source[name]={sha256:sha256(bytes),bytes:bytes.length};
    const copy=name==='rail-engine.js'?Buffer.from(instrument(bytes.toString('utf8'))):bytes;
    if(name==='rail-engine.js' && Buffer.from(bytes.toString('utf8')).compare(bytes)!==0)throw Error('Rail source is not lossless UTF-8.');
    instrumentedSources[name]={sha256:sha256(copy),bytes:copy.length};
    await writeFile(path.join(scratch,name),copy);
  }
  // Explicit module mode also makes the ignored copy portable to another cwd.
  await writeFile(path.join(scratch,'package.json'),' {"type":"module"}\n');
  const {createMultimodalRouter}=await import(pathToFileURL(path.join(scratch,'multimodal-engine.js')).href);
  const loaded=await Promise.all(dataNames.map(async name=>{
    const bytes=await readFile(path.join(root,'public/data',name+'.json'));
    return {data:JSON.parse(bytes.toString('utf8')),metadata:{name,bytes:bytes.length,sha256:sha256(bytes)}};
  }));
  const [rail,bus,walking]=loaded.map(item=>item.data);
  const data=loaded.map(item=>item.metadata);
  const afterDataMemory=process.memoryUsage();
  const router=createMultimodalRouter(rail,bus,walking);
  const initialMemory=process.memoryUsage();
  const queries=[],overall=statistics();
  let activeStats=null,queryIndex=0;
  if(Object.hasOwn(globalThis,'__r5MemoryProbe'))throw Error('An unrelated memory probe already exists in this process.');
  globalThis.__r5MemoryProbe=(kind,counter=null)=>{
    const memory=process.memoryUsage();
    observe(overall,memory,kind,counter,queryIndex);
    if(activeStats)observe(activeStats,memory,kind,counter,queryIndex);
    return memory;
  };
  try{
    for(let round=0;round<rounds;round++)for(const [originId,destinationId] of pairs){
      queryIndex++;
      activeStats=statistics();
      const beforeMemory=globalThis.__r5MemoryProbe('beforeQuery');
      const input={...base,originId,destinationId};
      const started=performance.now();
      let result,error=null;
      try{result=router.route(input);}catch(failure){error=String(failure?.message??failure);}
      const afterMemory=globalThis.__r5MemoryProbe('afterQuery');
      const ms=performance.now()-started;
      const validResult=result?.status==='ok' && Array.isArray(result.routes) && result.routes.length>0 && result.recommended!==null && result.recommended!==undefined;
      const passes=[result?.diagnostics,result?.diagnostics?.railPrepass].filter(Boolean);
      const probeCountsMatch=activeStats.byKind.beforeQuery===1 && activeStats.byKind.afterQuery===1 && activeStats.byKind.frequencyExpansions===passes.reduce((n,d)=>n+Math.floor((d.frequencyExpansions??0)/1024),0) && activeStats.byKind.railConnections===passes.reduce((n,d)=>n+Math.floor((d.connectionsScanned??0)/128),0);
      queries.push({queryIndex,round:round+1,input,status:result?.status??'exception',validResult,probeCountsMatch,error,arrivalSeconds:result?.recommended?.arrivalSeconds??null,diagnostics:result?.diagnostics??null,ms,beforeMemory,afterMemory,...activeStats,routeObjectives:(result?.routes??[]).map(route=>[route.arrivalSeconds,route.transfers,route.walkingSeconds])});
      activeStats=null;
      result=null;
    }
  }finally{
    delete globalThis.__r5MemoryProbe;
  }
  // Exactly one explicit collection, only after every query. The router, parsed
  // source networks and the bounded 24-query summaries remain retained here.
  const beforeExplicitGc=process.memoryUsage();
  // A global root prevents optimizer liveness from collecting locals whose last
  // routing use preceded this measurement. Remove it immediately afterward.
  if(Object.hasOwn(globalThis,'__r5MemoryKeepAlive'))throw Error('An unrelated retained-memory root already exists in this process.');
  globalThis.__r5MemoryKeepAlive={router,sourceNetworks:[rail,bus,walking],queries};
  let retainedMemoryAfterGc;
  try{
    global.gc();
    retainedMemoryAfterGc=process.memoryUsage();
  }finally{
    delete globalThis.__r5MemoryKeepAlive;
  }
  const sourceUnchanged={};
  for(const name of copiedNames)sourceUnchanged[name]=sha256(await readFile(path.join(root,'src',name)))===source[name].sha256;
  const dataUnchanged={};
  for(const item of data)dataUnchanged[item.name]=sha256(await readFile(path.join(root,'public/data',item.name+'.json')))===item.sha256;
  const snapshotsUnchanged=Object.values(sourceUnchanged).every(Boolean)&&Object.values(dataUnchanged).every(Boolean);
  const allQueriesOk=queries.every(query=>query.validResult);
  const measurementValid=queries.length===rounds*pairs.length && snapshotsUnchanged && queries.every(query=>query.probeCountsMatch);
  const heapTargetMet=overall.sampledMaximum.heapUsed<heapTargetBytes;
  const result={schemaVersion:1,startedAt,recordedAt:new Date().toISOString(),evidenceClass:'Instrumented Node desktop memory sampling inside route search; not an exact peak, browser, physical-phone or provider-latency measurement',environment,scriptSha256,source,instrumentedSources,data,sourceVersion:bus.sourceVersion,availability:bus.availability??null,ignoredEngineCopy:relative(scratch),instrumentation:{productionFilesModified:false,reversibleSourceCheck:true,probeFrequency:{frequencyExpansions:1024,railConnections:128,beforeAndAfterEachQuery:true},explicitGcDuringQueries:false,explicitGcCallsAfterQueries:1,retainedAtGc:'Router, parsed source networks, module copies and bounded summaries; full returned route objects are released.',limitations:['The true peak between probes may be higher.','Instrumentation and summaries add allocation and runtime overhead; elapsed times are not a clean performance benchmark.','Per-metric maxima may occur at different probes.','external already includes array-buffer memory; do not add arrayBuffers to heapPlusExternal.','Initialization stages are separate observations, not a continuously sampled startup peak.']},targetsSetBeforeMeasurement:{sampledHeapUsedBytes:heapTargetBytes},querySet:{base,pairs,rounds,total:rounds*pairs.length},startupMemory,afterDataMemory,initialMemory,...overall,beforeExplicitGc,retainedMemoryAfterGc,queries,sourceUnchanged,dataUnchanged,measurementValid,allQueriesOk,heapTargetMet,pass:measurementValid&&allQueriesOk&&heapTargetMet};
  await mkdir(path.dirname(config.output),{recursive:true});
  await writeFile(config.output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output:relative(config.output),pass:result.pass,measurementValid,allQueriesOk,queries:queries.length,probes:overall.probes,sampledHeapMiB:overall.sampledMaximum.heapUsed/1048576,sampledRssMiB:overall.sampledMaximum.rss/1048576,sampledExternalMiB:overall.sampledMaximum.external/1048576,retainedHeapMiB:retainedMemoryAfterGc.heapUsed/1048576,heapTargetMet}));
  if(!result.pass)process.exitCode=1;
}

await main();
