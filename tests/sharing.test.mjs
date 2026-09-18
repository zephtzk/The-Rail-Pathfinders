import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LocalSharingStore} from '../server/providers-local.js';
import {D1SharingStore,mutateSharing} from '../server/sharing-store.js';
import {handleSharingApi,runSharingMaintenance} from '../server/sharing.js';
import {base64url,credentialHash,flushSharingPush} from '../server/push.js';

const plan={schemaVersion:2,id:'planned-trip',origin:{id:'test-home',label:'Home',coordinates:[1.3,103.8]},destination:{id:'test-dest',label:'Destination',coordinates:[1.31,103.81]},route:{id:'route-original',steps:[]},preferences:{stepFree:true},mode:'replay'};
async function fixture(t){const directory=await mkdtemp(path.join(os.tmpdir(),'commute-sharing-'));const database=path.join(directory,'sharing.sqlite');const store=new LocalSharingStore(database);t.after(async()=>{try{store.close();}catch{}await rm(directory,{recursive:true,force:true});});return {store,database,env:{SHARING_STORE:store}};}
async function api(env,method,url,token,body){const request=new Request(`https://commute.test${url}`,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});if(body)request.headers.set('content-type','application/json');const result=await handleSharingApi(request,env);return {status:result.status,headers:result.headers,body:await result.json()};}
async function create(env){const result=await api(env,'POST','/api/shares',null,{plan});assert.equal(result.status,201,JSON.stringify(result.body));return result.body;}
async function accept(env,share,consent={progress:true,location:false}){const result=await api(env,'POST',`/api/shares/${share.id}/accept`,share.inviteToken,{eventId:'accept-00000001',expectedRevision:share.revision,consent});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
const progressBody=(accepted,extra={})=>({eventId:'progress-000001',expectedRevision:accepted.revision,sharingEpoch:accepted.sharingEpoch,routeRevision:1,status:'started',checkpoint:{id:'confirmed-gate',label:'Gate manually confirmed',confirmedAt:Date.now()},eta:'2026-09-18T12:30:00Z',...extra});
async function subscription(){const key=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {endpoint:'https://fcm.googleapis.com/fcm/send/test-device',expirationTime:null,keys:{p256dh:base64url(await crypto.subtle.exportKey('raw',key.publicKey)),auth:base64url(crypto.getRandomValues(new Uint8Array(16)))}};}

test('two isolated credentials prepare, review, explicitly pair, follow accepted revision across backend restart',async t=>{
  const {env,store,database}=await fixture(t),share=await create(env);
  const review=await api(env,'GET',`/api/shares/${share.id}`,share.inviteToken);
  assert.equal(review.body.proposedPlan.destination.id,'test-dest');assert.equal(review.body.location,undefined);
  const accepted=await accept(env,share,{progress:true,location:true});
  const changed={...plan,route:{id:'accepted-detour',steps:[{id:'detour'}]}};
  const body=progressBody(accepted,{acceptedPlan:changed,location:{latitude:1.3,longitude:103.8,accuracy:65,timestamp:Date.now()}});
  const update=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,body);assert.equal(update.status,200);
  const duplicate=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,body);assert.equal(duplicate.body.revision,update.body.revision);
  const secondStore=new LocalSharingStore(database);
  const viewer=await api({SHARING_STORE:secondStore},'GET',`/api/shares/${share.id}`,share.viewerToken);
  assert.equal(viewer.body.acceptedPlan.route.id,'accepted-detour');assert.equal(viewer.body.progress.routeRevision,1);assert.equal(viewer.body.location.accuracy,65);
  const onDisk=JSON.stringify((await store.read()).value);for(const secret of [share.inviteToken,share.editorToken,share.viewerToken,accepted.travellerToken])assert.ok(!onDisk.includes(secret),'only hashed role credentials persist');
  assert.match(viewer.headers.get('cache-control'),/no-store/);assert.equal(viewer.headers.get('referrer-policy'),'no-referrer');
  secondStore.close();
});

