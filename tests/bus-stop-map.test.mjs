import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleBusStops} from '../src/bus-stop-map.js';
test('map keeps nearby stops bounded and includes directory-only stops without route inference',()=>{
  const stops=[{id:'00001',lat:1.3,lon:103.8},{id:'00002',lat:1.31,lon:103.81},{id:'00003',lat:2,lon:104},{id:'00004',lat:null,lon:103.8}];
  const bounds={south:1.2,north:1.4,west:103.7,east:103.9},center={lat:1.3,lng:103.8};
  assert.deepEqual(visibleBusStops(stops,bounds,center,1),{stops:[stops[0]],total:2});
  assert.equal(visibleBusStops(stops,bounds,center).stops.length,2);
  assert.deepEqual(stops.map(s=>s.id),['00001','00002','00003','00004']);
});
