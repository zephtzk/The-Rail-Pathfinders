import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {NEARBY_FACILITIES, FACILITIES_COVERAGE} from '../src/nearby-facilities-data.js';
import {FIXTURE_LAYOUT} from '../src/facility-data.js';

const dataRoot = new URL('../data/facilities/', import.meta.url);
const readJson = file => JSON.parse(readFileSync(new URL(file, dataRoot), 'utf8'));
const manifest = readJson('source-manifest.json');
const facts = readJson('sbs-station-facts.json');
const exitFeatures = readJson('lta-mrt-exits.geojson').features;
const parkFeatures = readJson('nparks-central-nature-reserve.geojson').features;
const exits = new Map(exitFeatures.map(feature => [String(feature.properties.OBJECTID), feature]));
const parks = new Map(parkFeatures.map(feature => [String(feature.properties.OBJECTID), feature]));
const railArchive = readFileSync(new URL(manifest.railSource.file, dataRoot));
const railMetadata = readJson(manifest.railSource.metadata);
const exitUrl = 'https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view';
const parkUrl = 'https://data.gov.sg/datasets/d_19a87bbb86b2c14601a1745076812438/view';
const railUrl = 'https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html';
const stationEntries = NEARBY_FACILITIES.filter(entry => entry.stationName);
const parkEntries = NEARBY_FACILITIES.filter(entry => !entry.stationName);
const normalizeName = value => value.toLowerCase().replaceAll(' ', '');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const geoPosition = feature => ({lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0]});
const rowDate = value => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
const key = (station, exit) => `${station}|${exit ?? ''}`;

// Read the retained GTFS archive directly, without a network request, Python or
// an extra dependency. This bounded reader supports its stored/deflated ZIP entries.
function readZipEntry(bytes, target) {
  let end = bytes.length - 22;
  const minimum = Math.max(0, bytes.length - 65557);
  while (end >= minimum && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= minimum, 'GTFS ZIP has an end-of-central-directory record');
  let offset = bytes.readUInt32LE(end + 16);
  const count = bytes.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50, 'GTFS central directory entry');
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === target) {
      const method = bytes.readUInt16LE(offset + 10);
      const compressedSize = bytes.readUInt32LE(offset + 20);
      const expectedSize = bytes.readUInt32LE(offset + 24);
      const local = bytes.readUInt32LE(offset + 42);
      assert.equal(bytes.readUInt32LE(local), 0x04034b50, 'GTFS local file header');
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      const compressed = bytes.subarray(start, start + compressedSize);
      assert.ok(method === 0 || method === 8, 'Expected stored or deflated GTFS content');
      const contents = method === 8 ? inflateRawSync(compressed) : compressed;
      assert.equal(contents.length, expectedSize, 'GTFS entry has its declared uncompressed length');
      return contents.toString('utf8');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.fail(`Retained GTFS ZIP is missing ${target}`);
}

function csvRecords(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i <= text.length; i++) {
    const char = text[i] ?? '\n';
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (char === '\n') {
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
      }
    } else cell += char;
  }
  assert.equal(quoted, false, 'GTFS CSV does not end inside a quoted field');
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((name, i) => [name, values[i]])));
}

const stopRows = csvRecords(readZipEntry(railArchive, 'stops.txt'));
const stops = new Map(stopRows.map(row => [row.stop_id, row]));
const stationFacts = new Map(facts.stationFacts.map(fact => [fact.sourceUrl, fact]));

test('retained facility source files and GTFS match their recorded provenance hashes', () => {
  for (const source of manifest.sources) {
    const bytes = readFileSync(new URL(source.file, dataRoot));
    assert.equal(bytes.length, source.bytes, source.file);
    assert.equal(sha256(bytes), source.sha256, source.file);
    assert.equal(source.signedUrlRetained, false, source.file);
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.search, '', 'Manifest retains public page URLs, not signed download URLs');
  }
  assert.equal(sha256(railArchive), manifest.railSource.sha256);
  assert.equal(manifest.railSource.sha256, railMetadata.sha256);
  assert.equal(manifest.checkedAt, facts.checkedAt);
});

