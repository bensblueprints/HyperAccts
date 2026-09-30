import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createAssistant,validateMessages} from './ai.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
export function createAppServer({port=4173,fetchProvider=fetch,assistant=createAssistant()}={}){
const token=randomBytes(32).toString('hex');
const secrets=new Map();
const allowedFiles=new Set(['index.html','styles.css','app.mjs','api-client.mjs','domain.mjs','market.mjs','connectors.mjs','README.md','docs/PRODUCT.md','docs/AUDIT.md','docs/ARCHITECTURE.md','audit-evidence.json']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
function send(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req,limit=16384){let chunks=[],length=0;for await(const chunk of req){length+=chunk.length;if(length>limit)throw new Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function validToken(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))return false;return timingSafeEqual(Buffer.from(value),Buffer.from(token));}
const server=http.createServer(async(req,res)=>{
  const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
  if(!hosts.includes(req.headers.host))return send(res,403,{ok:false,message:'Invalid local host.'});
  if(req.headers.origin&&!hosts.map(h=>'http://'+h).includes(req.headers.origin))return send(res,403,{ok:false,message:'Same-origin requests only.'});
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  try{
    if(req.method==='GET'&&url.pathname==='/api/session')return send(res,200,{csrf:token});
    if(req.method==='GET'&&url.pathname==='/api/ai/status')return send(res,200,await assistant.status());
    if(req.method==='POST'&&url.pathname==='/api/ai/chat'){
      if(!validToken(req.headers['x-hyperaccts-token']))return send(res,403,{ok:false,message:'Refresh HyperAccts and retry.'});
      const input=await body(req,65536);
      let messages;
      try{messages=validateMessages(input?.messages);}catch(error){return send(res,400,{ok:false,message:error.message});}
      try{return send(res,200,await assistant.chat(messages));}
      catch(error){return send(res,502,{ok:false,message:error.message});}
    }
    if(req.method==='GET'&&url.pathname==='/api/pva/status'){
      try{
        const [platforms,campaigns]=await Promise.all(['/platform/list','/campaign/list'].map(async route=>{const r=await fetch('http://127.0.0.1:52636/api'+route,{signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw new Error('Legacy API request failed');return r.json();}));
        if(!platforms.isSuccess||!campaigns.isSuccess)throw new Error('Legacy API returned an error');
        return send(res,200,{ok:true,platforms:(platforms.data||[]).map(p=>({name:p.DisplayName||p.Name,status:p.Status})),campaignCount:(campaigns.data||[]).length});
      }catch{return send(res,200,{ok:false,message:'PVA Creator could not be reached on its local API. Open PVA Creator and try again.'});}
    }
    if(req.method==='POST'&&['/api/connectors/2captcha/check','/api/connectors/smspva/check','/api/connectors/daisysms/check'].includes(url.pathname)){
      if(!validToken(req.headers['x-hyperaccts-token']))return send(res,403,{ok:false,message:'Refresh HyperAccts and retry.'});
      const input=await body(req);
      const provider=url.pathname.split('/')[3];
      const savedSecret=input.credentialRef&&secrets.get(input.credentialRef);
      const existing=savedSecret?.provider===provider?savedSecret.apiKey:null;
      const apiKey=(typeof input.apiKey==='string'?input.apiKey.trim():'')||existing||process.env['HYPERACCTS_'+provider.toUpperCase()+'_KEY'];
      if(!apiKey||!/^[-_a-zA-Z0-9]{16,256}$/.test(apiKey))return send(res,400,{ok:false,message:'Enter a valid provider API key. Keys are kept in server memory only.'});
      try{
        let balance;
        if(provider==='2captcha'){
          const r=await fetchProvider('https://api.2captcha.com/getBalance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientKey:apiKey}),signal:AbortSignal.timeout(12000),redirect:'error'});
          if(!r.ok)return send(res,200,{ok:false,message:`2Captcha returned HTTP ${r.status}.`});
          const data=await r.json();
          if(data.errorId!==0||!Number.isFinite(Number(data.balance)))return send(res,200,{ok:false,message:'2Captcha did not accept the balance request. Check the key and account status.',code:typeof data.errorCode==='string'?data.errorCode.replace(/[^A-Z0-9_]/g,'').slice(0,80):'PROVIDER_ERROR'});
          balance=Number(data.balance);
        }else{
          const endpoint=new URL(provider==='daisysms'?'https://daisysms.io/stubs/handler_api.php':'https://smspva.com/stubs/handler_api.php');endpoint.searchParams.set('action',provider==='daisysms'?'getBalance':'getbalance');endpoint.searchParams.set('api_key',apiKey);
          const r=await fetchProvider(endpoint,{signal:AbortSignal.timeout(12000),redirect:'error'});
          const response=await r.text();const match=/^ACCESS_BALANCE:([0-9]+(?:\.[0-9]+)?)\s*$/.exec(response.trim());
          if(!r.ok||!match)return send(res,200,{ok:false,message:'The SMS provider did not accept the balance request. Check the API key and compatibility with its handler API.'});
          balance=Number(match[1]);
        }
        const credentialRef=existing===apiKey?input.credentialRef:randomUUID();secrets.set(credentialRef,{provider,apiKey});
        return send(res,200,{ok:true,credentialRef,balance,checkedAt:new Date().toISOString(),message:'Provider connection verified. No number was purchased and no CAPTCHA task was submitted.'});
      }catch{return send(res,200,{ok:false,message:'Could not reach the provider. Check your connection and retry.'});}
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{ok:false,message:'Method not supported.'});
    let name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    if(!allowedFiles.has(name))return send(res,404,{ok:false,message:'Not found.'});
    const bytes=await readFile(path.join(root,name));
    res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){send(res,error.message==='Request too large'?413:400,{ok:false,message:'The request could not be processed.'});}
});
server.on('close',()=>secrets.clear());
return server;
}
export async function startServer(port=4173){
  const server=createAppServer({port});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4173);
  const server=await startServer(port);
  console.log(`HyperAccts is ready at http://127.0.0.1:${port}`);
  process.on('SIGTERM',()=>server.close());
}
