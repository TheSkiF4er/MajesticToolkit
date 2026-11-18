/** Optional self-hosted, loopback-only OpenAI Responses API streaming gateway.
 * Start with OPENAI_API_KEY and MT_AI_GATEWAY_TOKEN in the Node process environment.
 * No credentials, prompts or replies are stored. Not a multi-user hosted service. */
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const DEFAULT_PORT = 32187;
const MAX_BODY = 12_000;
const MAX_QUESTION = 5_000;
const MAX_REPLY = 60_000;
const ORIGIN = /^(?:chrome-extension|moz-extension|safari-web-extension):\/\/[a-zA-Z0-9-]{6,128}$/;
const json = (res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
function safeEqual(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function config(env){
 const key=String(env.OPENAI_API_KEY||''),token=String(env.MT_AI_GATEWAY_TOKEN||'');
 if(!key.startsWith('sk-')||key.length<20)throw Error('OPENAI_API_KEY must be configured on the gateway, not in the extension');
 if(token.length<32||token.length>256||!/^[-._~a-zA-Z0-9]+$/.test(token))throw Error('MT_AI_GATEWAY_TOKEN must contain 32–256 random characters');
 const model=env.OPENAI_MODEL||'gpt-6-luna';if(!/^[\w.-]{3,80}$/.test(model))throw Error('Invalid OPENAI_MODEL');
 const allowed=Number(env.MT_AI_DAILY_LIMIT||30);if(!Number.isInteger(allowed)||allowed<1||allowed>1000)throw Error('Invalid MT_AI_DAILY_LIMIT');
 return {key,token,model,dailyLimit:allowed};
}
function normalizeOrigin(request){
 const origin=request.headers.origin||'';
 return typeof origin==='string'&&ORIGIN.test(origin)?origin:'';
}
function readJson(req){return new Promise((resolve,reject)=>{
 let size=0,parts=[];
 req.on('data',part=>{size+=part.length;if(size>MAX_BODY){reject(Object.assign(Error('Payload too large'),{status:413}));req.destroy();return;}parts.push(part);});
 req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{reject(Object.assign(Error('Invalid JSON'),{status:400}));}});
 req.on('error',reject);
 });}
function emit(res,event,payload){if(!res.writableEnded&&!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);}
async function* sseFrames(stream,signal){
 const decoder=new TextDecoder();let pending='';let seen=0;
 for await(const chunk of stream){if(signal.aborted)break;seen+=chunk.length;if(seen>4_000_000)throw Error('OpenAI stream exceeded size limit');pending+=decoder.decode(chunk,{stream:true});pending=pending.replace(/\r\n/g,'\n');
  while(true){const i=pending.indexOf('\n\n');if(i<0)break;const block=pending.slice(0,i);pending=pending.slice(i+2);
   const data=block.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(data&&data!=='[DONE]'){let value;try{value=JSON.parse(data);}catch{throw Error('Malformed upstream SSE');}yield value;}
  }
 }
}
export function createGateway({env=process.env,fetchImpl=globalThis.fetch,clock=()=>Date.now()}={}){
 const cfg=config(env);const requests=[];let active=0;
 const server=http.createServer(async(req,res)=>{
  const origin=normalizeOrigin(req);
  // Reject web pages and opaque/null origins, even when a bearer token is provided.
  if(!origin){json(res,403,{error:'Extension origin required'});return;}
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age','300');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(!safeEqual(String(req.headers.authorization||''),`Bearer ${cfg.token}`)){json(res,401,{error:'Gateway token rejected'});return;}
  if(req.method==='GET'&&req.url==='/health'){
   const day=clock()-86_400_000;while(requests.length&&requests[0]<day)requests.shift();
   json(res,200,{ok:true,provider:'OpenAI Responses API',model:cfg.model,remaining:Math.max(0,cfg.dailyLimit-requests.length),dailyLimit:cfg.dailyLimit,maxOutputTokens:700});return;
  }
  if(req.method!=='POST'||req.url!=='/v1/chat'){json(res,404,{error:'Not found'});return;}
  if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'JSON required'});return;}
  let input;try{input=await readJson(req);}catch(e){if(!res.destroyed)json(res,e.status||400,{error:e.message});return;}
  if(!input||Object.keys(input).some(k=>k!=='question')||typeof input.question!=='string'||!input.question.trim()||input.question.length>MAX_QUESTION){json(res,400,{error:'A text question of up to 5000 characters is required'});return;}
  const now=clock();while(requests.length&&requests[0]<now-86_400_000)requests.shift();
  if(requests.length>=cfg.dailyLimit||requests.filter(n=>n>now-60_000).length>=4||active>=2){json(res,429,{error:'Gateway rate limit; retry later'});return;}
  requests.push(now);active++;
  const ctl=new AbortController();let finished=false;const abort=()=>{if(!finished)ctl.abort();};res.on('close',abort);
  const stop=setTimeout(abort,60_000);
  try{
   const response=await fetchImpl('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:`Bearer ${cfg.key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:cfg.model,store:false,stream:true,max_output_tokens:700,
      instructions:'You are an optional assistant inside MajesticToolkit. Answer only the user-provided text. No access to hidden application records. Do not assume you saw files or game events. Respond in the language of the question.',
      input:[{role:'user',content:[{type:'input_text',text:input.question.trim()}]}]}),signal:ctl.signal
   });
   if(!response.ok){const status=[400,401,403,404,408,422,429].includes(response.status)?response.status:502;json(res,status,{error:response.status===429?'OpenAI rate limit':'OpenAI request failed',upstreamStatus:response.status});return;}
   if(!response.body)throw Error('Empty upstream stream');
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
   emit(res,'ready',{model:cfg.model});let length=0,completed=false;
   for await(const evt of sseFrames(response.body,ctl.signal)){
    if(evt.type==='response.output_text.delta'&&typeof evt.delta==='string'){
     length+=evt.delta.length;if(length>MAX_REPLY)throw Error('Response exceeded size limit');emit(res,'delta',{text:evt.delta});
    } else if(evt.type==='response.completed'){
     completed=true;emit(res,'complete',{usage:{inputTokens:Number(evt.response?.usage?.input_tokens||0),outputTokens:Number(evt.response?.usage?.output_tokens||0)}});
    } else if(evt.type==='response.failed'||evt.type==='response.incomplete'||evt.type==='error')throw Error('OpenAI response was not completed');
   }
   if(!ctl.signal.aborted&&!completed)throw Error('OpenAI stream ended early');
  }catch(e){if(res.headersSent)emit(res,'error',{error:ctl.signal.aborted?'Request cancelled or timed out':'Request failed; no reply was saved'});else if(!res.destroyed)json(res,ctl.signal.aborted?504:502,{error:'OpenAI stream unavailable'});
  }finally{finished=true;clearTimeout(stop);active--;if(!res.writableEnded&&!res.destroyed)res.end();}
 });
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const port=Number(process.env.MT_AI_PORT||DEFAULT_PORT);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid MT_AI_PORT');
  const server=createGateway();server.listen(port,'127.0.0.1',()=>console.log(`MajesticToolkit AI gateway ready at http://127.0.0.1:${port} (loopback only)`));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
