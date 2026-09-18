import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransportAdapter,normalizeNotices,normalizeCrowding} from '../server/adapter.js';
import {LIVE_STATIONS,crowdFreshness,offsetTime,noticeRelevance,liveSnapshot} from '../src/live-data.js';
import {renderLive} from '../src/live-ui.js';
import {plan} from '../src/engine.js';
import {DEFAULT_INPUT,demoEvent} from '../src/data.js';
import {saveJourney,restoreJourney,STORAGE_KEY} from '../src/storage.js';
import {readFile} from 'node:fs/promises';
import {summarizeLive} from '../scripts/verify-live.mjs';
const start='2026-09-18T20:00:00+08:00',end='2026-09-18T20:10:00+08:00',now=Date.parse(start)+300000;
const observation={level:'l',startTime:start,endTime:end};
const rawRow=(Station='EW2',extra={})=>({Station,StartTime:start,EndTime:end,CrowdLevel:'l',...extra});
const notices={value:{Status:1,Message:[],AffectedSegments:[]}};
const fetchPayload=url=>url.includes('TrainServiceAlerts')?notices:{value:LIVE_STATIONS.filter(s=>s.line===new URL(url).searchParams.get('TrainLine')).map(s=>rawRow(s.code))};
const makeFeed=async()=>createTransportAdapter({clock:()=>now,fetcher:async url=>Response.json(fetchPayload(url))})({LTA_ACCOUNT_KEY:'synthetic-key'});

