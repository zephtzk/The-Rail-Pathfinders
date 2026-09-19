import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {handleSharingApi} from '../server/sharing.js';

test('Sites migration initializes the configured D1 binding and a fresh handler reads the invitation',async t=>{
  const hosting=JSON.parse(await readFile(new URL('../.openai/hosting.json',import.meta.url),'utf8'));
  assert.equal(hosting.d1,'SHARING_DB');
  const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  const database=new DatabaseSync(':memory:');t.after(()=>database.close());
  for(const entry of journal.entries)database.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`,import.meta.url),'utf8'));
  const env=()=>({[hosting.d1]:{prepare(sql){return {bind(...args){return {
    first:async()=>database.prepare(sql).get(...args),
    run:async()=>({meta:{changes:database.prepare(sql).run(...args).changes}}),
  };}};}}});
  const response=await handleSharingApi(new Request('https://deployment.test/api/shares',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({plan:{schemaVersion:2,origin:{label:'Synthetic origin'},destination:{label:'Synthetic destination'}}}),
  }),env());
  assert.equal(response.status,201);
  const created=await response.json();
  const review=await handleSharingApi(new Request(`https://deployment.test/api/shares/${created.id}`,{
    headers:{Authorization:`Bearer ${created.inviteToken}`},
  }),env());
  assert.equal(review.status,200);
  assert.equal((await review.json()).proposedPlan.destination.label,'Synthetic destination');
  assert.throws(()=>database.prepare('INSERT INTO sharing_state VALUES(?,?,?)').run('invalid',0,'{}'),/CHECK/);
  assert.throws(()=>database.prepare('INSERT INTO sharing_state VALUES(?,?,?)').run('invalid',1,'not json'),/CHECK/);
});