test('every facility coordinate and location date exactly matches its retained official record', () => {
  const counts = {exits: 0, gtfs: 0, nparks: 0};
  for (const entry of NEARBY_FACILITIES) {
    const source = entry.coordinateSource;
    assert.equal(source.recordId, entry.coordinateRecord, entry.id);
    let expectedPosition, expectedDate;
    if (source.url === exitUrl) {
      const feature = exits.get(source.recordId);
      assert.ok(feature, `${entry.id}: retained LTA exit`);
      expectedPosition = geoPosition(feature);
      expectedDate = rowDate(feature.properties.FMEL_UPD_D);
      counts.exits++;
    } else if (source.url === parkUrl) {
      const feature = parks.get(source.recordId);
      assert.ok(feature, `${entry.id}: retained NParks point`);
      assert.match(feature.properties.BUILD_NAME, /toilet/i);
      expectedPosition = geoPosition(feature);
      expectedDate = rowDate(feature.properties.FMEL_UPD_D);
      counts.nparks++;
    } else {
      assert.equal(source.url, railUrl, `${entry.id}: supported coordinate authority`);
      const row = stops.get(source.recordId);
      assert.ok(row, `${entry.id}: retained GTFS stop`);
      expectedPosition = {lat: Number(row.stop_lat), lng: Number(row.stop_lon)};
      expectedDate = new Date(railMetadata.lastModified).toISOString().slice(0, 10);
      counts.gtfs++;
    }
    assert.deepEqual(entry.position, expectedPosition, entry.id);
    assert.equal(source.sourceTime, expectedDate, entry.id);
    assert.equal(source.checkedAt, manifest.checkedAt, entry.id);
    assert.ok(entry.position.lat > 1.1 && entry.position.lat < 1.5, entry.id);
    assert.ok(entry.position.lng > 103.5 && entry.position.lng < 104.1, entry.id);
  }
  assert.deepEqual(counts, {exits: 136, gtfs: 28, nparks: 18});
});

test('every station lift has operator evidence for its exact exit and an associated official exit pin', () => {
  for (const entry of stationEntries.filter(item => item.kind === 'lift')) {
    const fact = stationFacts.get(entry.source.url);
    assert.ok(fact, `${entry.id}: retained station-page facts`);
    assert.equal(fact.stationName, entry.stationName, entry.id);
    assert.ok(fact.liftExitGroups.includes(entry.exit), `${entry.id}: operator names this exit`);
    assert.equal(entry.coordinateAccuracy, 'site', entry.id);
    assert.equal(entry.coordinateReference, 'exit', entry.id);
    const referenceExit = entry.exit.split('/')[0];
    if (entry.coordinateSource.url === exitUrl) {
      const feature = exits.get(entry.coordinateRecord);
      const allowedStations = [`${entry.stationName.toUpperCase()} MRT STATION`];
      if (entry.stationName === 'Punggol') allowedStations.push('PUNGGOL LRT STATION');
      assert.ok(allowedStations.includes(feature.properties.STATION_NA), entry.id);
      assert.equal(feature.properties.EXIT_CODE.replace(/^Exit /, ''), referenceExit, entry.id);
    } else {
      const row = stops.get(entry.coordinateRecord);
      assert.equal(row.location_type, '2', `${entry.id}: GTFS entrance, not a platform`);
      assert.equal(row.stop_name, referenceExit, entry.id);
      assert.equal(normalizeName(stops.get(row.parent_station).stop_name), normalizeName(entry.stationName), entry.id);
    }
    assert.match(entry.locationNote, /exact lift doorway.*not mapped/i, entry.id);
  }
});

test('operator-listed lift groups are included once or explicitly excluded without guessed coordinates', () => {
  const declared = new Set(facts.stationFacts.flatMap(fact => fact.liftExitGroups.map(exit => key(fact.stationName, exit))));
  const omitted = new Set(facts.omittedLiftExits.map(item => key(item.station, item.exit)));
  assert.deepEqual([...omitted].sort(), ['Bukit Panjang|A1', 'Bukit Panjang|C', 'Dhoby Ghaut|G']);
  for (const value of omitted) assert.ok(declared.delete(value), `Excluded exit had operator evidence: ${value}`);
  const included = stationEntries.filter(entry => entry.kind === 'lift').map(entry => key(entry.stationName, entry.exit));
  assert.equal(new Set(included).size, included.length, 'Shared DTL/NEL pages do not duplicate a lift');
  assert.deepEqual([...new Set(included)].sort(), [...declared].sort());
  for (const value of omitted) assert.ok(!included.includes(value), value);
});

