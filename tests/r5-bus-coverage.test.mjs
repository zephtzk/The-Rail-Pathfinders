import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBusTiming,createMultimodalRouter} from '../src/multimodal-engine.js';
import {indexBusPatterns,normalizeBusArrivals} from '../server/bus-adapter.js';
const read=name=>JSON.parse(readFileSync(`public/data/${name}.json`));
const bus=read('bus-network'),rail=read('rail-network'),walking=read('walking-links');
const base={date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:0,preference:'fastest',maxExtraMinutes:0};
const sec=time=>{const[h,m]=time.split(':').map(Number);return h*3600+m*60;};
function fixture(){
  const span={WD:[sec('05:30'),sec('24:30')],SAT:[sec('07:00'),sec('22:00')],SUN:null};
  return {...bus,patterns:[{id:'7A:TEST:1',serviceNo:'7A',operator:'TEST',direction:1,originCode:'01001',destinationCode:'01002',headways:{AM_Peak_Freq:[4,6],AM_Offpeak_Freq:[7,10],PM_Peak_Freq:[3,5],PM_Offpeak_Freq:[8,12]},stops:[{stopId:'01001',sequence:1,visitNumber:1,distanceKm:0,firstLast:structuredClone(span)},{stopId:'01002',sequence:2,visitNumber:1,distanceKm:1,firstLast:structuredClone(span)}]}],stops:[{id:'01001',name:'Alpha'},{id:'01002',name:'Beta'}],assumptions:{...bus.assumptions,unverifiedBayStopCodes:['01001','01002']}};
}

