import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {makeCampaign} from '../domain.mjs';
import {initialSolutions,initialLicenses} from '../market.mjs';
import {initialConnections} from '../connectors.mjs';
import {validateWorkspace} from '../workspace-schema.mjs';
import {createWorkspaceClient,WORKSPACE_KEY} from '../workspace-client.mjs';
import {createAppServer} from '../server.mjs';

const fixture=name=>({version:1,campaigns:[makeCampaign('gmail',name||'Saved draft')],solutions:initialSolutions(),licenses:initialLicenses(),connections:initialConnections(),creatorName:'Test studio'});
function memoryStorage(initial){const values=new Map(initial?[[WORKSPACE_KEY,JSON.stringify(initial)]]:[]);return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};}
function service(initial=null){
  const calls=[];let disk=initial,failRead=false,failWrite=false;
  return {calls,get disk(){return disk;},set failRead(v){failRead=v;},set failWrite(v){failWrite=v;},fetcher:async(url,options={})=>{
    if(url==='/api/session')return Response.json({csrf:'test'});
    if(options.method==='PUT'){
      if(failWrite)return Response.json({ok:false,enabled:true,message:'Disk is full'},{status:503});
      disk=validateWorkspace(JSON.parse(options.body));calls.push(disk);return Response.json({ok:true,enabled:true});
    }
    return failRead?Response.json({ok:false,enabled:true,message:'Storage unreadable'},{status:503}):Response.json({ok:true,enabled:true,state:disk});
  }};
}

test('workspace validation preserves draft edits and rejects unsafe IDs, nested shapes, secrets and unsupported versions',()=>{
  const original=fixture();original.campaigns[0].settings.recoveryEmail='';original.campaigns[0].name='';
  assert.equal(validateWorkspace(original).campaigns[0].name,'');
  for(const mutate of [s=>s.version=99,s=>s.campaigns[0].records=null,s=>s.campaigns[0].id='" onclick="alert(1)',s=>s.connections[0].apiKey='private',s=>s.solutions[0].steps=[{}],s=>s.campaigns.push(structuredClone(s.campaigns[0]))]){
    const s=fixture();mutate(s);assert.throws(()=>validateWorkspace(s));
  }
  assert.throws(()=>validateWorkspace(JSON.parse('{"version":1,"__proto__":{}}')),/Unsafe/);
});

test('persistent snapshots exclude credential references and stale balance checks without mutating live connections',()=>{
  const state=fixture();Object.assign(state.connections[0],{credentialRef:'opaque-reference',balance:10,checkedAt:'today',status:'connected'});
  const saved=validateWorkspace(state);assert.equal(saved.connections[0].credentialRef,undefined);assert.equal(saved.connections[0].status,'untested');assert.equal(state.connections[0].credentialRef,'opaque-reference');
});

test('legacy browser workspace migrates once and survives a fresh client',async()=>{
  const old=fixture('Migration marker'),storage=memoryStorage(old),api=service();
  const client=createWorkspaceClient({storage,fetcher:api.fetcher});
  assert.equal((await client.load(fixture)).campaigns[0].name,'Migration marker');
  assert.deepEqual(api.disk,validateWorkspace(old));
  storage.removeItem(WORKSPACE_KEY);
  assert.equal((await createWorkspaceClient({storage,fetcher:api.fetcher}).load(fixture)).campaigns[0].name,'Migration marker');
});

test('failed migration preserves the original browser workspace for a retry',async()=>{
  const old=fixture('Do not lose'),storage=memoryStorage(old),raw=storage.getItem(WORKSPACE_KEY),api=service();api.failWrite=true;
  const client=createWorkspaceClient({storage,fetcher:api.fetcher});
  await client.load(fixture);assert.equal(storage.getItem(WORKSPACE_KEY),raw);assert.equal(client.status.kind,'error');
  api.failWrite=false;await client.load(fixture);assert.equal(api.disk.campaigns[0].name,'Do not lose');
});

