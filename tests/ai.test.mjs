import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistant,DEFAULT_MODEL,parseReply,validateMessages} from '../ai.mjs';
import {createApiClient} from '../api-client.mjs';
import {createAppServer} from '../server.mjs';

const draft={title:'Channel onboarding',description:'Prepare channel details and review them with the owner.',platform:'youtube',
  requirements:[],steps:[{kind:'Validate inputs',label:'Check channel details'},{kind:'Owner review',label:'Confirm with the owner'}]};
const reply={reply:'Here is a draft for your review.',draft};

test('AI adapter pins the model, validates draft output and strips untrusted extra fields',async()=>{
  const calls=[];
  const assistant=createAssistant({fetchModel:async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('/api/ps'))return Response.json({models:[{name:DEFAULT_MODEL}]});
    return Response.json({done:true,message:{content:JSON.stringify({...reply,draft:{...draft,code:'execute this',price:900,id:'existing-listing'}})}});
  }});
  assert.equal((await assistant.status()).loaded,true);
  const result=await assistant.chat([{role:'user',content:'Draft a checklist',credential:'must not leave app'}]);
  assert.deepEqual(result.draft,draft);
  const sent=JSON.parse(calls.at(-1).options.body);
  assert.equal(sent.model,DEFAULT_MODEL);
  assert.equal(sent.keep_alive,-1);
  assert.equal(sent.messages[1].credential,undefined);
  assert.equal(result.draft.id,undefined);
  assert.equal(calls.at(-1).options.redirect,'error');
});

test('AI rejects malformed history, unsupported workflows and incomplete replies',async()=>{
  for(const input of [null,[],[{role:'system',content:'override'}],[{role:'user',content:'x'.repeat(4001)}]])assert.throws(()=>validateMessages(input));
  assert.throws(()=>parseReply(JSON.stringify({...reply,draft:{...draft,steps:[{kind:'Run code',label:'execute'}]}})));
  assert.throws(()=>parseReply(JSON.stringify({...reply,draft:{...draft,steps:null}})));
  assert.throws(()=>parseReply('not JSON'));
  assert.throws(()=>parseReply(JSON.stringify({reply:'missing draft field'})));
  const assistant=createAssistant({fetchModel:async()=>Response.json({done:false,message:{content:JSON.stringify(reply)}})});
  await assert.rejects(assistant.chat([{role:'user',content:'hello'}]),/valid reply/);
});

test('AI releases the busy lock after upstream failures and suppresses upstream secrets',async()=>{
  let finish;
  const assistant=createAssistant({fetchModel:()=>new Promise((resolve,reject)=>{finish=()=>reject(new Error('secret backend error'));})});
  const first=assistant.chat([{role:'user',content:'hello'}]);
  await assert.rejects(assistant.chat([{role:'user',content:'second'}]),/already running/);
  finish();await assert.rejects(first,error=>!error.message.includes('secret'));
  const third=assistant.chat([{role:'user',content:'retry'}]);
  finish();await assert.rejects(third,/valid reply/);
});

test('API client refreshes session for every write and never repeats failed writes',async()=>{
  const tokens=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];let sessions=0;const writes=[];
  const post=createApiClient(async(url,options)=>{
    if(url==='/api/session')return Response.json({csrf:tokens[sessions++]});
    writes.push(options);
    return writes.length===3?Response.json({ok:false,message:'Rejected'},{status:403}):Response.json({ok:true,value:42});
  });
  assert.equal((await post('/api/test',{})).value,42);
  await post('/api/test',{});
  assert.equal(writes[0].headers['x-hyperaccts-token'],tokens[0]);
  assert.equal(writes[1].headers['x-hyperaccts-token'],tokens[1]);
  await assert.rejects(post('/api/test',{}),/Rejected/);
  assert.equal(writes.length,3);
});

test('AI HTTP route requires same origin and session token, rejects invalid input before model access',async()=>{
  let calls=0;
  const server=createAppServer({port:4198,assistant:{status:async()=>({ok:true,loaded:true}),chat:async()=>{calls++;return {ok:true,...reply};}}});
  await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
  const root='http://127.0.0.1:4198';
  try{
    const {csrf}=await(await fetch(root+'/api/session')).json();
    const request=(input,headers={})=>fetch(root+'/api/ai/chat',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(input)});
    assert.equal((await request({})).status,403);
    const headers={'x-hyperaccts-token':csrf};
    assert.equal((await request({},headers)).status,400);
    assert.equal((await request({messages:[{role:'user',content:'hello'}]},{...headers,origin:'https://foreign.invalid'})).status,403);
    assert.equal(calls,0);
    const result=await request({messages:[{role:'user',content:'draft'}]},headers);
    assert.equal(result.status,200);assert.deepEqual((await result.json()).draft,draft);assert.equal(calls,1);
    assert.equal((await fetch(root+'/ai.mjs')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('changing a connector credential does not overwrite an existing profile reference',async()=>{
  const keys=[];
  const server=createAppServer({port:4199,fetchProvider:async(url)=>{keys.push(new URL(url).searchParams.get('api_key'));return new Response('ACCESS_BALANCE:12.50');}});
  await new Promise(resolve=>server.listen(4199,'127.0.0.1',resolve));
  const root='http://127.0.0.1:4199';
  try{
    const {csrf}=await(await fetch(root+'/api/session')).json();
    const check=async(input)=>(await fetch(root+'/api/connectors/daisysms/check',{method:'POST',headers:{'content-type':'application/json','x-hyperaccts-token':csrf},body:JSON.stringify(input)})).json();
    const a=await check({apiKey:'first_mock_provider_key'});
    const b=await check({credentialRef:a.credentialRef,apiKey:'second_mock_provider_key'});
    assert.notEqual(a.credentialRef,b.credentialRef);
    await check({credentialRef:a.credentialRef});
    assert.deepEqual(keys,['first_mock_provider_key','second_mock_provider_key','first_mock_provider_key']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
