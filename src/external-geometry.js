// Bounded geographic overlays, never floor plans or evidence of accessibility.
export const validCoordinate=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=1.144&&p[0]<=1.494&&p[1]>=103.535&&p[1]<=104.502;
export function decodePolyline(encoded){
  if(typeof encoded!=='string'||encoded.length>48000)throw Error('Invalid geometry');
  let position=0,lat=0,lng=0;const points=[];
  function delta(){let result=0,shift=0,byte;do{if(position>=encoded.length||shift>30)throw Error('Invalid geometry');byte=encoded.charCodeAt(position++)-63;if(byte<0||byte>63)throw Error('Invalid geometry');result+=(byte&31)*2**shift;shift+=5;}while(byte>=32);return result%2?-(Math.floor(result/2)+1):result/2;}
  while(position<encoded.length){lat+=delta();lng+=delta();const point=[lat/1e5,lng/1e5];if(!validCoordinate(point)||points.length>=8000)throw Error('Invalid geometry');points.push(point);}
  if(points.length<2)throw Error('Invalid geometry');return points;
}
export function compactGeometry(points,limit){
  if(points.length<=limit)return points;
  return Array.from({length:limit},(_,index)=>points[Math.round(index*(points.length-1)/(limit-1))]);
}
export function validExternalGeometry(route){
  if(route.provider==null&&route.geometry==null)return true;
  if(route.provider!=='onemap'||!Number.isFinite(route.providerRetrievedAt)||route.providerRetrievedAt<0||!Array.isArray(route.geometry)||route.geometry.length>24)return false;
  let count=0;const indices=new Set();
  return route.geometry.every(segment=>{
    if(!Number.isInteger(segment.stepIndex)||segment.stepIndex<0||segment.stepIndex>=route.steps.length||indices.has(segment.stepIndex)||!['provider','schematic'].includes(segment.kind)||!Array.isArray(segment.points)||segment.points.length<2||segment.points.length>192)return false;
    indices.add(segment.stepIndex);count+=segment.points.length;
    return count<=192&&segment.points.every(validCoordinate);
  });
}
