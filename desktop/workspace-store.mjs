import {mkdir,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const MAX_JSON_SIZE=4*1024*1024;
const versionError=()=>Object.assign(new Error('Unsupported workspace version; use a compatible HyperAccts build or explicitly restore a backup.'),{code:'WORKSPACE_VERSION_UNSUPPORTED'});
function defaultValidate(state){
  if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('Workspace must be an object.');
  if(state.version!==1)throw versionError();
  for(const key of ['campaigns','solutions','licenses'])if(!Array.isArray(state[key]))throw new Error(`Workspace is missing the ${key} array.`);
  return state;
}

export function createWorkspaceStore(directory,{validate=defaultValidate}={}){
  const primary=path.join(directory,'workspace.json'),backup=path.join(directory,'workspace.backup.json');
  let tail=Promise.resolve();
  const enqueue=operation=>{const result=tail.then(operation);tail=result.catch(()=>{});return result;};
  function snapshot(value){
    const raw=JSON.stringify(value);
    if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_JSON_SIZE)throw new Error('Workspace must be JSON smaller than 4 MiB.');
    const copy=JSON.parse(raw);
    if(!copy||typeof copy!=='object'||Array.isArray(copy))throw new Error('Workspace must be an object.');
    if(typeof copy.version==='number'&&copy.version!==1)throw versionError();
    if(copy.version!==1)throw new Error('Workspace version 1 is required.');
    const state=validate(copy);
    const checked=JSON.stringify(state);
    if(typeof checked!=='string'||Buffer.byteLength(checked)>MAX_JSON_SIZE)throw new Error('Validated workspace exceeds 4 MiB.');
    return JSON.parse(checked);
  }
  async function candidate(file){
    let handle;
    try{handle=await open(file,'r');}catch(error){if(error.code==='ENOENT')return {exists:false};throw error;}
    let raw;
    try{
      const info=await handle.stat();
      if(!info.isFile())throw new Error('Workspace storage path is not a regular file.');
      if(info.size>MAX_JSON_SIZE)return {exists:true,valid:false,error:new Error('Workspace file exceeds 4 MiB.')};
      raw=await handle.readFile('utf8');
    }finally{await handle.close();}
    try{return {exists:true,valid:true,state:snapshot(JSON.parse(raw))};}
    catch(error){return {exists:true,valid:false,error};}
  }
  async function quarantine(file){
    const target=path.join(directory,`${path.basename(file,'.json')}.corrupted-${randomUUID()}.json`);
    await rename(file,target);return path.basename(target);
  }
  async function atomicWrite(file,state){
    const temporary=path.join(directory,`.${path.basename(file)}.${randomUUID()}.tmp`);
    let handle;
    try{
      handle=await open(temporary,'wx',0o600);
      await handle.writeFile(JSON.stringify(state),'utf8');await handle.sync();
      await handle.close();handle=null;
      await rename(temporary,file);
    }finally{
      if(handle)await handle.close().catch(()=>{});
      await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
  }
  function read(){return enqueue(async()=>{
    const current=await candidate(primary);
    if(current.valid)return {state:current.state,recovered:false,warning:null};
    // A newer schema is not corruption: never silently roll it back to an old backup.
    if(current.error?.code==='WORKSPACE_VERSION_UNSUPPORTED')throw current.error;
    const previous=await candidate(backup);
    if(previous.valid){
      const evidence=current.exists?await quarantine(primary):null;
      return {state:previous.state,recovered:true,warning:`Recovered the previous saved workspace.${evidence?' The unreadable file was preserved as '+evidence+'.':' The primary file was missing.'}`};
    }
    if(!current.exists&&!previous.exists)return {state:null,recovered:false,warning:null};
    throw new Error('Workspace and recovery copy could not be read. Existing files were preserved. Restore a valid backup in Workspace settings.');
  });}
  function write(value){
    // Capture the invocation's state before waiting for earlier writes.
    let state;try{state=snapshot(value);}catch(error){return Promise.reject(error);}
    return enqueue(async()=>{
      await mkdir(directory,{recursive:true,mode:0o700});
      const current=await candidate(primary);
      if(current.valid){
        const previous=await candidate(backup);
        if(previous.exists&&!previous.valid)await quarantine(backup);
        // Copy atomically; keep the primary intact until its replacement is durable.
        await atomicWrite(backup,current.state);
      }else if(current.exists)await quarantine(primary);
      await atomicWrite(primary,state);
      return state;
    });
  }
  return {read,write};
}
