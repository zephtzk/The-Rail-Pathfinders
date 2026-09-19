// Differential correctness only: timings and memory are deliberately not compared.
// Baseline engine source is read from Git; snapshots stay in ignored test-results.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=path.join(root,'test-results/router-differential');
const baselineRef='70ae3a8';
const baselineSourceFiles=['multimodal-engine.js','rail-engine.js'];
const currentSourceFiles=[...baselineSourceFiles,'search-arena.js'];
const dataFiles=['rail-network','bus-network','walking-links'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const base={date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:30,preference:'fastest',maxExtraMinutes:15};
const pairs=[['bus:75009','bus:75059'],['bus:99009','bus:28009'],['bus:28009','bus:59009'],['bus:59009','bus:77009'],['bus:75009','DT14'],['DT14','bus:75009'],['bus:99009','NS22'],['NS9','CG2']];
const seconds=value=>value.split(':').map(Number).reduce((h,m)=>h*3600+m*60);

function cases(){
 const groups={main:[],busOnly:[],closedRail:[],earlyRetry:[],calendar:[],downstreamFloor:[],finalCarryover:[]};
 const add=(group,id,pair,patch={},extra={})=>groups[group].push({id,input:{...base,originId:pair[0],destinationId:pair[1],...patch},...extra});
 pairs.forEach((pair,i)=>{
  add('main',`benchmark-${i+1}`,pair);
  for(const preference of ['fewer-transfers','less-walking','quieter'])add('main',`preference-${i+1}-${preference}`,pair,{preference,maxExtraMinutes:i%2?0:60});
  for(const walkingLimitMinutes of [0,4,8])add('main',`walking-${i+1}-${walkingLimitMinutes}`,pair,{walkingLimitMinutes});
  for(const deadlineTime of ['10:05','10:30','12:00'])add('main',`deadline-${i+1}-${deadlineTime}`,pair,{deadlineDate:base.date,deadlineTime});
  for(const date of ['2026-09-19','2026-09-20'])add('main',`weekend-${i+1}-${date}`,pair,{date});
 });
 for(const [i,pair]of [pairs[0],pairs[4],pairs[7]].entries())for(const departureTime of ['00:05','05:20','06:29','08:29','08:31','16:59','19:01','23:55'])add('main',`clock-${i+1}-${departureTime}`,pair,{date:'2026-09-19',departureTime});
 for(const [i,pair]of [pairs[4],pairs[7]].entries())add('main',`next-day-deadline-${i+1}`,pair,{departureTime:'23:55',deadlineDate:'2026-09-19',deadlineTime:'01:30'});
 add('main','invalid-deadline-before-departure',pairs[0],{deadlineTime:'09:59'});
 add('main','unsupported-source-date',pairs[0],{date:'2026-10-03'});
 add('main','explicit-work-limit',pairs[1],{maxSearchWork:10});
 add('main','already-cancelled',pairs[1],{}, {abort:true});
 for(const [i,pair]of pairs.slice(0,4).entries())add('busOnly',`bus-only-benchmark-${i+1}`,pair,{walkingLimitMinutes:0});
 for(const [id,canBoard,externalSinceRide]of [['alighted',false,false],['boarding-confirmed',true,false],['external-evidence',false,true]])add('busOnly',`terminal-seed-${id}`,['bus:95129','bus:64009'],{date:'2026-09-21',walkingLimitMinutes:0,progressSeed:{stopId:'bus:95129',canBoard,externalSinceRide,hasBoarded:true}});
 add('busOnly','roadside-transfer-seed',['bus:75059','bus:81119'],{walkingLimitMinutes:0,progressSeed:{stopId:'bus:75059',canBoard:false,externalSinceRide:false,hasBoarded:true}});
 for(const [i,pair]of [pairs[4],pairs[5]].entries())add('closedRail',`synthetic-ewl-closure-${i+1}`,pair);
 for(const departureTime of ['05:05','06:30'])add('earlyRetry',`source-10-early-retry-${departureTime}`,['bus:96109','bus:85079'],{date:'2026-09-21',departureTime,walkingLimitMinutes:0,maxExtraMinutes:0});
 const fixturePair=['bus:01001','bus:01002'];
 for(const [date,departureTime]of [['2026-09-18','05:20'],['2026-09-18','05:31'],['2026-09-18','08:31'],['2026-09-19','00:05'],['2026-09-19','10:00'],['2026-09-20','10:00']])add('calendar',`synthetic-calendar-${date}-${departureTime}`,fixturePair,{date,departureTime,walkingLimitMinutes:0,maxExtraMinutes:0});
 add('downstreamFloor','synthetic-later-downstream-first-arrival',fixturePair,{departureTime:'07:00',walkingLimitMinutes:0,maxExtraMinutes:0});
 for(const departureTime of ['00:05','10:00'])add('finalCarryover',`synthetic-final-day-carryover-${departureTime}`,fixturePair,{date:'2026-09-19',departureTime,walkingLimitMinutes:0,maxExtraMinutes:0});
 return groups;
}

// Explicitly synthetic timing fixtures, separate from imported-source cases.
function calendarFixture(bus){
 const span={WD:[seconds('05:30'),seconds('24:30')],SAT:[seconds('07:00'),seconds('22:00')],SUN:null};
 return {...bus,stops:[{id:'01001',name:'Synthetic Alpha'},{id:'01002',name:'Synthetic Beta'}],patterns:[{id:'7A:TEST:1',serviceNo:'7A',operator:'TEST',direction:1,originCode:'01001',destinationCode:'01002',headways:{AM_Peak_Freq:[4,6],AM_Offpeak_Freq:[7,10],PM_Peak_Freq:[3,5],PM_Offpeak_Freq:[8,12]},stops:[{stopId:'01001',sequence:1,visitNumber:1,distanceKm:0,firstLast:structuredClone(span)},{stopId:'01002',sequence:2,visitNumber:1,distanceKm:1,firstLast:structuredClone(span)}]}],assumptions:{...bus.assumptions,unverifiedBayStopCodes:['01001','01002']}};
}

async function metadata(){
 const data=Object.fromEntries(await Promise.all(dataFiles.map(async name=>[name,hash(await readFile(path.join(root,'public/data',name+'.json')))])));
 return {baselineCommit:execFileSync('git',['rev-parse',baselineRef],{cwd:root,encoding:'utf8'}).trim(),data,caseSha256:hash(JSON.stringify(cases())),harnessSha256:hash(await readFile(fileURLToPath(import.meta.url)))};
}

async function capture(kind){
 const directory=kind==='baseline'?path.join(output,'committed-src'):path.join(root,'src');
 const {createMultimodalRouter}=await import(pathToFileURL(path.join(directory,'multimodal-engine.js')));
 const [rail,bus,walking]=await Promise.all(dataFiles.map(async name=>JSON.parse(await readFile(path.join(root,'public/data',name+'.json'),'utf8'))));
 const sourceFiles=kind==='baseline'?baselineSourceFiles:currentSourceFiles;
 const sourceSha256=Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,hash(await readFile(path.join(directory,name)))])));
 const records=[];
 for(const [group,queries]of Object.entries(cases())){
  let data=bus,paths=walking,options={};
  if(group==='busOnly')options={busOnly:true};
  if(group==='closedRail')options={closedRailRouteIds:['EWL']};
  if(group==='earlyRetry'){data={...bus,patterns:bus.patterns.filter(p=>p.id==='10:GAS:1')};paths={links:[]};options={busOnly:true};}
  if(['calendar','downstreamFloor','finalCarryover'].includes(group)){data=calendarFixture(bus);paths={links:[]};options={busOnly:true};}
  if(group==='downstreamFloor')data.patterns[0].stops[1].firstLast.WD=[seconds('08:00'),seconds('23:00')];
  if(group==='finalCarryover')data.coverage={...data.coverage,validThrough:'2026-09-18'};
  let router=createMultimodalRouter(rail,data,paths,options);
  for(const query of queries){
   const input={...query.input,...(query.abort?{signal:AbortSignal.abort()}:{} )};
   const {diagnostics,...publicResult}=router.route(input);
   // Compare exactly what callers can serialize; preserve all routes, leg details,
   // IDs, ordering, errors, assumptions, coverage and recommendation fields.
   records.push({group,...query,result:JSON.parse(JSON.stringify(publicResult))});
   global.gc?.();
  }
  router=null;global.gc?.();
  console.log(`${kind}: ${group} ${queries.length} cases captured`);
 }
 const record={schemaVersion:1,kind,recordedAt:new Date().toISOString(),runtime:process.version,...await metadata(),sourceSha256,strippedFields:['diagnostics'],records};
 await writeFile(path.join(output,kind+'.json'),JSON.stringify(record,null,2)+'\n');
}

