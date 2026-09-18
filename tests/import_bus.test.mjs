import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {acquireBus,ENDPOINTS} from '../scripts/acquire-bus.mjs';
const temporary=()=>mkdtemp(path.join(os.tmpdir(),'bus-import-test-'));
const noPause=async()=>{};

test('bus acquisition paginates through empty terminal pages and never persists key',async()=>{
  const directory=await temporary(),requests=[],secret='SYNTHETIC-KEY-NOT-A-CREDENTIAL';
  const fetchImpl=async(url,options)=>{
    const parsed=new URL(url),skip=Number(parsed.searchParams.get('$skip'));
    requests.push({endpoint:parsed.pathname.split('/').at(-1),skip});
    assert.equal(options.headers.AccountKey,secret);
    assert.equal(options.redirect,'error');
    return Response.json({value:skip===0?[{example:'licensed public metadata'}]:[]});
  };
  try{
    const result=await acquireBus(secret,directory,{fetchImpl,pause:noPause});
    assert.equal(requests.length,6);
    assert.deepEqual(requests.map(x=>x.skip),[0,500,0,500,0,500]);
    const metadata=JSON.parse(await readFile(path.join(result.directory,'metadata.json'),'utf8'));
    assert.equal(metadata.credentialPersisted,false);
    for(const endpoint of ENDPOINTS){
      assert.equal(metadata.datasets[endpoint].terminalEmptyPage,true);
      assert.equal(metadata.datasets[endpoint].rawCount,1);
      for(const page of metadata.datasets[endpoint].pages)assert.ok(!(await readFile(path.join(result.directory,page.file),'utf8')).includes(secret));
    }
    assert.ok(!JSON.stringify(metadata).includes(secret));
    const repeated=await acquireBus(secret,directory,{fetchImpl,pause:noPause});
    assert.equal(repeated.reusedExisting,true);
    assert.equal(repeated.version,result.version);
    assert.equal(repeated.repeatRequestCount,6);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('repeated nonempty page aborts instead of falsely claiming pagination complete',async()=>{
  const directory=await temporary();let requests=0;
  try{
    await assert.rejects(acquireBus('fixture',directory,{fetchImpl:async()=>{requests++;return Response.json({value:[{id:1}]});},pause:noPause}),/Repeated page/);
    assert.equal(requests,2);
    assert.equal((await readdir(directory)).length,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('authentication, rate limits, malformed and network failures stop safely without retry storms',async()=>{
  for(const response of [()=>new Response('',{status:401}),()=>new Response('',{status:403}),()=>new Response('',{status:429}),()=>Response.json({wrong:[]}),()=>Response.json({value:Array(501).fill({})}),()=>new Response('<html>Unavailable</html>'),()=>{throw new TypeError('Synthetic timeout');}]){
    const directory=await temporary();let requests=0;
    try{
      await assert.rejects(acquireBus('fixture',directory,{fetchImpl:async()=>{requests++;return response();},pause:noPause}));
      assert.equal(requests,1);
      assert.equal((await readdir(directory)).length,0);
    }finally{await rm(directory,{recursive:true,force:true});}
  }
});
