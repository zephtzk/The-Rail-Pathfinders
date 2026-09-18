// A narrow client boundary: no provider payload or prose can become a routing event.
const stamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
export function noticeSnapshot(value) {
  const n=value?.notices;
  if(value?.schemaVersion!==1||!stamp(value.checkedAt)||!n||!['available','partial','empty','missing','unavailable'].includes(n.status)||!Array.isArray(n.items)||!Array.isArray(n.segments)||n.items.length>100||n.segments.length>100) return null;
  if(n.retrievedAt!==undefined&&n.retrievedAt!==null&&!stamp(n.retrievedAt))return null;
  if(n.items.some(i=>!i||typeof i.text!=='string'))return null;
  return {schemaVersion:1,checkedAt:value.checkedAt,notices:{status:n.status,error:typeof n.error==='string'?n.error.slice(0,100):null,retrievedAt:n.retrievedAt??null,sourceTime:n.sourceTime??null,expiresAt:n.expiresAt??null,nextRefreshAt:stamp(n.nextRefreshAt)?n.nextRefreshAt:null,items:n.items.map(i=>({text:i.text.slice(0,2000)})),segments:[]}};
}
export function newerSnapshot(previous,next,now=Date.now()) {
  if(!next||Date.parse(next.checkedAt)>now+5000||Date.parse(next.notices.retrievedAt)>now+5000)return false;
  if(!previous)return true;
  if(Date.parse(next.checkedAt)<Date.parse(previous.checkedAt))return false;
  return !previous.notices.retrievedAt||!next.notices.retrievedAt||Date.parse(next.notices.retrievedAt)>=Date.parse(previous.notices.retrievedAt);
}
