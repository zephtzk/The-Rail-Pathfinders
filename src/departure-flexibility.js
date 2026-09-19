import {singaporeNow} from './personal.js';
export const FARE_FLEX_SOURCE='https://www.ptc.gov.sg/fares/morning-pre-peak-fares/';
export function departureChoices(input,{windowMinutes=15,now=Date.now()}={}){
 if(![15,30,60].includes(windowMinutes))throw Error('Choose a 15, 30 or 60 minute window.');
 const base=Date.parse(`${input.date}T${input.departureTime}:00+08:00`);if(!Number.isFinite(base))return [];
 return [-windowMinutes,windowMinutes].map(delta=>({at:base+delta*60000,delta})).filter(x=>x.at>=now&&(!input.deadlineTime||x.at<Date.parse(`${input.deadlineDate}T${input.deadlineTime}:00+08:00`))).map(({at,delta})=>{const when=singaporeNow(at);return {...input,date:when.departureDate,departureTime:when.departureTime,timeMode:input.deadlineTime?'arrive-by':'depart-later',flexMinutes:delta};});
}
export function departureBenefit(route,input,{holidays=[],calendarStart=null,calendarEnd=null}={}){
 const leg=route?.legs?.find(l=>l.type==='ride'&&l.mode==='rail');
 if(!leg)return {kind:'timing',message:'Compare this departure and arrival estimate. No verified fare saving is available.'};
 const date=new Date(Date.parse(input.date+'T12:00:00Z')+Math.floor(leg.startSeconds/86400)*86400000).toISOString().slice(0,10),day=new Date(date+'T12:00:00Z').getUTCDay(),seconds=leg.startSeconds%86400;
 if(!calendarStart||date<calendarStart||date>calendarEnd)return {kind:'unknown',message:'Fare-scheme holiday eligibility is not verified for this date. Savings are unknown.'};
 if(day===0||day===6||holidays.includes(date))return {kind:'timing',message:'Weekday morning fare schemes do not apply on this date. Compare the journey timing.'};
 const code=String(leg.fromStopId??'').replace(/_[AB]$/,''),northeast=/^(NE(13|14|15|16|17|18)|SE\d+|SW\d+|PE\d+|PW\d+|STC|PTC)$/.test(code);
 if(northeast&&(seconds<27000||seconds>=32400&&seconds<=35100))return {kind:'possible',message:'Possible free first rail trip under the north-east morning scheme. Eligibility depends on actual tap-in at a qualifying station, time and the same payment method at exit; saving amount is unknown.'};
 if(seconds<27900)return {kind:'possible',message:'Possible morning pre-peak discount if actual rail tap-in is before 07:45. The published cap is $0.50 or the rail fare, whichever is lower; your saving is unknown.'};
 return {kind:'timing',message:'Compare this departure and arrival estimate. No applicable morning fare saving is established.'};
}
