import {mkdir,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {checkRailImport} from './check-rail-import.mjs';
await checkRailImport();
await mkdir('dist/client/vendor',{recursive:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await cp('public','dist/client',{recursive:true});await cp('src','dist/client/src',{recursive:true});
for(const name of ['leaflet.js','leaflet.css'])await cp(`node_modules/leaflet/dist/${name}`,`dist/client/vendor/${name}`);
await cp('node_modules/leaflet/LICENSE','dist/client/vendor/leaflet-LICENSE.txt');
await cp('.openai/hosting.json','dist/.openai/hosting.json');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const assets={};
async function collect(dir,prefix=''){for(const ent of await readdir(dir,{withFileTypes:true})){const rel=`${prefix}/${ent.name}`,file=path.join(dir,ent.name);if(ent.isDirectory())await collect(file,rel);else assets[rel]={body:await readFile(file,'utf8'),type:types[path.extname(file)]??'text/plain'};}}
await collect('dist/client');
const hash=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,12);
assets['/sw.js'].body=assets['/sw.js'].body.replace("const CACHE='commute-copilot-v1'",`const CACHE='commute-copilot-v1-${hash}'`);
await writeFile('dist/client/sw.js',assets['/sw.js'].body);
// Keep the canonical JSON in dist/client; embed a compressed copy in the Worker.
// This reduces the actual first-load transfer, rather than reporting a hypothetical gzip size.
const railAsset=assets['/data/rail-network.json'];
assets['/data/rail-network.json']={type:railAsset.type,gzip:gzipSync(railAsset.body,{level:9,mtime:0}).toString('base64')};
const live=await readFile('src/live-data.js','utf8');
const adapter=live+'\n'+(await readFile('server/adapter.js','utf8')).replace(/^import .*from '\.\.\/src\/live-data\.js';\r?\n/m,'');
const worker=`${adapter}\nconst assets=${JSON.stringify(assets)};\nexport default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return handleApi(request,env);const asset=assets[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const headers={'Content-Type':asset.type,'Cache-Control':url.pathname==='/sw.js'?'no-cache':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'geolocation=(),camera=(),microphone=()'};let body=asset.body;if(asset.gzip){headers.Vary='Accept-Encoding';const bytes=Uint8Array.from(atob(asset.gzip),c=>c.charCodeAt(0));if((request.headers.get('Accept-Encoding')??'').split(',').some(part=>{const [name,...params]=part.trim().toLowerCase().split(';');if(name.trim()!=='gzip')return false;const q=params.find(p=>p.trim().startsWith('q='));const quality=q?Number(q.trim().slice(2)):1;return quality>0&&quality<=1;})){headers['Content-Encoding']='gzip';body=bytes;}else{body=new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));}}return new Response(request.method==='HEAD'?null:body,{headers});}};\n`;
await writeFile('dist/server/index.js',worker);console.log(`Built ${Object.keys(assets).length} local assets and Worker (${Math.round(Buffer.byteLength(worker)/1024)} KB).`);
