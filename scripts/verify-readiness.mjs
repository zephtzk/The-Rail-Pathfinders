// One bounded local acceptance run. No provider requests, publishing or access changes.
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve(process.env.READINESS_OUTPUT??'test-results/readiness-candidate');
await mkdir(out,{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
const initialStatus=git('status','--porcelain');
await writeFile(path.join(out,'receipt.json'),JSON.stringify({status:'RUNNING',sourceCommit,recordedAt:new Date().toISOString()})+'\n');
if(process.env.READINESS_REQUIRE_CLEAN==='1')assert.equal(initialStatus,'','candidate must be committed and clean');
const env={...process.env};delete env.LTA_ACCOUNT_KEY;
const npmCli=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const commands=[];
function run(name,exe,args,extra={}){
 const begin=Date.now(),r=spawnSync(exe,args,{env:{...env,...extra},encoding:'utf8',windowsHide:true,maxBuffer:24*1024*1024});
 const output=(r.stdout??'')+(r.stderr??'');
 // Only deterministic local suites run here; no credentialed diagnostic is invoked.
 commands.push({name,exitCode:r.status,elapsedMs:Date.now()-begin,status:r.status===0?'PASS':'FAIL'});
 return writeFile(path.join(out,name+'.log'),output).then(()=>{console.log(`${commands.at(-1).status} ${name}`);if(r.status!==0)throw Error(`${name} failed: ${r.error?.message??output.slice(-3500)}`);});
}
let server;
try{
 await run('check',process.execPath,[npmCli,'run','check']);
 if(initialStatus==='')await run('reproducible-build',process.execPath,['scripts/verify-reproducible-build.mjs'],{CAPTURE_DIR:out});
 await run('walking',process.env.PYTHON??'python',['scripts/verify-walking.py'],{CAPTURE_DIR:out});
 await run('worker-performance',process.execPath,['scripts/verify-phase4.mjs'],{CAPTURE_DIR:out});
 const port=process.env.READINESS_PORT??'4181',base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...env,PORT:port,HOST:'127.0.0.1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('local server did not start')),10000);server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);reject(Error(`local server exited ${code}`));});server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
 const applicationBuild=JSON.parse(await readFile('dist/client/data/application-build.json'));
 assert.deepEqual(await (await fetch(base+'/data/application-build.json')).json(),applicationBuild);
 for(const [name,file,replay] of [['phase4','phase4-browser.mjs'],['rail','rail-browser.mjs'],['rail-offline','rail-offline-browser.mjs'],['pilot','multimodal-browser.mjs'],['replay','browser.mjs',true],['live','live-browser.mjs',true]]){
  await run(name,process.execPath,['tests/'+file],{TEST_BASE_URL:base+(replay?'/replay.html':''),CAPTURE_DIR:path.join(out,name)});
 }
 assert.equal(git('rev-parse','HEAD'),sourceCommit,'candidate commit unchanged during run');
 assert.equal(git('status','--porcelain'),initialStatus,'tracked source unchanged during run');
 const receipt={recordedAt:new Date().toISOString(),status:'PASS',evidenceClass:'local deterministic acceptance and desktop browser emulation; no hosted or physical-phone claims',sourceCommit,sourceTree,branch:git('branch','--show-current'),node:process.version,zlib:process.versions.zlib,cleanCandidate:initialStatus==='',applicationBuild,workerSha256:createHash('sha256').update(await readFile('dist/server/index.js')).digest('hex'),commands};
 await writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
}catch(error){
 await writeFile(path.join(out,'receipt.json'),JSON.stringify({status:'FAIL',sourceCommit,recordedAt:new Date().toISOString(),commands,error:error.message},null,2)+'\n');throw error;
}finally{server?.kill();}
