import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBusArrivals,busPredictionState,createBusAdapter} from '../server/bus-adapter.js';

// All provider responses in this file are synthetic; no provider requests are made.
const now = Date.parse('2026-09-19T00:00:00Z');
const secret = 'synthetic-private-test-value';
const env = {LTA_ACCOUNT_KEY:secret};
const patterns = [
  {id:'7A-1',serviceNo:'7A',operator:'SBST',originCode:'01001',destinationCode:'01009',direction:1,stops:[{stopId:'01012',visitNumber:1,sequence:3},{stopId:'01012',visitNumber:2,sequence:13}]},
  {id:'7A-2',serviceNo:'7A',operator:'SBST',originCode:'01009',destinationCode:'01001',direction:2,stops:[{stopId:'01013',visitNumber:1,sequence:7}]}
];
const prediction = changes => ({OriginCode:'01001',DestinationCode:'01009',EstimatedArrival:'2026-09-19T08:05:00+08:00',Monitored:1,VisitNumber:'1',...changes});
const service = changes => ({ServiceNo:'7A',Operator:'SBST',NextBus:prediction(),NextBus2:{EstimatedArrival:''},NextBus3:{EstimatedArrival:''},...changes});
const payload = (services = [service()], stop = '01012') => ({BusStopCode:stop,Services:services});
const response = (data = payload(), options = {}) => new Response(JSON.stringify(data),{headers:{'content-type':'application/json'},...options});
const adapter = options => createBusAdapter({clock:() => now,patterns,allowedStopCodes:['01012','01013','01014'],...options});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise,resolve}; };

test('bus arrival matches exact service, operator, termini and repeated stop occurrence without losing leading zeros',() => {
  const feed = normalizeBusArrivals(payload([service({NextBus2:prediction({VisitNumber:'2'}),NextBus3:prediction({Monitored:0})})]),'01012',patterns);
  assert.equal(feed.status,'available');
  assert.equal(feed.stopCode,'01012');
  assert.deepEqual(feed.predictions.map(item => item.match),[
    {patternId:'7A-1',direction:1,sequence:3},{patternId:'7A-1',direction:1,sequence:13},{patternId:'7A-1',direction:1,sequence:3}
  ]);
  assert.deepEqual(feed.predictions.map(item => item.predictionBasis),['vehicle-location-estimate','vehicle-location-estimate','operator-schedule']);
  assert.equal(feed.providerTimestamp,null,'provider generation time is unavailable');
  assert.equal(feed.predictions[0].predictedArrival,'2026-09-19T08:05:00+08:00');
  assert.ok(!('downstreamArrivals' in feed.predictions[0]));
});

test('opposite-direction stop matches only the corresponding pattern and stop occurrence',() => {
  const incoming = service({NextBus:prediction({OriginCode:'01009',DestinationCode:'01001'})});
  assert.deepEqual(normalizeBusArrivals(payload([incoming],'01013'),'01013',patterns).predictions[0].match,{patternId:'7A-2',direction:2,sequence:7});
  assert.equal(normalizeBusArrivals(payload([incoming]),'01012',patterns).predictions[0].matchStatus,'unmatched');
});

test('service variant, operator, origin, destination or occurrence mismatches never become a timing match',() => {
  const changes = [
    {ServiceNo:'7'}, {Operator:'SMRT'}, {NextBus:prediction({OriginCode:'01002'})},
    {NextBus:prediction({DestinationCode:'01008'})}, {NextBus:prediction({VisitNumber:'3'})}
  ];
  for (const change of changes) {
    const item = normalizeBusArrivals(payload([service(change)]),'01012',patterns).predictions[0];
    assert.equal(item.matchStatus,'unmatched',JSON.stringify(change));
    assert.equal(item.match,null);
  }
});