test('invitation cannot expose location; viewer cannot edit and caregiver changes remain proposals',async t=>{
  const {env}=await fixture(t),share=await create(env),accepted=await accept(env,share);
  assert.equal((await api(env,'GET',`/api/shares/${share.id}`,share.inviteToken)).status,404);
  const editBody={eventId:'edit-00000001',expectedRevision:accepted.revision,plan:{...plan,destination:{id:'different',label:'Proposed address'}}};
  assert.equal((await api(env,'PATCH',`/api/shares/${share.id}/plan`,share.viewerToken,editBody)).status,404);
  const edited=await api(env,'PATCH',`/api/shares/${share.id}/plan`,share.editorToken,editBody);assert.equal(edited.status,200);
  const view=await api(env,'GET',`/api/shares/${share.id}`,share.viewerToken);assert.equal(view.body.acceptedPlan.destination.id,'test-dest');assert.equal(view.body.proposedPlan,null);
  const traveller=await api(env,'GET',`/api/shares/${share.id}`,accepted.travellerToken);assert.equal(traveller.body.proposedPlan.destination.id,'different');assert.equal(traveller.body.acceptedPlan.destination.id,'test-dest');
  const editor=await api(env,'GET',`/api/shares/${share.id}`,share.editorToken);assert.equal(editor.body.progress,undefined);assert.equal(editor.body.location,undefined);
});

test('both consents default off; location consent is independent and never inferred by accepting',async t=>{
  const {env}=await fixture(t),share=await create(env),accepted=await accept(env,share,{progress:false,location:false});
  const unauthorized=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(accepted,{location:{latitude:1.3,longitude:103.8,accuracy:5,timestamp:Date.now()}}));assert.equal(unauthorized.status,403);
  const quiet=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(accepted));assert.equal(quiet.status,200);
  const viewer=await api(env,'GET',`/api/shares/${share.id}`,share.viewerToken);assert.equal(viewer.body.progress,null);assert.equal(viewer.body.location,null);assert.equal(viewer.body.acceptedPlan,null);
  const enabled=await api(env,'PATCH',`/api/shares/${share.id}/permissions`,accepted.travellerToken,{eventId:'consent-000001',expectedRevision:quiet.body.revision,consent:{progress:false,location:true}});
  const located=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(enabled.body,{eventId:'location-000001',location:{latitude:1.3,longitude:103.8,accuracy:250,timestamp:Date.now()}}));assert.equal(located.status,200);
  const independent=await api(env,'GET',`/api/shares/${share.id}`,share.viewerToken);assert.equal(independent.body.progress,null);assert.equal(independent.body.location.accuracy,250);
});

test('pause, resume and revocation invalidate queued location uploads; completion stops collection',async t=>{
  const {env}=await fixture(t),share=await create(env),accepted=await accept(env,share,{progress:true,location:true});
  const paused=await api(env,'PATCH',`/api/shares/${share.id}/permissions`,accepted.travellerToken,{eventId:'pause-00000001',expectedRevision:accepted.revision,consent:{progress:true,location:true},paused:true});
  const resumed=await api(env,'PATCH',`/api/shares/${share.id}/permissions`,accepted.travellerToken,{eventId:'resume-0000001',expectedRevision:paused.body.revision,consent:{progress:true,location:true},paused:false});
  const stale=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(accepted,{expectedRevision:resumed.body.revision}));assert.equal(stale.status,409);assert.equal(stale.body.sharingEpoch,2);
  const completed=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(resumed.body,{status:'completed'}));assert.equal(completed.status,200);assert.equal(completed.body.collectionStopped,true);assert.equal(completed.body.location,null);
  const late=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(completed.body,{eventId:'late-000000001'}));assert.equal(late.status,409);
  const revoked=await api(env,'DELETE',`/api/shares/${share.id}/access`,accepted.travellerToken,{eventId:'revoke-0000001',expectedRevision:completed.body.revision});assert.equal(revoked.status,200);
  assert.equal((await api(env,'GET',`/api/shares/${share.id}`,share.viewerToken)).status,404);assert.equal((await api(env,'GET',`/api/shares/${share.id}`,share.editorToken)).status,404);
});

test('concurrent revisions commit once and reusing event IDs with a different payload is rejected',async t=>{
  const {env}=await fixture(t),share=await create(env),accepted=await accept(env,share);
  const results=await Promise.all(['concurrent-0001','concurrent-0002'].map(eventId=>api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(accepted,{eventId}))));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winning=results.findIndex(r=>r.status===200);
  const reused=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(accepted,{eventId:['concurrent-0001','concurrent-0002'][winning],eta:'different'}));assert.equal(reused.status,409);
});

