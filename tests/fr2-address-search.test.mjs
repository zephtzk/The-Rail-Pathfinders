import test from 'node:test';
import assert from 'node:assert/strict';
import {createOneMapAddressSearch} from '../src/address-search.js';

const point={id:'onemap:1.300000,103.800000',label:'Synthetic public address',address:'Synthetic public address, Singapore',lat:1.3,lng:103.8};
const response=(results=[point])=>new Response(JSON.stringify({provider:'onemap',status:'ok',results}));

test('OneMap edit or clear aborts and ignores a provider that completes after cancellation',async()=>{
  let done,signal;
  const search=createOneMapAddressSearch({fetcher:(_url,options)=>{signal=options.signal;return new Promise(resolve=>done=resolve);}});
  const pending=search.search('public address');search.cancel();assert.equal(signal.aborted,true);
  done(response());assert.equal(await pending,null);
});

test('new OneMap query wins even when the older request finishes last',async()=>{
  const requests=[];
  const search=createOneMapAddressSearch({minIntervalMs:0,fetcher:()=>new Promise(resolve=>requests.push(resolve))});
  const older=search.search('old public address'),newer=search.search('new public address');
  requests[1](response([{...point,label:'New public address'}]));assert.equal((await newer)[0].label,'New public address');
  requests[0](response());assert.equal(await older,null);
});

test('OneMap cached results stay labelled, cloned, coordinate based and usable without a fresh request',async()=>{
  let calls=0;
  const search=createOneMapAddressSearch({fetcher:async()=>{calls++;return response();}});
  const fresh=await search.search('Public address');assert.ok(!fresh[0].searchCached);
  fresh[0].lat=0;
  const cached=await search.search('public address');assert.equal(cached[0].lat,1.3);assert.equal(cached[0].searchCached,true);
  assert.equal(cached[0].routingId,null);assert.equal(cached[0].accessibility,'unknown');assert.equal(calls,1);
});

test('OneMap failures and empty responses never manufacture an address',async()=>{
  assert.deepEqual(await createOneMapAddressSearch({fetcher:async()=>response([])}).search('missing address'),[]);
  await assert.rejects(createOneMapAddressSearch({fetcher:async()=>{throw TypeError('Offline');}}).search('public address'),/could not connect/);
  await assert.rejects(createOneMapAddressSearch({fetcher:async()=>new Response(JSON.stringify({status:'unavailable',message:'Provider unavailable'}),{status:503})}).search('public address'),/Provider unavailable/);
});
