import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMultimodalRouter} from '../src/multimodal-engine.js';
const read=name=>JSON.parse(readFileSync(`public/data/${name}.json`));
// Independent Dijkstra over full-pattern ride edges, integer 0.1km costs.
// The test deliberately stays in the single documented AM off-peak band;
// separate calendar tests cover boundaries and carryover without this oracle.
function reference(bus,origin,destination){
  const index=new Map(),blocked=new Set(bus.assumptions.unverifiedBayStopCodes);
  for(const p of bus.patterns.filter(p=>p.timingSupported!==false&&!p.dayTimingExclusions?.WD))for(let i=0;i<p.stops.length-1;i++){
    const s=p.stops[i];if(!index.has(s.stopId))index.set(s.stopId,[]);index.get(s.stopId).push([p,i]);
  }
  const best=new Map([[origin,36000]]),heap=[[36000,origin]];
  function push(item){heap.push(item);let i=heap.length-1;while(i){const parent=(i-1)>>1;if(heap[parent][0]<=item[0])break;heap[i]=heap[parent];i=parent;}heap[i]=item;}
  function pop(){const item=heap[0],tail=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=tail[0])break;heap[i]=heap[c];i=c;}heap[i]=tail;}return item;}
  while(heap.length){
    const [time,code]=pop();if(time!==best.get(code))continue;if(code===destination)return time;
    if(code!==origin&&blocked.has(code))continue;
    for(const[p,i]of index.get(code)??[]){
      const a=p.stops[i],span=a.firstLast.WD;if(!span||!p.headways.AM_Offpeak_Freq)continue;
      const ready=time+(code===origin?0:60);
      const departure=ready<=span[0] ? span[0] : ready+p.headways.AM_Offpeak_Freq[1]*60;
      if(departure>span[1]||departure>57600)continue;
      for(let j=i+1;j<p.stops.length;j++){
        const b=p.stops[j],end=b.firstLast.WD;if(!end)continue;
        if(a.distanceSegment!==b.distanceSegment)break;
        const arrival=departure+(Math.round(b.distanceKm*10)-Math.round(a.distanceKm*10))*20+(j-i)*30;
        if(arrival>57600)break;if(arrival<end[0]||arrival>end[1])continue;
        if(arrival<(best.get(b.stopId)??Infinity)){best.set(b.stopId,arrival);push([arrival,b.stopId]);}
      }
    }
  }
  return null;
}
test('R5 six full-network paths match independent exact-arithmetic Dijkstra',()=>{
  const bus=read('bus-network'),router=createMultimodalRouter(read('rail-network'),bus,read('walking-links'),{busOnly:true});
  for(const [origin,destination]of[['99009','28009'],['28009','59009'],['59009','77009'],['75009','10499'],['52009','99009'],['01059','81111']]){
    const expected=reference(bus,origin,destination);
    const result=router.route({originId:`bus:${origin}`,destinationId:`bus:${destination}`,date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:0,preference:'fastest',maxExtraMinutes:0});
    assert.equal(result.recommended?.arrivalSeconds??null,expected,`${origin} → ${destination}: ${result.status}`);
    assert.equal(result.status,'ok');
  }
});
