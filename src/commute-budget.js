import {expenditureTotals} from './fare-ledger.js';

export const BUDGET_KEY='commute-copilot-budget-v1';
const valid=value=>value?.schemaVersion===1&&['week','month'].includes(value.period)&&Number.isSafeInteger(value.cents)&&value.cents>0&&value.cents<=10000000;
export function createBudgetStore(storage){
  function read(){try{const raw=storage.getItem(BUDGET_KEY);if(raw===null)return {ok:true,budget:null};const budget=JSON.parse(raw);if(!valid(budget))throw Error();return {ok:true,budget};}catch{return {ok:false,budget:null,error:'Budget settings could not be read. Existing settings are preserved.'};}}
  return {read,set({period,cents}){if(!read().ok)throw Error(read().error);const budget={schemaVersion:1,period,cents};if(!valid(budget))throw Error('Choose a weekly or monthly budget greater than $0, up to $100,000.');try{const raw=JSON.stringify(budget);storage.setItem(BUDGET_KEY,raw);if(storage.getItem(BUDGET_KEY)!==raw)throw Error();}catch{throw Error('Could not save the budget on this device.');}return budget;},remove(){try{storage.removeItem(BUDGET_KEY);if(storage.getItem(BUDGET_KEY)!==null)throw Error();}catch{throw Error('Could not remove the budget setting.');}}};
}
export function budgetProgress(records,budget,at=Date.now()){
  if(!valid(budget))return null;
  const totals=expenditureTotals(records,at),period=totals[budget.period==='week'?'weekTotals':'monthTotals'];
  const start=budget.period==='week'?totals.weekStart:totals.month+'-01',end=new Date(start+'T00:00:00Z');
  if(budget.period==='week')end.setUTCDate(end.getUTCDate()+6);else{end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);}
  return {...period,period:budget.period,start,end:end.toISOString().slice(0,10),budgetCents:budget.cents,remainingCents:budget.cents-period.totalCents,overBudgetCents:Math.max(0,period.totalCents-budget.cents),actualPercent:100*period.totalCents/budget.cents,percent:Math.min(100,Math.max(0,100*period.totalCents/budget.cents))};
}
