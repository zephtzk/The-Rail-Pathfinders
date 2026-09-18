// Reuse the existing authorised localhost runtime. Never extract its key.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
const target='dist/server/index.js',original=await readFile(target,'utf8'),nonce=randomBytes(24).toString('hex');
const marker='const url=new URL(request.url);';
if(!original.includes(marker))throw Error('Expected local runtime unavailable');
const script=path.resolve('scripts/probe-phase4.py');
const handler=`if(url.pathname==='/__phase4_${nonce}'){if(request.method!=='POST'||url.hostname!=='127.0.0.1'||request.headers.get('Origin')||request.headers.get('Sec-Fetch-Site'))return new Response('Forbidden',{status:403});try{const {execFile}=await import('node:child_process');const result=await new Promise((resolve,reject)=>execFile('python',[${JSON.stringify(script)}],{env,timeout:115000,windowsHide:true,maxBuffer:1024*1024},(error,stdout)=>error?reject(error):resolve(stdout)));return new Response(result);}catch{return Response.json({error:'Probe failed; credential and payload omitted'},{status:502});}}`;
const temporary=original.replace(marker,marker+handler);await writeFile(target,temporary);
try{
  const response=await fetch(`http://127.0.0.1:4173/__phase4_${nonce}`,{method:'POST',signal:AbortSignal.timeout(120000)});
  console.log(await response.text());if(!response.ok)process.exitCode=1;
  const observations=[];
  for(const endpoint of ['/api/status','/api/bus-arrivals?stop=81119','/api/bus-arrivals?stop=81111']) {
    const r=await fetch('http://127.0.0.1:4173'+endpoint,{signal:AbortSignal.timeout(10000)}),d=await r.json();
    observations.push({endpoint,httpStatus:r.status,checkedAt:d.checkedAt??new Date().toISOString(),status:d.status,
      notices:d.notices?{status:d.notices.status,retrievedAt:d.notices.retrievedAt,serviceStatus:d.notices.serviceStatus,items:d.notices.items?.length,segments:d.notices.segments?.length,error:d.notices.error}:undefined,
      retrievedAt:d.retrievedAt,providerTimestamp:d.providerTimestamp,predictionCount:d.predictions?.length,unmatchedCount:d.predictions?.filter(p=>p.matchStatus!=='matched').length,predictions:d.predictions?.filter(p=>p.matchStatus==='matched').slice(0,6).map(p=>({serviceNo:p.serviceNo,matchStatus:p.matchStatus,match:p.match,predictedArrival:p.predictedArrival,predictionBasis:p.predictionBasis})),error:d.error});
  }
  await mkdir('docs/evidence/phase4',{recursive:true});await writeFile('docs/evidence/phase4/live-real.json',JSON.stringify({evidenceClass:'real-provider bounded adapter samples',recordedAt:new Date().toISOString(),observations},null,2));
}finally{if(await readFile(target,'utf8')===temporary)await writeFile(target,original);}
