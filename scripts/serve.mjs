import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {stat} from 'node:fs/promises';
const workerPath=`${process.cwd()}/dist/server/index.js`;
let worker,modified;
async function currentWorker(){const m=(await stat(workerPath)).mtimeMs;if(m!==modified){worker=(await import(`${pathToFileURL(workerPath)}?v=${m}`)).default;modified=m;}return worker;}
const port=Number(process.env.PORT??4173);
http.createServer(async(req,res)=>{try{const response=await (await currentWorker()).fetch(new Request(`http://${req.headers.host}${req.url}`,{method:req.method}),process.env,{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Server error');}}).listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`Commute Copilot: http://localhost:${port}`));