test('ambiguous pattern match is explicitly retained without choosing a direction',() => {
  const ambiguous = [...patterns,{...patterns[0],id:'7A-variant',direction:2}];
  const item = normalizeBusArrivals(payload(),'01012',ambiguous).predictions[0];
  assert.equal(item.matchStatus,'ambiguous');
  assert.equal(item.match,null);
});

test('valid empty service list and empty prediction slots differ from malformed and partial records',() => {
  const noServices = normalizeBusArrivals(payload([]),'01012',patterns);
  assert.equal(noServices.status,'empty');
  assert.equal(noServices.invalidRecords,0);
  const emptySlots = normalizeBusArrivals(payload([service({NextBus:{EstimatedArrival:''}})]),'01012',patterns);
  assert.equal(emptySlots.status,'empty');
  assert.equal(emptySlots.emptySlots,3);
  const partial = normalizeBusArrivals(payload([service({NextBus2:prediction({VisitNumber:'0'})}),null]),'01012',patterns);
  assert.equal(partial.status,'partial');
  assert.equal(partial.predictions.length,1);
  assert.equal(partial.invalidRecords,2);
  for (const value of [null,{},payload([], '1012'),{BusStopCode:'01012',Services:{}},payload(Array(101).fill(service()))]) {
    assert.throws(() => normalizeBusArrivals(value,'01012',patterns),/malformed/);
  }
});

test('invalid prediction fields are excluded while other slots remain usable',() => {
  for (const change of [
    {OriginCode:1001},{DestinationCode:'1009'},{VisitNumber:'0'},{VisitNumber:'100'},
    {EstimatedArrival:'2026-09-19T08:05:00'}, {EstimatedArrival:'not-a-date'}, {Monitored:2}
  ]) {
    const feed = normalizeBusArrivals(payload([service({NextBus2:prediction(change)})]),'01012',patterns);
    assert.equal(feed.status,'partial',JSON.stringify(change));
    assert.equal(feed.invalidRecords,1);
    assert.equal(feed.predictions.length,1);
  }
});

test('impossible civil timestamps and non-string service identifiers are malformed records',() => {
  const impossible = normalizeBusArrivals(payload([service({NextBus:prediction({EstimatedArrival:'2026-02-30T08:05:00+08:00'})})]),'01012',patterns);
  assert.equal(impossible.status,'partial');
  assert.equal(impossible.predictions.length,0,'Date.parse rollover must not turn an impossible provider date into a usable prediction');
  const numericService = normalizeBusArrivals(payload([service({ServiceNo:7})]),'01012',patterns);
  assert.equal(numericService.status,'partial');
  assert.equal(numericService.predictions.length,0,'service identifiers must preserve their string/variant semantics');
});

test('freshness uses retrieval and prediction times independently and never makes offline or unmatched arrivals current',() => {
  const item = normalizeBusArrivals(payload(),'01012',patterns).predictions[0];
  const feed = {status:'available',retrievedAt:new Date(now).toISOString(),providerTimestamp:null};
  assert.equal(busPredictionState(item,feed,now,true),'fresh');
  assert.equal(busPredictionState(item,feed,now,false),'offline');
  assert.equal(busPredictionState(item,{...feed,status:'unavailable'},now,true),'unavailable');
  assert.equal(busPredictionState({...item,matchStatus:'unmatched'},feed,now,true),'unmatched');
  assert.equal(busPredictionState({...item,matchStatus:'ambiguous'},feed,now,true),'ambiguous');
  for (const [candidate,source,clock] of [
    [item,feed,now+90001], [item,{...feed,retrievedAt:new Date(now+5001).toISOString()},now],
    [item,{...feed,retrievedAt:'bad'},now], [item,{...feed,retrievedAt:null},now],
    [{...item,predictedArrival:new Date(now).toISOString()},feed,now],
    [{...item,predictedArrival:new Date(now+7200001).toISOString()},feed,now],
    [{...item,predictedArrival:'bad'},feed,now]
  ]) assert.equal(busPredictionState(candidate,source,clock,true),'expired');
});

