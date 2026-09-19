import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {estimatePlanFare,estimateFare,busFareLeg,fareForDistance} from '../src/fares.js';
import {BUS_FARE_CATEGORIES} from '../src/fare-distance-data.js';
import {createLedger,recordAmount} from '../src/fare-ledger.js';
import {fareEstimateHTML} from '../src/fare-ui.js';
const busNetwork=JSON.parse(fs.readFileSync(new URL('../public/data/bus-network.json',import.meta.url)));
const date='2026-09-19';
const rail=(from='NS1_A',to='NS16_A',start=36000)=>({type:'ride',mode:'rail',fromStopId:from,toStopId:to,startSeconds:start,endSeconds:start+1200});
function bus(patternId='2:GAS:1',from=0,to=1,start=38000){
  const p=busNetwork.patterns.find(p=>p.id===patternId),a=p.stops[from],b=p.stops[to];
  return {type:'ride',mode:'bus',serviceNo:p.serviceNo,patternId,fromSequence:a.sequence,toSequence:b.sequence,fromStopId:'bus:'+a.stopId,toStopId:'bus:'+b.stopId,startSeconds:start,endSeconds:start+180};
}
const price=legs=>estimatePlanFare({departureDate:date,route:{legs}},{busNetwork});

test('island-wide rail and reverse pairs get explicitly approximate cost without using travel time',()=>{
  const a=price([rail()]),b=price([{...rail(),endSeconds:42000}]),reverse=price([rail('EW12_B','EW8_B')]);
  assert.equal(a.status,'estimate');assert.equal(a.estimateKind,'approximate-distance');assert.equal(a.totalCents,b.totalCents);
  assert.ok(a.breakdown[0].estimatedDistanceMetres>0);assert.equal(a.breakdown[0].officialDistanceMetres,undefined);
  assert.equal(reverse.status,'estimate');assert.match(a.assumptions,/Distance is approximate/);
  const html=fareEstimateHTML(a);assert.match(html,/Approximate distance/);assert.match(html,/2025-12-27/);assert.match(html,/2026-09-19/);assert.doesNotMatch(html,/ · official fare distance/);
});
test('different paid-area rail routes share the same OD estimate and one fare',()=>{
  const direct=price([rail('NS1_A','NE1_A')]);
  const alternative=price([rail('NS1_A','NS24_A'),{type:'transfer',durationSeconds:240},rail('NE6_A','NE1_A',37500)]);
  assert.equal(alternative.totalCents,direct.totalCents);assert.equal(alternative.breakdown.length,1);assert.equal(alternative.breakdown[0].legCount,1);
});
test('expanded bus coverage uses exact official occurrences, feeder cap and explicit unsupported classes',()=>{
  const p=busNetwork.patterns.find(p=>p.id==='10:GAS:1');
  assert.equal(price([bus(p.id)]).totalCents,128);
  const feeder=bus('222:SBST:1',0,busNetwork.patterns.find(p=>p.id==='222:SBST:1').stops.length-1);
  const leg=busFareLeg(feeder,busNetwork);assert.equal(leg.serviceCategory,'FEEDER');assert.equal(leg.distance.metres,3200);assert.ok(leg.distance.routeMetres>3200);
  for(const category of ['EXPRESS','CITY_LINK']){
    const p=busNetwork.patterns.find(p=>BUS_FARE_CATEGORIES[p.id]===category);
    assert.equal(price([bus(p.id)]).status,'unavailable');
  }
  const broken=structuredClone(busNetwork),pattern=broken.patterns.find(p=>p.id==='2:GAS:1');pattern.stops[1].distanceSegment=999;
  assert.equal(busFareLeg(bus(),broken),null,'Distance-reset boundaries must not be subtracted');
});
test('bus and rail combined distance is priced once, including reverse order',()=>{
  const railLeg=rail('EW8_A','EW12_A'),busLeg=bus();
  const together=price([railLeg,busLeg]);
  assert.equal(together.totalCents,fareForDistance(5000).totalCents);assert.equal(together.breakdown.length,1);assert.equal(together.breakdown[0].legCount,2);
  assert.ok(together.totalCents<price([railLeg]).totalCents+price([busLeg]).totalCents);
  const reverse=price([bus('2:GAS:1',0,1,34000),railLeg]);assert.equal(reverse.totalCents,together.totalCents);
});
test('repeated buses start a fresh fare even across intervening rail or another bus',()=>{
  const first=bus('2:GAS:1',0,1,34000),last=bus('2:GAS:1',0,1,38000);
  for(const middle of [rail('EW8_A','EW12_A'),bus(busNetwork.patterns.find(p=>p.serviceNo==='23').id,0,1,36000)]){
    const f=price([first,middle,last]);assert.equal(f.breakdown.length,2);assert.match(f.breakdown[1].reason,/Repeating/);
  }
});
test('expired category snapshots, overlapping times, invalid input and protected reroutes remain manual',()=>{
  assert.equal(estimatePlanFare({departureDate:'2026-10-03',route:{legs:[bus()]}},{busNetwork}).status,'unavailable');
  assert.equal(price([rail(),bus('2:GAS:1',0,1,36500)]).status,'unavailable');
  assert.equal(estimateFare({date,legs:null}).status,'unavailable');
  const f=estimatePlanFare({departureDate:date,route:{legs:[rail()],fareEstimate:{status:'unavailable',reason:'Earlier paid travel needs reassessment.'}}});
  assert.equal(f.status,'unavailable');assert.match(f.reason,/Earlier paid/);
});
test('OneMap provider distances yield labelled mixed estimates and retain retrieval provenance',()=>{
  const route={provider:'onemap',providerRetrievedAt:123,steps:[
    {type:'ride',source:{mode:'bus',serviceNo:'23',fromLabel:'Example A',toLabel:'Example B',startSeconds:36000,endSeconds:36600,distanceMetres:2100}},
    {type:'walk',source:{startSeconds:36600,endSeconds:36700,distanceMetres:200}},
    {type:'ride',source:{mode:'rail',fromLabel:'Example rail A',toLabel:'Example rail B',startSeconds:36800,endSeconds:37400,distanceMetres:2900}}
  ]};
  const f=estimatePlanFare({departureDate:date,route});assert.equal(f.totalCents,149);assert.equal(f.estimateKind,'approximate-distance');assert.equal(f.providerRetrievedAt,123);assert.equal(f.breakdown[0].estimatedDistanceMetres,5000);
  route.steps[0].source.serviceNo='private-shuttle';assert.equal(estimatePlanFare({departureDate:date,route}).status,'unavailable');
});
test('completion stores cost once and actual correction replaces it without dropping source or including demo',()=>{
  const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},ledger=createLedger(storage);
  const journey={id:'fr2-cost',status:'completed',completedAt:'2026-09-19T10:00:00+08:00',plan:{mode:'real',departureDate:date,origin:{label:'Jurong East'},destination:{label:'Ang Mo Kio'}},route:{legs:[rail()]}};
  const record=ledger.complete(journey).record;assert.ok(record.estimatedCents>0);assert.equal(record.actualCents,null);assert.equal(record.fareEstimate.reviewedAt,date);
  ledger.confirm(record.id,155);ledger.adjust(record.id,{cents:-10,note:'Fare correction'});
  assert.equal(ledger.complete(journey).recorded,false);assert.equal(recordAmount(ledger.read().state.records[0]),145);assert.ok(ledger.read().state.records[0].fareEstimate.distanceSources[0].sourceVersion);
  const replay={...journey,id:'demo',plan:{...journey.plan,mode:'replay'}};
  assert.equal(ledger.complete(replay).recorded,false);createLedger(storage,{demo:true}).complete(replay);
  assert.equal(ledger.totals(journey.completedAt).dayTotals.totalCents,145);
});
