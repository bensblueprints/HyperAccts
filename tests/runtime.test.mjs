import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRuntime} from '../runtime.mjs';
import {createAppServer} from '../server.mjs';
import {parseRecords} from '../live-data.mjs';
import {starterWorkflow} from '../workflow-schema.mjs';
import {requestAPI,publicAddress} from '../workflow-http.mjs';
import {createStore} from '../runtime-store.mjs';
import {createEngine} from '../workflow-engine.mjs';
import Stripe from 'stripe';
async function fixture(options={}){const directory=await mkdtemp(path.join(os.tmpdir(),'hyper-runtime-')),runtime=await createRuntime({directory,autoStart:false,...options}),server=createAppServer({port:0,runtime});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,token=(await fetch(origin+'/api/session').then(r=>r.json())).csrf;
 const api=async(route,body,{cookie='',status=200,tokenOverride=token}={})=>{const r=await fetch(origin+'/api/runtime/'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-hyperaccts-token':tokenOverride,cookie},body:body===undefined?undefined:JSON.stringify(body)}),d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return {...d,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 return {directory,runtime,server,origin,api,async close(){await new Promise(r=>server.close(r));await runtime.close();await rm(directory,{recursive:true,force:true});}};}
test('published workflow runs real HTTP, persists output, pauses for owner and exports',async()=>{
 const calls=[],remote=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;calls.push({body:JSON.parse(body),key:req.headers['idempotency-key'],auth:req.headers.authorization});res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'saved-1'}));});await new Promise(r=>remote.listen(0,'127.0.0.1',r));
 const f=await fixture();try{
  await f.api('connections/save',{name:'Owned API',origin:'http://127.0.0.1:'+remote.address().port,allowPrivate:true,credential:'test-credential'});
  const workflow={...starterWorkflow(),title:'Send and review records',steps:[{id:'validate',label:'Validate',type:'validate',config:{required:['name','email']}},{id:'send',label:'Save record',type:'http',config:{connection:'api',method:'POST',path:'/records',body:{name:'{{name}}',email:'{{email}}'}}},{id:'result',label:'Keep result',type:'set',config:{values:{remoteId:'{{steps.send.data.id}}'}}},{id:'review',label:'Owner approval',type:'review',config:{message:'Check {{remoteId}}'}},{id:'export',label:'Export',type:'export',config:{fields:['name','remoteId']}}]};
  const draft=(await f.api('workflows/save',{workflow})).result;await f.api('workflows/submit',{id:draft.id});const pkg=(await f.api('workflows/review',{id:draft.id})).result;
  const state=await f.api('state');assert.equal(state.connections[0].hasCredential,true);assert.ok(!JSON.stringify(state).includes('test-credential'));
  const campaign=(await f.api('campaigns/create',{name:'Real execution',packageId:pkg.id,bindings:{api:state.connections[0].id},records:parseRecords('name,email\nAlex,alex@example.invalid')})).result;
  await f.api('campaigns/action',{id:campaign.id,action:'start'});for(let i=0;i<8;i++)await f.runtime.engine.tick();
  let saved=f.runtime.store.get('campaign',campaign.id);assert.equal(saved.status,'waiting');assert.equal(calls.length,1);assert.equal(calls[0].body.name,'Alex');assert.equal(calls[0].auth,'Bearer test-credential');assert.ok(calls[0].key);assert.equal(saved.records[0].data.remoteId,'saved-1');
  await f.api('campaigns/review',{id:campaign.id,recordId:saved.records[0].id,decision:'approve'});await f.api('campaigns/action',{id:campaign.id,action:'resume'});for(let i=0;i<3;i++)await f.runtime.engine.tick();saved=f.runtime.store.get('campaign',campaign.id);assert.equal(saved.status,'completed');assert.equal(calls.length,1);
  const exported=await f.api('campaigns/export?id='+campaign.id);assert.equal(exported.records[0].output.export.remoteId,'saved-1');
  await f.api('workflows/save',{id:draft.id,revision:draft.revision,workflow:{...workflow,title:'Edited future version'}});assert.equal(f.runtime.store.get('package',pkg.id).workflow.title,'Send and review records');assert.equal(f.runtime.store.get('campaign',campaign.id).workflow.title,'Send and review records');
  await f.api('campaigns/action',{id:campaign.id,action:'start'},{status:409});await f.api('campaigns/create',{}, {status:403,tokenOverride:'bad'});
 }finally{await f.close();await new Promise(r=>remote.close(r));}
});
test('hosted users are isolated and publication requires administrator',async()=>{const f=await fixture({hosted:true,adminEmail:'admin@example.invalid',adminPassword:'secure-test-passphrase'});try{
 const a=await f.api('auth/register',{name:'A',email:'a@example.invalid',password:'secure-test-passphrase'}),b=await f.api('auth/register',{name:'B',email:'b@example.invalid',password:'secure-test-passphrase'});
 await f.api('state',undefined,{status:401});const draft=(await f.api('workflows/save',{workflow:starterWorkflow()},{cookie:a.cookie})).result;
 await f.api('workflows/save',{id:draft.id,revision:1,workflow:starterWorkflow()},{cookie:b.cookie,status:404});await f.api('workflows/submit',{id:draft.id},{cookie:a.cookie});await f.api('workflows/review',{id:draft.id},{cookie:a.cookie,status:403});
 const admin=await f.api('auth/login',{email:'admin@example.invalid',password:'secure-test-passphrase'});const pkg=(await f.api('workflows/review',{id:draft.id},{cookie:admin.cookie})).result;
 await f.api('marketplace/install',{packageId:pkg.id},{cookie:b.cookie});const c=(await f.api('campaigns/create',{name:'B campaign',packageId:pkg.id,records:[{name:'B',email:'b@example.invalid'}]},{cookie:b.cookie})).result;
 await f.api('campaigns/action',{id:c.id,action:'start'},{cookie:a.cookie,status:404});assert.equal((await f.api('state',undefined,{cookie:a.cookie})).campaigns.length,0);
 await f.api('connections/save',{name:'Private',origin:'http://127.0.0.1',allowPrivate:true},{cookie:a.cookie,status:403});
 }finally{await f.close();}});
