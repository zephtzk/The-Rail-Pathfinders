import {expenditureTotals,singaporeDate} from './fare-ledger.js';

// Presentation groups share the ledger's Singapore calendar boundaries and use
// each trip's completion date, never the date of a later charge or refund.
export function spendingPeriods(records,at=Date.now()){
  const totals=expenditureTotals(records,at),weekEnd=new Date(totals.weekStart+'T00:00:00Z');
  weekEnd.setUTCDate(weekEnd.getUTCDate()+7);
  const end=weekEnd.toISOString().slice(0,10),included=new Set();
  const personal=records.filter(r=>!r.demo).slice().sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
  const definitions=[
    ['today','Today',totals.dayTotals,day=>day===totals.day],
    ['week','Calendar week',totals.weekTotals,day=>day>=totals.weekStart&&day<end],
    ['month','Calendar month',totals.monthTotals,day=>day.startsWith(totals.month)]
  ];
  const periods=definitions.map(([id,label,total,contains])=>({id,label,total,records:personal.filter(r=>{
    if(!contains(singaporeDate(r.completedAt)))return false;
    included.add(r.id);return true;
  })}));
  return {periods,earlier:personal.filter(r=>!included.has(r.id))};
}
