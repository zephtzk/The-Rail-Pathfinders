import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function checkRailImport() {
  const manifest=JSON.parse(await readFile('public/data/rail-manifest.json','utf8'));
  const inputs=[
    ['data/rail/sources/lta-train-2026-09-18.zip',manifest.source.archiveSha256],
    ['data/rail/sources/lta-train-2026-09-18.json',manifest.source.metadataSha256],
    ['data/rail/validation.json',manifest.rules.sha256],
    ['scripts/import-rail.py',manifest.importer.sha256],
    ['public/data/rail-network.json',manifest.sizes.networkSha256],
  ];
  for(const [file,expected] of inputs) {
    if(!expected || hash(await readFile(file))!==expected) throw Error(`Rail import is stale or inconsistent: ${file}. Run npm run import:rail and review coverage before building.`);
  }
  return manifest;
}
