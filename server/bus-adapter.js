// BusArrival v3 is advisory. No prediction is propagated to downstream stops or routing.
const BUS_BASE = 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=';
const isoBus = ms => new Date(ms).toISOString();
const busCode = value => typeof value === 'string' && /^\d{5}$/.test(value);
const busTimestamp = value => {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [,year,month,day,hour,minute,second] = parts.map(Number);
  // Date.parse normalizes impossible dates (for example 30 February); validate
  // the provider's civil date before applying its explicit time-zone offset.
  const civil = new Date(0);
  civil.setUTCFullYear(year,month-1,day);
  civil.setUTCHours(0,0,0,0);
  return civil.getUTCFullYear() === year && civil.getUTCMonth() === month-1 && civil.getUTCDate() === day && hour < 24 && minute < 60 && second < 60;
};

const patternMatchKey = (service,operator,origin,destination,stop,visit) => JSON.stringify([service,operator,origin,destination,stop,visit]);
export function indexBusPatterns(patterns = []) {
  const index = new Map();
  for (const pattern of patterns) for (const stop of pattern.stops) {
    const key = patternMatchKey(pattern.serviceNo,pattern.operator,pattern.originCode,pattern.destinationCode,stop.stopId,stop.visitNumber);
    if (!index.has(key)) index.set(key,[]);
    index.get(key).push({patternId:pattern.id,direction:pattern.direction,sequence:stop.sequence});
  }
  return index;
}

export function normalizeBusArrivals(payload, stopCode, patterns = []) {
  if (!payload || payload.BusStopCode !== stopCode || !Array.isArray(payload.Services) || payload.Services.length > 100) throw Error('malformed');
  const index = patterns instanceof Map ? patterns : indexBusPatterns(patterns);
  let invalidRecords = 0, emptySlots = 0;
  const predictions = [];
  for (const service of payload.Services) {
    if (!service || typeof service.ServiceNo !== 'string' || !/^[A-Za-z\d]{1,12}$/.test(service.ServiceNo) || typeof service.Operator !== 'string' || !/^[A-Z]{2,8}$/.test(service.Operator)) { invalidRecords++; continue; }
    for (const slot of ['NextBus', 'NextBus2', 'NextBus3']) {
      const raw = service[slot];
      if (raw && raw.EstimatedArrival === '') { emptySlots++; continue; }
      if (!raw || !busCode(raw.OriginCode) || !busCode(raw.DestinationCode) || !busTimestamp(raw.EstimatedArrival) || ![0, 1].includes(raw.Monitored) || !/^[1-9]\d?$/.test(String(raw.VisitNumber))) { invalidRecords++; continue; }
      const matches = index.get(patternMatchKey(service.ServiceNo,service.Operator,raw.OriginCode,raw.DestinationCode,stopCode,Number(raw.VisitNumber))) ?? [];
      predictions.push({serviceNo:service.ServiceNo,operator:service.Operator,slot,stopCode,originCode:raw.OriginCode,destinationCode:raw.DestinationCode,visitNumber:Number(raw.VisitNumber),
        predictedArrival:raw.EstimatedArrival,predictionBasis:raw.Monitored === 1 ? 'vehicle-location-estimate' : 'operator-schedule',
        matchStatus:matches.length === 1 ? 'matched' : matches.length ? 'ambiguous' : 'unmatched',match:matches.length === 1 ? matches[0] : null});
    }
  }
  return {status:invalidRecords ? 'partial' : predictions.length ? 'available' : 'empty',stopCode,predictions,invalidRecords,emptySlots,providerTimestamp:null,
    limitation:'The provider supplies predicted arrivals but no observation/generation timestamp. Empty data does not establish that service has stopped. Predictions never change an accepted itinerary.'};
}

export function busPredictionState(prediction, feed, now = Date.now(), online = true) {
  if (!online) return 'offline';
  if (feed.status === 'unavailable') return 'unavailable';
  const retrieved = Date.parse(feed.retrievedAt), arrival = Date.parse(prediction.predictedArrival);
  if (!Number.isFinite(retrieved) || now < retrieved - 5000 || now - retrieved > 90000 || !Number.isFinite(arrival) || arrival <= now || arrival - now > 2 * 3600000) return 'expired';
  return prediction.matchStatus === 'matched' ? 'fresh' : prediction.matchStatus;
}

