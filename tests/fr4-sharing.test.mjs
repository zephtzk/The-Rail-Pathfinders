import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalSharingStore} from '../server/providers-local.js';
import {handleSharingApi} from '../server/sharing.js';
import {SharingClient} from '../src/sharing-client.js';
const plan={schemaVersion:2,id:'one-planned-trip',origin:{id:'test-origin'},destination:{id:'test-destination'},route:{id:'test-route',steps:[]}};
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
function fixture(t){const store=new LocalSharingStore(':memory:');t.after(()=>store.close());const fetcher=(url,options)=>handleSharingApi(new Request('https://sharing.test'+url,options),{SHARING_STORE:store});const owner=new SharingClient(memory(),{fetcher});return {store,fetcher,owner};}
async function request(fetcher,path,token,method='GET',body){const result=await fetcher('/api/shares'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:result.status,body:await result.json()};}

test('plan viewer sees only the explicitly shared current plan, cannot accept or write, and owner can update/delete',async t=>{
  const {store,fetcher,owner}=fixture(t),share=await owner.create(plan,{purpose:'plan-view'});
  assert.equal(share.purpose,'plan-view');assert.equal(share.inviteToken,undefined);
  assert.equal((await store.read()).value.shares[share.id].tokens.invite,undefined);
  const other=await owner.create({...plan,id:'another-private-trip'});
  const view=await request(fetcher,'/'+share.id,share.viewerToken);
  assert.equal(view.status,200);assert.equal(view.body.sharedPlan.id,plan.id);assert.equal(view.body.readOnly,true);
  for(const key of ['progress','location','acceptedPlan','proposedPlan','travellerToken','inviteToken'])assert.equal(view.body[key],undefined);
  assert.equal((await request(fetcher,'/'+other.id,share.viewerToken)).status,404);
  for(const [method,action] of [['POST','accept'],['PATCH','plan'],['PATCH','permissions'],['PATCH','progress'],['DELETE','access'],['DELETE','']]){
    const result=await request(fetcher,'/'+share.id+(action?'/'+action:''),share.viewerToken,method,{eventId:crypto.randomUUID(),expectedRevision:1,plan,consent:{progress:true,location:true},status:'started',sharingEpoch:0,routeRevision:1});
    assert.equal(result.status,404,method+' '+action);
  }
  const ownerAccept=await request(fetcher,'/'+share.id+'/accept',share.editorToken,'POST',{eventId:crypto.randomUUID(),expectedRevision:1,consent:{progress:true,location:true}});assert.equal(ownerAccept.status,404);
  owner.session={...share,role:'caregiver'};
  const revised={...plan,id:'current-revised-trip'};await owner.propose(revised);
  const updated=await request(fetcher,'/'+share.id,share.viewerToken);assert.equal(updated.body.sharedPlan.id,revised.id);assert.equal(updated.body.planRevision,2);
  await owner.delete();assert.equal((await request(fetcher,'/'+share.id,share.viewerToken)).status,404);
});

test('view-trip fragment uses only viewer capability and caller-provided session storage',async()=>{
  const previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),previousHistory=Object.getOwnPropertyDescriptor(globalThis,'history');let replacement;
  try{
    Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'https://sharing.test',pathname:'/',search:'',hash:'#view-trip='+'a'.repeat(22)+'.'+'b'.repeat(43)}});
    Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState(_state,_title,url){replacement=url;}}});
    const storage=memory(),client=new SharingClient(storage,{fetcher:async()=>{throw Error('No network required');}});
    assert.equal(client.useFragment(),true);assert.equal(replacement,'/');assert.equal(client.session.role,'plan-viewer');assert.equal(client.session.purpose,'plan-view');assert.equal(client.session.editorToken,undefined);assert.equal(client.session.inviteToken,undefined);
    assert.equal(client.links().invite,null);assert.ok(client.links().viewer.includes('#view-trip='));
    const restored=new SharingClient(storage,{fetcher:async()=>{throw Error('No network required');}});assert.equal(restored.session.purpose,'plan-view');
    await assert.rejects(client.accept(),/valid recipient invitation/);await assert.rejects(client.delete(),/Only the traveller/);
  }finally{if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else delete globalThis.location;if(previousHistory)Object.defineProperty(globalThis,'history',previousHistory);else delete globalThis.history;}
});
