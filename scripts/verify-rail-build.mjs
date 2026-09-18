import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import worker from '../dist/server/index.js';
const expected=await readFile('public/data/rail-network.json','utf8');
const checks=[];
for(const [accept,gzip] of [['gzip, deflate, br',true],['identity',false],['gzip;q=0',false],['gzip;q=0 , br',false],['gzip;q=0.5',true]]){
 const response=await worker.fetch(new Request('http://localhost/data/rail-network.json',{headers:{'Accept-Encoding':accept}}),{},{});
 assert.equal(response.headers.get('Content-Encoding'),gzip?'gzip':null);
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(gzip?gunzipSync(bytes).toString():bytes.toString(),expected);
 checks.push({acceptEncoding:accept,contentEncoding:response.headers.get('Content-Encoding')??'identity',bytes:bytes.length,status:'PASS'});
}
const url=process.env.TEST_BASE_URL??'http://127.0.0.1:4175';
const response=await fetch(url+'/data/rail-network.json',{headers:{'Accept-Encoding':'gzip'}});
assert.equal(response.headers.get('Content-Encoding'),'gzip');assert.equal(await response.text(),expected);
checks.push({name:'Local HTTP server forwards compression negotiation; downloaded data equals canonical import',status:'PASS'});
await mkdir('docs/evidence/phase2',{recursive:true});
await writeFile('docs/evidence/phase2/build.json',JSON.stringify({recordedAt:new Date().toISOString(),checks},null,2)+'\n');
console.log(`PASS ${checks.length} build/HTTP checks.`);
