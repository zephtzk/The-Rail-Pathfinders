import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRailRouter} from '../src/rail-engine.js';
import {acceptJourney,ingestEvents,compareJourney,decide} from '../src/journey-state.js';
import {canonicalReroute} from '../src/reroute-model.js';
import {routeFromLegacy,startJourney,confirmCheckpoint,proposeRoute,acceptRoute,transition} from '../src/journey-v2.js';
import {createIncidentDraft} from '../src/demo-incidents.js';
import {replayJourney} from '../src/demo-replay.js';
import {deriveNebulaJourneyContext as derive} from '../src/nebula-journey-bridge.js';

const network = JSON.parse(readFileSync(new URL('../public/data/rail-network.json', import.meta.url)));
const router = createRailRouter(network), build = 'pinned-test-build';
const now = Date.parse('2026-09-25T10:00:00+08:00');
const input = {originId:'CC9',destinationId:'DT14',date:'2026-09-25',departureTime:'10:00',deadlineTime:'12:00',walkingLimitMinutes:30,preference:'fastest',maxExtraMinutes:60};
function fixture() {
  const route = router.route(input).recommended;
  assert.ok(route);
  const active = startJourney(routeFromLegacy(route,input), now);
  active.routingContext = acceptJourney(route,input,build,now);
  return active;
}
const context = (active, extra={}) => derive({active,network,build,now,...extra});
const incident = {...createIncidentDraft('planned',{date:input.date}), id:'sept25-ew-demo',demo:true,source:'demo',status:'active',revision:1,scope:'service',from:'',to:''};

test('actual accepted first boarding point uses station geometry and preserves all private state', () => {
  const active = fixture();
  active.sharing = {viewerUrl:'https://candidate.test/share#private-fragment'};
  const before = structuredClone(active), result = context(active);
  const ride = active.route.steps.find(step => step.type==='ride');
  const station = network.stations.find(s => s.id===network.stops.find(s=>s.id===ride.fromStopId).stationId);
  assert.equal(result.nextBoarding.stopId,ride.fromStopId);
  assert.equal(result.nextBoarding.lat,station.lat);
  assert.equal(result.nextBoarding.lng,station.lon);
  assert.match(result.nextBoarding.label,/approximate station position; entrance unverified/);
  assert.doesNotMatch(result.nextBoarding.url,/private|share|token/);
  assert.equal(result.notice,null);
  assert.deepEqual(active,before);
});

test('September 25 actual imported EW closure replay is honest and does not replace the accepted point', async () => {
  const active = fixture(), before = structuredClone(active);
  const replay = await replayJourney({incident,context:active.routingContext,network,search:q=>router.route(q),build});
  assert.equal(replay.status,'alternative');
  assert.equal(replay.affected,true);
  assert.equal(context(active,{incidents:[incident]}).notice.source,'demo');
  assert.match(context(active,{incidents:[incident]}).notice.label,/personal trip unchanged/);
  const proposal = proposeRoute(active,routeFromLegacy(replay.directions,input).route,'Reviewed demo alternative',now);
  assert.deepEqual(context(proposal).nextBoarding,context(active).nextBoarding,'unaccepted proposal/keep leaves target unchanged');
  const accepted = acceptRoute(proposal,now);
  accepted.routingContext = acceptJourney(replay.directions,input,build,now);
  assert.notEqual(context(accepted).nextBoarding.stopId,context(active).nextBoarding.stopId);
  assert.equal(accepted.id,active.id);
  assert.deepEqual(accepted.plan.destination,active.plan.destination);
  assert.deepEqual(active,before);
  console.log('September 25 demo:', context(active).nextBoarding.stopId, '→', context(accepted).nextBoarding.stopId, replay.status);
});