test('adapter permits only declared stops, needs configuration and never fetches unsupported input',async () => {
  let requests = 0;
  const arrivals = adapter({fetcher:async () => { requests++; return response(); }});
  assert.equal((await arrivals('01012')).error,'not_configured');
  for (const stop of ['01099','1012','01012&ServiceNo=7A','https://attacker.invalid']) assert.equal((await arrivals(stop,env)).error,'unsupported_stop');
  assert.equal(requests,0);
});

test('adapter separates HTTP date, retrieval time and prediction time; keeps credential server-side',async () => {
  let time = now, captured;
  const arrivals = adapter({clock:() => time,fetcher:async (url,options) => {
    captured = {url,options}; time += 1500;
    return response(payload(),{headers:{date:'Sat, 19 Sep 2026 00:00:00 GMT'}});
  }});
  const result = await arrivals('01012',{LTA_ACCOUNT_KEY:`  ${secret}  `});
  assert.equal(captured.url,'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=01012');
  assert.equal(captured.options.headers.AccountKey,secret);
  assert.equal(captured.options.redirect,'error');
  assert.ok(captured.options.signal instanceof AbortSignal);
  assert.equal(result.retrievedAt,'2026-09-19T00:00:01.500Z');
  assert.equal(result.providerHttpDate,'2026-09-19T00:00:00.000Z');
  assert.equal(result.providerTimestamp,null);
  assert.equal(result.predictions[0].predictedArrival,'2026-09-19T08:05:00+08:00');
  assert.equal(result.nextRefreshAt,'2026-09-19T00:00:31.500Z');
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('same-stop concurrent requests coalesce and cached results cannot be mutated by callers',async () => {
  let time = now, requests = 0;
  const gate = deferred();
  const arrivals = adapter({clock:() => time,fetcher:async () => { requests++; await gate.promise; return response(); }});
  const pending = [arrivals('01012',env),arrivals('01012',env),arrivals('01012',env)];
  assert.equal(requests,1);
  gate.resolve();
  const [first,second,third] = await Promise.all(pending);
  assert.deepEqual(first,second); assert.deepEqual(second,third);
  first.predictions[0].serviceNo = 'tampered';
  assert.equal((await arrivals('01012',env)).predictions[0].serviceNo,'7A');
  time += 29999; await arrivals('01012',env); assert.equal(requests,1);
  time++; await arrivals('01012',env); assert.equal(requests,2);
});

test('different-stop concurrency is bounded without queuing unbounded provider requests',async () => {
  let requests = 0;
  const gate = deferred();
  const arrivals = adapter({fetcher:async url => { requests++; await gate.promise; return response(payload([],new URL(url).searchParams.get('BusStopCode'))); }});
  const first = arrivals('01012',env), second = arrivals('01013',env);
  const third = await arrivals('01014',env);
  assert.equal(third.error,'busy');
  assert.equal(requests,2);
  gate.resolve(); await Promise.all([first,second]);
  assert.equal((await arrivals('01014',env)).status,'empty');
  assert.equal(requests,3);
});

test('authentication failures use shared five-minute backoff and sanitize response bodies',async () => {
  for (const status of [401,403]) {
    let time = now, requests = 0;
    const arrivals = adapter({clock:() => time,fetcher:async () => { requests++; return new Response(secret,{status}); }});
    const result = await arrivals('01012',env);
    assert.equal(result.error,'authentication'); assert.equal(result.httpStatus,status);
    assert.equal(result.nextRefreshAt,new Date(now+300000).toISOString());
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.equal((await arrivals('01013',env)).error,'backoff');
    assert.equal((await arrivals('01012',env)).error,'authentication');
    assert.equal(requests,1);
    time += 300000; await arrivals('01013',env); assert.equal(requests,2);
  }
});

test('rate limits honor Retry-After seconds and dates within bounded shared backoff',async () => {
  for (const [retry,delay] of [['120',120000],['1',60000],['999999',86400000],['bad',60000],['Sat, 19 Sep 2026 00:03:00 GMT',180000]]) {
    let requests = 0;
    const arrivals = adapter({fetcher:async () => { requests++; return new Response(secret,{status:429,headers:{'retry-after':retry}}); }});
    const result = await arrivals('01012',env);
    assert.equal(result.error,'rate_limited');
    assert.equal(result.nextRefreshAt,new Date(now+delay).toISOString());
    assert.equal((await arrivals('01013',env)).error,'backoff');
    assert.equal(requests,1);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test('network and HTTP failures are sanitized, cached and isolated across stops',async () => {
  for (const [fetcher,error] of [[async () => { throw Error(secret); },'network'],[async () => new Response(secret,{status:503}),'http_error']]) {
    let requests = 0;
    const arrivals = adapter({fetcher:async (...args) => { requests++; return fetcher(...args); }});
    const result = await arrivals('01012',env);
    assert.equal(result.error,error);
    assert.ok(!JSON.stringify(result).includes(secret));
    await arrivals('01012',env); assert.equal(requests,1);
    await arrivals('01013',env); assert.equal(requests,2,'local failure does not create provider-wide authentication/rate backoff');
  }
});

test('timeout aborts a pending provider request and returns bounded unavailable fallback',async () => {
  let aborted = false;
  const arrivals = adapter({timeoutMs:5,fetcher:async (url,{signal}) => new Promise((resolve,reject) => {
    signal.addEventListener('abort',() => { aborted = true; reject(Error(secret)); },{once:true});
  })});
  const result = await arrivals('01012',env);
  assert.equal(aborted,true);
  assert.equal(result.status,'unavailable');
  assert.equal(result.error,'timeout');
  assert.equal(result.retrievedAt,null);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('malformed, oversized and mismatched-stop responses fail closed',async () => {
  const factories = [
    () => new Response('{bad json'), () => response(payload([],'01013')),
    () => response({BusStopCode:'01012',Services:null}),
    () => new Response(' ',{headers:{'content-length':'262145'}}),
    () => new Response(' '.repeat(262145)), () => new Response(null)
  ];
  for (const factory of factories) {
    const result = await adapter({fetcher:async () => factory()})('01012',env);
    assert.equal(result.status,'unavailable'); assert.equal(result.error,'malformed');
    assert.deepEqual(result.predictions,[]);
  }
});

test('empty and partially valid responses preserve their distinct status through caching',async () => {
  for (const [data,status,count] of [[payload([]),'empty',0],[payload([service({NextBus2:prediction({Monitored:2})})]),'partial',1]]) {
    let requests = 0;
    const arrivals = adapter({fetcher:async () => { requests++; return response(data); }});
    const first = await arrivals('01012',env), cached = await arrivals('01012',env);
    assert.equal(first.status,status); assert.equal(first.predictions.length,count);
    assert.equal(first.error,null); assert.equal(first.retrievedAt,new Date(now).toISOString());
    assert.deepEqual(cached,first); assert.equal(requests,1);
  }
});

test('credential changes invalidate cached data and old in-flight responses cannot overwrite the new cache',async () => {
  const gate = deferred(); let requests = 0;
  const arrivals = adapter({fetcher:async (url,{headers}) => {
    requests++;
    if (headers.AccountKey === secret) { await gate.promise; return response(); }
    return response(payload([]));
  }});
  const old = arrivals('01012',env);
  const current = await arrivals('01012',{LTA_ACCOUNT_KEY:'replacement-synthetic-key'});
  assert.equal(current.status,'empty');
  gate.resolve(); await old;
  assert.equal((await arrivals('01012',{LTA_ACCOUNT_KEY:'replacement-synthetic-key'})).status,'empty');
  assert.equal(requests,2);
  assert.equal((await arrivals('01012',{})).error,'not_configured');
});
