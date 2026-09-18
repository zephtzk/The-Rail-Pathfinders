/**
 * Reusable, router-private search objects. Public routes must be materialized
 * into detached objects before reset/release: either operation invalidates the
 * previous query's labels and chain IDs. Retention caps never limit search
 * work: object pools allocate unretained overflow, and packed chains grow for
 * the current query before releasing excess capacity.
 */
const LABEL_CAP = 65536;
const CHAIN_CAP = 131072;
const LEG_CAP = 32768;

function pool(cap, create) { return {cap,create,used:0,entries:[]}; }
function take(storage) {
  const index = storage.used++;
  if (index < storage.entries.length) return storage.entries[index];
  const value = storage.create();
  if (index < storage.cap) storage.entries.push(value);
  return value;
}

export function createSearchArena() {
  const labels = pool(LABEL_CAP, () => ({stop:null,time:0,walk:0,boardings:0,externalSinceRide:false,chain:0,segment:-1,newlyBoarded:false}));
  let predecessors = new Uint32Array(1024), legReferences = new Array(1024), chainCount = 0;
  const busLegs = pool(LEG_CAP, () => ({type:'bus-ride',pattern:null,fromIndex:0,toIndex:0,startSeconds:0,endSeconds:0,serviceDate:null,boardingBasis:null,headwayField:null}));
  const railLegs = pool(LEG_CAP, () => ({type:'rail-ride',trip:null,fromStopId:null,toStopId:null,startSeconds:0,endSeconds:0,serviceDate:null}));
  const transferLegs = pool(LEG_CAP, () => ({type:'transfer',fromStopId:null,toStopId:null,startSeconds:0,endSeconds:0,durationSeconds:0,walkingSeconds:0,allowanceSeconds:0,provenance:null,pathId:undefined,assumed:false}));
  const busWaits = pool(LEG_CAP, () => ({type:'wait',mode:'bus',timing:'frequency-estimated',fromStopId:null,toStopId:null,startSeconds:0,endSeconds:0,durationSeconds:0}));
  const railWaits = pool(LEG_CAP, () => ({type:'wait',fromStopId:null,toStopId:null,startSeconds:0,endSeconds:0,durationSeconds:0}));
  const storages = [labels,busLegs,railLegs,transferLegs,busWaits,railWaits];

  function release() {
    // Clear every graph reference, including unretained overflow legs, before
    // making any numeric chain IDs available to the next query.
    for (let i=0,end=Math.min(labels.used,labels.entries.length);i<end;i++) labels.entries[i].chain=0;
    legReferences.fill(null,0,chainCount);
    if (predecessors.length > CHAIN_CAP) {
      predecessors = new Uint32Array(CHAIN_CAP);
      legReferences = new Array(CHAIN_CAP);
    } else predecessors.fill(0,0,chainCount);
    chainCount = 0;
    for (let i=0,end=Math.min(busLegs.used,busLegs.entries.length);i<end;i++) busLegs.entries[i].pattern=null;
    for (let i=0,end=Math.min(railLegs.used,railLegs.entries.length);i<end;i++) railLegs.entries[i].trip=null;
    for (const storage of storages) storage.used=0;
  }
  function reset() { release(); }

  function label(stop,time,walk,boardings,externalSinceRide,chain,segment=-1,newlyBoarded=false) {
    const value=take(labels);
    value.stop=stop;
    value.time=time;
    value.walk=walk;
    value.boardings=boardings;
    value.externalSinceRide=externalSinceRide;
    value.chain=chain ?? 0;
    value.segment=segment;
    value.newlyBoarded=newlyBoarded;
    return value;
  }
  function chain(previous,leg) {
    const predecessor = previous ?? 0;
    if (!Number.isInteger(predecessor) || predecessor < 0 || predecessor > chainCount) throw new RangeError('Chain predecessor is outside this query.');
    if (chainCount === 0xffffffff) throw new RangeError('Chain index exceeds Uint32 capacity.');
    if (chainCount === predecessors.length) {
      const capacity = predecessors.length*2;
      const grown = new Uint32Array(capacity);
      grown.set(predecessors);
      predecessors = grown;
      legReferences.length = capacity;
    }
    predecessors[chainCount] = predecessor;
    legReferences[chainCount] = leg;
    return ++chainCount;
  }
  const validChain = id => Number.isInteger(id) && id > 0 && id <= chainCount;
  function previous(id) { return validChain(id) ? predecessors[id-1] : 0; }
  function leg(id) { return validChain(id) ? legReferences[id-1] : null; }
  function busRide(previous,pattern,fromIndex,toIndex,startSeconds,endSeconds,serviceDate,boardingBasis,headwayField) {
    const leg=take(busLegs);
    leg.pattern=pattern;
    leg.fromIndex=fromIndex;
    leg.toIndex=toIndex;
    leg.startSeconds=startSeconds;
    leg.endSeconds=endSeconds;
    leg.serviceDate=serviceDate;
    leg.boardingBasis=boardingBasis;
    leg.headwayField=headwayField;
    return chain(previous,leg);
  }
  function railRide(previous,trip,fromStopId,toStopId,startSeconds,endSeconds,serviceDate) {
    const leg=take(railLegs);
    leg.trip=trip;
    leg.fromStopId=fromStopId;
    leg.toStopId=toStopId;
    leg.startSeconds=startSeconds;
    leg.endSeconds=endSeconds;
    leg.serviceDate=serviceDate;
    return chain(previous,leg);
  }
  function transfer(previous,edge,startSeconds,endSeconds) {
    const leg=take(transferLegs);
    leg.fromStopId=edge.fromStopId;
    leg.toStopId=edge.toStopId;
    leg.startSeconds=startSeconds;
    leg.endSeconds=endSeconds;
    leg.durationSeconds=edge.seconds;
    leg.walkingSeconds=edge.walkSeconds;
    leg.allowanceSeconds=edge.seconds-edge.walkSeconds;
    leg.provenance=edge.provenance;
    leg.pathId=edge.pathId;
    leg.assumed=edge.assumed===true;
    return chain(previous,leg);
  }
  function wait(previous,stop,start,end,isBus) {
    const leg=take(isBus ? busWaits : railWaits);
    leg.fromStopId=stop;
    leg.toStopId=stop;
    leg.startSeconds=start;
    leg.endSeconds=end;
    leg.durationSeconds=end-start;
    return chain(previous,leg);
  }
  return {reset,release,label,chain,previous,leg,busRide,railRide,transfer,wait};
}
