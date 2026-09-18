import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve, relative, isAbsolute} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = data => createHash('sha256').update(data).digest('hex');

/** Read-only build gate. Path review and geometry checks live in verify-walking.py. */
export async function checkWalking() {
  const source = await readFile(resolve(root, 'data/bus/walking-links.json'));
  const published = await readFile(resolve(root, 'public/data/walking-links.json'));
  if (!source.equals(published)) throw new Error('Walking ledger source/public copies differ. Rebuild and review the walking ledger.');
  const ledger = JSON.parse(source);
  if (ledger.schemaVersion !== 1 || typeof ledger.version !== 'string' || !Array.isArray(ledger.links) || !Array.isArray(ledger.sources)) throw new Error('Invalid walking ledger schema.');
  const ids = new Set();
  for (const item of ledger.sources) {
    const path = resolve(root, item.file);
    const rel = relative(root, path);
    if (isAbsolute(rel) || rel.startsWith('..')) throw new Error(`Walking evidence escapes repository: ${item.id}`);
    if (ids.has(item.id)) throw new Error(`Duplicate walking source: ${item.id}`);
    ids.add(item.id);
    const data = await readFile(path);
    if (sha256(data) !== item.sha256) throw new Error(`Walking source hash mismatch: ${item.id}. A fresh source requires a new path review.`);
  }
  const linkIds = new Set();
  for (const link of ledger.links) {
    if (linkIds.has(link.id)) throw new Error(`Duplicate walking link: ${link.id}`);
    linkIds.add(link.id);
    if (!/^\d{5}$/.test(link.busStopId) || !link.sourceIds?.length || link.sourceIds.some(id => !ids.has(id))) throw new Error(`Invalid walking identity/provenance: ${link.id}`);
    if (link.evidenceLevel !== 'map-supported' || link.fieldSurveyed !== false || link.accessibility !== 'unknown') throw new Error(`Unsupported walking verification claim: ${link.id}`);
    if (link.directionality !== 'bidirectional' || !link.path?.waypoints?.length || !link.sourceUrls?.length) throw new Error(`Incomplete walking path: ${link.id}`);
    if (link.railAllowanceSeconds !== 120 || !Number.isFinite(link.externalSeconds) || link.externalSeconds <= 0) throw new Error(`Invalid walking time allowance: ${link.id}`);
  }
  return {version: ledger.version, linkCount: ledger.links.length, sourceCount: ledger.sources.length, sha256: sha256(source)};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await checkWalking(), null, 2));
}