test('station toilet zones and levels are backed by operator facts and are never precise doorway pins', () => {
  const declared = new Set(facts.stationFacts.filter(fact => fact.toilets.listed).flatMap(fact =>
    (fact.toilets.nearExits.length ? fact.toilets.nearExits : [null]).map(exit => key(fact.stationName, exit))));
  const included = [];
  for (const entry of stationEntries.filter(item => item.kind === 'toilet')) {
    const fact = stationFacts.get(entry.source.url);
    assert.ok(fact?.toilets.listed, entry.id);
    assert.equal(fact.stationName, entry.stationName, entry.id);
    assert.equal(entry.floor, fact.toilets.level, entry.id);
    assert.ok(fact.toilets.nearExits.length ? fact.toilets.nearExits.includes(entry.exit) : entry.exit === null, entry.id);
    assert.equal(entry.coordinateAccuracy, 'site', entry.id);
    assert.ok(['exit', 'station'].includes(entry.coordinateReference), entry.id);
    assert.match(entry.locationNote, /exact toilet doorway.*not mapped/i, entry.id);
    if (entry.coordinateReference === 'exit') {
      const namedExit = entry.coordinateSource.url === exitUrl
        ? exits.get(entry.coordinateRecord).properties.EXIT_CODE.replace(/^Exit /, '')
        : stops.get(entry.coordinateRecord).stop_name;
      assert.equal(namedExit, entry.exit, entry.id);
    } else {
      const row = stops.get(entry.coordinateRecord);
      assert.ok(['0', '1'].includes(row.location_type), entry.id);
      assert.equal(normalizeName(row.stop_name), normalizeName(entry.stationName), entry.id);
    }
    included.push(key(entry.stationName, entry.exit));
  }
  assert.equal(new Set(included).size, included.length, 'Shared DTL/NEL descriptions are deduplicated');
  assert.deepEqual(included.sort(), [...declared].sort());
});

test('NParks coverage contains every and only named toilet point in the retained dataset', () => {
  const expected = parkFeatures.filter(feature => /toilet/i.test(feature.properties.BUILD_NAME));
  assert.deepEqual(parkEntries.map(entry => entry.coordinateRecord).sort(), expected.map(feature => String(feature.properties.OBJECTID)).sort());
  for (const entry of parkEntries) {
    assert.equal(entry.kind, 'toilet');
    assert.equal(entry.coordinateAccuracy, 'point');
    assert.equal(entry.coordinateReference, 'facility');
    assert.equal(entry.source.url, parkUrl);
    assert.equal(entry.source.sourceTime, entry.coordinateSource.sourceTime);
    assert.match(entry.locationNote, /source does not name this park/i);
    assert.ok(entry.name.includes(entry.coordinateRecord));
  }
});

test('station identities include all real interchange codes and a primary code for the operator line', () => {
  for (const entry of stationEntries) {
    const fact = stationFacts.get(entry.source.url);
    const named = stopRows.filter(row => ['0', '1'].includes(row.location_type) && normalizeName(row.stop_name) === normalizeName(entry.stationName));
    const expectedCodes = [...new Set(named.map(row => row.stop_code))].sort();
    assert.deepEqual([...entry.stationCodes].sort(), expectedCodes, entry.id);
    assert.equal(new Set(entry.stationCodes).size, entry.stationCodes.length, entry.id);
    assert.ok(entry.stationCodes.includes(entry.stationCode), entry.id);
    assert.ok(entry.stationCode.startsWith(fact.line === 'DTL' ? 'DT' : 'NE'), entry.id);
    const url = new URL(entry.source.url);
    assert.equal(url.hostname, 'www.sbstransit.com.sg');
    assert.equal(url.searchParams.get('Station'), fact.operatorCode);
    assert.equal(url.searchParams.get('TrainLine'), fact.line);
  }
});

