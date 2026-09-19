import test from 'node:test';
import assert from 'node:assert/strict';
import {createMultimodalRouter} from '../src/multimodal-engine.js';
import {compileDemoClosures,demoRouteAffected} from '../src/demo-closures.js';
const sec=v=>{const [h,m]=v.split(':').map(Number);return h*3600+m*60;};
const query={originId:'bus:01001',destinationId:'bus:01003',date:'2026-09-18',departureTime:'10:00',walkingLimitMinutes:10,preference:'fastest',maxExtraMinutes:15};
function fixture({calendar=false,last='23:00'}={}){
  const rail={schemaVersion:1,timeZone:'Asia/Singapore',stations:[],stops:[],routes:[],services:[],trips:[],transfers:[],coverage:{startDate:'2026-09-01',endDate:'2026-09-30'},assumptions:{accessSeconds:120,exitSeconds:120}};
  const bus={schemaVersion:1,coverage:{validFrom:'2026-09-18',validThrough:'2026-09-30',earliestSeconds:sec('09:30'),latestSeconds:sec('16:30'),excludedDates:[],...(calendar?{calendarMode:'service-day'}:{})},assumptions:{rideSpeedKph:18,dwellSecondsPerStop:30,headwayBands:[{field:'AM_Offpeak_Freq',startSeconds:sec('09:30'),endSeconds:sec('16:30')}]},stops:['01001','01002','01003'].map(id=>({id,name:id,lat:1,lon:103})),patterns:[{id:'7',serviceNo:'7',operator:'SBST',direction:1,headways:{AM_Offpeak_Freq:[5,10]},stops:['01001','01002','01003'].map((stopId,i)=>({stopId,sequence:i+1,distanceKm:i*1.5,firstLast:{WD:[sec('06:00'),sec(last)]}}))}]};
  const router=createMultimodalRouter(rail,bus,{links:[]},{busOnly:true});return router;
}
const rule=(start,end,edges=[['bus:01001','bus:01002']])=>({demo:true,routeId:'7',startSeconds:sec(start),endSeconds:sec(end),edges});
test('temporary bus closure retries a supported frequency boarding after expiry',()=>{
  for(const calendar of [false,true]){
    const router=fixture({calendar}),normal=router.route(query).recommended;
    assert.equal(normal.arrivalSeconds,sec('10:21'));
    const rules=[rule('10:00','10:15')],result=router.route({...query,demoClosures:rules});
    assert.equal(result.status,'ok');assert.equal(result.recommended.arrivalSeconds,sec('10:36'));
    const ride=result.recommended.legs.find(l=>l.type==='ride');assert.equal(ride.startSeconds,sec('10:25'));assert.equal(result.recommended.waitSeconds,25*60);assert.equal(demoRouteAffected(result.recommended,rules,router.network),false);
    assert.equal(result.recommended.arrivalSeconds,router.route({...query,departureTime:'10:15'}).recommended.arrivalSeconds);
  }
});
test('retries follow consecutive closure expiries and keep ride chain time continuous',()=>{
  const router=fixture(),rules=[rule('10:00','10:15'),rule('10:24','10:40')],result=router.route({...query,demoClosures:rules});
  assert.equal(result.status,'ok');assert.equal(result.recommended.arrivalSeconds,sec('11:01'));
  let at=sec('10:00');for(const leg of result.recommended.legs){assert.equal(leg.startSeconds,at);at=leg.endSeconds;}assert.equal(at,sec('11:01'));
});
test('bus retry remains limited to directed traversed edges and half-open ride windows',()=>{
  const router=fixture();
  for(const rules of [[rule('09:50','10:10')],[rule('10:21','11:00')],[rule('10:00','11:00',[['bus:01002','bus:01001']])],[{...rule('10:00','11:00'),routeId:'other'}]])assert.equal(router.route({...query,demoClosures:rules}).recommended.arrivalSeconds,sec('10:21'));
  const prefix=router.route({...query,destinationId:'bus:01002',demoClosures:[rule('10:00','11:00',[['bus:01002','bus:01003']])]});assert.equal(prefix.recommended.arrivalSeconds,sec('10:15')+30);
});
test('closure expiry never fabricates boarding beyond last service or timing horizon',()=>{
  for(const router of [fixture({last:'10:20'}),fixture({calendar:true,last:'10:20'})])assert.equal(router.route({...query,demoClosures:[rule('10:00','10:15')]}).routes.length,0);
  assert.equal(fixture().route({...query,demoClosures:[rule('10:00','17:00')]}).routes.length,0);
});
