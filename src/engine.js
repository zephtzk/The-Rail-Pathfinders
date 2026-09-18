import {DEFAULT_INPUT, EW_EAST, EW_WEST, CC, DT} from './data.js';
export const minute = value => typeof value==='string'?Number(value.split(':')[0])*60+Number(value.split(':')[1]):NaN;
export const clock = value => `${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}${value>=1440?' (+1 day)':''}`;
export const timestamp = (date,minutes) => Date.parse(`${date}T00:00:00+08:00`)+minutes*60000;
const walk = (id,text,minutes,station,connection) => ({id,type:'walk',text,minutes,station,connection,verified:true});
const wait = (id,line,minutes,station) => ({id,type:'wait',text:`Wait for ${line} Line`,line,minutes,station});
const ride = (id,line,direction,minutes,stops,text) => ({id,type:'ride',line,direction,minutes,stops,text});
const normalTail=()=>[ride('ew-west','EW','west',10,EW_WEST,'East West Line toward Tuas Link'),walk('exit','Follow signs to Bugis station exit',2,'bugis','station-exit')];
const alternativeTail=()=>[
  walk('transfer-pl','At Paya Lebar, follow signs to Circle Line',4,'payalebar','paya-lebar-ew-cc'),
  wait('wait-cc','CC',3,'payalebar'),ride('cc','CC','clockwise',12,CC,'Circle Line clockwise via Dakota · alight at Promenade'),
  walk('transfer-pr','At Promenade, follow signs to Downtown Line',4,'promenade','promenade-cc-dt'),
  wait('wait-dt','DT',3,'promenade'),ride('dt','DT','bukit-panjang',2,DT,'Downtown Line toward Bukit Panjang · 1 stop to Bugis'),
  walk('exit','Follow signs to Bugis station exit',2,'bugis','station-exit')
];
export function validateInput(input) {
  const errors=[];
  if(!['tampines','payalebar'].includes(input.origin)||input.destination!=='bugis') errors.push('This prototype supports Tampines or Paya Lebar to Bugis.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(Date.parse(`${input.date}T00:00:00Z`))||new Date(`${input.date}T00:00:00Z`).toISOString().slice(0,10)!==input.date) errors.push('Choose a valid travel date.');
  if(![input.departure,input.deadline].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) errors.push('Choose valid departure and arrival times.');
  if(minute(input.deadline)<=minute(input.departure)) errors.push('Arrival deadline must be after departure on the same date.');
  if(!Number.isFinite(Number(input.walkingLimit))||Number(input.walkingLimit)<0) errors.push('Choose a walking limit.');
  if(!['fastest','quieter'].includes(input.preference)) errors.push('Choose a valid preference.');
  if(!Number.isFinite(Number(input.detourLimit??10))||Number(input.detourLimit??10)<0)errors.push('Extra travel time must be zero or more minutes.');
  return errors;
}
export function templates(input,current='origin') {
  const prefix = current==='payalebar'?[]:input.origin==='tampines'?[
    walk('entry','Enter Tampines and follow East West Line signs',2,'tampines','station-entry'),wait('wait-ew','EW',3,'tampines'),ride('ew-east','EW','west',14,EW_EAST,'East West Line toward Tuas Link · stay on at Paya Lebar')
  ]:[walk('entry','Enter Paya Lebar and follow East West Line signs',2,'payalebar','station-entry'),wait('wait-ew','EW',3,'payalebar')];
  return [
    {id:'direct',name:'Stay on East West Line',shortName:'East West Line',transfers:0,crowding:0.8,crowdingLabel:'Busier · replay',legs:[...prefix,...normalTail()]},
    {id:'circle',name:'Via Circle + Downtown',shortName:'Circle + Downtown',transfers:input.origin==='payalebar'&&current==='origin'?1:2,crowding:0.45,crowdingLabel:'Moderate · replay',legs:input.origin==='payalebar'&&current==='origin'?[walk('entry','Enter Paya Lebar and follow Circle Line signs',2,'payalebar','station-entry'),...alternativeTail().slice(1)]:[...prefix,...alternativeTail()]}
  ];
}
export function matchesEvent(leg,event,start,end) {
  if(leg.type!=='ride'||leg.line!==event.line||leg.direction!==event.direction) return false;
  const topology=leg.line==='EW'?[...EW_EAST,...EW_WEST.slice(1)]:leg.line==='CC'?CC:DT;
  const a=topology.indexOf(event.from),b=topology.indexOf(event.to);
  if(a<0||b<=a)return false;
  const eventEdges=new Set(topology.slice(a,b).map((s,i)=>`${s}:${topology[a+i+1]}`));
  return leg.stops.slice(0,-1).some((s,i)=>eventEdges.has(`${s}:${leg.stops[i+1]}`)&&start+(end-start)*i/(leg.stops.length-1)<Date.parse(event.endsAt)&&start+(end-start)*(i+1)/(leg.stops.length-1)>Date.parse(event.startsAt));
}
export function evaluateRoute(route,input,events,nowMinutes) {
  let cursor=nowMinutes,delay=0;const applied=new Set(),affected=[];let blocked=false;
  const legs=route.legs.map(leg=>{
    const start=cursor;let extra=0;
    for(const event of events) {
      if(!applied.has(event.id)&&matchesEvent(leg,event,timestamp(input.date,start),timestamp(input.date,start+leg.minutes))){
        applied.add(event.id);affected.push(event);blocked ||= event.closed;extra+=Math.max(0,event.delayMinutes||0);
      }
    }
    cursor+=leg.minutes+extra;delay+=extra;return {...leg,start,end:cursor,delay:extra};
  });
  const walking=legs.filter(l=>l.type==='walk').reduce((a,l)=>a+l.minutes,0);
  const totalWalking=walking+(nowMinutes>minute(input.departure)?2:0);
  const reasons=[];if(blocked)reasons.push('Uses a closed segment');if(totalWalking>Number(input.walkingLimit))reasons.push(`Needs ${totalWalking} min walking; limit is ${input.walkingLimit} min`);
  if(legs.some(l=>l.type==='walk'&&!l.verified))reasons.push('Walking connection is not verified');
  return {...route,legs,arrival:cursor,duration:cursor-nowMinutes,walking,totalWalking,delay,affected,feasible:!reasons.length,reasons,onTime:cursor<=minute(input.deadline),buffer:minute(input.deadline)-cursor};
}
export function plan(input=DEFAULT_INPUT,events=[],current='origin',selected='direct',confirmedMinutes=null) {
  const errors=validateInput(input);if(errors.length)return {errors,routes:[],recommended:null};
  const nowMinutes=current==='payalebar'&&Number.isFinite(confirmedMinutes)?Math.max(minute(input.departure),confirmedMinutes):minute(input.departure)+(current==='payalebar'&&input.origin==='tampines'?19:current==='payalebar'?5:0);
  const routes=templates(input,current).map(r=>evaluateRoute(r,input,events,nowMinutes));
  const feasible=routes.filter(r=>r.feasible),onTime=feasible.filter(r=>r.onTime);
  let pool=onTime.length?onTime:feasible;
  const fastest=Math.min(...pool.map(r=>r.duration));
  if(input.preference==='quieter')pool=pool.filter(r=>r.duration<=fastest+Number(input.detourLimit??10));
  const max=Math.max(...pool.map(r=>r.duration)),min=Math.min(...pool.map(r=>r.duration));
  for(const r of routes){
    const speed=Math.max(0,Math.min(1,1-(r.duration-fastest)/30));
    const comfort=r.crowding==null?0:1-Math.max(0,Math.min(1,r.crowding));
    r.score=pool.includes(r)?(input.preference==='quieter'?0.5*speed+0.5*comfort:0.8*speed+0.2*comfort):-1;
  }
  pool.sort((a,b)=>!onTime.length?a.duration-b.duration:b.score-a.score||a.duration-b.duration||a.transfers-b.transfers);
  let recommended=pool[0]??null;
  const staying=routes.find(r=>r.id===selected);
  // Avoid switching for a negligible benefit when the selected route still meets the deadline.
  if(staying?.feasible&&staying.onTime&&recommended&&staying.id!==recommended.id&&staying.duration-recommended.duration<3&&input.preference==='fastest')recommended=staying;
  let reason=!recommended?'No route meets your walking and closure constraints.':!recommended.onTime?`No feasible route meets ${input.deadline}. This arrives ${-recommended.buffer} min late.`:recommended.id===selected?`Your selected route still works. Arrive ${recommended.buffer} min before your deadline.`:`Arrive ${recommended.buffer} min before your deadline with ${recommended.transfers} transfers and ${recommended.totalWalking} min total walking.`;
  if(recommended&&input.preference==='quieter')reason+=' Crowding is simulated; only routes within your extra-time limit were considered.';
  return {errors,nowMinutes,routes,recommended,reason,allLate:feasible.length>0&&!onTime.length};
}
export function alertKey(event){return `${event.id}:${event.revision}`;}
export function shouldAlert(event,route,seen,previousArrival,deadline) {
  return !seen.includes(alertKey(event))&&route.affected.some(e=>e.id===event.id)&&(event.closed||route.arrival-previousArrival>=5||route.arrival>deadline);
}
export function boardingAdvice(observation,mapping,context,now=Date.now()) {
  if(!observation||![observation.expiresAt,observation.observedAt,observation.confidence].every(Number.isFinite)||observation.expiresAt<=now||observation.observedAt>now||observation.observedAt>=observation.expiresAt||observation.departed||observation.confidence<0.9||observation.confidence>1||!Array.isArray(observation.cars))return {status:'unavailable',message:'Car crowding unavailable. Check the platform display.'};
  for(const k of ['trainId','station','platform','direction','formation'])if(!context[k]||observation[k]!==context[k])return {status:'unavailable',message:'Observation does not match the approaching train.'};
  if(!mapping||!mapping.orientationVerified)return {status:'unavailable',message:'Car orientation is unverified.'};
  for(const k of ['station','platform','direction','formation'])if(mapping[k]!==context[k])return {status:'unavailable',message:'Platform mapping does not match.'};
  const car=observation.cars.filter(c=>c&&Number.isFinite(c.load)&&c.load>=0&&c.load<=1&&c.id!=null).sort((a,b)=>a.load-b.load)[0];
  if(!car)return {status:'unavailable',message:'Car crowding unavailable.'};
  const doors=mapping.doorsVerified?mapping.doors?.[car.id]:null;
  return {status:doors?'doors':'car',message:doors?`Car ${car.id}, platform doors ${doors}.`: `Car ${car.id} has lower observed crowding.`,source:observation.source};
}