test('acceptance retry recovers the same claimant token, cannot be repeated with a different pairing event',async t=>{
  const {env}=await fixture(t),share=await create(env),first=await accept(env,share),second=await accept(env,share);assert.equal(first.travellerToken,second.travellerToken);
  const attacker=await api(env,'POST',`/api/shares/${share.id}/accept`,share.inviteToken,{eventId:'different-0001',expectedRevision:first.revision,consent:{progress:true,location:true}});assert.equal(attacker.status,404);
});

test('expiry and scheduled retention remove share, location, subscription and outbox after restart',async t=>{
  const {env,store}=await fixture(t),share=await create(env);await accept(env,share);
  await mutateSharing(store,state=>{state.shares[share.id].expiresAt=Date.now()-100;state.shares[share.id].purgeAt=Date.now()-1;});
  await runSharingMaintenance(env);
  assert.equal((await api(env,'GET',`/api/shares/${share.id}`,share.viewerToken)).status,404);assert.equal((await store.read()).value.shares[share.id],undefined);
});

test('persistent rate limits survive a new provider and cross-origin/body/query validation fails closed',async t=>{
  const {env,database}=await fixture(t);for(let i=0;i<10;i++)assert.equal((await api(env,'POST','/api/shares',null,{plan})).status,201);
  const restart=new LocalSharingStore(database);assert.equal((await api({SHARING_STORE:restart},'POST','/api/shares',null,{plan})).status,429);restart.close();
  const cross=await handleSharingApi(new Request('https://commute.test/api/shares',{method:'POST',headers:{origin:'https://other.test','content-type':'application/json'},body:JSON.stringify({plan})}),env);assert.equal(cross.status,403);
  assert.equal((await api(env,'GET','/api/shares?token=secret',null)).status,400);
});

test('D1 compare-and-swap uses durable SQL conditional writes rather than an isolate map',async t=>{
  const {store}=await fixture(t);
  const binding={prepare(sql){return {bind(...args){return {first:async()=>store.database.prepare(sql).get(...args),run:async()=>({meta:{changes:store.database.prepare(sql).run(...args).changes}})};}};}};
  const d1=new D1SharingStore(binding);const first=await d1.read();assert.equal(await d1.compareAndSwap(first.revision,first.value),true);assert.equal(await d1.compareAndSwap(first.revision,first.value),false);
  await mutateSharing(d1,state=>{state.rates['durable']={count:1,expiresAt:Date.now()+60000};});assert.equal((await store.read()).value.rates.durable.count,1);
});

test('server event delivers once via explicit local test transport; consent and gone subscriptions are enforced',async t=>{
  const {env,store}=await fixture(t);const delivered=[];env.PUSH_TEST_TRANSPORT=async(_sub,payload)=>{delivered.push(payload);return {status:201};};
  const share=await create(env),accepted=await accept(env,share),sub=await subscription();
  const registration=await api(env,'POST','/api/push/subscriptions',share.viewerToken,{shareId:share.id,subscription:sub});assert.equal(registration.status,200);
  const body=progressBody(accepted,{acceptedPlan:{...plan,route:{id:'toilet-detour'}}});
  const changed=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,body);assert.equal(changed.status,200);assert.equal(delivered.length,1);assert.equal(delivered[0].title,'Journey updated');assert.ok(!JSON.stringify(delivered).includes('toilet'));
  await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,body);await flushSharingPush(env);assert.equal(delivered.length,1);
  env.PUSH_TEST_TRANSPORT=async()=>({status:410});
  const finish=await api(env,'PATCH',`/api/shares/${share.id}/progress`,accepted.travellerToken,progressBody(changed.body,{eventId:'finish-0000001',status:'completed'}));assert.equal(finish.status,200);assert.equal(Object.keys((await store.read()).value.subscriptions).length,0);
});

test('private/internal push destinations and missing delivery credentials are rejected',async t=>{
  const {env}=await fixture(t),share=await create(env),accepted=await accept(env,share),sub=await subscription();
  assert.equal((await api(env,'POST','/api/push/subscriptions',accepted.travellerToken,{shareId:share.id,subscription:{...sub,endpoint:'https://127.0.0.1/private'}})).status,400);
  assert.equal((await api(env,'POST','/api/push/subscriptions',accepted.travellerToken,{shareId:share.id,subscription:sub})).status,503);
  const config=await api(env,'GET','/api/push/config');assert.equal(config.body.configured,false);assert.deepEqual(config.body.missing,['VAPID_PUBLIC_KEY','VAPID_PRIVATE_JWK','VAPID_SUBJECT']);
});