test('source interval uses exact inclusive start/exclusive end; refetch cannot renew it',()=>{
  assert.equal(crowdFreshness(observation,Date.parse(start)-1),'future');
  assert.equal(crowdFreshness(observation,Date.parse(start)),'current');
  assert.equal(crowdFreshness(observation,Date.parse(end)-1),'current');
  assert.equal(crowdFreshness({...observation,retrievedAt:new Date().toISOString()},Date.parse(end)),'expired');
});
test('missing timezone, impossible dates, NA, conflicts and reversed intervals never become current',()=>{
  for(const patch of [{startTime:null},{startTime:'2026-09-18T20:00:00'},{startTime:'2026-02-30T20:00:00+08:00'},{endTime:start},{level:'NA'},{level:'quiet'},{conflict:true}])assert.notEqual(crowdFreshness({...observation,...patch},now),'current');
  assert.equal(offsetTime('2026-09-18T24:00:00+08:00'),null);
});
test('crowd records map exact requested-line codes, not prefixes or other platforms',()=>{
  const r=normalizeCrowding({value:[rawRow('EW2'),rawRow('EW20'),rawRow('DT32'),rawRow('EW2-EW12'),rawRow('CC9')]},'EWL');
  assert.deepEqual(r.records.map(s=>s.code),['EW2']);assert.equal(r.unmappedRecords,4);
});
test('duplicate contradictory station reports fail to unknown; missing and empty are distinct',()=>{
  const r=normalizeCrowding({value:[rawRow(),rawRow('EW2',{CrowdLevel:'h'})]},'EWL');
  assert.equal(crowdFreshness(r.records[0],now),'unknown');
  assert.equal(normalizeCrowding({value:[]},'EWL').status,'empty');
  assert.throws(()=>normalizeCrowding({},'EWL'),/malformed/);
  assert.equal(normalizeCrowding({value:[{}]},'EWL').status,'partial');
});
test('notice status 1, valid emptiness, missing fields and malformed records remain distinct',()=>{
  assert.equal(normalizeNotices(notices).status,'empty');assert.equal(normalizeNotices(notices).serviceStatus,1);
  assert.equal(normalizeNotices({value:{Status:1}}).status,'missing');
  assert.equal(normalizeNotices({value:{Status:2,Message:[{}],AffectedSegments:[]}}).status,'partial');
  assert.throws(()=>normalizeNotices({value:{Status:'1'}}),/malformed/);
});
test('structured notices separate corridor, outside, line-only and unknown relevance',()=>{
  assert.equal(noticeRelevance({Line:'EWL',Stations:'EW8|CC9,EW9'}).relevance,'corridor');
  assert.equal(noticeRelevance({Line:'EWL',Stations:'EW1'}).relevance,'unmapped');
  assert.equal(noticeRelevance({Line:'NSL',Stations:'NS13'}).relevance,'elsewhere');
  assert.equal(noticeRelevance({Line:'EWL',Stations:''}).relevance,'line');
  assert.equal(noticeRelevance({Stations:'EW8'}).relevance,'unmapped');
  for(const Stations of ['CC9','EW200','EW1-EW13'])assert.equal(noticeRelevance({Line:'EWL',Stations}).relevance,'unmapped');
});
test('messages are never assigned segment meaning, time validity or a delay from prose',()=>{
  const r=normalizeNotices({value:{Status:2,Message:[{Content:'EW8 delayed by 22 minutes',CreatedDate:'2026-09-18 20:00:00'}],AffectedSegments:[{Line:'NSL',Stations:'NS13',Direction:'Both'}]}});
  assert.equal(r.items[0].relevance,'unmapped');assert.equal(r.items[0].expiresAt,null);assert.equal(r.items[0].sourceTime,'2026-09-18 20:00:00');assert.equal(r.segments[0].relevance,'elsewhere');
});
test('parallel callers share four bounded fetches, honor per-feed TTL and cannot mutate the cache',async()=>{
  let count=0,time=now;const adapter=createTransportAdapter({clock:()=>time,fetcher:async url=>{count++;await new Promise(r=>setTimeout(r,5));return Response.json(fetchPayload(url));}});
  const env={LTA_ACCOUNT_KEY:'synthetic-key'},[a,b]=await Promise.all([adapter(env),adapter(env)]);assert.equal(count,4);
  a.crowding.lines[0].records[0].level='h';assert.equal(b.crowding.lines[0].records[0].level,'l');
  time+=60001;const c=await adapter(env);assert.equal(count,5);assert.equal(c.crowding.lines[0].retrievedAt,b.crowding.lines[0].retrievedAt);
  time+=600000;await adapter(env);assert.equal(count,9);
});
test('missing or changed credentials never inherit a successful cached feed',async()=>{
  let count=0;const adapter=createTransportAdapter({clock:()=>now,fetcher:async(url,opts)=>{count++;return opts.headers.AccountKey==='good-key'?Response.json(fetchPayload(url)):new Response('secret reflected',{status:401});}});
  assert.equal((await adapter({LTA_ACCOUNT_KEY:'good-key'})).notices.status,'empty');
  assert.equal((await adapter({})).status,'unavailable');assert.equal(count,4);
  const denied=await adapter({LTA_ACCOUNT_KEY:'bad-key'});assert.equal(denied.notices.error,'authentication');assert.equal(denied.notices.items,undefined);assert.equal(count,8);
  assert.ok(!JSON.stringify(denied).includes('bad-key'));await adapter({LTA_ACCOUNT_KEY:'bad-key'});assert.equal(count,8);
});
test('429 Retry-After suppresses shared retries without changing source timestamps',async()=>{
  let time=now,count=0,fail=false;
  const adapter=createTransportAdapter({clock:()=>time,fetcher:async url=>{count++;return fail?new Response('',{status:429,headers:{'Retry-After':'300'}}):Response.json(fetchPayload(url));}});
  const env={LTA_ACCOUNT_KEY:'synthetic-key'},first=await adapter(env);time+=600001;fail=true;
  const r=await adapter(env);assert.equal(r.crowding.lines[0].error,'rate_limited');assert.equal(r.crowding.lines[0].retrievedAt,first.crowding.lines[0].retrievedAt);
  assert.equal(crowdFreshness(r.crowding.lines[0].records[0],time),'expired');time+=299000;await adapter(env);assert.equal(count,8);
});
test('one malformed feed leaves others usable; reflected key and unexpected fields are excluded',async()=>{
  const key='synthetic-private-key';const adapter=createTransportAdapter({clock:()=>now,fetcher:async(url,options)=>{
    assert.equal(options.redirect,'error');assert.equal(new URL(url).searchParams.has('AccountKey'),false);
    if(url.includes('TrainServiceAlerts'))return Response.json({value:{Status:2,Message:[{Content:`Advisory ${key}`,CreatedDate:key}],AffectedSegments:[],AccountKey:key}});
    if(url.includes('CCL'))return new Response('{broken');return Response.json(fetchPayload(url));
  }});
  const r=await adapter({LTA_ACCOUNT_KEY:key});assert.equal(r.crowding.status,'partial');assert.equal(r.crowding.lines.find(l=>l.line==='CCL').error,'malformed');assert.ok(!JSON.stringify(r).includes(key));
});
test('timeout and network failures are bounded and never disclose exception text',async()=>{
  const adapter=createTransportAdapter({timeoutMs:5,fetcher:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('synthetic-secret'))))});
  const r=await adapter({LTA_ACCOUNT_KEY:'synthetic-secret'});assert.equal(r.notices.error,'timeout');assert.equal(r.status,'unavailable');assert.ok(!JSON.stringify(r).includes('synthetic-secret'));
});
test('bounded response rejects oversized data and unexpected redirects fail closed',async()=>{
  const r=await createTransportAdapter({fetcher:async()=>new Response('x',{headers:{'content-length':String(3*1024*1024)}})})({LTA_ACCOUNT_KEY:'synthetic-key'});
  assert.equal(r.notices.error,'malformed');
  const redirect=await createTransportAdapter({fetcher:async()=>new Response(null,{status:302})})({LTA_ACCOUNT_KEY:'synthetic-key'});assert.equal(redirect.notices.error,'http_error');
});
test('source metadata survives saved-journey restore independently of demo timestamp',async()=>{
  const feed=await makeFeed();feed.clientReceivedAt=new Date(now).toISOString();feed.secretExtra='should-not-persist';
  const geometry=JSON.parse(await readFile('public/data/corridor.json','utf8')),storage=new Map();storage.setItem=storage.set;storage.getItem=storage.get;
  const state={input:DEFAULT_INPUT,routes:plan(DEFAULT_INPUT).routes,selected:'direct',scene:'normal',current:'origin',geometry,liveFeed:liveSnapshot(feed),lastChecked:'2026-09-19T08:10:00+08:00'};
  assert.equal(saveJourney(storage,state).ok,true);const restored=restoreJourney(storage);assert.equal(restored.liveFeed.crowding.lines[0].records[0].endTime,end);assert.equal(restored.lastChecked,state.lastChecked);assert.ok(!storage.get(STORAGE_KEY).includes('should-not-persist'));
});
test('live UI excludes unrelated segments, escapes advisories, and never labels expired/NA/offline bands current',async()=>{
  const feed=await makeFeed();feed.notices.items=[{text:'<img onerror="bad()">',sourceTime:'2026-09-18 20:00:00'}];feed.notices.segments=[{relevance:'elsewhere',line:'NSL',codes:['NS13']}];
  const current=renderLive(feed,{now});assert.match(current,/Current interval/);assert.ok(!current.includes('<img'));assert.match(current,/timezone or format unconfirmed/);assert.match(current,/outside this corridor omitted/);
  const expired=renderLive(feed,{now:Date.parse(end)});assert.ok(!expired.includes('Current interval'));assert.match(expired,/Expired/);assert.match(expired,/replay calculations/);
  assert.ok(!renderLive(feed,{now,online:false}).includes('Current interval'));assert.ok(!renderLive(feed,{now,requestFailed:true}).includes('Current interval'));
  feed.crowding.lines[0].retrievedAt=new Date(now+10000).toISOString();assert.ok(!renderLive(feed,{now}).match(/station-report current[^]*?data-station-code="EW2"/));
});
test('future source reports cannot mature into observations without a new validating retrieval',async()=>{
  const feed=await makeFeed();for(const line of feed.crowding.lines)line.retrievedAt='2026-09-18T19:50:00+08:00';
  assert.ok(!renderLive(feed,{now}).includes('Current interval'));assert.match(renderLive(feed,{now}),/Source timing unconfirmed/);
});
test('corrupt live snapshots cannot crash restored UI or persist nested unknown properties',async()=>{
  const feed=await makeFeed();feed.notices.segments=[{relevance:'corridor'}];feed.notices.items=[{text:{AccountKey:'synthetic-private'},sourceTime:[]}];
  const restored=liveSnapshot(feed);assert.ok(!JSON.stringify(restored).includes('synthetic-private'));assert.doesNotThrow(()=>renderLive(restored,{now}));
  assert.equal(liveSnapshot({...feed,notices:{items:{bad:true}}}),null);
  for(const level of ['constructor','toString','__proto__']){feed.crowding.lines[0].records[0].level=level;assert.doesNotThrow(()=>renderLive(liveSnapshot(feed),{now}));}
  feed.crowding.status={secretExtra:'should-not-persist'};assert.ok(!JSON.stringify(liveSnapshot(feed)).includes('should-not-persist'));
});
test('failed refresh cannot reuse previous HTTP success as live validation evidence',async()=>{
  let time=now,fail=false;const adapter=createTransportAdapter({clock:()=>time,fetcher:async url=>{if(fail)throw Error('network');return Response.json(fetchPayload(url));}});
  const env={LTA_ACCOUNT_KEY:'synthetic-key'},good=await adapter(env);assert.equal(summarizeLive(good,time).accessCheck,'PASS');
  time+=600001;fail=true;const bad=await adapter(env);assert.equal(bad.notices.httpStatus,null);assert.equal(bad.crowding.lines[0].records.length,11);
  assert.equal(summarizeLive(bad,time).accessCheck,'BLOCKED');assert.equal(summarizeLive(bad,time).corridorMappingCheck,'NOT TESTED');
  bad.notices.httpStatus=200;bad.crowding.lines.forEach(l=>l.httpStatus=200);assert.equal(summarizeLive(bad,time).accessCheck,'BLOCKED');
});
