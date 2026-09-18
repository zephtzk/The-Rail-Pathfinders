import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyPlannerInput} from '../src/legacy-planner-preferences.js';
import {routeFromLegacy} from '../src/journey-v2.js';

const saved = Object.freeze({stepFree:true,fareCategory:'senior',walkingLimitMinutes:25,maxExtraMinutes:7,preference:'less-walking',assistanceRequested:true});

test('legacy form edits preserve hidden saved requirements and use explicit current preferences', () => {
  const result=legacyPlannerInput({originId:'EW8',destinationId:'EW12',date:'2026-09-21',departureTime:'10:00',walkingLimitMinutes:'30',preference:'fastest',maxExtraMinutes:'15'},saved);
  assert.equal(result.stepFree,true);assert.equal(result.fareCategory,'senior');assert.equal(result.assistanceRequested,true);
  assert.equal(result.walkingLimitMinutes,30);assert.equal(result.preference,'fastest');assert.equal(result.maxExtraMinutes,15);
  assert.equal(result.originId,'EW8');assert.equal(result.departureTime,'10:00');
});

test('replay aliases override a carried canonical preference without stale nested values', () => {
  const result=legacyPlannerInput({...saved,preferences:saved,walkingLimit:'12',detourLimit:'5',preference:'quieter'},saved);
  assert.equal(result.walkingLimitMinutes,12);assert.equal(result.maxExtraMinutes,5);assert.equal(result.preference,'quieter');
  assert.equal(result.preferences,undefined);assert.equal(result.stepFree,true);assert.equal(result.fareCategory,'senior');
  assert.deepEqual(saved,{stepFree:true,fareCategory:'senior',walkingLimitMinutes:25,maxExtraMinutes:7,preference:'less-walking',assistanceRequested:true});
});

test('legacy submitted input still supplies saved accessibility and fare to accepted plan conversion', () => {
  const input=legacyPlannerInput({originId:'EW8',destinationId:'EW12',date:'2026-09-21',departureTime:'10:00',walkingLimitMinutes:'30'},saved);
  const plan=routeFromLegacy({id:'r',departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:0,legs:[{type:'ride',mode:'rail',routeId:'EWL',fromStopId:'EW8_A',toStopId:'EW12_A',durationSeconds:600}]},input);
  assert.equal(plan.preferences.stepFree,true);assert.equal(plan.preferences.fareCategory,'senior');assert.equal(plan.preferences.walkingLimitMinutes,30);
});

test('explicit new Settings values can replace an older saved carry-over', () => {
  const result=legacyPlannerInput({stepFree:false,fareCategory:'pwd'},saved);
  assert.equal(result.stepFree,false);assert.equal(result.fareCategory,'pwd');
});
