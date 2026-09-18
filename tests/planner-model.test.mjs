import test from 'node:test';
import assert from 'node:assert/strict';
import {timeInput,endpointCatalog,suggestEndpoints,resolveEndpoint} from '../src/planner-model.js';
test('Leave now uses actual Singapore civil date across midnight and ignores stale defaults',()=>{
 assert.deepEqual(timeInput({timeMode:'leave-now',date:'2025-01-01',departureTime:'08:00'},Date.parse('2026-09-18T16:01:00Z')),{timeMode:'leave-now',date:'2026-09-19',departureTime:'00:01'});
});
test('deadline carries explicit civil date and rejects invalid dates/time',()=>{
 const x={timeMode:'arrive-by',date:'2026-09-19',departureTime:'23:45',deadlineDate:'2026-09-20',deadlineTime:'00:20'};
 assert.deepEqual(timeInput(x),x);assert.throws(()=>timeInput({...x,deadlineDate:'2026-02-30'}));assert.throws(()=>timeInput({...x,departureTime:'24:00'}));
});
test('suggestions preserve routing IDs, codes, direction, and unresolved saved places',()=>{
 const network={stations:[{id:'EW12',name:'Bugis',lat:1.3,lon:103.8},{id:'bus:01012',name:'Hotel',lat:1.3,lon:103.8}]};
 const catalog=endpointCatalog(network,{patterns:[{serviceNo:'2',direction:1,stops:[{stopId:'01012'}]}]},{places:[{id:'local-1',routingId:'EW12',label:'Work'},{id:'local-2',label:'Unknown address'}]});
 assert.equal(suggestEndpoints(catalog,'EW12').length,2);assert.match(suggestEndpoints(catalog,'01012')[0].detail,/2 direction 1/);assert.equal(resolveEndpoint(catalog,'local-1',network).routingId,'EW12');assert.throws(()=>resolveEndpoint(catalog,'local-2',network));assert.throws(()=>resolveEndpoint(catalog,'untyped address',network));
});
