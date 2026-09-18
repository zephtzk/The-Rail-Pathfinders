import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createMultimodalRouter} from '../src/multimodal-engine.js';

const read = name => JSON.parse(readFileSync(`public/data/${name}.json`));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');

// Independent reference: expand each complete bus pattern into an ordinary
// directed graph, then run Dijkstra. No rail engine/frequency helper is called
// by the reference. The production search uses Pareto connection-scan closure.
// Exact tenths of a kilometre at 18km/h cost 20 seconds each; all pinned source
// distances have this precision. This avoids sharing its floating arithmetic.
function referenceGraph(bus) {
  assert.equal(bus.assumptions.rideSpeedKph,18);
  assert.equal(bus.assumptions.dwellSecondsPerStop,30);
  const edges = new Map(bus.stops.map(stop => [stop.id,[]]));
  for (const pattern of bus.patterns) {
    for (const occurrence of pattern.stops) {
      assert.ok(Math.abs(occurrence.distanceKm*10-Math.round(occurrence.distanceKm*10))<1e-9,'Reference requires pinned 0.1km precision');
    }
    for (let from=0;from<pattern.stops.length-1;from++) {
      for (let to=from+1;to<pattern.stops.length;to++) {
        const a=pattern.stops[from],b=pattern.stops[to];
        edges.get(a.stopId).push({
          to:b.stopId,wait:pattern.headways.AM_Offpeak_Freq[1]*60,
          ride:(Math.round(b.distanceKm*10)-Math.round(a.distanceKm*10))*20+(b.sequence-a.sequence)*30,
          first:a.firstLast.WD[0],last:a.firstLast.WD[1],
          alightFirst:b.firstLast.WD[0],alightLast:b.firstLast.WD[1]
        });
      }
    }
  }
  return edges;
}

function dijkstra(edges,unverifiedBays,origin,target,departureSeconds) {
  const best=new Map([[origin,departureSeconds]]),settled=new Set();
  while (true) {
    let current=null,time=Infinity;
    for (const [stop,arrival] of best) if (!settled.has(stop)&&arrival<time) {current=stop;time=arrival;}
    if (current===null) return null;
    if (current===target) return time;
    settled.add(current);
    if (current!==origin&&unverifiedBays.has(current)) continue;
    for (const edge of edges.get(current)) {
      // At roadside intermediate stops a different bus requires 60 seconds
      // to change, followed by its own published maximum-headway wait.
      const boarding=Math.max(time+(current===origin?0:60),34200,edge.first)+edge.wait;
      const arrival=boarding+edge.ride;
      if (boarding>Math.min(59400,edge.last)||arrival>Math.min(59400,edge.alightLast)||arrival<edge.alightFirst) continue;
      if (arrival<(best.get(edge.to)??Infinity)) best.set(edge.to,arrival);
    }
  }
}

test('36 actual bus-only stop pairs match an independent exact-arithmetic Dijkstra oracle',async()=>{
  const rail=read('rail-network'),bus=read('bus-network'),walking=read('walking-links'),manifest=read('bus-manifest');
  const router=createMultimodalRouter(rail,bus,walking,{busOnly:true});
  const edges=referenceGraph(bus),banned=new Set(bus.assumptions.unverifiedBayStopCodes);
  const terminalChecks=[...banned].map(code=>({code,selfTransferPresent:router.network.transfers.some(edge=>edge.fromStopId===`bus:${code}`&&edge.toStopId===`bus:${code}`)}));
  for (const item of terminalChecks) assert.equal(item.selfTransferPresent,false,`Unverified bays ${item.code} cannot gain a transfer`);
  const stopIds=bus.stops.map(stop=>stop.id),cases=[];
  const input={date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:0,preference:'fastest',maxExtraMinutes:0};
  for (let index=0;index<36;index++) {
    const origin=stopIds[(index*29+19)%stopIds.length],destination=stopIds[(index*53+117)%stopIds.length];
    assert.notEqual(origin,destination,'Fixed oracle sample must contain different endpoints');
    const query={...input,originId:`bus:${origin}`,destinationId:`bus:${destination}`};
    const expected=dijkstra(edges,banned,origin,destination,36000),result=router.route(query);
    const actual=result.recommended?.arrivalSeconds??null;
    assert.equal(actual,expected,`${origin}→${destination} (${result.status})`);
    if (actual!==null) {
      const journey=result.recommended;
      assert.equal(journey.walkingSeconds,0);
      assert.equal(journey.totalSeconds,actual-36000);
      assert.ok(journey.legs.filter(leg=>leg.type==='ride').every(leg=>leg.mode==='bus'));
      assert.ok(journey.legs.filter(leg=>leg.type==='transfer').every(leg=>!banned.has(leg.fromStopId.slice(4))));
    }
    cases.push({input:query,expectedArrivalSeconds:expected,actualArrivalSeconds:actual,status:result.status,
      route:result.recommended?{totalSeconds:result.recommended.totalSeconds,waitSeconds:result.recommended.waitSeconds,
        rideSeconds:result.recommended.rideSeconds,transferSeconds:result.recommended.transferSeconds,
        transfers:result.recommended.transfers,patterns:result.recommended.legs.filter(leg=>leg.type==='ride').map(leg=>leg.patternId)}:null});
  }
  assert.equal(cases.length,36);
  assert.ok(cases.some(item=>item.route?.transfers>0),'Reference checks actual bus transfers too');
  if (process.env.WRITE_BUS_ORACLE_EVIDENCE==='1') {
    const evidence={schemaVersion:1,kind:'offline-independent-oracle',status:'PASS',caseCount:cases.length,
      method:'Independent directed-graph Dijkstra using exact 0.1km distance costs; compared with production Pareto frequency closure. No provider requests.',
      limitations:'Validates the stated model arithmetic and earliest arrival, not real traffic, waiting guarantees, physical-device performance or field walking.',
      sourceVersion:manifest.sourceVersion,busNetworkSha256:sha('public/data/bus-network.json'),
      multimodalEngineSha256:sha('src/multimodal-engine.js'),railEngineSha256:sha('src/rail-engine.js'),
      oracleSha256:sha('tests/bus-oracle.test.mjs'),terminalChecks,cases};
    await mkdir('docs/evidence/phase3',{recursive:true});
    await writeFile('docs/evidence/phase3/bus-oracle.json',JSON.stringify(evidence,null,2)+'\n');
  }
});
