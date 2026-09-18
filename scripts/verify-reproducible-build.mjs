// Export the committed source without checkout line-ending conversion, then rebuild.
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=process.cwd(),out=path.resolve(process.env.CAPTURE_DIR??'test-results/readiness-candidate');
await mkdir(path.join(root,'test-results'),{recursive:true});
const scratch=await mkdtemp(path.join(root,'test-results','source-export-')),exported=path.join(scratch,'source');
await mkdir(exported);await mkdir(out,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
execFileSync('git',['archive','--format=tar','--output='+path.join(scratch,'source.tar'),sourceCommit],{windowsHide:true});
execFileSync('tar',['-xf',path.join(scratch,'source.tar'),'-C',exported],{windowsHide:true});
// Reuse the two shipped dependencies' locked installed bytes;
// this verifies clean source/export reproducibility, not a new registry download.
await cp(path.join(root,'node_modules/leaflet'),path.join(exported,'node_modules/leaflet'),{recursive:true});
await cp(path.join(root,'node_modules/qrcode-generator'),path.join(exported,'node_modules/qrcode-generator'),{recursive:true});
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:exported,windowsHide:true});
const records=[];
for(const file of ['dist/client/data/application-build.json','dist/server/index.js']){
 const local=await readFile(path.join(root,file)),fresh=await readFile(path.join(exported,file));assert.deepEqual(fresh,local,file+' matches clean committed export');
 records.push({file,sha256:sha(fresh),status:'PASS'});
}
const report={recordedAt:new Date().toISOString(),sourceCommit,node:process.version,zlib:process.versions.zlib,status:'PASS',scope:'Clean Git archive build using the same locked installed Leaflet, QR encoder and Node/zlib runtime; not a Linux runtime execution or fresh registry install',records};
await writeFile(path.join(out,'reproducible-build.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
