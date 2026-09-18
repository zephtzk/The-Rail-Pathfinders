import test from 'node:test';
import assert from 'node:assert/strict';
import {spendingPeriods} from '../src/fare-periods.js';
import {createLedger,recordAmount} from '../src/fare-ledger.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const record=(id,completedAt,extra={})=>({id,completedAt,demo:false,actualCents:100,estimatedCents:null,adjustments:[],...extra});
const ids=p=>p.records.map(r=>r.id);

test('spending rows and amounts share Singapore midnight and Monday boundaries',()=>{
  const records=[record('sunday','2026-09-20T15:59:00Z'),record('monday','2026-09-20T16:00:00Z')];
  const before=JSON.stringify(records),{periods}=spendingPeriods(records,'2026-09-20T16:01:00Z');
  assert.deepEqual(ids(periods[0]),['monday']);assert.deepEqual(ids(periods[1]),['monday']);assert.deepEqual(ids(periods[2]),['monday','sunday']);
  assert.deepEqual(periods.map(p=>p.total.totalCents),[100,100,200]);assert.equal(JSON.stringify(records),before);
});

test('month changes retain the previous month trip in the current week and keep older dates accessible',()=>{
  const records=[record('old','2026-08-15T08:00:00Z'),record('sunday','2026-09-27T12:00:00Z'),record('september','2026-09-30T15:59:00Z'),record('october','2026-09-30T16:00:00Z')];
  const {periods,earlier}=spendingPeriods(records,'2026-09-30T16:01:00Z');
  assert.deepEqual(ids(periods[0]),['october']);assert.deepEqual(ids(periods[1]),['october','september']);assert.deepEqual(ids(periods[2]),['october']);assert.deepEqual(earlier.map(r=>r.id),['sunday','old']);
  for(const p of periods)assert.equal(p.total.totalCents,p.records.reduce((sum,r)=>sum+recordAmount(r),0));
});

test('per-period pending counts remain separate from estimates and exclude demo spending',()=>{
  const records=[record('confirmed','2026-09-21T03:00:00Z'),record('estimate','2026-09-21T02:00:00Z',{actualCents:null,estimatedCents:149}),record('pending','2026-09-21T01:00:00Z',{actualCents:null}),record('demo','2026-09-21T04:00:00Z',{demo:true})];
  const {periods,earlier}=spendingPeriods(records,'2026-09-21T05:00:00Z');
  for(const p of periods){assert.deepEqual(ids(p),['confirmed','estimate','pending']);assert.equal(p.total.totalCents,249);assert.equal(p.total.unpricedTrips,1);assert.equal(p.total.tripCount,3);}
  assert.deepEqual(earlier,[]);
});

test('confirmed charges, later refunds, deletion and reload retain the original trip period and tombstone',()=>{
  const storage=memory(),ledger=createLedger(storage);
  ledger.addManual({label:'September trip',journeyId:'trip',completedAt:'2026-09-30T15:59:00Z',cents:149,kind:'estimate'});
  const id=ledger.read().state.records[0].id;ledger.confirm(id,159);ledger.adjust(id,{cents:-20,note:'Fare correction'},Date.parse('2026-10-01T03:00:00Z'));
  const records=createLedger(storage).read().state.records,september=spendingPeriods(records,'2026-09-30T15:59:00Z'),october=spendingPeriods(records,'2026-10-01T03:00:00Z');
  assert.equal(september.periods[2].total.totalCents,139);assert.equal(october.periods[2].total.totalCents,0);assert.equal(october.periods[1].total.totalCents,139);assert.deepEqual(ids(october.periods[1]),[id]);
  ledger.delete(id);assert.ok(spendingPeriods(createLedger(storage).read().state.records,'2026-10-01T03:00:00Z').periods.every(p=>p.records.length===0));
  assert.throws(()=>createLedger(storage).addManual({label:'September trip',journeyId:'trip',completedAt:'2026-09-30T15:59:00Z',cents:149}),/already/);
});
