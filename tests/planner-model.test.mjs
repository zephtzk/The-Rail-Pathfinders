import test from 'node:test';
import assert from 'node:assert/strict';
import {timeInput,endpointCatalog,suggestEndpoints,resolveEndpoint,busDirectionLabel,busStopDetails,plannerFeedback} from '../src/planner-model.js';
test('Leave now uses actual Singapore civil date across midnight and ignores stale defaults',()=>{
 assert.deepEqual(timeInput({timeMode:'leave-now',date:'2025-01-01',departureTime:'08:00'},Date.parse('2026-09-18T16:01:00Z')),{timeMode:'leave-now',date:'2026-09-19',departureTime:'00:01'});
});
test('deadline carries explicit civil date and rejects invalid dates/time',()=>{
 const x={timeMode:'arrive-by',date:'2026-09-19',departureTime:'23:45',deadlineDate:'2026-09-20',deadlineTime:'00:20'};
 assert.deepEqual(timeInput(x),x);assert.throws(()=>timeInput({...x,deadlineDate:'2026-02-30'}));assert.throws(()=>timeInput({...x,departureTime:'24:00'}));assert.throws(()=>timeInput({...x,date:'2026-99-99'}),/Choose a valid departure/);
});
test('suggestions preserve routing IDs, codes, direction, and unresolved saved places',()=>{
 const network={stations:[{id:'EW12',name:'Bugis',lat:1.3,lon:103.8},{id:'bus:01012',name:'Hotel',lat:1.3,lon:103.8}]};
 const catalog=endpointCatalog(network,{patterns:[{serviceNo:'2',direction:1,stops:[{stopId:'01012'}]}]},{places:[{id:'local-1',routingId:'EW12',label:'Work'},{id:'local-2',label:'Unknown address'}]});
 assert.equal(suggestEndpoints(catalog,'EW12').length,2);assert.equal(suggestEndpoints(catalog,'01012')[0].detail,'2');assert.equal(resolveEndpoint(catalog,'local-1',network).routingId,'EW12');assert.throws(()=>resolveEndpoint(catalog,'local-2',network));assert.throws(()=>resolveEndpoint(catalog,'untyped address',network));
});