test('R5 every source pattern is accounted for and unsupported services stay out',()=>{
  const manifest=read('bus-manifest'),audit=manifest.audit;
  assert.equal(audit.reviewedPatterns.length,801);
  assert.equal(bus.stops.length,4840);assert.equal(bus.patterns.length,416);
  assert.equal(bus.availability.routablePatternCount,391);
  assert.ok(bus.patterns.some(p=>/[A-Z]$/.test(p.serviceNo)),'suffixes stay separate');
  assert.ok(!bus.patterns.some(p=>p.serviceNo==='684'),'fixed City Direct trips have no fabricated frequency');
  assert.ok(!bus.patterns.some(p=>p.id==='857:TTS:1'),'decreasing-distance source is held for review');
  for(const p of bus.patterns){
    assert.deepEqual(p.stops.map(s=>s.sequence),Array.from({length:p.stops.length},(_,i)=>i+1));
    assert.equal(p.stops[0].stopId,p.originCode);assert.equal(p.stops.at(-1).stopId,p.destinationCode);
    assert.ok(audit.reviewedPatterns.some(r=>r.id===p.id&&r.status==='included'));
  }
});
test('R5 limited origin-day spans are withheld with exact recorded exceptions',()=>{
  const manifest=read('bus-manifest'),p=bus.patterns.find(p=>p.id==='107M:SBST:1');
  assert.equal(manifest.audit.limitedSpanDayExceptions.length,37);
  assert.equal(manifest.audit.fullyTimingExcludedPatternIds.length,25);
  assert.ok(p.dayTimingExclusions.WD);assert.ok(p.supportedDayTypes.includes('SUN'));
  assert.equal(bus.patterns.find(p=>p.id==='55B:SBST:1').timingSupported,false);
  assert.equal(bus.patterns.find(p=>p.id==='189A:TTS:1').timingSupported,false);
  const timing=createBusTiming(bus);
  const wd=timing.boarding(p,0,sec('20:00'),'2026-09-21');
  assert.equal(wd,null,'weekday short span never borrows the published Sunday-like generic headway');
  assert.equal(timing.boarding(p,0,sec('20:00'),'2026-09-20')?.dayType,'SUN');
});
test('R5 weekday, Saturday and Sunday spans do not borrow an operating day',()=>{
  const data=fixture(),timing=createBusTiming(data),p=data.patterns[0];
  assert.equal(timing.boarding(p,0,sec('10:00'),'2026-09-18').dayType,'WD');
  assert.equal(timing.boarding(p,0,sec('10:00'),'2026-09-19').dayType,'SAT');
  const sunday=timing.boarding(p,0,sec('10:00'),'2026-09-20');
  assert.equal(sunday?.serviceDate,'2026-09-21','next day is identified explicitly, not Sunday service');
  const emptyRail={...rail,trips:[]};
  const r=createMultimodalRouter(emptyRail,data,{links:[]},{busOnly:true}).route({...base,date:'2026-09-20',originId:'bus:01001',destinationId:'bus:01002'});
  assert.equal(r.status,'no-service');
});
test('R5 previous service date controls both boarding and alighting after midnight',()=>{
  const data=fixture(),timing=createBusTiming(data),p=data.patterns[0];
  const boarding=timing.boarding(p,0,sec('00:05'),'2026-09-19');
  assert.equal(boarding.serviceDate,'2026-09-18');assert.equal(boarding.dayType,'WD');
  assert.equal(boarding.seconds,sec('00:17'));assert.equal(boarding.offsetSeconds,-86400);
  assert.ok(timing.canAlight(p,1,sec('00:21'),'2026-09-19',boarding));
  assert.equal(timing.canAlight(p,1,sec('00:31'),'2026-09-19',boarding),false);
  const result=createMultimodalRouter(rail,data,{links:[]},{busOnly:true}).route({...base,date:'2026-09-19',departureTime:'00:05',originId:'bus:01001',destinationId:'bus:01002'});
  assert.equal(result.status,'ok');assert.equal(result.recommended.legs.find(l=>l.type==='ride').serviceDate,'2026-09-18');
});
test('R5 actual published period boundaries choose only the applicable band',()=>{
  const data=fixture(),timing=createBusTiming(data),p=data.patterns[0];
  for(const [time,field,expected]of[['07:00','AM_Peak_Freq','07:06'],['08:31','AM_Offpeak_Freq','08:41'],['17:00','PM_Peak_Freq','17:05'],['19:01','PM_Offpeak_Freq','19:13']]){
    const b=timing.boarding(p,0,sec(time),'2026-09-18');assert.equal(b.headwayField,field);assert.equal(b.seconds,sec(expected));
  }
  p.headways.PM_Peak_Freq=null;
  const missing=timing.boarding(p,0,sec('17:00'),'2026-09-18');
  assert.equal(missing.headwayField,'PM_Offpeak_Freq');assert.equal(missing.seconds,sec('19:13'),'missing peak headway does not acquire continuous service');
});
test('R5 early first arrival is usable without inventing a pre-06:30 headway',()=>{
  const data=fixture(),timing=createBusTiming(data),p=data.patterns[0];
  const first=timing.boarding(p,0,sec('05:20'),'2026-09-18');
  assert.equal(first.seconds,sec('05:30'));assert.equal(first.basis,'published-first-arrival');
  const after=timing.boarding(p,0,sec('05:31'),'2026-09-18');
  assert.equal(after.seconds,sec('06:36'));assert.equal(after.headwayField,'AM_Peak_Freq');
});
test('R5 optional boarding outputs are reused without changing ordinary returned results',()=>{
  const data=fixture(),timing=createBusTiming(data),p=data.patterns[0];
  const first=Object.freeze(timing.boarding(p,0,sec('05:20'),'2026-09-18'));
  const firstSnapshot={...first},same=timing.boarding(p,0,sec('05:20'),'2026-09-18');
  assert.notEqual(same,first);assert.deepEqual(same,first);
  const output={};
  assert.equal(timing.boarding(p,0,sec('17:00'),'2026-09-18',null,0,output),output);
  assert.deepEqual(output,timing.boarding(p,0,sec('17:00'),'2026-09-18'));
  assert.equal(timing.boarding(p,0,sec('05:20'),'2026-09-18',null,0,output),output);
  assert.deepEqual(output,firstSnapshot,'all reused fields, including headway null, are overwritten');
  assert.deepEqual(first,firstSnapshot,'ordinary callers retain immutable previous values');
  assert.equal(timing.boarding(p,0,0,'invalid',null,0,output),null);
  assert.equal(timing.boarding(p,0,sec('10:00'),'2026-10-10',null,0,output),null);
  assert.deepEqual(output,firstSnapshot,'failed lookup leaves caller scratch state untouched');
});
test('R5 retry output remains independent from base boarding and legacy numbers stay numbers',()=>{
  const data=fixture(),p=data.patterns[0];p.stops[1].firstLast.WD[0]=sec('05:35');
  const frequency=createMultimodalRouter(rail,data,{links:[]},{busOnly:true}).network.frequency;
  const baseOutput={},retryOutput={},pattern=frequency.patterns[0];
  assert.equal(frequency.boarding(pattern,0,sec('05:20'),'2026-09-18',null,0,baseOutput),baseOutput);
  const original={...baseOutput};
  assert.equal(frequency.boardingForAlight(pattern,0,1,sec('05:20'),'2026-09-18',230,retryOutput),retryOutput);
  assert.notEqual(retryOutput,baseOutput);assert.deepEqual(baseOutput,original);
  assert.equal(baseOutput.seconds,sec('05:30'));assert.equal(retryOutput.seconds,sec('06:36'));
  const legacy={...data,coverage:{...data.coverage,calendarMode:'legacy'}},timing=createBusTiming(legacy),untouched={sentinel:true};
  const expected=timing.boarding(p,0,sec('10:00'),'2026-09-18');
  assert.equal(typeof expected,'number');
  assert.equal(timing.boarding(p,0,sec('10:00'),'2026-09-18',null,0,untouched),expected);
  assert.deepEqual(untouched,{sentinel:true});
});
test('R5 holiday mapping fails closed and final service day can carry over',()=>{
  const data=fixture();data.coverage={...data.coverage,holidays:['2026-09-21'],validThrough:'2026-09-21'};
  let timing=createBusTiming(data);assert.equal(timing.dayType('2026-09-21'),null);
  data.coverage.holidayDayType='SUN';timing=createBusTiming(data);assert.equal(timing.dayType('2026-09-21'),'SUN');
  data.coverage.validThrough='2026-09-18';timing=createBusTiming(data);
  assert.equal(timing.boarding(data.patterns[0],0,sec('00:05'),'2026-09-19').serviceDate,'2026-09-18');
  assert.equal(timing.boarding(data.patterns[0],0,sec('10:00'),'2026-09-19'),null);
});
test('R5 late-start service downstream midnight clocks are normalized without shifting early partial trips',()=>{
  const data=fixture(),p=data.patterns[0];p.stops[0].firstLast.WD=[sec('23:00'),sec('25:00')];p.stops[1].firstLast.WD=[sec('00:05'),sec('01:10')];
  const timing=createBusTiming(data),b=timing.boarding(p,0,sec('23:50'),'2026-09-18');
  assert.ok(timing.canAlight(p,1,sec('24:10'),'2026-09-18',b));
  assert.equal(timing.canAlight(p,1,sec('23:59'),'2026-09-18',b),false);
});
test('R5 expanded stops and every potential terminal retain transfer evidence gates',()=>{
  const router=createMultimodalRouter(rail,bus,walking,{busOnly:true});
  const selfTransfers=new Set(router.network.transfers.filter(t=>t.fromStopId===t.toStopId).map(t=>t.fromStopId));
  for(const p of bus.patterns)for(const code of [p.originCode,p.destinationCode])assert.ok(!selfTransfers.has(`bus:${code}`));
  assert.ok(!selfTransfers.has('bus:95129'),'excluded-source endpoints remain potential terminal bays for included through services');
  const airport=router.route({...base,date:'2026-09-21',originId:'bus:95129',destinationId:'bus:64009',progressSeed:{stopId:'bus:95129',canBoard:false,externalSinceRide:false,hasBoarded:true}});
  assert.notEqual(airport.status,'ok','confirmed alighting cannot infer a boarding-bay transfer at Changi Airport T2');
  assert.equal(router.network.transfers.filter(t=>t.external).length,walking.links.filter(l=>l.enabled).reduce((n,l)=>n+l.railPlatformIds.length*2,0));
  const input={...base,originId:'bus:99009',destinationId:'bus:28009'};
  assert.equal(router.route(input).status,'ok');
  const stopped=router.route({...input,maxSearchWork:10});assert.equal(stopped.status,'search-limit');assert.deepEqual(stopped.routes,[]);assert.equal(stopped.recommended,null);
  const cancelled=router.route({...input,signal:AbortSignal.abort()});assert.equal(cancelled.status,'cancelled');assert.deepEqual(cancelled.routes,[]);
});
test('R5 broad arrival index preserves exact suffix and ambiguous occurrence matches',()=>{
  const patterns=[fixture().patterns[0]],index=indexBusPatterns(patterns);
  const vehicle={OriginCode:'01001',DestinationCode:'01002',VisitNumber:'1',EstimatedArrival:'2026-09-19T10:10:00+08:00',Monitored:1};
  const payload={BusStopCode:'01001',Services:[{ServiceNo:'7A',Operator:'TEST',NextBus:vehicle,NextBus2:{EstimatedArrival:''},NextBus3:{EstimatedArrival:''}}]};
  assert.equal(normalizeBusArrivals(payload,'01001',index).predictions[0].matchStatus,'matched');
  payload.Services[0].ServiceNo='7';assert.equal(normalizeBusArrivals(payload,'01001',index).predictions[0].matchStatus,'unmatched');
});
test('R5 arriving before a first-bus bound can wait for a later published period',()=>{
  const single={...bus,patterns:bus.patterns.filter(p=>p.id==='10:GAS:1')};
  const router=createMultimodalRouter(rail,single,{links:[]},{busOnly:true});
  const input={...base,date:'2026-09-21',originId:'bus:96109',destinationId:'bus:85079',departureTime:'05:05'};
  const early=router.route(input),later=router.route({...input,departureTime:'06:30'});
  assert.equal(early.status,'ok');assert.equal(later.status,'ok');
  assert.equal(early.recommended.arrivalSeconds,24150);
  assert.ok(early.recommended.arrivalSeconds<=later.recommended.arrivalSeconds,'an earlier caller can wait for every later supported option');
  const ride=early.recommended.legs.find(l=>l.type==='ride');
  assert.equal(ride.headwayField,'AM_Peak_Freq');assert.equal(ride.startSeconds,24000);
  assert.equal(early.recommended.totalSeconds,early.recommended.legs.reduce((sum,l)=>sum+l.durationSeconds,0));
});
test('R5 period estimates may wait for a later downstream first-arrival floor without inventing an early band',()=>{
  const data=fixture(),p=data.patterns[0];p.stops[1].firstLast.WD=[sec('08:00'),sec('23:00')];
  const router=createMultimodalRouter(rail,data,{links:[]},{busOnly:true});
  const input={...base,originId:'bus:01001',destinationId:'bus:01002',departureTime:'07:00'};
  const result=router.route(input);assert.equal(result.status,'ok');assert.equal(result.recommended.arrivalSeconds,sec('08:00'));
  assert.equal(result.recommended.legs.find(l=>l.type==='ride').headwayField,'AM_Peak_Freq');
});