test('pause, cancellation and uncertain writes never automatically repeat a write',async()=>{let calls=0;const f=await fixture({request:async()=>{calls++;throw Error('Lost response');}});try{const user=f.runtime.auth.current({headers:{}}),draft=f.runtime.market.save(user,{workflow:{...starterWorkflow(),steps:[{id:'send',label:'Write',type:'http',config:{connection:'api',method:'POST',path:'/records',body:{name:'{{name}}'}}}]}});f.runtime.market.submit(user,draft.id);const pkg=f.runtime.market.publish(user,draft.id);f.runtime.store.put('connection',{id:'api',owner:user.id,origin:'https://example.com'});const c=f.runtime.engine.create(user,{name:'Uncertain write',packageId:pkg.id,records:[{name:'Test'}],bindings:{api:'api'}});
 f.runtime.engine.action(user,c.id,'start');f.runtime.engine.action(user,c.id,'pause');await f.runtime.engine.tick();assert.equal(calls,0);f.runtime.engine.action(user,c.id,'resume');await f.runtime.engine.tick();for(let i=0;i<5;i++)await f.runtime.engine.tick();assert.equal(calls,1);assert.equal(f.runtime.engine.own(c.id,user).status,'waiting');
 f.runtime.engine.action(user,c.id,'cancel');await f.runtime.engine.tick();assert.equal(calls,1);assert.throws(()=>f.runtime.engine.review(user,c.id,c.records[0].id,{decision:'retry'}),/No pending review/);
 }finally{await f.close();}});
test('marketplace payment matching, duplicates and refund before payment completion',async()=>{const f=await fixture();try{const market=f.runtime.market,store=f.runtime.store,owner=f.runtime.auth.current({headers:{}}),workflow={...starterWorkflow(),priceCents:1500};const d=market.save(owner,{workflow});market.submit(owner,d.id);const pkg=market.publish(owner,d.id);const buyer={id:'buyer',name:'Buyer'};assert.throws(()=>market.install(buyer,pkg.id),/checkout/);
 const order={id:'order',owner:'buyer',packageId:pkg.id,amount:1500,currency:'usd',sessionId:'cs_test',status:'pending'};store.put('order',order);const paid={id:'event1',type:'checkout.session.completed',data:{object:{id:'cs_test',client_reference_id:'order',metadata:{orderId:'order'},amount_total:1500,currency:'usd',payment_status:'paid',payment_intent:'pi_test'}}};
 assert.throws(()=>market.webhook({...paid,data:{object:{...paid.data.object,amount_total:1}}}),/match/);assert.equal(store.get('payment-event','event1'),null);
 market.webhook({id:'refund',type:'charge.refunded',data:{object:{payment_intent:'pi_test',refunded:true}}});market.webhook(paid);assert.equal(store.get('order','order').status,'refunded');assert.equal(store.get('entitlement','buyer:'+pkg.id),null);assert.equal(market.webhook(paid).duplicate,true);
 }finally{await f.close();}});
