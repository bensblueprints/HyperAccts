import {randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createStore} from './runtime-store.mjs';
import {createAuth} from './runtime-auth.mjs';
import {createMarketplace} from './runtime-market.mjs';
import {createEngine} from './workflow-engine.mjs';
import {connectionOrigin} from './workflow-http.mjs';
import {problem} from './workflow-schema.mjs';

async function readBody(req,limit=1200000){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>limit)throw problem('Request exceeds the size limit.',413);chunks.push(c);}return Buffer.concat(chunks);}
export async function createRuntime({directory=process.env.HYPERACCTS_DATA_DIR||path.join(os.homedir(),'.hyperaccts'),hosted=false,origin='http://127.0.0.1:4173',payments,webhookSecret=process.env.HYPERACCTS_MARKETPLACE_WEBHOOK_SECRET,adminEmail,adminPassword,request,autoStart=true}={}){
  const store=createStore(directory);let auth;
  try{auth=await createAuth({store,hosted,adminEmail,adminPassword});}catch(e){store.close();throw e;}
  if(payments===undefined&&process.env.HYPERACCTS_MARKETPLACE_STRIPE_KEY){const {default:Stripe}=await import('stripe');payments=new Stripe(process.env.HYPERACCTS_MARKETPLACE_STRIPE_KEY);}
  const market=createMarketplace({store,payments,origin}),engine=createEngine({store,request,autoStart});market.seed();
  const safeConnection=({secret,...c})=>({...c,hasCredential:!!secret});
  function state(user){return {user,hosted,paymentsReady:!!payments&&!!webhookSecret,catalog:market.catalog(user),drafts:store.list('draft',user.id),campaigns:store.list('campaign',user.id),connections:store.list('connection',user.id).map(safeConnection),entitlements:store.list('entitlement',user.id),packages:store.list('package').filter(p=>p.owner===user.id||store.get('entitlement',user.id+':'+p.id)&&!store.get('entitlement',user.id+':'+p.id).revoked),orders:store.list('order',user.id),reviews:user.admin?store.list('draft').filter(d=>d.status==='submitted'):[]};}
  async function handle(req,res,url,{send,validToken}){
    if(!url.pathname.startsWith('/api/runtime/'))return false;
    const route=url.pathname.slice('/api/runtime/'.length);
    try{
      if(route==='payments/webhook'&&req.method==='POST'){
        if(!payments||!webhookSecret)throw problem('Marketplace payments are not configured.',503);
        const raw=await readBody(req);let event;try{event=payments.webhooks.constructEvent(raw,req.headers['stripe-signature'],webhookSecret);}catch{throw problem('Invalid payment signature.',400);}
        send(res,200,market.webhook(event));return true;
      }
      if(req.method==='POST'&&!validToken(req.headers['x-hyperaccts-token']))throw problem('Refresh the app session and try again.',403);
      if(!['GET','POST'].includes(req.method))throw problem('Method not supported.',405);
      const input=req.method==='POST'?JSON.parse((await readBody(req)).toString()||'{}'):{};
      if(['auth/login','auth/register'].includes(route)&&req.method==='POST'){
        const result=await auth[route.endsWith('register')?'register':'login'](input,req.socket.remoteAddress||'unknown');
        res.setHeader('set-cookie',`hyper_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${hosted?'; Secure':''}`);send(res,200,{user:result.user});return true;
      }
      if(route==='session'&&req.method==='GET'){send(res,200,{user:auth.current(req),hosted});return true;}
      const user=auth.current(req);if(!user)throw problem('Sign in to your workspace.',401);
      if(route==='auth/logout'&&req.method==='POST'){auth.logout(req);res.setHeader('set-cookie','hyper_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');send(res,200,{ok:true});return true;}
      if(route==='state'&&req.method==='GET'){send(res,200,state(user));return true;}
      if(route==='campaigns/export'&&req.method==='GET'){
        const c=engine.own(url.searchParams.get('id'),user),format=url.searchParams.get('format');
        const rows=c.records.map(r=>({record:r.index+1,status:r.status,message:r.message,...r.data,output:r.outputs}));
        if(format==='csv'){const keys=[...new Set(rows.flatMap(Object.keys))],cell=v=>{let s=typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="campaign-results.csv"','cache-control':'no-store'});res.end([keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n'));}else send(res,200,{campaign:c.name,workflowHash:c.hash,records:rows});return true;
      }
      if(req.method!=='POST')throw problem('Not found.',404);
      let result;
      if(route==='workflows/save'){if(!input.id&&store.list('draft',user.id).length>=100)throw problem('Archive or reuse an existing workflow before adding more.');result=market.save(user,input);}
      else if(route==='workflows/submit')result=market.submit(user,input.id);
      else if(route==='workflows/review')result=market.publish(user,input.id,input);
      else if(route==='marketplace/install')result=market.install(user,input.packageId);
      else if(route==='marketplace/checkout'){if(!webhookSecret)throw problem('Marketplace payment webhook is not configured.',503);result=await market.checkout(user,input.packageId);}
      else if(route==='marketplace/onboard')result=await market.onboard(user);
      else if(route==='connections/save'){
        const id=input.id||randomUUID(),old=store.get('connection',id);if(old&&old.owner!==user.id)throw problem('Connection not found.',404);
        if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw problem('Name the connection.');
        const allowPrivate=!!input.allowPrivate;if(allowPrivate&&hosted&&!user.admin)throw problem('Only an administrator can enable a private network API.',403);
        const endpoint=connectionOrigin(input.origin,{allowPrivate});let secret=old?.secret||null;
        if(old&&old.origin!==endpoint)secret=null;
        if(input.credential!==undefined){if(typeof input.credential!=='string'||input.credential.length>8000||/[\r\n]/.test(input.credential))throw problem('Invalid credential.');
          const header=String(input.header||'authorization').toLowerCase();if(!['authorization','x-api-key','api-key'].includes(header))throw problem('Choose Authorization, X-API-Key or API-Key.');
          secret=input.credential?store.encrypt({value:input.credential,header,prefix:header==='authorization'?'Bearer ':''},id):null;
        }
        result=safeConnection(store.put('connection',{id,owner:user.id,name:input.name.trim(),origin:endpoint,allowPrivate,secret}));
      }
      else if(route==='connections/delete'){const c=store.get('connection',input.id);if(!c||c.owner!==user.id)throw problem('Connection not found.',404);store.remove('connection',input.id);result={deleted:true};}
      else if(route==='campaigns/create'){if(store.list('campaign',user.id).length>=100)throw problem('Delete an old campaign before creating another.');result=engine.create(user,input);}
      else if(route==='campaigns/action')result=engine.action(user,input.id,input.action);
      else if(route==='campaigns/review')result=engine.review(user,input.id,input.recordId,input);
      else if(route==='campaigns/delete'){const c=engine.own(input.id,user);if(['running','paused','waiting'].includes(c.status))throw problem('Cancel the campaign before deleting it.');store.remove('campaign',c.id);result={deleted:true};}
      else throw problem('Not found.',404);
      send(res,200,{ok:true,result});return true;
    }catch(error){send(res,error.status||400,{ok:false,message:error instanceof SyntaxError?'Invalid JSON request.':error.message});return true;}
  }
  return {store,auth,market,engine,handle,state,hosted,async close(){await engine.close();store.close();}};
}
