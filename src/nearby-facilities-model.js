export const NEARBY_RADIUS_METERS = 1000;

const EARTH_RADIUS_METERS = 6371000;
const STATUS_MAX_AGE_MS = 15 * 60 * 1000;
const LTA_SOURCE_URL = 'https://datamall2.mytransport.sg/ltaodataservice/v2/FacilitiesMaintenance';
const validPosition = position => Boolean(position && Number.isFinite(position.lat) && Number.isFinite(position.lng) && Math.abs(position.lat) <= 90 && Math.abs(position.lng) <= 180);
const timestamp = value => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
const safeUrl = value => typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value) ? value : null;
const isFixture = facility => Boolean(facility?.fixture || facility?.verification === 'fixture' || facility?.evidence === 'fixture' || facility?.coverage === 'fixture' || facility?.source?.verification === 'fixture' || /^fixture(?:-|$)/i.test(facility?.id ?? '') || /^fixture(?:-|$)/i.test(facility?.stationCode ?? '') || /^fixture(?:-|$)/i.test(facility?.stationId ?? '') || /\b(?:fixture|fictional)\b/i.test(facility?.source?.name ?? ''));

function distanceMeters(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians, dLng = (b.lng - a.lng) * radians;
  const chord = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, chord))));
}

// Straight-line proximity is discovery only; it does not establish an entrance
// route, opening hours or wheelchair access. Input records are never mutated.
export function nearbyFacilities(facilities, center, {kind = 'all', radiusMeters = NEARBY_RADIUS_METERS} = {}) {
  if (!Array.isArray(facilities) || !validPosition(center) || !Number.isFinite(radiusMeters) || radiusMeters < 0 || !['all', 'lift', 'toilet'].includes(kind)) return [];
  return facilities.filter(facility => facility && !isFixture(facility) && ['lift', 'toilet'].includes(facility.kind) && (kind === 'all' || facility.kind === kind) && validPosition(facility.position))
    .map(facility => ({...facility, distanceMeters: distanceMeters(center, facility.position)}))
    .filter(facility => facility.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || String(a.id ?? '').localeCompare(String(b.id ?? '')));
}

export function formatFacilityDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return 'Distance unknown';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function invalidTime(value, now) {
  return value != null && (!Number.isFinite(timestamp(value)) || timestamp(value) > now);
}

function freshFetched(record, now) {
  const fetched = timestamp(record?.fetchedAt);
  return Number.isFinite(fetched) && fetched <= now && now - fetched <= STATUS_MAX_AGE_MS;
}

function display({label = 'Status unknown', tone = 'unknown', detail, sourceTime = null, fetchedAt = null, stale = false, sourceUrl = null}) {
  return {label, tone, detail, sourceTime, fetchedAt, stale, sourceUrl};
}

function sourcedReport(facility, now, offline) {
  const report = facility?.report;
  if (!report || isFixture(report) || !['operator', 'survey'].includes(report.evidence) || !safeUrl(report.source?.url)) return null;
  const sourceTime = report.sourceTime ?? report.source?.sourceTime ?? null;
  const sourceAt = timestamp(sourceTime);
  const stale = offline || report.stale === true || !freshFetched(report, now) || !Number.isFinite(sourceAt) || sourceAt > now || now - sourceAt > STATUS_MAX_AGE_MS;
  const metadata = {sourceTime, fetchedAt: report.fetchedAt ?? null, stale, sourceUrl: safeUrl(report.source.url)};
  if (report.status === 'reported-unavailable') return display({
    ...metadata, tone: 'unavailable', label: stale ? 'Last reported unavailable · stale' : 'Reported unavailable',
    detail: stale ? 'A sourced report said this facility was unavailable. Current conditions are unknown; check with the operator.' : 'A sourced report says this facility is unavailable. Check with the operator before travelling.'
  });
  if (report.status === 'verified-available' && !stale && timestamp(report.validUntil) > now) return display({
    ...metadata, tone: 'available', label: facility.kind === 'toilet' ? 'Reported open' : 'Reported operating',
    detail: 'A recent sourced report confirms operation at the report time. Current access and toilet occupancy are not guaranteed.'
  });
  return display({...metadata, stale: true, tone: 'warning', label: 'Unknown / stale', detail: 'The sourced availability report has expired or cannot be dated reliably. Current operation is unconfirmed.'});
}

