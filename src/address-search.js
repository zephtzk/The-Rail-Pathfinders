// Explicit searches only. The endpoint may be replaced with a self-hosted Photon
// service. This client caches results only in page memory; Photon may keep
// operational request logs. Personal saved-place labels are never sent.
export const ADDRESS_SEARCH_ENDPOINT='https://photon.komoot.io/api/';
export const ADDRESS_SEARCH_BOUNDS=[103.535,1.144,104.502,1.494];
const text=(value,max=180)=>typeof value==='string'?value.trim().slice(0,max):'';
export function normalizeAddressResults(payload){
  if(!payload||payload.type!=='FeatureCollection'||!Array.isArray(payload.features))throw Error('The address service returned an unreadable response. Please try again.');
  const seen=new Set();
  return payload.features.slice(0,30).flatMap(feature=>{
    const p=feature?.properties,g=feature?.geometry;
    if(!p||text(p.countrycode).toUpperCase()!=='SG'||g?.type!=='Point'||!Array.isArray(g.coordinates))return [];
    const [lng,lat]=g.coordinates,[west,south,east,north]=ADDRESS_SEARCH_BOUNDS;
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lng<west||lng>east||lat<south||lat>north)return [];
    if(!['N','W','R'].includes(p.osm_type)||!Number.isSafeInteger(p.osm_id)||p.osm_id<=0)return [];
    const sourceId=`photon:osm:${p.osm_type}:${p.osm_id}`;
    if(seen.has(sourceId))return [];seen.add(sourceId);
    const street=[text(p.housenumber),text(p.street)].filter(Boolean).join(' ');
    const parts=[text(p.name),street,text(p.district),text(p.postcode),'Singapore'].filter(Boolean);
    const address=[...new Set(parts)].join(', ').slice(0,300);
    if(!text(p.name)&&!street)return [];
    return [{id:sourceId,label:(text(p.name)||street).slice(0,80),address,lat,lng,sourceId,routingId:null,stationId:null,entranceId:null,coverage:'unknown',accessibility:'unknown'}];
  }).slice(0,6);
}
export function createAddressSearch({fetcher=globalThis.fetch,endpoint=ADDRESS_SEARCH_ENDPOINT,clock=Date.now,minIntervalMs=1500,timeoutMs=8000}={}){
  const cache=new Map();let generation=0,controller=null,lastRequest=-Infinity;
  const cancel=()=>{generation++;controller?.abort();controller=null;};
  async function search(value){
    cancel();const version=generation,query=text(value,161);
    if(query.length<2||query.length>160)throw Error('Enter an address or place name between 2 and 160 characters.');
    const key=query.toLocaleLowerCase();
    if(cache.has(key))return structuredClone(cache.get(key));
    if(clock()-lastRequest<minIntervalMs)throw Error('Please wait a moment before searching again.');
    const url=new URL(endpoint);if(url.protocol!=='https:')throw Error('Address search requires a secure service connection.');
    url.searchParams.set('q',query);url.searchParams.set('countrycode','SG');url.searchParams.set('bbox',ADDRESS_SEARCH_BOUNDS.join(','));url.searchParams.set('limit','6');url.searchParams.set('lang','en');
    const requestController=new AbortController();controller=requestController;lastRequest=clock();
    const timer=setTimeout(()=>requestController.abort(),timeoutMs);
    try{
      const response=await fetcher(url.href,{signal:requestController.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
      if(version!==generation)return null;
      if(!response.ok)throw Error(response.status===429?'Address search is busy. Please wait and try again.':'Address search is unavailable. Please try again later or choose a station below.');
      const results=normalizeAddressResults(await response.json());
      if(version!==generation)return null;
      cache.set(key,results);if(cache.size>30)cache.delete(cache.keys().next().value);
      return structuredClone(results);
    }catch(error){
      if(version!==generation)return null;
      if(requestController.signal.aborted)throw Error('Address search took too long. Check your connection and try again.');
      if(error instanceof TypeError)throw Error('Address search could not connect. Check your connection and try again.');
      throw error;
    }finally{clearTimeout(timer);if(version===generation)controller=null;}
  }
  return {search,cancel};
}
