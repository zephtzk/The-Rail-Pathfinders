import {mkdir,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {checkRailImport} from './check-rail-import.mjs';
import {checkBusImport} from './check-bus-import.mjs';
import {checkWalking} from './check-walking.mjs';
await checkRailImport();
await checkBusImport();
await checkWalking();
await mkdir('dist/client/vendor',{recursive:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await cp('public','dist/client',{recursive:true});await cp('src','dist/client/src',{recursive:true});
for(const name of ['leaflet.js','leaflet.css'])await cp(`node_modules/leaflet/dist/${name}`,`dist/client/vendor/${name}`);
await cp('node_modules/leaflet/LICENSE','dist/client/vendor/leaflet-LICENSE.txt');
await cp('node_modules/qrcode-generator/dist/qrcode.mjs','dist/client/vendor/qrcode.mjs');
await cp('node_modules/qrcode-generator/dist/qrcode.js','dist/client/vendor/qrcode.js');
for(const file of await readdir('server'))if(file.endsWith('.js'))await cp('server/'+file,'dist/server/'+file);
await mkdir('dist/migrations',{recursive:true});
await cp('migrations','dist/migrations',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
// Sites provisions the logical D1 binding and applies the packaged Drizzle journal.
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const assets={};
async function collect(dir,prefix=''){for(const ent of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const rel=`${prefix}/${ent.name}`,file=path.join(dir,ent.name);if(ent.isDirectory())await collect(file,rel);else assets[rel]={body:await readFile(file,'utf8'),type:types[path.extname(file)]??'text/plain'};}}
await collect('dist/client');
delete assets['/data/application-build.json']; // Previous build identity must not hash itself.
const busAdapter=await readFile('server/bus-adapter.js','utf8');
const serverAdapter=await readFile('server/adapter.js','utf8');
let upgradeServer='';for(const file of (await readdir('server')).sort())if(file.endsWith('.js'))upgradeServer+=await readFile('server/'+file,'utf8');
const codeHash=createHash('sha256').update(JSON.stringify(assets)).update(busAdapter).update(serverAdapter).update(upgradeServer).digest('hex');
const identity=JSON.stringify({schemaVersion:1,applicationSha256:codeHash,railNetworkSha256:JSON.parse(assets['/data/rail-manifest.json'].body).sizes.networkSha256,busNetworkSha256:JSON.parse(assets['/data/bus-manifest.json'].body).networkSha256,walkingSha256:createHash('sha256').update(assets['/data/walking-links.json'].body).digest('hex')});
assets['/data/application-build.json']={type:'application/json',body:identity};
await writeFile('dist/client/data/application-build.json',identity);
const hash=codeHash.slice(0,12);
assets['/sw.js'].body=assets['/sw.js'].body.replace("const CACHE='commute-copilot-v1'",`const CACHE='commute-copilot-v1-${hash}'`);
assets['/sw.js'].body=assets['/sw.js'].body.replace(/^const SHELL=.*$/m,'const SHELL='+JSON.stringify(Object.keys(assets).filter(p=>p!=='/sw.js').concat('/'))+';');
await writeFile('dist/client/sw.js',assets['/sw.js'].body);
// Keep the canonical JSON in dist/client; embed a compressed copy in the Worker.
// This reduces the actual first-load transfer, rather than reporting a hypothetical gzip size.
const busNetwork=JSON.parse(assets['/data/bus-network.json'].body);
for(const name of ['/data/rail-network.json','/data/bus-network.json','/data/walking-links.json']){
 const asset=assets[name],compressed=gzipSync(asset.body,{level:9,mtime:0});
 compressed[9]=255; // Canonical gzip OS marker; Windows and Linux embed identical headers.
 assets[name]={type:asset.type,gzip:compressed.toString('base64')};
}
const live=await readFile('src/live-data.js','utf8');
const adapter=live+'\n'+serverAdapter.replace(/^import .*from '\.\.\/src\/live-data\.js';\r?\n/m,'')+'\n'+busAdapter+`\nconst pilotBusAdapter=createBusAdapter({patterns:${JSON.stringify(busNetwork.patterns)},allowedStopCodes:${JSON.stringify(busNetwork.stops.map(s=>s.id))}});`;
const worker=`import {createAddressAdapter} from './address-adapter.js';\nconst addressAdapter=createAddressAdapter();\nimport {handleSharingApi,runSharingMaintenance} from './sharing.js';\nimport {createFacilityAdapter} from './facility-adapter.js';\nconst facilityAdapter=createFacilityAdapter();\n${adapter}\nconst assets=${JSON.stringify(assets)};\nexport default {async scheduled(controller,env,ctx){ctx.waitUntil(runSharingMaintenance(env));},async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname.startsWith('/api/address/'))return addressAdapter(request,env);if(url.pathname.startsWith('/api/shares')||url.pathname.startsWith('/api/push/'))return handleSharingApi(request,env,ctx);if(url.pathname==='/api/facilities'){if(request.method!=='GET')return json({error:'Method not allowed'},405);return json(await facilityAdapter(env));}if(url.pathname==='/api/bus-arrivals'){if(request.method!=='GET')return json({error:'Method not allowed'},405);return json(await pilotBusAdapter(url.searchParams.get('stop'),env));}if(url.pathname.startsWith('/api/'))return handleApi(request,env);const asset=assets[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const headers={'Content-Type':asset.type,'Cache-Control':url.pathname==='/sw.js'?'no-cache':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'geolocation=(self),camera=(),microphone=()'};let body=asset.body;if(asset.gzip){headers.Vary='Accept-Encoding';const bytes=Uint8Array.from(atob(asset.gzip),c=>c.charCodeAt(0));if((request.headers.get('Accept-Encoding')??'').split(',').some(part=>{const [name,...params]=part.trim().toLowerCase().split(';');if(name.trim()!=='gzip')return false;const q=params.find(p=>p.trim().startsWith('q='));const quality=q?Number(q.trim().slice(2)):1;return quality>0&&quality<=1;})){headers['Content-Encoding']='gzip';body=bytes;}else{body=new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));}}return new Response(request.method==='HEAD'?null:body,{headers});}};\n`;
await writeFile('dist/server/index.js',worker);console.log(`Built ${Object.keys(assets).length} local assets and Worker (${Math.round(Buffer.byteLength(worker)/1024)} KB).`);