function firstDifference(expected,actual,location='$'){
 if(isDeepStrictEqual(expected,actual))return null;
 if(expected&&actual&&typeof expected==='object'&&typeof actual==='object'){
  for(const key of [...new Set([...Object.keys(expected),...Object.keys(actual)])].sort()){
   if(!Object.hasOwn(expected,key)||!Object.hasOwn(actual,key))return {path:location+'.'+key,expected:expected[key],actual:actual[key]};
   const found=firstDifference(expected[key],actual[key],location+'.'+key);if(found)return found;
  }
 }
 return {path:location,expected,actual};
}

function worker(kind){
 const run=spawnSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--worker',kind],{cwd:root,stdio:'inherit'});
 if(run.error)throw run.error;if(run.status!==0)throw Error(`${kind} capture failed (${run.status})`);
}

await mkdir(output,{recursive:true});
if(process.argv[2]==='--worker')await capture(process.argv[3]);
else {
 const currentMetadata=await metadata();
 let baseline;
 try{baseline=JSON.parse(await readFile(path.join(output,'baseline.json'),'utf8'));}catch{}
 const sourceUnchanged=baselineSourceFiles.every(name=>baseline?.sourceSha256?.[name]===hash(execFileSync('git',['show',`${baselineRef}:src/${name}`],{cwd:root})));
 if(process.argv.includes('--capture-baseline')||!baseline||!sourceUnchanged||!isDeepStrictEqual({baselineCommit:baseline.baselineCommit,data:baseline.data,caseSha256:baseline.caseSha256,harnessSha256:baseline.harnessSha256},currentMetadata)){
  await mkdir(path.join(output,'committed-src'),{recursive:true});
  for(const name of baselineSourceFiles)await writeFile(path.join(output,'committed-src',name),execFileSync('git',['show',`${baselineRef}:src/${name}`],{cwd:root}));
  worker('baseline');baseline=JSON.parse(await readFile(path.join(output,'baseline.json'),'utf8'));
 }
 if(process.argv.includes('--capture-baseline'))console.log(`Baseline ready: ${baseline.records.length} cases at ${path.relative(root,path.join(output,'baseline.json'))}`);
 else {
  worker('current');
  const current=JSON.parse(await readFile(path.join(output,'current.json'),'utf8'));
  const mismatches=[];
  for(let i=0;i<baseline.records.length;i++){
   const expected=baseline.records[i],actual=current.records[i];
   const difference=firstDifference(expected,actual);
   if(difference)mismatches.push({case:expected.id,group:expected.group,...difference});
  }
  if(current.records.length!==baseline.records.length)mismatches.push({case:'case-count',expected:baseline.records.length,actual:current.records.length});
  const report={schemaVersion:1,recordedAt:new Date().toISOString(),evidenceClass:'Differential public-result equality against the previous committed router, not an independent correctness oracle or performance measurement',...currentMetadata,baselineSourceSha256:baseline.sourceSha256,currentSourceSha256:current.sourceSha256,strippedFields:['diagnostics'],baselineSnapshotSha256:hash(await readFile(path.join(output,'baseline.json'))),currentSnapshotSha256:hash(await readFile(path.join(output,'current.json'))),cases:baseline.records.length,matched:baseline.records.length-mismatches.length,groups:Object.fromEntries(Object.keys(cases()).map(group=>[group,baseline.records.filter(r=>r.group===group).length])),baselineStatuses:baseline.records.reduce((counts,r)=>(counts[r.result.status]=(counts[r.result.status]??0)+1,counts),{}),pass:mismatches.length===0,mismatches};
  await writeFile(path.join(output,'comparison.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:report.pass,cases:report.cases,matched:report.matched,report:path.relative(root,path.join(output,'comparison.json')),mismatches:mismatches.map(({case:id,group,path:at})=>({id,group,path:at}))}));
  if(!report.pass)process.exitCode=1;
 }
}