// /api/facilities is an outage-only feed. It cannot confirm that an unlisted
// lift operates, and a station name or description is never an ID mapping.
// Optional facility.report uses the existing report vocabulary plus an explicit
// source URL; only a recent operator/survey report may say "reported operating".
export function nearbyFacilityStatus(facility, snapshot, {now = Date.now(), offline = false} = {}) {
  if (!facility || isFixture(facility) || !['lift', 'toilet'].includes(facility.kind)) return display({detail: 'No real facility status is available.'});
  if (!Number.isFinite(now)) return display({detail: 'Current status cannot be dated reliably.', stale: true, tone: 'warning'});

  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  const mappedLift = facility.kind === 'lift' && typeof facility.providerLiftId === 'string' && facility.providerLiftId.trim() && typeof facility.stationCode === 'string' && facility.stationCode.trim();
  const matching = mappedLift ? records.filter(record => record && !isFixture(record) && record.stationCode === facility.stationCode && record.liftId === facility.providerLiftId && record.status === 'reported-unavailable') : [];
  if (matching.length) {
    const notice = matching[0];
    const sourceTime = notice.sourceTime ?? snapshot?.sourceTime ?? null;
    const stale = offline || snapshot.stale === true || snapshot.status !== 'available' || !freshFetched(snapshot, now) || invalidTime(sourceTime, now);
    return display({
      label: stale ? 'Last maintenance report · stale' : 'Reported maintenance', tone: 'unavailable', stale,
      detail: stale ? 'The last matching LTA report marked this lift unavailable for maintenance. Current conditions are unknown; check with the operator.' : 'LTA reports this exact station lift unavailable for maintenance. Check with the operator before travelling.',
      sourceTime, fetchedAt: snapshot.fetchedAt ?? null, sourceUrl: LTA_SOURCE_URL
    });
  }

  const report = sourcedReport(facility, now, offline);
  if (report) return report;
  // A reviewed station association supports a station-wide warning, never a
  // claim that this particular entrance lift is the one under maintenance.
  const stationCodes = new Set([facility.stationCode, ...(Array.isArray(facility.stationCodes) ? facility.stationCodes : [])].filter(code => typeof code === 'string' && code.trim()));
  const stationNotice = facility.kind === 'lift' ? records.find(record => record && !isFixture(record) && record.status === 'reported-unavailable' && stationCodes.has(record.stationCode)) : null;
  if (stationNotice) {
    const sourceTime = stationNotice.sourceTime ?? snapshot?.sourceTime ?? null;
    const stale = offline || snapshot.stale === true || snapshot.status !== 'available' || !freshFetched(snapshot, now) || invalidTime(sourceTime, now);
    return display({
      label: stale ? 'Last station notice · stale' : 'Station maintenance notice', tone: 'warning', stale,
      detail: stale ? 'The last LTA report mentioned lift maintenance at this station. This lift has not been matched; its current operation is unknown. Check with station staff.' : 'A lift-maintenance report exists at this station. This lift has not been matched; its operation is unknown. Check with station staff.',
      sourceTime, fetchedAt: snapshot.fetchedAt ?? null, sourceUrl: LTA_SOURCE_URL
    });
  }
  const offlineNote = offline ? ' Offline; current conditions cannot be checked.' : '';
  if (facility.kind === 'toilet') return display({
    label: 'Availability unknown', detail: 'No sourced current toilet availability report is available. The LTA maintenance feed covers lifts only.' + offlineNote, stale: offline
  });
  if (!mappedLift) return display({
    detail: 'Current operation of this lift is unconfirmed. Check station notices or ask staff.' + offlineNote, stale: offline
  });
  if (!snapshot) return display({detail: 'Lift maintenance has not been checked. Operation is unconfirmed.' + offlineNote, stale: offline});

  const stale = offline || snapshot.stale === true || (snapshot.fetchedAt != null && !freshFetched(snapshot, now)) || invalidTime(snapshot.sourceTime, now);
  const metadata = {sourceTime: snapshot.sourceTime ?? null, fetchedAt: snapshot.fetchedAt ?? null, sourceUrl: LTA_SOURCE_URL, stale};
  if (snapshot.error === 'not_configured') return display({...metadata, detail: 'Live lift maintenance is unavailable on this installation. Operation is unconfirmed.' + offlineNote});
  if (snapshot.status !== 'available' || snapshot.error) return display({
    ...metadata, label: stale ? 'Unknown / stale' : 'Status unknown', tone: stale ? 'warning' : 'unknown',
    detail: snapshot.status === 'partial' ? 'The maintenance feed is incomplete. Operation is unconfirmed.' + offlineNote : 'The maintenance check is unavailable. Operation is unconfirmed.' + offlineNote
  });
  if (!freshFetched(snapshot, now) || stale) return display({...metadata, stale: true, tone: 'warning', label: 'Unknown / stale', detail: 'The maintenance check is out of date or cannot be dated reliably. Operation is unconfirmed.' + offlineNote});
  const ambiguous = records.some(record => !record || !record.stationCode || (record.stationCode === facility.stationCode && !record.liftId));
  if (ambiguous || snapshot.complete === false || snapshot.possiblyTruncated || snapshot.invalidRecords > 0) return display({...metadata, detail: 'Unresolved or incomplete maintenance notices prevent a clear status for this lift. Operation is unconfirmed.'});
  return display({...metadata, label: 'Operation unconfirmed', detail: 'No matching maintenance report was found. Absence from the maintenance feed does not confirm operation.'});
}