test('failed saves recover pending browser changes on a new client, in save order',async()=>{
  const old=fixture(),storage=memoryStorage(old),api=service(old),client=createWorkspaceClient({storage,fetcher:api.fetcher});
  await client.load(fixture);api.failWrite=true;
  const edited=fixture('Newest unsaved edit');client.persist(edited);await client.flush();
  assert.equal(JSON.parse(storage.getItem(WORKSPACE_KEY))._desktopPending,true);
  api.failWrite=false;
  const resumed=createWorkspaceClient({storage,fetcher:api.fetcher});await resumed.load(fixture);
  assert.equal(api.disk.campaigns[0].name,'Newest unsaved edit');
  resumed.persist(fixture('One'));resumed.persist(fixture('Two'));await resumed.flush();
  assert.deepEqual(api.calls.slice(-2).map(s=>s.campaigns[0].name),['One','Two']);
  assert.equal(JSON.parse(storage.getItem(WORKSPACE_KEY))._desktopPending,undefined);
});

test('unreadable disk never triggers an automatic replacement; explicit valid restore repairs it',async()=>{
  const old=fixture('Keep disk'),storage=memoryStorage(),api=service(old);api.failRead=true;
  const client=createWorkspaceClient({storage,fetcher:api.fetcher});await client.load(fixture);
  assert.equal(api.calls.length,0);client.persist(fixture('Temporary edit'));await client.flush();assert.equal(api.calls.length,0);
  const restored=await client.restore(fixture('Chosen backup'));assert.equal(restored.campaigns[0].name,'Chosen backup');
  assert.equal(api.disk.campaigns[0].name,'Chosen backup');
});

test('malformed browser evidence is retained when disk is healthy',async()=>{
  const storage=memoryStorage();storage.setItem(WORKSPACE_KEY,'{broken');const api=service(fixture('Healthy disk'));
  const client=createWorkspaceClient({storage,fetcher:api.fetcher});await client.load(fixture);client.persist(fixture('New disk edit'));await client.flush();
  assert.equal(storage.getItem(WORKSPACE_KEY),'{broken');assert.equal(api.disk.campaigns[0].name,'New disk edit');
});

test('invalid import and failed restore cannot change the current saved workspace',async()=>{
  const old=fixture('Original'),storage=memoryStorage(old),api=service(old),client=createWorkspaceClient({storage,fetcher:api.fetcher});
  await client.load(fixture);const raw=storage.getItem(WORKSPACE_KEY),disk=JSON.stringify(api.disk);
  await assert.rejects(client.restore({version:99}));api.failWrite=true;
  await assert.rejects(client.restore(fixture('Replacement')),/Disk is full/);
  assert.equal(storage.getItem(WORKSPACE_KEY),raw);assert.equal(JSON.stringify(api.disk),disk);
});

test('workspace API enforces CSRF, validates backups, keeps data private and survives server restart',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'hyperaccts-api-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let port=4198,base=`http://127.0.0.1:${port}`;
  const start=async()=>{const s=createAppServer({port,workspaceDirectory:dir});await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(port,'127.0.0.1',resolve);});return s;};
  let server=await start();t.after(async()=>{if(server.listening)await new Promise(resolve=>server.close(resolve));});
  const state=fixture('API restart marker');
  assert.equal((await fetch(base+'/api/workspace',{method:'PUT',body:JSON.stringify(state)})).status,403);
  const {csrf}=await (await fetch(base+'/api/session')).json();
  const put=data=>fetch(base+'/api/workspace',{method:'PUT',headers:{'content-type':'application/json','x-hyperaccts-token':csrf},body:JSON.stringify(data)});
  assert.equal((await put(state)).status,200);
  assert.equal((await put({version:99})).status,400);
  assert.equal((await fetch(base+'/api/workspace',{headers:{origin:'https://foreign.invalid'}})).status,403);
  for(const name of ['workspace.json','workspace.backup.json','desktop/workspace-store.mjs'])assert.equal((await fetch(base+'/'+name)).status,404);
  assert.equal((await fetch(base+'/workspace-client.mjs')).status,200);
  await new Promise(resolve=>server.close(resolve));port=4199;base=`http://127.0.0.1:${port}`;server=await start();
  assert.equal((await (await fetch(base+'/api/workspace')).json()).state.campaigns[0].name,'API restart marker');
  assert.equal(JSON.parse(await readFile(path.join(dir,'workspace.json'),'utf8')).campaigns[0].name,'API restart marker');
});
