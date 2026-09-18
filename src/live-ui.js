import {LIVE_LINES,LIVE_STATIONS,crowdFreshness,offsetTime} from './live-data.js';
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bands=Object.assign(Object.create(null),{l:'Low',m:'Moderate',h:'High',NA:'Unknown'});
export function sourceDate(value) {
  const ms=offsetTime(value);return ms===null?'Time unavailable':new Date(ms).toLocaleString('en-SG',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Singapore'})+' SGT';
}
function errorText(feed) {
  return ({not_configured:'Live connection not configured.',authentication:'Live source authentication failed.',rate_limited:'Source rate limit reached; waiting before retry.',timeout:'Source request timed out.',malformed:'Source returned an unreadable response.',network:'Source could not be reached.',http_error:'Source request failed.'})[feed?.error]??'Source unavailable.';
}
function received(feed,now) {
  const time=offsetTime(feed?.retrievedAt);
  return time===null?'Not retrieved':time>now?'Retrieval clock is ahead; timing unconfirmed':`Retrieved ${sourceDate(feed.retrievedAt)}${now-time>120000?' · last known report':''}`;
}
export function renderLive(feed,{online=true,requestFailed=false,now=Date.now()}={}) {
  const n=feed?.notices,segments=n?.segments??[],relevant=segments.filter(s=>s.relevance==='corridor'),lineOnly=segments.filter(s=>s.relevance==='line');
  const elsewhere=segments.filter(s=>s.relevance==='elsewhere').length;
  const available=online&&!requestFailed&&n&&n.status!=='unavailable';
  const providerStatus=n?.serviceStatus===1?'Normal service or minor delays reported':n?.serviceStatus===2?'Disruption or major delays reported':'Service status unavailable';
  const statusTime=offsetTime(n?.retrievedAt),recent=available&&statusTime!==null&&statusTime<=now&&now-statusTime<=120000;
  const noticeSummary=!feed?'Checking live information…':!online?'Offline · saved source information only':requestFailed?'Connection failed · saved source information only':n?.status==='unavailable'?errorText(n):n?.status==='missing'?'Some expected notice fields are missing.':n?.status==='partial'?'Some notice records could not be read.':n?.status==='empty'?'Valid empty notice list returned.':`${n?.items?.length??0} source advisories returned.`;
  const notices=`<div class="live-heading"><h3>Service notices</h3><span class="tag">${!online?'Offline':!available?'Unavailable':recent?'Source connected':'Last known'}</span></div>
    <p role="status">${html(noticeSummary)}</p><p class="live-meta">${html(received(n,now))}</p>
    ${n?.serviceStatus?`<p>${recent?'':'Last retrieved status: '}${providerStatus}. This is a network report; it is not a corridor all-clear.</p>`:''}
    ${relevant.length?`<ul class="notice-segments">${relevant.map(s=>`<li><b>${html(s.line)} · ${html(s.codes.join(', '))}</b><br>Direction: ${html(s.direction??'not supplied')} · applicability time not supplied. Informational only.</li>`).join('')}</ul>`:''}
    ${lineOnly.length?`<p>Line advisories: ${html([...new Set(lineOnly.map(s=>s.line))].join(', '))}. Affected corridor stations are unconfirmed.</p>`:''}
    ${elsewhere?`<p class="live-meta">${elsewhere} structured segment${elsewhere===1?'':'s'} outside this corridor omitted.</p>`:''}
    ${segments.some(s=>s.relevance==='unmapped')?'<p class="live-meta">Some affected segments could not be mapped. Corridor relevance is unconfirmed.</p>':''}
    ${(n?.items??[]).length?`<details class="live-advisories"><summary>General source advisories · corridor relevance unconfirmed (${n.items.length})</summary><p class="live-meta">The source does not link these messages to individual affected segments. Validity and route impact are unconfirmed.</p>${n.items.map(a=>`<article><p>${html(a.text)}</p><p class="live-meta">Source time: ${html(a.sourceTime??'not supplied')}${a.sourceTime&&offsetTime(a.sourceTime)===null?' · timezone or format unconfirmed':''}. Expiry not supplied.</p></article>`).join('')}</details>`:''}`;
  const crowd=LIVE_LINES.map(line=>{
    const source=feed?.crowding?.lines?.find(l=>l.line===line),sourceOk=online&&!requestFailed&&['available','partial'].includes(source?.status);
    let currentCount=0;
    const rows=LIVE_STATIONS.filter(s=>s.line===line).map(station=>{
      const row=source?.records?.find(r=>r.code===station.code),timing=crowdFreshness(row,now);
      const retrieval=offsetTime(source?.retrievedAt),sourceStart=offsetTime(row?.startTime),clockOkay=retrieval!==null&&retrieval<=now&&sourceStart!==null&&sourceStart<=retrieval;
      const current=timing==='current'&&sourceOk&&clockOkay;
      if(current)currentCount++;
      const state=current?'Current interval':timing==='expired'?'Expired':timing==='future'?'Future interval · unavailable':timing==='current'&&!clockOkay?'Source timing unconfirmed':timing==='current'?'Saved report · not live':'Unknown';
      const interval=row?.startTime&&row?.endTime?`${sourceDate(row.startTime)} – ${sourceDate(row.endTime)}`:'Reporting interval unavailable';
      const expired=timing==='expired'?` · ended ${Math.max(0,Math.floor((now-offsetTime(row.endTime))/60000))} min ago`:'';
      return `<li class="station-report ${current?'current':'not-current'}" data-station-code="${station.code}" data-freshness="${timing}"><div><b>${html(station.name)} <span class="live-meta">${station.code}</span></b><span class="crowd-band">${current?html(bands[row.level]):'Current crowding unavailable'}</span></div><p>${state}${row&&!current&&bands[row.level]?` · last reported ${html(bands[row.level].toLowerCase())}`:''}</p><small>${html(interval+expired)}</small></li>`;
    }).join('');
    return `<details class="crowd-line"><summary>${line} station reports <span class="live-meta">· ${!online?'Offline':source?.status==='unavailable'?'Source unavailable':source?.status==='empty'?'No reports returned':currentCount?`${currentCount} current`:'No current reports'}</span></summary><p class="live-meta">${html(received(source,now))}${source?.status==='empty'?' · valid empty response':source?.status==='unavailable'?' · '+html(errorText(source)):''}</p><ul class="station-reports">${rows}</ul></details>`;
  }).join('');
  return `<section id="live-panel" class="live-panel" aria-label="Live corridor information"><div class="section-title"><div><span class="eyebrow">LTA DATAMALL · EXISTING CORRIDOR</span><h2>Live information</h2></div><button id="refresh-live" class="secondary" ${!online?'disabled':''}>Check source</button></div>
    <p class="live-boundary">For current conditions only. Your displayed journey times, preferences and route recommendations remain <b>replay calculations</b>, even when the journey date differs from today.</p>
    ${notices}<div class="live-heading"><h3>Station crowding</h3><span class="tag">Station level</span></div>
    <p>Only a valid, unexpired reporting interval is labelled current. Expired or unknown bands do not influence your route. Station bands do not describe a carriage, door or available seat.</p>${crowd}
    <p class="live-meta">Observation instant is not supplied separately from the crowd reporting interval. Source interval, upstream retrieval and this device’s receipt are distinct.</p>
    ${feed?.clientReceivedAt?`<p class="live-meta">Device received ${html(sourceDate(feed.clientReceivedAt))}. Receipt does not renew source freshness.</p>`:''}
    <p class="live-meta">Data: LTA DataMall — TrainServiceAlerts and Station Crowd Density Real Time. Access dates are shown above. Available under the <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noreferrer">Singapore Open Data Licence v1.0</a>. No live timetable routing.</p></section>`;
}