test('HTTP workflow prevents cross-origin and private targets and does not follow redirects',async()=>{assert.equal(publicAddress('127.0.0.1'),false);assert.equal(publicAddress('169.254.169.254'),false);assert.equal(publicAddress('::1'),false);await assert.rejects(requestAPI({origin:'https://example.com',path:'//other.example/path',method:'GET'}),/origin/);await assert.rejects(requestAPI({origin:'https://example.com',path:'/',method:'GET'},async()=>[{address:'127.0.0.1',family:4}]),/private/);});
test('restart preserves completed results and marks paused in-flight writes for review',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'hyper-restart-'));let store=createStore(directory),engine;
 try{store.put('campaign',{id:'recovery',owner:'owner',status:'paused',events:[],workflow:{steps:[{id:'write',type:'http',config:{method:'POST'}}]},records:[{id:'done',status:'completed',step:1,outputs:{write:{id:'persisted'}}},{id:'uncertain',status:'running',step:0,outputs:{}}]});store.close();store=createStore(directory);let writes=0;engine=createEngine({store,autoStart:false,request:async()=>{writes++;}});const c=store.get('campaign','recovery');assert.equal(c.status,'paused');assert.equal(c.records[0].outputs.write.id,'persisted');assert.equal(c.records[1].status,'review');assert.equal(c.records[1].uncertain,true);await engine.tick();assert.equal(writes,0);
 }finally{await engine?.close();store.close();await rm(directory,{recursive:true,force:true});}
});
test('private API redirects are not followed and mapped IPv6 addresses are rejected',async()=>{
 for(const address of ['0:0:0:0:0:0:0:1','::ffff:127.0.0.1','0:0:0:0:0:ffff:7f00:1','64:ff9b::7f00:1','2002:7f00:1::'])assert.equal(publicAddress(address),false,address);
 const remote=http.createServer((_req,res)=>{res.writeHead(302,{location:'http://127.0.0.1:1/private'});res.end();});await new Promise(r=>remote.listen(0,'127.0.0.1',r));try{await assert.rejects(requestAPI({origin:'http://127.0.0.1:'+remote.address().port,path:'/',method:'GET',allowPrivate:true}),/HTTP 302/);}finally{await new Promise(r=>remote.close(r));}
});
test('paid checkout uses saved prices and signed Stripe events grant and revoke access',async()=>{
 const stripe=new Stripe('sk_test_fixture'),secret='whsec_fixture';let checkoutInput;
 const payments={webhooks:stripe.webhooks,accounts:{retrieve:async()=>({charges_enabled:true,payouts_enabled:true})},checkout:{sessions:{create:async input=>{checkoutInput=input;return {id:'cs_fixture',url:'https://checkout.stripe.com/fixture'};}}}};
 const f=await fixture({hosted:true,adminEmail:'admin@example.invalid',adminPassword:'secure-test-passphrase',payments,webhookSecret:secret});
 try{const creator=f.runtime.store.list('user').find(u=>u.admin);creator.stripeAccount='acct_creator';f.runtime.store.put('user',creator);const d=f.runtime.market.save(creator,{workflow:{...starterWorkflow(),priceCents:2500}});f.runtime.market.submit(creator,d.id);const pkg=f.runtime.market.publish(creator,d.id);const buyer=await f.api('auth/register',{name:'Buyer',email:'buyer@example.invalid',password:'secure-test-passphrase'});
 const before=await f.api('state',undefined,{cookie:buyer.cookie});assert.equal(before.catalog.find(p=>p.id===pkg.id).workflow.steps[0].config,undefined);
 const checkout=(await f.api('marketplace/checkout',{packageId:pkg.id,priceCents:1},{cookie:buyer.cookie})).result;assert.equal(checkoutInput.line_items[0].price_data.unit_amount,2500);assert.equal(checkoutInput.payment_intent_data.transfer_data.destination,'acct_creator');
 const event={id:'evt_paid',type:'checkout.session.completed',data:{object:{id:'cs_fixture',client_reference_id:checkout.orderId,metadata:{orderId:checkout.orderId},amount_total:2500,currency:'usd',payment_status:'paid',payment_intent:'pi_paid'}}};
 const deliver=async(e,valid=true)=>{const payload=JSON.stringify(e);const r=await fetch(f.origin+'/api/runtime/payments/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':valid?stripe.webhooks.generateTestHeaderString({payload,secret}):'invalid'},body:payload});return r;};
 assert.equal((await deliver(event,false)).status,400);assert.equal(f.runtime.store.list('entitlement',buyer.user.id).length,0);
 assert.equal((await deliver(event)).status,200);const after=await f.api('state',undefined,{cookie:buyer.cookie});assert.ok(after.packages.some(p=>p.id===pkg.id));assert.equal(after.orders[0].status,'paid');assert.equal((await (await deliver(event)).json()).duplicate,true);
 await deliver({id:'evt_refund',type:'charge.refunded',data:{object:{payment_intent:'pi_paid',refunded:true}}});await f.api('campaigns/create',{name:'Refunded',packageId:pkg.id,records:[{name:'A',email:'a@example.invalid'}]},{cookie:buyer.cookie,status:403});
 }finally{await f.close();}
});
