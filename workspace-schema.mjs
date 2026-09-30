import {platforms} from './domain.mjs';
import {initialConnections,providers} from './connectors.mjs';

export const MAX_WORKSPACE_BYTES=4*1024*1024;
export class WorkspaceValidationError extends Error {}
const fail=message=>{throw new WorkspaceValidationError(message);};
const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(`${label} must be an object.`);};
const array=(v,label,max=5000)=>{if(!Array.isArray(v)||v.length>max)fail(`${label} must be an array with at most ${max} entries.`);};
const string=(v,label)=>{if(typeof v!=='string')fail(`${label} must be text.`);};
const id=(v,label)=>{if(typeof v!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(v))fail(`${label} has an invalid identifier.`);};
const unique=(items,key,label)=>{const keys=items.map(v=>v[key]);if(new Set(keys).size!==keys.length)fail(`${label} contains duplicate identifiers.`);};
const platform=v=>{if(!platforms.some(p=>p.id===v))fail('The workspace contains an unsupported platform.');};
function inspect(value,depth=0){
  if(depth>16)fail('Workspace nesting is too deep.');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='string'){if(value.length>32000)fail('A workspace text field is too long.');return;}
  if(typeof value==='number'){if(!Number.isFinite(value))fail('Workspace numbers must be finite.');return;}
  if(typeof value!=='object')fail('Workspace values must be JSON data.');
  if(Array.isArray(value)){array(value,'Workspace collection');for(const v of value)inspect(v,depth+1);return;}
  for(const [k,v] of Object.entries(value)){
    if(['__proto__','constructor','prototype'].includes(k))fail('Unsafe workspace property.');
    if(/^(password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)$/i.test(k))fail('Workspace files cannot contain passwords or provider secrets.');
    inspect(v,depth+1);
  }
}
function steps(value,label){array(value,label,100);for(const step of value){object(step,label);string(step.kind,'Step kind');string(step.label,'Step label');}}
function requirements(value){array(value,'Connector requirements',10);if(value.some(v=>!['SMS','CAPTCHA'].includes(v)))fail('Unsupported connector requirement.');}

// Validate storage shape, including incomplete drafts; campaign execution has separate validation.
export function validateWorkspace(input){
  object(input,'Workspace');
  if(input.version!==1)fail('Unsupported workspace version. Use a version 1 HyperAccts backup.');
  inspect(input);
  const json=JSON.stringify(input);
  if(new TextEncoder().encode(json).length>MAX_WORKSPACE_BYTES)fail('Choose a workspace smaller than 4 MiB.');
  const state=JSON.parse(json);
  delete state._desktopPending;
  for(const k of ['campaigns','solutions','licenses'])array(state[k],k);
  state.connections??=initialConnections();state.creatorName??='My studio';
  string(state.creatorName,'Creator name');array(state.connections,'Connections');
  for(const c of state.campaigns){
    object(c,'Campaign');id(c.id,'Campaign');platform(c.platform);string(c.name,'Campaign name');
    if(!['draft','running','paused','stopped','completed'].includes(c.status))fail('Invalid campaign status.');
    object(c.settings,'Campaign settings');array(c.records,'Campaign records',500);array(c.events??=[],'Campaign events',500);
    for(const event of c.events){object(event,'Event');string(event.time,'Event time');string(event.text,'Event text');}
    for(const row of c.records){object(row,'Record');id(row.id,'Record');for(const k of ['username','email','mockOutcome','status'])string(row[k],`Record ${k}`);}
    unique(c.records,'id','Campaign records');
    if(c.workflow!==undefined)steps(c.workflow,'Campaign workflow');
    if(c.requirements!==undefined)requirements(c.requirements);
    if(c.bindings!==undefined){object(c.bindings,'Campaign bindings');for(const v of Object.values(c.bindings))string(v,'Connection binding');}
  }
  unique(state.campaigns,'id','Campaigns');
  for(const s of state.solutions){
    object(s,'Solution');id(s.id,'Solution');platform(s.platform);
    for(const k of ['title','creator','version','description','status'])string(s[k],`Solution ${k}`);
    if(!['draft','published'].includes(s.status))fail('Invalid solution status.');
    if(!Number.isFinite(Number(s.price))||Number(s.price)<0)fail('Invalid solution price.');
    steps(s.steps,'Solution steps');requirements(s.requirements??=[]);
    if(s.capabilities!==undefined){array(s.capabilities,'Capabilities');s.capabilities.forEach(v=>string(v,'Capability'));}
  }
  unique(state.solutions,'id','Solutions');
  for(const l of state.licenses){object(l,'Demo unlock');id(l.solutionId,'Demo unlock');string(l.version,'Unlock version');}
  unique(state.licenses,'solutionId','Demo unlocks');
  for(const c of state.connections){
    object(c,'Connection');id(c.id,'Connection');string(c.name,'Connection name');
    if(!providers.some(p=>p.id===c.provider)||!['mock','balance-only'].includes(c.mode))fail('Unsupported connection profile.');
    for(const k of ['budget','timeout'])if(!Number.isFinite(Number(c[k])))fail(`Invalid connection ${k}.`);
    // Credential references and test results belong to one running service, not backups.
    delete c.credentialRef;delete c.balance;delete c.checkedAt;c.status='untested';
  }
  unique(state.connections,'id','Connections');
  return state;
}
