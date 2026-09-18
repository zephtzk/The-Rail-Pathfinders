import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SharingClient} from '../src/sharing-client.js';
import {LocalSharingStore} from '../server/providers-local.js';
import {handleSharingApi} from '../server/sharing.js';

const plan={schemaVersion:2,id:'plan-1',mode:'replay',origin:{id:'origin'},destination:{id:'destination'},route:{id:'route',steps:[],arrivalSeconds:36000},stops:[]};
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};};
async function setup(t){const directory=await mkdtemp(path.join(os.tmpdir(),'commute-client-')),store=new LocalSharingStore(path.join(directory,'db.sqlite'));t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true});});const env={SHARING_STORE:store};const fetcher=(url,options)=>handleSharingApi(new Request('https://commute.test'+url,options),env);const caregiver=new SharingClient(storage(),{fetcher});const share=await caregiver.create(plan);const recipientStorage=storage();recipientStorage.setItem('commute-copilot-pairing-v2',JSON.stringify({id:share.id,role:'recipient',inviteToken:share.inviteToken,revision:share.revision}));const traveller=new SharingClient(recipientStorage,{fetcher});return {store,fetcher,caregiver,share,traveller,recipientStorage};}
function active(extra={}){return {id:'active-1',revision:1,status:'started',permissions:{progress:true,location:true,paused:false,revoked:false},progress:{checkpoint:{id:'manual-checkpoint'}},plan,route:plan.route,stops:[],location:{latitude:1.3,longitude:103.8,accuracy:55,timestamp:Date.now()},...extra};}

test('default browser fetch is invoked with its Window/global receiver',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async function(){assert.equal(this,globalThis);return Response.json({id:'a'.repeat(22),revision:1,inviteToken:'b'.repeat(43)});};
    const client=new SharingClient(storage());await client.create(plan);
  }finally{globalThis.fetch=original;}
});

test('consuming an invitation removes the secret fragment and retains the compatibility entry query',()=>{
  const previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),previousHistory=Object.getOwnPropertyDescriptor(globalThis,'history');let replaced;
  try {
    Object.defineProperty(globalThis,'location',{configurable:true,value:{pathname:'/',search:'?legacy=1',hash:'#invite='+'a'.repeat(22)+'.'+'b'.repeat(43)}});
    Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState(_state,_title,url){replaced=url;}}});
    const client=new SharingClient(storage(),{fetcher:async()=>{throw Error('No network needed to consume invitation');}});
    assert.equal(client.useFragment(),true);assert.equal(replaced,'/?legacy=1');assert.equal(replaced.includes('#'),false);assert.equal(client.session.inviteToken,'b'.repeat(43));
  } finally {
    if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else delete globalThis.location;
    if(previousHistory)Object.defineProperty(globalThis,'history',previousHistory);else delete globalThis.history;
  }
});

test('lost acceptance responses recover the same claimant after reload, without another pairing grant',async t=>{
  const {fetcher,traveller,recipientStorage,store,share}=await setup(t);let losses=0;
  traveller.fetcher=async(url,options)=>{const response=await fetcher(url,options);if(url.endsWith('/accept')){losses++;throw Error('Response lost after server commit');}return response;};
  await assert.rejects(traveller.accept());assert.equal(losses,2);
  const pending=JSON.parse(recipientStorage.getItem('commute-copilot-pairing-v2')).pendingAcceptance;assert.ok(pending.eventId);
  const reloaded=new SharingClient(recipientStorage,{fetcher});const recovered=await reloaded.read();assert.equal(recovered.role,'traveller');assert.equal(reloaded.session.role,'traveller');assert.equal(reloaded.session.inviteToken,undefined);assert.equal((await store.read()).value.shares[share.id].revision,2);
});

test('permission change waits for in-flight revision and discards queued coordinates before resuming',async t=>{
  const {fetcher,traveller,store,share}=await setup(t);await traveller.accept({progress:true,location:true});
  let release,signalStarted;const started=new Promise(resolve=>signalStarted=resolve),hold=new Promise(resolve=>release=resolve);let progressRequests=0;
  traveller.fetcher=async(url,options)=>{const response=await fetcher(url,options);if(url.endsWith('/progress')){progressRequests++;signalStarted();await hold;}return response;};
  const first=traveller.update(active());await started;
  const queued=traveller.update(active({revision:2}));const pause=traveller.permissions({progress:true,location:true},true);release();
  await first;assert.equal(await queued,null);const changed=await pause;assert.equal(changed.sharingEpoch,1);assert.equal(progressRequests,1);
  const saved=(await store.read()).value.shares[share.id];assert.equal(saved.location,null);assert.equal(saved.sharingPaused,true);assert.equal(traveller.session.revision,saved.revision);
});

test('lost progress response retries the exact event, duplicate snapshots do not create extra revisions',async t=>{
  const {fetcher,traveller,store,share}=await setup(t);await traveller.accept({progress:true,location:true});const payloads=[];let lost=false;
  traveller.fetcher=async(url,options)=>{const response=await fetcher(url,options);if(url.endsWith('/progress')){payloads.push(options.body);if(!lost){lost=true;throw Error('Lost response');}}return response;};
  const journey=active();await traveller.update(journey);await traveller.update(journey);assert.equal(payloads.length,2);assert.equal(payloads[0],payloads[1]);assert.equal((await store.read()).value.shares[share.id].revision,3);
  const terminal=await traveller.update(active({revision:2,status:'completed'}));assert.equal(terminal.collectionStopped,true);assert.equal(JSON.parse(payloads.at(-1)).location,undefined);
});

test('offline updates store no location queue; changed server permission epoch blocks stale reconnect',async t=>{
  const {fetcher,traveller,recipientStorage,share}=await setup(t);await traveller.accept({progress:true,location:true});traveller.online=()=>false;
  assert.equal(await traveller.update(active()),null);assert.ok(!recipientStorage.getItem('commute-copilot-pairing-v2').includes('latitude'));
  const remote=new SharingClient(recipientStorage,{fetcher});await remote.permissions({progress:false,location:false},true);
  traveller.online=()=>true;await assert.rejects(traveller.update(active({revision:2})),/queued location was discarded/);
  assert.equal(await traveller.update(active({revision:3})),null);
  const viewer=await fetcher('/api/shares/'+share.id,{headers:{Authorization:'Bearer '+share.viewerToken}});const view=await viewer.json();assert.equal(view.location,null);assert.equal(view.progress,null);
});

test('unsupported push leaves in-app flow available',async()=>{
  const {enablePush}=await import('../src/sharing-client.js');
  await assert.rejects(enablePush({}),/Web Push unavailable/);
});

test('denied notification permission does not prompt again or register a subscription',async()=>{
  const {enablePush}=await import('../src/sharing-client.js');
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousNotification=Object.getOwnPropertyDescriptor(globalThis,'Notification'),previousServiceWorker=Object.getOwnPropertyDescriptor(globalThis.navigator,'serviceWorker');
  try{
    Object.defineProperty(globalThis,'window',{value:{PushManager(){},Notification:{}},configurable:true});
    Object.defineProperty(globalThis.navigator,'serviceWorker',{value:{},configurable:true});
    Object.defineProperty(globalThis,'Notification',{value:{permission:'denied',requestPermission(){throw Error('Permission must not be prompted again');}},configurable:true});
    await assert.rejects(enablePush({travellerToken:'configured-role-token'}),/Notifications are denied/);
  }finally{
    for(const [object,key,descriptor] of [[globalThis,'window',previousWindow],[globalThis,'Notification',previousNotification],[globalThis.navigator,'serviceWorker',previousServiceWorker]]){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}
  }
});