test('Bayfront interchange codes and Punggol paired MRT/LRT exits retain their distinct associations', () => {
  const bayfront = stationEntries.filter(entry => entry.stationName === 'Bayfront');
  assert.equal(bayfront.length, 5);
  for (const entry of bayfront) {
    assert.equal(entry.stationCode, 'DT16');
    assert.deepEqual([...entry.stationCodes].sort(), ['CC34', 'DT16']);
  }
  const punggol = stationEntries.filter(entry => entry.stationName === 'Punggol' && entry.kind === 'lift');
  assert.deepEqual(punggol.map(entry => entry.exit).sort(), ['A/B', 'C/D']);
  for (const entry of punggol) {
    const feature = exits.get(entry.coordinateRecord);
    assert.equal(feature.properties.EXIT_CODE, entry.exit === 'A/B' ? 'Exit A' : 'Exit C');
    assert.equal(feature.properties.STATION_NA, entry.exit === 'A/B' ? 'PUNGGOL MRT STATION' : 'PUNGGOL LRT STATION');
    assert.deepEqual([...entry.stationCodes].sort(), ['NE17', 'PTC']);
  }
  const bukitPanjang = stationEntries.filter(entry => entry.stationName === 'Bukit Panjang' && entry.kind === 'lift');
  assert.equal(bukitPanjang.length, 1);
  assert.equal(bukitPanjang[0].exit, 'B');
  const bukitPanjangExit = exits.get(bukitPanjang[0].coordinateRecord);
  assert.equal(bukitPanjangExit.properties.STATION_NA, 'BUKIT PANJANG MRT STATION', 'Do not substitute Bukit Panjang LRT Exit B');
  assert.equal(bukitPanjangExit.properties.EXIT_CODE, 'Exit B');
});

test('directory entries never fabricate provider IDs, operating observations, accessibility or fixture evidence', () => {
  const fixtureIds = new Set([...FIXTURE_LAYOUT.facilities, ...FIXTURE_LAYOUT.toilets, ...FIXTURE_LAYOUT.nodes].map(item => item.id));
  for (const entry of NEARBY_FACILITIES) {
    assert.ok(!fixtureIds.has(entry.id), entry.id);
    assert.doesNotMatch(entry.id, /fixture|training/i);
    assert.equal(entry.verification, 'source-listed', entry.id);
    assert.equal(entry.operatingStatus, 'unknown', entry.id);
    for (const field of ['providerLiftId', 'status', 'report', 'validUntil', 'verifiedAt', 'fetchedAt', 'fixture']) {
      assert.equal(Object.hasOwn(entry, field), false, `${entry.id}: ${field}`);
    }
    for (const field of ['wheelchair', 'paidArea', 'openingHours', 'feeCents']) assert.equal(entry[field], null, `${entry.id}: ${field}`);
    assert.equal(entry.source.checkedAt, facts.checkedAt, entry.id);
    assert.match(entry.source.sourceTimeNote, /no (?:publication date or )?current operating observation|no operating observation/i, entry.id);
    if (entry.stationName) assert.equal(entry.source.sourceTime, null, 'Operator review date is not a source publication date');
    assert.equal(new URL(entry.source.url).protocol, 'https:');
    assert.equal(entry.coordinateSource.license, 'Singapore Open Data Licence v1.0');
    assert.equal(entry.coordinateSource.licenseUrl, 'https://data.gov.sg/open-data-licence');
  }
});

test('coverage totals and duplicate handling agree with the documented sourced directory', () => {
  assert.equal(NEARBY_FACILITIES.length, 182);
  assert.equal(new Set(NEARBY_FACILITIES.map(entry => entry.id)).size, 182);
  assert.equal(NEARBY_FACILITIES.filter(entry => entry.kind === 'lift').length, 112);
  assert.equal(NEARBY_FACILITIES.filter(entry => entry.kind === 'toilet').length, 70);
  assert.equal(parkEntries.length, 18);
  assert.equal(new Set(stationEntries.map(entry => entry.stationName)).size, 50);
  assert.equal(facts.stationFacts.length, 52);
  assert.equal(FACILITIES_COVERAGE.facilityCount, 182);
  assert.equal(FACILITIES_COVERAGE.stationCount, 50);
  assert.equal(FACILITIES_COVERAGE.checkedAt, manifest.checkedAt);
  for (const station of ['Chinatown', 'Little India']) {
    assert.equal(stationEntries.filter(entry => entry.stationName === station && entry.kind === 'toilet').length, 2, station);
  }
  assert.match(FACILITIES_COVERAGE.description, /partial/i);
  const docs = readFileSync(new URL('../docs/FR1_FACILITIES_SOURCES.md', import.meta.url), 'utf8');
  assert.match(docs, /182 source-listed locations/);
  assert.match(docs, /112 lift exit locations and 70 toilet locations/);
});
