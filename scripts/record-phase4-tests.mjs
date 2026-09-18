import {spawnSync} from 'node:child_process';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const unitFiles=(await readdir('tests')).filter(n=>n.endsWith('.test.mjs')).map(n=>'tests/'+n),commands=[];
for(const [exe,args] of [[process.execPath,['--test','--test-reporter=tap',...unitFiles]],['python',['-m','unittest','discover','-s','tests','-p','test_import_rail.py']],['python',['-m','unittest','discover','-s','tests','-p','test_import_bus.py']],['python',['-m','unittest','discover','-s','tests','-p','test_walking_metadata.py']]]){
 const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true}),output=r.stdout+r.stderr;
 const count=Number(output.match(/# tests (\d+)/)?.[1]??output.match(/Ran (\d+) test/)?.[1]);
 commands.push({command:exe===process.execPath?'node '+args.slice(0,2).join(' ')+' tests/*.test.mjs':exe+' '+args.join(' '),exitCode:r.status,status:r.status===0?'PASS':'FAIL',testCount:count,output});
 console.log(JSON.stringify({status:commands.at(-1).status,tests:count,command:commands.at(-1).command}));
 if(r.status!==0)process.exitCode=1;
}
await writeFile('docs/evidence/phase4/tests.json',JSON.stringify({recordedAt:new Date().toISOString(),evidenceClass:'deterministic synthetic and pinned-data regressions; not real-provider validation',applicationBuild:JSON.parse(await readFile('dist/client/data/application-build.json')),workerSha256:createHash('sha256').update(await readFile('dist/server/index.js')).digest('hex'),commands},null,2));
