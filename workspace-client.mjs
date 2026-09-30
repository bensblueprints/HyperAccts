import {validateWorkspace} from './workspace-schema.mjs';

export const WORKSPACE_KEY='hyperaccts-v1';

export function createWorkspaceClient({storage,fetcher=fetch,onStatus=()=>{}}){
  let enabled=false,ready=false,csrf,mirrorBlocked=false,queue=Promise.resolve(),pending=0,lastStatus={kind:'loading',message:'Opening workspace…'};
  const status=(kind,message)=>{lastStatus={kind,message};onStatus(lastStatus);};
  const parse=text=>validateWorkspace(JSON.parse(text));
  async function request(url,options={}){
    const response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok||data.ok===false)throw Object.assign(new Error(data.message||'The workspace service is unavailable.'),{enabled:data.enabled});return data;
  }
  async function saveRemote(snapshot){
    if(!csrf)csrf=(await request('/api/session')).csrf;
    try{return await request('/api/workspace',{method:'PUT',headers:{'content-type':'application/json','x-hyperaccts-token':csrf},body:JSON.stringify(snapshot)});}
    catch(error){csrf=null;throw error;}
  }
  function mirror(snapshot){
    if(mirrorBlocked)throw new Error('Preserving an unreadable browser copy.');
    // One atomic localStorage update keeps the pending marker tied to its exact state.
    const json=JSON.stringify({...snapshot,_desktopPending:true});
    storage.setItem(WORKSPACE_KEY,json);return json;
  }
  function persist(state){
    let snapshot,json,mirrored=true;
    try{snapshot=validateWorkspace(state);json=mirror(snapshot);}catch(error){
      if(!snapshot){status('error',error.message);return false;}
      mirrored=false;json=JSON.stringify(snapshot);
    }
    if(!enabled||!ready){status(mirrored?'warning':'error',mirrored?'Saved in this browser. Desktop storage is unavailable; retry the connection in Workspace settings.':'Unable to save. Export a backup before closing.');return mirrored;}
    pending++;status('saving','Saving to this computer…');
    const save=queue.then(()=>saveRemote(snapshot));
    queue=save.catch(()=>{});
    save.then(()=>{
      try{if(storage.getItem(WORKSPACE_KEY)===json)storage.setItem(WORKSPACE_KEY,JSON.stringify(snapshot));}catch{}
      if(pending===1)status('saved','Saved to this computer');
    },error=>status('error',`Desktop save failed: ${error.message} ${mirrored?'A recovery copy is saved in this browser.':'Export a backup before closing.'}`)).finally(()=>pending--);
    return true;
  }
  async function load(seed){
    ready=false;let local=null,localError='',hasPending=false;
    try{const raw=storage.getItem(WORKSPACE_KEY);if(raw){hasPending=JSON.parse(raw)._desktopPending===true;local=parse(raw);}}
    catch{localError='The browser copy could not be read. It has been left untouched.';mirrorBlocked=true;}
    let data;
    try{data=await request('/api/workspace');enabled=data.enabled===true;}
    catch(error){enabled=error.enabled===true;status('error',`${error.message} ${localError||(local?'Using a browser recovery copy until storage reconnects.':'A temporary demo is shown until storage reconnects; saved files have not been replaced.')}`);return local||seed();}
    if(!enabled){status('warning','Browser-only preview. Start the desktop app for durable storage.');return local||seed();}
    let selected;
    try{selected=hasPending&&local?local:data.state?validateWorkspace(data.state):local||seed();}
    catch(error){status('error',error.message);return local||seed();}
    // Finish initial migration/recovery before showing a successful disk save.
    try{
      await saveRemote(selected);ready=true;
      if(!localError)try{storage.setItem(WORKSPACE_KEY,JSON.stringify(selected));}catch{try{storage.removeItem(WORKSPACE_KEY);}catch{}}
      status(data.recovered||localError?'warning':'saved',data.warning||localError||(hasPending?'Recovered the latest browser changes and saved to this computer.':'Saved to this computer'));
    }catch(error){status('error',`Workspace could not be saved: ${error.message} Existing browser data was preserved.`);}
    return selected;
  }
  async function restore(input){
    const snapshot=validateWorkspace(input);await queue;
    if(!enabled)throw new Error('Reconnect desktop storage before restoring a backup. Your current workspace has not changed.');
    await saveRemote(snapshot);ready=true;
    try{
      if(mirrorBlocked){const raw=storage.getItem(WORKSPACE_KEY);if(raw)storage.setItem(WORKSPACE_KEY+'-unreadable-'+Date.now(),raw);}
      storage.setItem(WORKSPACE_KEY,JSON.stringify(snapshot));mirrorBlocked=false;
    }catch{if(!mirrorBlocked)try{storage.removeItem(WORKSPACE_KEY);}catch{}}
    status('saved','Backup restored and saved to this computer');return snapshot;
  }
  return {load,persist,restore,flush:()=>queue,get status(){return lastStatus;},get pending(){return pending;}};
}
