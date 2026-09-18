// Route search lives off the UI thread. Termination cancels work immediately,
// including a search currently inside synchronous timetable expansion.
export function createPlannerClient(data){
 let worker=null,sequence=0,pending=new Map(),ready;
 function stop(){worker?.terminate();worker=null;for(const p of pending.values())p.reject(new DOMException('Search cancelled','AbortError'));pending.clear();}
 function send(type,data,instance=worker){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});try{instance.postMessage({id,type,data});}catch(error){pending.delete(id);reject(error);}});}
 function start(){if(worker)return;worker=new Worker(new URL('./planner-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result??data.ready);};worker.onerror=()=>{for(const p of pending.values())p.reject(Error('Routing worker failed. Reload to retry.'));pending.clear();worker?.terminate();worker=null;};ready=send('init',data);ready.catch(()=>{});}
 return {async route(input){start();const instance=worker,initialized=ready;await initialized;if(worker!==instance)throw new DOMException('Search cancelled','AbortError');return send('route',input,instance);},cancel:stop,destroy:stop};
}