test('manual transfer progress picks remaining boarding; onboard/ended/unknown never invent a walking action', async () => {
  const active = fixture();
  const replay = await replayJourney({incident,context:active.routingContext,network,search:q=>router.route(q),build});
  const next = startJourney(routeFromLegacy(replay.directions,input),now);
  next.routingContext=acceptJourney(replay.directions,input,build,now);
  const rides=next.route.steps.flatMap((step,i)=>step.type==='ride'?[i]:[]);
  assert.ok(rides.length>=2);
  const waiting=confirmCheckpoint(next,{stepIndex:rides[1],kind:'waiting'},now);
  assert.equal(context(waiting).nextBoarding.stopId,next.route.steps[rides[1]].fromStopId);
  assert.equal(context(confirmCheckpoint(next,{stepIndex:rides[0],kind:'onboard'},now)).nextBoarding,null);
  assert.equal(context(confirmCheckpoint(next,{stepIndex:rides[1],kind:'unknown'},now)).nextBoarding,null);
  for(const action of ['finish','cancel','pause']) assert.equal(context(transition(next,action,now)).nextBoarding,null);
  const final=confirmCheckpoint(next,{stepIndex:next.route.steps.length-1},now);
  assert.equal(context(final).nextBoarding,null);
});

test('stale dates, confirmations, builds, invalid storage and missing coordinates fail closed', () => {
  const active=fixture();
  assert.equal(context(null).nextBoarding,null);
  assert.equal(context({...active,progress:{...active.progress,stepIndex:999}}).nextBoarding,null);
  assert.equal(context(active,{now:now+86400000}).nextBoarding,null);
  assert.equal(context(active,{now:now+300001}).nextBoarding,null);
  assert.equal(context(active,{build:'changed'}).nextBoarding,null);
  assert.equal(context(active,{network:null}).nextBoarding,null);
  assert.equal(context({...active,routingContext:null}).nextBoarding,null);
  for(const value of ['1.3',NaN,91]) {
    const invalid=structuredClone(network);
    invalid.stations.find(s=>s.id==='CC9').lat=value;
    assert.equal(context(active,{network:invalid}).nextBoarding,null);
  }
  assert.equal(context(active,{online:false}).notice.source,'stale');
});

test('unrelated, resolved and expired demo incidents are not represented as active disruptions', () => {
  const active=fixture();
  for(const change of [{service:'BP'},{status:'resolved'},{startsAt:'2026-09-24T00:00:00+08:00',endsAt:'2026-09-24T23:59:00+08:00'}])
    assert.equal(context(active,{incidents:[{...incident,...change}]}).notice,null);
});

test('existing synthetic incident comparison keeps or accepts explicitly, with truthful freshness', () => {
  const active=fixture();active.plan.mode='replay';
  const leg=active.routingContext.route.legs.find(l=>l.type==='ride');
  const event={id:'demo-next-train',revision:1,evidence:'synthetic',effect:'cancelled',build,
    tripId:leg.tripId,routeId:leg.routeId,directionId:leg.directionId,serviceDate:leg.serviceDate,
    impactStartSeconds:leg.startSeconds,impactEndSeconds:leg.endSeconds,
    sourceTime:new Date(now).toISOString(),retrievedAt:new Date(now).toISOString(),
    validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+90000).toISOString()};
  active.routingContext=ingestEvents(active.routingContext,[event],network,now);
  assert.equal(context(active).notice.source,'demo');
  const comparison=compareJourney(active.routingContext,{network,route:q=>router.route(q)},now);
  assert.equal(comparison.status,'offer');
  const before=structuredClone(active);
  const kept={...active,routingContext:decide(active.routingContext,comparison,'declined',now)};
  assert.deepEqual(context(kept).nextBoarding,context(active).nextBoarding);
  const acceptedContext=decide(active.routingContext,comparison,'accepted',now);
  const plan=canonicalReroute(acceptedContext,{priorRoute:active.route});
  const accepted=acceptRoute(proposeRoute(active,plan.route,'Reviewed comparison',now),now);
  accepted.routingContext=acceptedContext;
  assert.equal(context(accepted).nextBoarding.stopId,accepted.route.steps.find(s=>s.type==='ride').fromStopId);
  assert.equal(accepted.id,active.id);
  assert.deepEqual(accepted.plan.destination,active.plan.destination);
  assert.deepEqual(active,before);
  assert.equal(context(active,{now:now+90001}).notice.source,'stale');
  assert.equal(context({...active,plan:{...active.plan,mode:'real'}}).notice,null,'synthetic events never pretend to affect a personal trip');
});
