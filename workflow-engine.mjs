import {randomUUID} from 'node:crypto';
import {problem,validateRecords,template,shouldRun,workflowHash} from './workflow-schema.mjs';
import {requestAPI} from './workflow-http.mjs';

export function createEngine({store,request=requestAPI,autoStart=true}){
  let closed=false,busy=false;const pending=new Map();
  const event=(c,text)=>{c.events.push({at:new Date().toISOString(),text});c.events=c.events.slice(-500);};
  const own=(id,user)=>{const c=store.get('campaign',id);if(!c||c.owner!==user.id)throw problem('Campaign not found.',404);return c;};
  for(const c of store.list('campaign'))if(c.status==='running'||c.records.some(r=>r.status==='running')){
    if(c.status!=='cancelled')c.status='paused';for(const r of c.records)if(r.status==='running'){const step=c.workflow.steps[r.step];r.status=c.status==='cancelled'?'cancelled':step?.type==='http'&&step.config.method!=='GET'?'review':'pending';r.uncertain=step?.type==='http'&&step.config.method!=='GET';r.message=r.uncertain?'The service restarted during an API write. Check the remote outcome before continuing.':'Paused after service restart.';}
    event(c,'Recovered after service restart; owner resume required.');store.put('campaign',c);
  }
  function create(user,{name,packageId,records,bindings={}}){
    if(typeof name!=='string'||!name.trim()||name.length>100)throw problem('Name your campaign (up to 100 characters).');
    const pkg=store.get('package',packageId),grant=store.get('entitlement',user.id+':'+packageId);
    if(!pkg||pkg.owner!==user.id&&(!grant||grant.revoked))throw problem('Install this workflow version before creating a campaign.',403);
    if(workflowHash(pkg.workflow)!==pkg.hash)throw problem('Workflow package integrity check failed.',409);
    const required=[...new Set(pkg.workflow.steps.filter(s=>s.type==='http').map(s=>s.config.connection))];
    for(const slot of required){const conn=store.get('connection',bindings[slot]);if(!conn||conn.owner!==user.id)throw problem('Bind your own API connection for '+slot+'.');}
    const c={id:randomUUID(),owner:user.id,name:name.trim(),packageId,workflow:structuredClone(pkg.workflow),hash:pkg.hash,bindings:Object.fromEntries(required.map(k=>[k,bindings[k]])),status:'draft',createdAt:new Date().toISOString(),events:[],records:validateRecords(records).map((data,index)=>({id:randomUUID(),index,data,outputs:{},step:0,status:'pending',attempts:[],message:''}))};
    event(c,'Created from '+pkg.workflow.title+' v'+pkg.workflow.version+'.');return store.put('campaign',c);
  }
  function action(user,id,action){
    const c=own(id,user);
    if(action==='start'&&c.status!=='draft'||action==='resume'&&!['paused','waiting'].includes(c.status)||action==='pause'&&c.status!=='running'||action==='cancel'&&!['draft','running','paused','waiting'].includes(c.status))throw problem('That action is unavailable in the current campaign state.',409);
    if(action==='start'||action==='resume')c.status='running';
    else if(action==='pause')c.status='paused';
    else if(action==='cancel'){c.status='cancelled';for(const r of c.records)if(['pending','review'].includes(r.status))r.status='cancelled';}
    else if(action==='retry'){
      if(!['completed','failed','cancelled'].includes(c.status))throw problem('Finish or cancel the campaign before retrying failed records.',409);
      const failures=c.records.filter(r=>r.status==='failed');if(!failures.length)throw problem('No failed records to retry.');
      failures.forEach(r=>{r.status='pending';r.message='';});c.status='running';
    }else throw problem('Unknown campaign action.');
    event(c,'Campaign '+action+' requested.');store.put('campaign',c);
    // Let an in-flight write settle; cancellation prevents subsequent steps.
    return c;
  }
  function review(user,id,recordId,{decision,note=''}){
    const c=own(id,user),r=c.records.find(r=>r.id===recordId);if(!r||r.status!=='review')throw problem('No pending review for that record.',409);
    if(!['approve','reject','retry'].includes(decision))throw problem('Choose approve, reject or retry.');
    if(decision==='retry'&&!r.uncertain)throw problem('Retry is only available for an uncertain API result.');
    r.attempts.push({step:c.workflow.steps[r.step]?.id,status:'owner_'+decision,at:new Date().toISOString(),note:String(note).slice(0,1000)});
    if(decision==='reject'){r.status='failed';r.message='Rejected by owner.';}else{if(decision==='approve')r.step++;r.status='pending';r.message='';}
    r.uncertain=false;if(c.status==='waiting')c.status='paused';event(c,'Owner '+decision+' for record '+(r.index+1)+'.');return store.put('campaign',c);
  }
  function saveResult(id,recordId,fn){const c=store.get('campaign',id);if(!c)return;const r=c.records.find(x=>x.id===recordId);fn(c,r);return store.put('campaign',c);}
  function finish(c){if(c.status!=='running')return;if(c.records.some(r=>['pending','running'].includes(r.status)))return;c.status=c.records.some(r=>r.status==='review')?'waiting':c.records.some(r=>r.status==='failed')?'failed':'completed';event(c,'Campaign '+c.status+'.');store.put('campaign',c);}
  async function step(c,r){
    if(r.wakeAt&&Date.now()<r.wakeAt)return;
    const s=c.workflow.steps[r.step];if(!s){r.status='completed';r.message='All workflow steps completed.';store.put('campaign',c);finish(c);return;}
    delete r.wakeAt;
    if(!shouldRun(s.when,r.data)){r.attempts.push({step:s.id,status:'skipped',at:new Date().toISOString()});r.step++;store.put('campaign',c);return;}
    r.status='running';const attemptId=randomUUID();r.attempts.push({id:attemptId,step:s.id,status:'running',at:new Date().toISOString()});store.put('campaign',c);
    const controller=new AbortController();pending.set(c.id,controller);
    try{
      let output={},reviewMessage=null;
      const context={...r.data,record:r.data,steps:r.outputs};
      if(s.type==='validate'){const missing=s.config.required.filter(k=>r.data[k]===undefined||r.data[k]===null||r.data[k]==='');if(missing.length)throw problem('Missing required fields: '+missing.join(', '));output={validated:true};}
      if(s.type==='set'){output=template(s.config.values,context);}
      if(s.type==='review')reviewMessage=template(s.config.message,context);
      if(s.type==='export')output=Object.fromEntries(s.config.fields.map(k=>[k,r.data[k]??null]));
      if(s.type==='http'){
        const conn=store.get('connection',c.bindings[s.config.connection]);if(!conn||conn.owner!==c.owner)throw problem('The campaign connection was removed.');
        const credential=conn.secret?store.decrypt(conn.secret,conn.id):{},headers={};if(credential.value)headers[credential.header||'authorization']=credential.prefix+credential.value;
        if(s.config.method!=='GET')headers['idempotency-key']=`${c.id}:${r.id}:${s.id}`;
        output=await request({origin:conn.origin,path:template(s.config.path,context,{url:true}),method:s.config.method,body:template(s.config.body,context),headers,timeoutSeconds:s.config.timeoutSeconds,allowPrivate:conn.allowPrivate,signal:controller.signal});
        if(credential.value){const scrub=v=>{if(typeof v==='string')return v.split(credential.value).join('[redacted]');if(Array.isArray(v))return v.map(scrub);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/password|secret|token|api.?key/i.test(k)?'[redacted]':scrub(x)]));return v;};output=scrub(output);}
      }
      saveResult(c.id,r.id,(current,row)=>{
        row.attempts.find(a=>a.id===attemptId).status=reviewMessage?'review':'completed';
        row.outputs[s.id]=output;
        if(s.type==='set')Object.assign(row.data,output);
        if(reviewMessage){row.status='review';row.message=reviewMessage;}else{row.step++;row.status=current.status==='cancelled'?'cancelled':'pending';row.message=s.label+' completed.';}
        if(s.type==='wait')row.wakeAt=Date.now()+s.config.seconds*1000;
        row.attempts=row.attempts.slice(-200);event(current,'Record '+(row.index+1)+': '+s.label+(reviewMessage?' needs owner review.':' completed.'));
      });
    }catch(error){
      saveResult(c.id,r.id,(current,row)=>{const uncertain=s.type==='http'&&s.config.method!=='GET';row.uncertain=uncertain;row.status=uncertain?'review':'failed';row.message=uncertain?'API write outcome requires review. Inspect the remote result before approving or retrying.':String(error.message).slice(0,500);row.attempts.find(a=>a.id===attemptId).status=row.status;event(current,'Record '+(row.index+1)+': '+row.message);});
    }finally{pending.delete(c.id);const current=store.get('campaign',c.id);if(current)finish(current);}
  }
  async function tick(){if(closed||busy)return;busy=true;try{for(const c of store.list('campaign')){if(closed)break;if(c.status!=='running')continue;const r=c.records.find(r=>r.status==='pending'&&(!r.wakeAt||r.wakeAt<=Date.now()));if(r)await step(c,r);else finish(c);}}finally{busy=false;}}
  const timer=autoStart?setInterval(()=>tick().catch(()=>{}),150):null;timer?.unref();
  return {create,action,review,own,tick,async close(){closed=true;clearInterval(timer);for(const control of pending.values())control.abort();while(busy)await new Promise(r=>setTimeout(r,10));}};
}
