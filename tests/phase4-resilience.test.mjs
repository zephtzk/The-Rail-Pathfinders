import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeSnapshot,newerSnapshot} from '../src/feed-health.js';
import {createTransportAdapter} from '../server/adapter.js';
import {createBusAdapter} from '../server/bus-adapter.js';
const now=Date.parse('2026-09-18T02:00:00Z');
const snapshot=t=>({schemaVersion:1,checkedAt:new Date(t).toISOString(),notices:{status:'available',retrievedAt:new Date(t).toISOString(),items:[{text:'Advisory only'}],segments:[]}});
test('older or future snapshot never replaces newer retrieval; malformed/partial remains distinct',()=>{
 const current=noticeSnapshot(snapshot(now));assert.ok(current);
 assert.equal(newerSnapshot(current,noticeSnapshot(snapshot(now-1000)),now),false);
 assert.equal(newerSnapshot(current,noticeSnapshot(snapshot(now+6000)),now),false);
 assert.equal(newerSnapshot(current,noticeSnapshot(snapshot(now+1)),now),true);
 assert.equal(noticeSnapshot({...snapshot(now),notices:{status:'available',items:{},segments:[]}}),null);
 assert.equal(noticeSnapshot({...snapshot(now),notices:{status:'available',items:[null],segments:[]}}),null);
 const partial=noticeSnapshot({...snapshot(now),notices:{...snapshot(now).notices,status:'partial'}});assert.equal(partial.notices.status,'partial');
 const oldSource=snapshot(now+1);oldSource.notices.retrievedAt=new Date(now-1).toISOString();assert.equal(newerSnapshot(current,noticeSnapshot(oldSource),now),false);
});
test('relevant notice endpoint shares cache with status; failures back off and retain last success',async()=>{
 let at=now,calls=0,fail=false;
 const adapter=createTransportAdapter({clock:()=>at,fetcher:async url=>{calls++;if(fail)throw Error('secret must not leak');return Response.json(url.includes('TrainServiceAlerts')?{value:{Status:1,Message:[],AffectedSegments:[]}}:{value:[]});}});
 const key={LTA_ACCOUNT_KEY:'synthetic-key'};
 await Promise.all([adapter(key,true),adapter(key,true)]);assert.equal(calls,1);
 await adapter(key);assert.equal(calls,4);
 at+=60001;fail=true;const failed=await adapter(key,true);assert.equal(failed.notices.status,'unavailable');assert.equal(failed.notices.retrievedAt,new Date(now).toISOString());
 assert.ok(!JSON.stringify(failed).includes('secret'));
 at=Date.parse(failed.notices.nextRefreshAt)+1;const again=await adapter(key,true);assert.equal(Date.parse(again.notices.nextRefreshAt)-at,120000);
});
test('bus outage retains last successful retrieval, bounded retry and per-isolate cache disclosure',async()=>{
 let at=now,fail=false;
 const adapter=createBusAdapter({clock:()=>at,allowedStopCodes:['81111'],fetcher:async()=>{if(fail)throw Error('secret');return Response.json({BusStopCode:'81111',Services:[]});}});
 const key={LTA_ACCOUNT_KEY:'synthetic-key'};const initial=await adapter('81111',key);at+=30001;fail=true;const failed=await adapter('81111',key);
 assert.equal(failed.lastSuccessfulRetrievalAt,initial.retrievedAt);assert.equal(failed.status,'unavailable');assert.equal(failed.sourceValidity,null);assert.match(failed.cacheScope,/not a distributed/);
 at=Date.parse(failed.nextRefreshAt)+1;assert.equal(Date.parse((await adapter('81111',key)).nextRefreshAt)-at,120000);
});
