import {createMultimodalRouter} from './multimodal-engine.js';
let router;
self.onmessage=event=>{const {id,type,data}=event.data;try{if(type==='init'){router=createMultimodalRouter(...data);self.postMessage({id,ready:true});}else{if(!router)throw Error('Routing data is not ready.');self.postMessage({id,result:router.route(data)});}}catch(error){self.postMessage({id,error:error.message});}};
