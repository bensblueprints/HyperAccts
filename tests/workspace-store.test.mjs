import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,unlink,rm,rmdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createWorkspaceStore} from '../desktop/workspace-store.mjs';

const state=name=>({version:1,campaigns:[{name}],solutions:[],licenses:[]});
async function directory(t){
  const root=path.resolve(os.tmpdir()),dir=await mkdtemp(path.join(root,'hyperaccts-store-'));
  assert.equal(path.dirname(dir),root);
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return dir;
}
test('store roundtrip across instances retains the immediately preceding good save',async t=>{
  const dir=await directory(t),store=createWorkspaceStore(dir);
  assert.deepEqual(await store.read(),{state:null,recovered:false,warning:null});
  await store.write(state('first'));await store.write(state('second'));await store.write(state('third'));
  assert.deepEqual((await createWorkspaceStore(dir).read()).state,state('third'));
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,'workspace.backup.json'),'utf8')),state('second'));
  assert.deepEqual((await readdir(dir)).sort(),['workspace.backup.json','workspace.json']);
});
test('concurrent saves capture invocation state and commit in order',async t=>{
  const dir=await directory(t),store=createWorkspaceStore(dir),input=state('first');
  const first=store.write(input);input.campaigns[0].name='mutated';
  const saved=await Promise.all([first,store.write(state('second')),store.write(state('third'))]);
  assert.equal(saved[0].campaigns[0].name,'first');
  assert.deepEqual((await store.read()).state,state('third'));
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,'workspace.backup.json'),'utf8')),state('second'));
});
test('corrupt primary is preserved and recovery uses the last valid backup',async t=>{
  const dir=await directory(t),store=createWorkspaceStore(dir);
  await store.write(state('backup'));await store.write(state('primary'));
  await writeFile(path.join(dir,'workspace.json'),'{broken');
  await writeFile(path.join(dir,'unrelated.txt'),'keep');
  const result=await store.read();assert.equal(result.recovered,true);assert.match(result.warning,/Recovered/);
  assert.deepEqual(result.state,state('backup'));
  const evidence=(await readdir(dir)).find(name=>name.startsWith('workspace.corrupted-'));
  assert.ok(evidence);assert.equal(await readFile(path.join(dir,evidence),'utf8'),'{broken');
  await store.write(state('restored'));
  assert.equal(await readFile(path.join(dir,'unrelated.txt'),'utf8'),'keep');
  assert.deepEqual((await store.read()).state,state('restored'));
});
test('validation failure and oversized state leave both committed files unchanged',async t=>{
  const dir=await directory(t),store=createWorkspaceStore(dir);
  await store.write(state('backup'));await store.write(state('current'));
  const before=await Promise.all(['workspace.json','workspace.backup.json'].map(name=>readFile(path.join(dir,name),'utf8')));
  for(const invalid of [null,[],{version:1},state('x'.repeat(4*1024*1024))])await assert.rejects(store.write(invalid));
  assert.deepEqual(await Promise.all(['workspace.json','workspace.backup.json'].map(name=>readFile(path.join(dir,name),'utf8'))),before);
});
test('both malformed files raise an actionable error without initializing or overwriting',async t=>{
  const dir=await directory(t);
  await writeFile(path.join(dir,'workspace.json'),'bad primary');await writeFile(path.join(dir,'workspace.backup.json'),'bad backup');
  await assert.rejects(createWorkspaceStore(dir).read(),/Restore a valid backup/);
  assert.equal(await readFile(path.join(dir,'workspace.json'),'utf8'),'bad primary');
  assert.equal(await readFile(path.join(dir,'workspace.backup.json'),'utf8'),'bad backup');
});
test('missing primary recovers backup and structurally invalid JSON cannot masquerade as valid',async t=>{
  const dir=await directory(t),store=createWorkspaceStore(dir);
  await store.write(state('first'));await store.write(state('second'));
  await unlink(path.join(dir,'workspace.json'));
  assert.deepEqual((await store.read()).state,state('first'));
  await writeFile(path.join(dir,'workspace.json'),JSON.stringify({version:1}));
  assert.deepEqual((await store.read()).state,state('first'));
  await writeFile(path.join(dir,'workspace.json'),'null');
  assert.deepEqual((await store.read()).state,state('first'));
});
test('newer schemas are never silently downgraded to an old backup',async t=>{
  const dir=await directory(t),store=createWorkspaceStore(dir);
  await store.write(state('first'));await store.write(state('second'));
  const future=JSON.stringify({...state('newer'),version:2});
  await writeFile(path.join(dir,'workspace.json'),future);
  await assert.rejects(store.read(),/Unsupported workspace version/);
  assert.equal(await readFile(path.join(dir,'workspace.json'),'utf8'),future);
});
test('filesystem failure rejects the save, preserves primary and does not poison later saves',async t=>{
  const dir=await directory(t),store=createWorkspaceStore(dir);
  await store.write(state('current'));
  const blocked=path.join(dir,'workspace.backup.json');await mkdir(blocked);
  await assert.rejects(store.write(state('failed')));
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,'workspace.json'),'utf8')),state('current'));
  await rmdir(blocked);
  await store.write(state('retry'));
  assert.deepEqual((await store.read()).state,state('retry'));
});
