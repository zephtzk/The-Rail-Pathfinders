const stamp=value=>typeof value==='number'?value:Date.parse(value);
const inactive=new Set(['resolved','recovered','closed','inactive','cancelled']);
const text=value=>typeof value==='string'?value:'';

/** Local authoring records are simulations even when their text names a real operator. */
export function demoIncidentState(incident,now=Date.now()){
  const start=stamp(incident?.startsAt),end=stamp(incident?.endsAt);
  if(inactive.has(incident?.status)||incident?.resolvedAt)return 'resolved';
  if(Number.isFinite(end)&&end<=now)return 'ended';
  if(Number.isFinite(start)&&start>now)return 'scheduled';
  return 'active';
}

export function serviceDemoIncidents(value){
  return (Array.isArray(value)?value:[]).filter(incident=>incident&&typeof incident==='object'&&(incident.demo===true||incident.source==='demo')).slice(0,100);
}

/** A route's selected service date can make a scheduled rehearsal relevant. */
export function demoIncidentAlertable(incident,context={},now=Date.now()){
  const phase=demoIncidentState(incident,now);
  if(phase==='active')return true;
  if(phase!=='scheduled')return false;
  const date=context?.input?.date??context?.active?.routingContext?.input?.date??context?.active?.plan?.date;
  return !!date&&String(incident.startsAt??'').slice(0,10)<=date&&String(incident.endsAt??incident.startsAt??'').slice(0,10)>=date;
}

export function officialServiceState(snapshot,{now=Date.now(),online=true}={}){
  const notices=snapshot?.notices,at=stamp(notices?.retrievedAt),expiry=stamp(notices?.expiresAt);
  const items=(notices?.items??[]).filter(item=>text(item?.text).trim());
  const fresh=online&&['available','partial','empty','missing'].includes(notices?.status)&&Number.isFinite(at)&&at<=now&&now-at<=120000&&(!Number.isFinite(expiry)||expiry>now);
  return {items,fresh,alertable:fresh&&items.length>0,partial:['partial','missing'].includes(notices?.status)};
}

// Retrieval times deliberately do not change official notice identity: checking
// an unchanged message again must not undo a user's dismissal.
export function serviceNoticeKey(kind,record){
  return JSON.stringify(kind==='official'?['official',text(record?.text)]:['demo',record?.id??null,record?.revision??null,record?.updatedAt??null,record?.title??'',record?.details??record?.description??'',record?.status??'',record?.startsAt??'',record?.endsAt??'']);
}
