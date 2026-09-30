import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCampaign,transition,summary,parseCSV,validateCampaign,recoverCampaigns} from '../domain.mjs';
import {initialSolutions,initialLicenses,snapshotSolution,unlockSolution} from '../market.mjs';
import {initialConnections,checkRequirements,validateConnection} from '../connectors.mjs';
import {createAppServer} from '../server.mjs';

test('campaign pause/recovery and retry preserve completed and review records',()=>{
  const original=makeCampaign();let campaign=transition(original,'start');campaign=transition(campaign,'tick');
  campaign=transition(campaign,'pause');assert.equal(transition(campaign,'tick').status,'paused');
  campaign=transition(campaign,'resume');assert.equal(recoverCampaigns([campaign])[0].status,'paused');
  for(let i=0;i<8;i++)campaign=transition(campaign,'tick');
  assert.deepEqual(summary(campaign),{total:3,success:1,review:1,failure:1,done:3});
  const retried=transition(campaign,'retry');assert.equal(retried.records.filter(r=>r.status==='pending').length,1);
  assert.equal(retried.records.filter(r=>r.status==='success').length,1);assert.equal(original.status,'draft');
});
test('CSV handles quoted commas while rejecting sensitive and duplicate columns',()=>{
  const rows=parseCSV('username,email,firstName\r\nmock,mock@example.invalid,"River, A"\r\n');assert.equal(rows[0].firstName,'River, A');
  assert.throws(()=>parseCSV('username,email,password\na,b,c'),/template/);
  assert.throws(()=>parseCSV('username,email,email\na,b,c'),/unique/);
  const campaign=makeCampaign();campaign.records[0].email='real@example.com';assert.ok(validateCampaign(campaign).some(e=>e.message.includes('.invalid')));
});
test('solution versions and requirements are copied, with unlock required',()=>{
  const solutions=initialSolutions(),licenses=initialLicenses(),source=solutions[0];const snapshot=snapshotSolution(source,licenses);
  source.steps[0].label='Changed later';source.requirements.push('CAPTCHA');assert.notEqual(snapshot.workflow[0].label,source.steps[0].label);assert.deepEqual(snapshot.requirements,['SMS']);
  assert.throws(()=>snapshotSolution(solutions[4],licenses),/Unlock/);const updated=unlockSolution(solutions[4],licenses);assert.equal(updated.length,licenses.length+1);assert.throws(()=>unlockSolution(solutions[4],updated),/already installed/);
});
test('connector capability bindings reject mismatches and Daisy supports balance mode',()=>{
  const connections=initialConnections();assert.deepEqual(checkRequirements({requirements:['SMS']},connections,{SMS:'mock-daisy'}),[]);
  assert.ok(checkRequirements({requirements:['CAPTCHA']},connections,{CAPTCHA:'mock-daisy'}).length);
  assert.deepEqual(validateConnection({...connections[0],mode:'balance-only'}),[]);
});
test('local service protects credentials, blocks foreign origins, and only requests balances',async()=>{
  const calls=[];const server=createAppServer({port:4197,fetchProvider:async(url,options)=>{calls.push({url:String(url),options});return new Response(String(url).includes('2captcha')?JSON.stringify({errorId:0,balance:3.5}):'ACCESS_BALANCE:12.50');}});
  await new Promise(resolve=>server.listen(4197,'127.0.0.1',resolve));
  try{
    const root='http://127.0.0.1:4197';assert.equal((await fetch(root+'/package.json')).status,404);assert.equal((await fetch(root+'/api/session',{headers:{origin:'https://foreign.invalid'}})).status,403);
    assert.equal((await fetch(root+'/api/connectors/daisysms/check',{method:'POST',body:'{}'})).status,403);
    const {csrf}=await (await fetch(root+'/api/session')).json();const key='mock_secret_for_adapter_tests';
    const request=async(provider,input)=>(await fetch(root+`/api/connectors/${provider}/check`,{method:'POST',headers:{'content-type':'application/json','x-hyperaccts-token':csrf},body:JSON.stringify(input)})).json();
    const result=await request('daisysms',{apiKey:key});assert.equal(result.ok,true);assert.equal(result.balance,12.5);assert.ok(!JSON.stringify(result).includes(key));assert.equal(new URL(calls[0].url).host,'daisysms.io');assert.equal(new URL(calls[0].url).searchParams.get('action'),'getBalance');
    assert.equal((await request('daisysms',{credentialRef:result.credentialRef})).ok,true);
    assert.equal((await request('smspva',{credentialRef:result.credentialRef})).ok,false);
    const captcha=await request('2captcha',{apiKey:key});assert.equal(captcha.balance,3.5);assert.equal(calls.at(-1).url,'https://api.2captcha.com/getBalance');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