export function createBusAdapter({fetcher = fetch, clock = Date.now, timeoutMs = 6000, patterns = [], allowedStopCodes = []} = {}) {
  const allowed = new Set(allowedStopCodes), cache = new Map(), patternIndex = indexBusPatterns(patterns);
  let credential = null, generation = 0, active = 0, globalBackoffUntil = 0;
  return async function arrivals(stopCode, env = {}) {
    const now = clock(), key = typeof env.LTA_ACCOUNT_KEY === 'string' ? env.LTA_ACCOUNT_KEY.trim() : '';
    const unavailable = error => ({schemaVersion:1,status:'unavailable',error,stopCode,predictions:[],retrievedAt:null,providerTimestamp:null,checkedAt:isoBus(now)});
    if (!allowed.has(stopCode)) return unavailable('unsupported_stop');
    if (credential !== key) { cache.clear(); credential = key; generation++; globalBackoffUntil = 0; }
    if (!key) return unavailable('not_configured');
    const old = cache.get(stopCode);
    if (old?.pending) return structuredClone(await old.pending);
    if (old && now < old.nextAt) return structuredClone(old.result);
    if (now < globalBackoffUntil) return {...unavailable('backoff'),nextRefreshAt:isoBus(globalBackoffUntil)};
    if (active >= 2) return {...unavailable('busy'),nextRefreshAt:isoBus(now + 30000)};
    if (!cache.has(stopCode) && cache.size >= 40) {
      const evict = [...cache].find(([,entry]) => !entry.pending);
      if (evict) cache.delete(evict[0]);
      else return {...unavailable('busy'),nextRefreshAt:isoBus(now + 30000)};
    }
    const epoch = generation;
    const pending = (async () => {
      active++;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
      let result, nextAt = now + Math.min(600000,60000*2**Math.min(old?.failures??0,4));
      try {
        const response = await fetcher(BUS_BASE + stopCode, {headers:{AccountKey:key,accept:'application/json'},signal:controller.signal,redirect:'error'});
        if (!response.ok) {
          const error = [401,403].includes(response.status) ? 'authentication' : response.status === 429 ? 'rate_limited' : 'http_error';
          let delay = error === 'authentication' ? 300000 : 60000;
          if (response.status === 429) {
            const retry = response.headers.get('retry-after');
            const value = /^\d+$/.test(retry ?? '') ? Number(retry)*1000 : Date.parse(retry)-now;
            if (Number.isFinite(value)) delay = Math.max(delay, Math.min(value, 86400000));
          }
          nextAt = clock() + delay;
          if (epoch === generation && ['authentication','rate_limited'].includes(error)) globalBackoffUntil = nextAt;
          result = {...unavailable(error),httpStatus:response.status};
        } else {
          if (Number(response.headers.get('content-length')) > 262144) throw Error('malformed');
          const reader = response.body?.getReader(); if (!reader) throw Error('malformed');
          const chunks = []; let size = 0;
          try { while (true) { const {value,done} = await reader.read(); if (done) break; size += value.length; if (size > 262144) { await reader.cancel(); throw Error('malformed'); } chunks.push(value); } } finally { reader.releaseLock(); }
          const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
          let payload; try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw Error('malformed'); }
          const normalized = normalizeBusArrivals(payload,stopCode,patternIndex);
          result = {schemaVersion:1,...normalized,retrievedAt:isoBus(clock()),providerHttpDate:Number.isFinite(Date.parse(response.headers.get('date'))) ? new Date(response.headers.get('date')).toISOString() : null,error:null};
          nextAt = clock()+30000;
        }
      } catch (error) { result = unavailable(controller.signal.aborted ? 'timeout' : error.message === 'malformed' ? 'malformed' : 'network'); }
      finally { clearTimeout(timer); active--; }
      result.nextRefreshAt = isoBus(nextAt);
      result.lastSuccessfulRetrievalAt=result.retrievedAt??old?.lastGood?.retrievedAt??null;
      result.sourceValidity=null;
      result.cacheScope='per-process/isolate; not a distributed cache';
      if (epoch === generation) {
        cache.set(stopCode,{result,nextAt,lastGood:result.status==='unavailable'?old?.lastGood:result,failures:result.status==='unavailable'?(old?.failures??0)+1:0});
      }
      return result;
    })();
    cache.set(stopCode,{pending,lastGood:old?.lastGood,failures:old?.failures??0});
    return structuredClone(await pending);
  };
}
