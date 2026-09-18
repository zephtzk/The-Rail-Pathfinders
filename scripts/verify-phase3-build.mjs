import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import worker from '../dist/server/index.js';
const results=[];
for(const name of ['rail-network','bus-network','walking-links'])for(const gzip of [true,false]){
  const response=await worker.fetch(new Request(`http://localhost/data/${name}.json`,{headers:{'Accept-Encoding':gzip?'gzip':'identity'}}),{},{});
  const bytes=Buffer.from(await response.arrayBuffer()),expected=await readFile(`public/data/${name}.json`);
  assert.deepEqual(gzip?gunzipSync(bytes):bytes,expected);assert.equal(response.headers.get('Content-Encoding'),gzip?'gzip':null);
  results.push({name:`${name}: ${gzip?'gzip':'identity'} matches pinned bytes`,status:'PASS'});
}
for(const [path,error] of [['/api/bus-arrivals?stop=81111','not_configured'],['/api/bus-arrivals?stop=99999','unsupported_stop']]){
  const response=await worker.fetch(new Request(`http://localhost${path}`),{},{});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).error,error);results.push({name:error+' at built API with no credential or external request',status:'PASS'});
}
const response=await worker.fetch(new Request('http://localhost/api/bus-arrivals?stop=81111',{method:'POST'}),{},{});assert.equal(response.status,405);results.push({name:'built bus endpoint is GET-only',status:'PASS'});
const code=await readFile('dist/server/index.js','utf8');assert.ok(!code.includes('__local_bus_acquisition_'));results.push({name:'temporary acquisition handler absent from delivered Worker',status:'PASS'});
const applicationBuild=JSON.parse(await readFile('dist/client/data/application-build.json'));
await writeFile('docs/evidence/phase3/build.json',JSON.stringify({recordedAt:new Date().toISOString(),applicationBuild,results},null,2));console.log(`PASS ${results.length} Phase3 build checks`);
