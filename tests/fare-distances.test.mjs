import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {approximateRailDistance} from '../src/fare-distances.js';
import {RAIL_DISTANCE_VERSION,RAIL_DISTANCE_EDGES,RAIL_DISTANCE_ALIASES,BUS_CATEGORY_VERSION,BUS_FARE_CATEGORIES} from '../src/fare-distance-data.js';
import {renderFareDistanceData} from '../scripts/build-fare-distances.mjs';

const date='2026-09-19',distance=(from,to,day=date)=>approximateRailDistance(from,to,day);

test('rail distance is a dated coordinate approximation, never an official fare distance',()=>{
  const result=distance('EW8','EW12');
  assert.equal(result.kind,'estimated-rail-distance');
  assert.ok(result.metres>4000&&result.metres<5000);
  assert.equal(result.metres%100,0);
  assert.match(result.method,/not official fare distance or track length/);
  assert.match(result.method,/Timetable duration is not used/);
  assert.equal(result.reviewedAt,'2026-09-18');
  assert.equal(result.validFrom,'2026-09-18');
  assert.equal(result.validThrough,'2026-12-31');
  assert.match(result.source,/datamall\.lta\.gov\.sg/);
  assert.match(result.sourceVersion,/^[a-f\d]{64}$/);
  const network=fs.readFileSync(new URL('../public/data/rail-network.json',import.meta.url));
  assert.equal(result.networkSha256,crypto.createHash('sha256').update(network).digest('hex'));
});

test('station codes, source platform IDs and paid-area interchange names agree',()=>{
  const expected=distance('EW8','EW12').metres;
  for(const [from,to] of [['EW8_A','EW12_B'],['CC9','DT14'],['Paya Lebar','Bugis'],['paya-lebar MRT','Bugis MRT Station']])assert.equal(distance(from,to).metres,expected);
  assert.equal(distance('EW12','EW8').metres,expected);
  assert.equal(distance('EW8','CC9'),null,'A change inside the same paid area is not a ride');
  assert.equal(distance('EW8_A','EW8_B'),null);
});

test('shortest continuous graph paths do not create tap-out interchange shortcuts',()=>{
  for(const [from,to,min] of [['NS21','DT11',4000],['EW2','DT32',8000],['BP6','DT1',20000]]){
    assert.equal(RAIL_DISTANCE_EDGES.some(([a,b])=>a===from&&b===to||a===to&&b===from),false);
    assert.ok(distance(from,to).metres>min,'Separate line codes can connect only through the longer continuous rail network');
  }
  for(const name of ['Newton','Tampines','Bukit Panjang']){
    assert.equal(Object.hasOwn(RAIL_DISTANCE_ALIASES,name.toLowerCase().replaceAll(' ','')),false);
    assert.equal(distance(name,'Bugis'),null,'Ambiguous paid-area name needs an explicit line code');
  }
  assert.ok(RAIL_DISTANCE_EDGES.some(([a,b,m])=>a==='CC9'&&b==='EW8'&&m===0));
  assert.ok(distance('BP1','BP10').metres>4000,'LRT uses consecutive stops around the loop, not endpoint crow-flight distance');
});

test('missing stations, malformed inputs and dates outside reviewed graph coverage remain unavailable',()=>{
  for(const id of ['does-not-exist','bus:01012','EW8_C','__proto__',null,42,{}])assert.equal(distance(id,'Bugis'),null);
  for(const day of ['2026-09-17','2027-01-01','2026-02-30','2026-9-19',null,undefined])assert.equal(approximateRailDistance('EW8','EW12',day),null);
  assert.ok(distance('EW8','EW12','2026-09-18'));
  assert.ok(distance('EW8','EW12','2026-12-31'));
});

test('shortest geometry is independent of platform choice and never counted per train line',()=>{
  const fromInterchange=distance('CC9_A','NE1_A'),fromEquivalent=distance('EW8_B','CC29_B');
  assert.equal(fromInterchange.metres,fromEquivalent.metres);
  assert.ok(fromInterchange.metres>0);
  const ns=distance('NS1','NS4'),equivalent=distance('EW24','BP1');
  assert.equal(ns.metres,equivalent.metres);
  assert.equal(RAIL_DISTANCE_VERSION.method.includes('shortest'),true);
});

test('bus fare categories retain exact official pattern identity and snapshot validity',()=>{
  assert.equal(BUS_FARE_CATEGORIES['2:GAS:1'],'TRUNK');
  assert.equal(BUS_FARE_CATEGORIES['222:SBST:1'],'FEEDER');
  assert.equal(BUS_FARE_CATEGORIES['10e:GAS:1'],'EXPRESS');
  assert.equal(BUS_FARE_CATEGORIES['646:GAS:1'],'CITY_LINK');
  assert.equal(BUS_FARE_CATEGORIES['2:UNKNOWN:1'],undefined);
  assert.equal(BUS_CATEGORY_VERSION.validFrom,'2026-09-18');
  assert.equal(BUS_CATEGORY_VERSION.validThrough,'2026-10-02');
  assert.match(BUS_CATEGORY_VERSION.sourceVersion,/^[a-f\d]{64}$/);
  assert.equal(BUS_CATEGORY_VERSION.servicePageSha256s.length,3);
  const bus=JSON.parse(fs.readFileSync(new URL('../public/data/bus-network.json',import.meta.url)));
  assert.equal(BUS_CATEGORY_VERSION.sourceVersion,bus.sourceVersion);
  assert.deepEqual(Object.keys(BUS_FARE_CATEGORIES).sort(),bus.patterns.map(p=>p.id).sort());
});

test('generated graph and bus categories reproduce from hash-checked source snapshots',()=>{
  const actual=fs.readFileSync(new URL('../src/fare-distance-data.js',import.meta.url),'utf8');
  assert.equal(actual,renderFareDistanceData());
});
