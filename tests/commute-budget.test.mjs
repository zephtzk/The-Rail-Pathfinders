import test from 'node:test';
import assert from 'node:assert/strict';
import {createBudgetStore,budgetProgress,BUDGET_KEY} from '../src/commute-budget.js';
import {createLedger} from '../src/fare-ledger.js';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('budget uses Singapore calendar periods, confirmed replacement, refunds and separate estimates',()=>{
 const s=storage(),ledger=createLedger(s),budgets=createBudgetStore(s);let b=budgets.set({period:'week',cents:1000});
 ledger.addManual({label:'Sunday SGT',completedAt:'2026-09-20T23:59:00+08:00',cents:900});
 ledger.addManual({label:'Monday SGT',completedAt:'2026-09-20T16:01:00Z',cents:700,kind:'estimate'});
 ledger.addManual({label:'Charge',completedAt:'2026-09-21T09:00:00+08:00',cents:800});
 let records=ledger.read().state.records,result=budgetProgress(records,b,Date.parse('2026-09-21T10:00:00+08:00'));
 assert.equal(result.confirmedCents,800);assert.equal(result.estimatedCents,700);assert.equal(result.remainingCents,-500);assert.equal(result.percent,100);assert.equal(result.actualPercent,150);assert.equal(result.end,'2026-09-27');
 ledger.confirm(records[1].id,600);ledger.adjust(records[1].id,{cents:-100,note:'Refund'},Date.parse('2026-10-05T00:00:00+08:00'));
 result=budgetProgress(ledger.read().state.records,b,Date.parse('2026-09-21T10:00:00+08:00'));
 assert.equal(result.confirmedCents,1300);assert.equal(result.estimatedCents,0);assert.equal(result.overBudgetCents,300);assert.equal(result.percent,100);
 b=budgets.set({period:'month',cents:5000});assert.equal(budgetProgress(ledger.read().state.records,b,Date.parse('2026-09-30T16:00:00Z')).tripCount,0);
 budgets.remove();assert.equal(ledger.read().state.records.length,3);assert.equal(budgets.read().budget,null);
});
test('demo and unpriced records cannot consume budget; corrupt and blocked settings are explicit',()=>{
 const s=storage(),b=createBudgetStore(s).set({period:'week',cents:100});
 const r={completedAt:'2026-09-21T00:00:00+08:00',actualCents:null,estimatedCents:null,adjustments:[],demo:false};
 const result=budgetProgress([r,{...r,demo:true,actualCents:10000}],b,Date.parse(r.completedAt));assert.equal(result.confirmedCents,0);assert.equal(result.unpricedTrips,1);
 s.setItem(BUDGET_KEY,'broken');assert.equal(createBudgetStore(s).read().ok,false);assert.throws(()=>createBudgetStore(s).set({period:'week',cents:1}));assert.equal(s.getItem(BUDGET_KEY),'broken');
 assert.throws(()=>createBudgetStore({getItem:()=>null,setItem:()=>{throw Error();}}).set({period:'week',cents:1}),/Could not save/);
});
