// Run after npm run build. Real local HTTP and two independent Playwright API
// clients verify forwarding, scoped auth and persistence across a process restart.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {request as playwrightRequest} from 'playwright';

const directory=await mkdtemp(path.join(os.tmpdir(),'commute-sharing-http-'));
const reserved=createServer();reserved.listen(0,'127.0.0.1');await once(reserved,'listening');const port=reserved.address().port;await new Promise(resolve=>reserved.close(resolve));
const base=`http://127.0.0.1:${port}`;
let server,logs='';
async function start(){
  server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SHARING_SQLITE_PATH:path.join(directory,'sharing.sqlite')},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
  for(let attempt=0;attempt<100;attempt++){if(server.exitCode!==null)throw Error('Local server exited: '+logs);try{if((await fetch(base+'/api/push/config')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error('Local server failed to become ready: '+logs);
}
async function stop(){if(!server||server.exitCode!==null)return;const exited=once(server,'exit');server.kill();await exited;}
let caregiver,traveller;
try {
  const builtWorker=(await import('../dist/server/index.js')).default;
  const unconfigured=await builtWorker.fetch(new Request('https://deployment.test/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:{}})}),{},{});
  assert.equal(unconfigured.status,503);assert.match((await unconfigured.json()).error,/SHARING_DB/);
  await start();caregiver=await playwrightRequest.newContext({baseURL:base});traveller=await playwrightRequest.newContext({baseURL:base});
  const plan={schemaVersion:2,id:'http-demo',mode:'replay',origin:{id:'test-origin',label:'Test origin'},destination:{id:'test-destination',label:'Test destination'},route:{id:'http-original',steps:[]},stops:[]};
  const creation=await caregiver.post('/api/shares',{data:{plan}});assert.equal(creation.status(),201);const share=await creation.json();
  const invite=await traveller.get('/api/shares/'+share.id,{headers:{Authorization:'Bearer '+share.inviteToken}});assert.equal(invite.status(),200);assert.equal((await invite.json()).location,undefined);
  const acceptance=await traveller.post(`/api/shares/${share.id}/accept`,{headers:{Authorization:'Bearer '+share.inviteToken},data:{eventId:'http-pair-0001',expectedRevision:share.revision,consent:{progress:true,location:false}}});assert.equal(acceptance.status(),200);const paired=await acceptance.json();
  const revised={...plan,route:{id:'http-traveller-accepted-revision',steps:[{id:'manual-test-step'}]}};
  const changed=await traveller.patch(`/api/shares/${share.id}/progress`,{headers:{Authorization:'Bearer '+paired.travellerToken},data:{eventId:'http-progress-0001',expectedRevision:paired.revision,sharingEpoch:paired.sharingEpoch,routeRevision:1,status:'started',checkpoint:{id:'manual-test-point'},acceptedPlan:revised,eta:'2026-09-18T12:30:00Z'}});assert.equal(changed.status(),200);const current=await changed.json();
  await stop();await start();
  const observed=await caregiver.get('/api/shares/'+share.id,{headers:{Authorization:'Bearer '+share.viewerToken}});assert.equal(observed.status(),200);const view=await observed.json();assert.equal(view.acceptedPlan.route.id,revised.route.id);assert.equal(view.location,null);assert.match(observed.headers()['cache-control'],/no-store/);
  const denied=await caregiver.patch(`/api/shares/${share.id}/plan`,{headers:{Authorization:'Bearer '+share.viewerToken},data:{eventId:'viewer-attack-0001',expectedRevision:current.revision,plan}});assert.equal(denied.status(),404);
  const removed=await traveller.delete(`/api/shares/${share.id}/access`,{headers:{Authorization:'Bearer '+paired.travellerToken},data:{eventId:'http-revoke-0001',expectedRevision:current.revision}});assert.equal(removed.status(),200);
  assert.equal((await caregiver.get('/api/shares/'+share.id,{headers:{Authorization:'Bearer '+share.viewerToken}})).status(),404);
  console.log('PASS: two isolated HTTP clients create/review/accept/observe a revised route across server restart; viewer edit denied; revocation enforced; POST/PATCH/DELETE headers and bodies forwarded; unconfigured deployed Worker returns 503. No physical-device or external push inference.');
} finally {await caregiver?.dispose();await traveller?.dispose();await stop();await rm(directory,{recursive:true,force:true});}
