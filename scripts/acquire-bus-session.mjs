/** Reuse an explicitly authorised local runtime without reading its credential. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const port=Number(process.argv[2]??4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port');
const target='dist/server/index.js',original=await readFile(target,'utf8'),nonce=randomBytes(24).toString('hex');
const moduleUrl=pathToFileURL(path.resolve('scripts/acquire-bus.mjs')).href+`?version=${Date.now()}`;
const evidenceModuleUrl=pathToFileURL(path.resolve('scripts/observe-bus-live.mjs')).href+`?version=${Date.now()}`;
const output=path.resolve('data/bus/sources');await mkdir(output,{recursive:true});
const marker='const url=new URL(request.url);';
if(!original.includes(marker))throw new Error('Expected local build entry point absent');
const handler=`if(url.pathname==='/__local_bus_acquisition_${nonce}'){if(request.method!=='POST'||url.hostname!=='127.0.0.1'||request.headers.get('Origin')||request.headers.get('Sec-Fetch-Site'))return new Response('Forbidden',{status:403});try{const {acquireBus}=await import(${JSON.stringify(moduleUrl)});const acquisition=await acquireBus(env.LTA_ACCOUNT_KEY,${JSON.stringify(output)});${process.argv.includes('--observe')?`const {observeBus}=await import(${JSON.stringify(evidenceModuleUrl)});const observations=await observeBus(env.LTA_ACCOUNT_KEY);return Response.json({acquisition,observations});`:'return Response.json(acquisition);'}}catch(e){return Response.json({error:e.name,message:'Bus acquisition failed; credential details omitted'},{status:502});}}`;
const temporary=original.replace(marker,marker+handler);
await writeFile(target,temporary);
try{
  const response=await fetch(`http://127.0.0.1:${port}/__local_bus_acquisition_${nonce}`,{method:'POST',signal:AbortSignal.timeout(300000)});
  const result=await response.json();console.log(JSON.stringify(result));if(!response.ok)process.exitCode=1;
  else{await mkdir('docs/evidence/phase3',{recursive:true});await writeFile('docs/evidence/phase3/bus-acquisition-repeat.json',JSON.stringify({kind:'real-api-repeat-acquisition',...result.acquisition??result},null,2)+'\n');}
}finally{
  // Do not overwrite another build performed concurrently.
  if(await readFile(target,'utf8')===temporary)await writeFile(target,original);
}
