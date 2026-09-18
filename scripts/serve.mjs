import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {stat} from 'node:fs/promises';
import {appendFile} from 'node:fs/promises';
import path from 'node:path';
import {LocalSharingStore} from '../server/providers-local.js';
import {runSharingMaintenance} from '../server/sharing.js';
const workerPath=`${process.cwd()}/dist/server/index.js`;
let worker,modified;
async function currentWorker(){const m=(await stat(workerPath)).mtimeMs;if(m!==modified){worker=(await import(`${pathToFileURL(workerPath)}?v=${m}`)).default;modified=m;}return worker;}
const port=Number(process.env.PORT??4173);
const sharingDatabase=path.resolve(process.env.SHARING_SQLITE_PATH??'.local-data/sharing.sqlite');
const store=new LocalSharingStore(sharingDatabase);
const environment={...process.env,SHARING_STORE:store};
if(process.env.PUSH_TRANSPORT==='test')environment.PUSH_TEST_TRANSPORT=async(_subscription,event)=>{
  await appendFile(path.join(path.dirname(sharingDatabase),'push-test.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600});
  return {status:201};
};
// A genuine server timer drains the durable outbox and retention queue even with
// every browser closed. Production uses the Worker's scheduled handler instead.
const maintenance=setInterval(()=>runSharingMaintenance(environment).catch(()=>{}),60000);
maintenance.unref();
await runSharingMaintenance(environment);
const server=http.createServer(async(req,res)=>{
  try {
    let body;
    if(!['GET','HEAD'].includes(req.method)){
      const parts=[];let size=0;
      for await(const part of req){size+=part.length;if(size>49152){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Request is too large');return;}parts.push(part);}
      body=Buffer.concat(parts);
    }
    // Do not trust a caller-supplied Cloudflare/IP header on the local server.
    const headers={...req.headers,'cf-connecting-ip':req.socket.remoteAddress??'local'};
    const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,body});
    const response=await (await currentWorker()).fetch(request,environment,{});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'Cache-Control':'no-store'});res.end('Server error');}
});
server.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`Commute Copilot: http://localhost:${port}`));
function close(){clearInterval(maintenance);server.close(()=>{store.close();process.exit(0);});}
process.on('SIGINT',close);process.on('SIGTERM',close);
