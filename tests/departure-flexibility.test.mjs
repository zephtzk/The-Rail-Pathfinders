import test from 'node:test';
import assert from 'node:assert/strict';
import {departureChoices,departureBenefit} from '../src/departure-flexibility.js';
test('departure alternatives keep all constraints, cross midnight and reject past/deadline departures',()=>{
 const input={date:'2026-09-21',departureTime:'23:50',originId:'a',destinationId:'b',walkingLimitMinutes:12,stepFree:true,deadlineDate:'2026-09-22',deadlineTime:'00:30'};
 const choices=departureChoices(input,{windowMinutes:15,now:Date.parse('2026-09-21T23:45:00+08:00')});assert.equal(choices.length,1);assert.equal(choices[0].date,'2026-09-22');assert.equal(choices[0].departureTime,'00:05');assert.equal(choices[0].stepFree,true);assert.equal(choices[0].walkingLimitMinutes,12);assert.equal(input.departureTime,'23:50');
 assert.equal(departureChoices({...input,deadlineTime:'00:00'},{windowMinutes:15,now:Date.parse('2026-09-21T23:45:00+08:00')}).length,0);
});
test('fare hints use rail boarding point and day, never leaving-home time or guaranteed savings',()=>{
 const input={date:'2026-09-21',departureTime:'07:00'},calendar={calendarStart:'2026-01-01',calendarEnd:'2026-12-31',holidays:['2026-11-09']};
 const route={legs:[{type:'ride',mode:'bus',startSeconds:25200},{type:'ride',mode:'rail',fromStopId:'NE17_A',startSeconds:33000,serviceDate:'2026-09-21'}]};
 assert.match(departureBenefit(route,input,calendar).message,/free first rail trip/);route.legs[1].fromStopId='EW8_A';assert.equal(departureBenefit(route,input,calendar).kind,'timing');route.legs[1].startSeconds=27899;assert.equal(departureBenefit(route,input,calendar).kind,'possible');input.date='2026-11-09';assert.equal(departureBenefit(route,input,calendar).kind,'timing');assert.equal(departureBenefit(route,input).kind,'unknown');
});