test('public station metadata deduplicates platform suffixes and preserves interchange codes',()=>{
 const network={stations:[{id:'BP1',name:'Choa Chu Kang',stopIds:['BP1_A','BP1_B']},{id:'EW21',name:'Buona Vista',stopIds:['EW21_A','EW21_B','CC22_A','CC22_B']}]};
 const catalog=endpointCatalog(network,{patterns:[]});
 assert.equal(catalog[0].detail,'BP1 · Rail station');assert.deepEqual(catalog[0].codes,['BP1']);
 assert.equal(catalog[1].detail,'EW21 / CC22 · Rail station');assert.equal(catalog[1].routingId,'EW21');
});
test('bus directions use metadata terminals and accurately describe a same-terminal loop',()=>{
 const stops=[{id:'75009',name:'Tampines Int'},{id:'52009',name:'Toa Payoh Int'}];
 assert.equal(busDirectionLabel({serviceNo:'28',originCode:'75009',destinationCode:'52009'},stops),'Bus 28 · Tampines Int → Toa Payoh Int');
 assert.equal(busDirectionLabel({serviceNo:'28',originCode:'52009',destinationCode:'75009'},stops),'Bus 28 · Toa Payoh Int → Tampines Int');
 assert.equal(busDirectionLabel({serviceNo:'23',originCode:'75009',destinationCode:'75009',loop:true,loopDescription:'Rochor Canal Rd'},stops),'Bus 23 · loop from Tampines Int via Rochor Canal Rd');
});
test('a partial pilot segment cannot supply invented full-service terminals',()=>{
 const stops=[{id:'01012',name:'Midroute A'},{id:'01013',name:'Midroute B'}];
 const pattern={serviceNo:'7',originCode:'00001',destinationCode:'00099',stops:[{stopId:'01012'},{stopId:'01013'}]};
 assert.equal(busDirectionLabel(pattern,stops),'Bus 7 · terminal names unavailable');
 const catalog=endpointCatalog({stations:[{id:'bus:01012',name:'01012 · Midroute A',roadName:'First Road'}]},{stops,patterns:[pattern]});
 assert.equal(catalog[0].detail,'7');assert.equal(catalog[0].routingId,'bus:01012');
 assert.match(catalog[0].searchText,/terminal names unavailable/);assert.equal(suggestEndpoints(catalog,'First Road')[0].id,'bus:01012');
 const selected=busStopDetails({stops,patterns:[pattern]},'bus:01013');
 assert.equal(selected.services[0].directionLabel,'Bus 7 · terminal names unavailable');
 assert.equal(selected.services[0].visits[0].terminatesHere,false);
});
test('bus suggestions show only sorted unique service numbers while road and terminal metadata stay searchable',()=>{
 const stops=[{id:'01012',name:'Hotel',roadName:'Victoria St'},{id:'75009',name:'Tampines Int'},{id:'16009',name:'Kent Ridge Ter'}];
 const patterns=['10e','10','2','10','100'].map((serviceNo,index)=>({id:`${serviceNo}:${index}`,serviceNo,direction:index===3?2:1,originCode:'75009',destinationCode:'16009',timingSupported:index!==4,stops:[{stopId:'01012'}]}));
 const catalog=endpointCatalog({stations:[{id:'bus:01012',name:'01012 · Hotel',roadName:'Victoria St'}]},{stops,patterns});
 assert.equal(catalog[0].kind,'bus');assert.equal(catalog[0].stopCode,'01012');assert.equal(catalog[0].roadName,'Victoria St');
 assert.equal(catalog[0].detail,'2, 10, 10e, 100');
 assert.equal(suggestEndpoints(catalog,'Kent Ridge')[0].id,'bus:01012');assert.equal(suggestEndpoints(catalog,'Victoria')[0].id,'bus:01012');
 assert.equal(suggestEndpoints(catalog,'100')[0].id,'bus:01012');
});
test('selected bus details retain opposite directions, loop visits and unsupported timing as static metadata',()=>{
 const stops=[{id:'75009',name:'Tampines Int',roadName:'Tampines Central'},{id:'52009',name:'Toa Payoh Int'},{id:'01012',name:'Hotel'}];
 const patterns=[
  {id:'28:SBST:2',serviceNo:'28',direction:2,operator:'SBST',originCode:'52009',destinationCode:'75009',stops:[{stopId:'52009',sequence:1},{stopId:'75009',sequence:60,visitNumber:1}]},
  {id:'28:SBST:1',serviceNo:'28',direction:1,operator:'SBST',originCode:'75009',destinationCode:'52009',stops:[{stopId:'75009',sequence:1,visitNumber:1},{stopId:'52009',sequence:60}]},
  {id:'23:SBST:1',serviceNo:'23',direction:1,operator:'SBST',originCode:'75009',destinationCode:'75009',loop:true,loopDescription:'Rochor Canal Rd',stops:[{stopId:'75009',sequence:1,visitNumber:1},{stopId:'01012',sequence:22,visitNumber:1},{stopId:'75009',sequence:44,visitNumber:2}]},
  {id:'2A:SBST:1',serviceNo:'2A',direction:1,operator:'SBST',originCode:'75009',destinationCode:'01012',timingSupported:false,stops:[{stopId:'75009',sequence:1},{stopId:'01012',sequence:2}]},
 ];
 const bus={stops,patterns},before=JSON.stringify(bus),details=busStopDetails(bus,'bus:75009');
 assert.deepEqual({stopCode:details.stopCode,name:details.name,roadName:details.roadName},{stopCode:'75009',name:'Tampines Int',roadName:'Tampines Central'});
 assert.deepEqual(details.services.map(s=>[s.serviceNo,s.direction]),[['2A',1],['23',1],['28',1],['28',2]]);
 assert.equal(details.services[0].timingSupported,false);
 const loop=details.services[1];assert.equal(loop.loop,true);assert.match(loop.directionLabel,/loop from Tampines Int via Rochor Canal Rd/);
 assert.deepEqual(loop.visits,[{sequence:1,visitNumber:1,terminatesHere:false},{sequence:44,visitNumber:2,terminatesHere:true}]);
 assert.equal(details.services[2].directionLabel,'Bus 28 · Tampines Int → Toa Payoh Int');assert.equal(details.services[2].visits[0].terminatesHere,false);
 assert.equal(details.services[3].directionLabel,'Bus 28 · Toa Payoh Int → Tampines Int');assert.equal(details.services[3].visits[0].terminatesHere,true);
 assert.equal(details.services[3].operator,'SBST');assert.equal(details.services[3].destinationName,'Tampines Int');
 assert.equal(busStopDetails(bus,'EW12'),null);assert.equal(busStopDetails(bus,'bus:99999'),null);assert.equal(JSON.stringify(bus),before);
});
test('planner separates supported walking and deadline constraints from unknown search causes',()=>{
 const walking=plannerFeedback({status:'no-feasible',errors:[{code:'walking-limit',message:'Access and exit require 4 minutes; your limit is 2.'}]});
 assert.equal(walking.kind,'constraint');assert.match(walking.message,/4 minutes/);assert.match(walking.message,/Settings/);
 const deadline=plannerFeedback({status:'deadline',errors:[{code:'impossible-deadline'}],routes:[{deadlineMet:false}]});assert.equal(deadline.kind,'constraint');assert.match(deadline.title,/after your deadline/);
 const unknown=plannerFeedback({status:'no-feasible',errors:[{code:'no-feasible'}],diagnostics:{boardingsFromOrigin:4}},{walkingLimitMinutes:5});
 assert.equal(unknown.kind,'search');assert.match(unknown.message,/5-minute/);assert.match(unknown.message,/did not identify one exact cause/);assert.doesNotMatch(unknown.message,/exceeds|too short|no real-world route/i);
});
test('missing date, bus-window and network coverage are explicit prototype limitations',()=>{
 const date=plannerFeedback({status:'unsupported-date'},{},{railCoverage:{startDate:'2026-09-18',endDate:'2026-10-02'}});
 assert.equal(date.kind,'coverage');assert.match(date.message,/2026-09-18 and 2026-10-02/);
 const bus=plannerFeedback({status:'unsupported-bus-window'},{},{busCoverage:{validFrom:'2026-09-18',validThrough:'2026-10-02',earliestSeconds:34200,latestSeconds:59400}});
 assert.equal(bus.kind,'coverage');assert.match(bus.message,/09:30–16:30/);assert.match(bus.message,/not a statement that buses are not running/);
 const broad=plannerFeedback({status:'unsupported-bus-window'},{},{busCoverage:{calendarMode:'service-day',validFrom:'2026-09-18',validThrough:'2026-10-02'}});
 assert.match(broad.message,/Saturday and Sunday/);assert.match(broad.message,/previous-day/);assert.doesNotMatch(broad.message,/09:30/);
 assert.match(plannerFeedback({status:'search-limit'}).message,/No partial result/);
 const disconnected=plannerFeedback({status:'disconnected'});assert.equal(disconnected.kind,'coverage');assert.match(disconnected.message,/operator journey planner/);
 const noService=plannerFeedback({status:'no-service',errors:[{code:'no-origin-service'}]});assert.equal(noService.kind,'search');assert.match(noService.message,/Try an earlier departure/);
});
