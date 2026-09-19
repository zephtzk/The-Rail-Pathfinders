import test from 'node:test';
import assert from 'node:assert/strict';
import {currentBusArrivalContext} from '../src/arrivals-ui.js';
test('arrival requests follow accepted unboarded bus, never confirmed onboard or blocked detour',()=>{
 const active={status:'started',plan:{departureDate:'2026-09-21'},progress:{stepIndex:0,kind:'waiting'},route:{steps:[{type:'wait'},{type:'ride',source:{mode:'bus',serviceNo:'28',fromStopId:'bus:75009'}}]}};
 assert.equal(currentBusArrivalContext(active).date,'2026-09-21');active.progress={stepIndex:1,kind:'onboard'};assert.equal(currentBusArrivalContext(active),null);active.progress.kind='checkpoint';assert.equal(currentBusArrivalContext(active).leg.serviceNo,'28');active.status='paused';assert.equal(currentBusArrivalContext(active),null);active.status='started';active.detour={status:'accepted'};assert.equal(currentBusArrivalContext(active),null);active.detour.status='resumed';active.facilityReview=true;assert.equal(currentBusArrivalContext(active),null);
});
