import {createHash} from 'node:crypto';
export const stepTypes=['validate','set','http','review','wait','export'];
const safeKey=v=>typeof v==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
export const problem=(message,status=400)=>Object.assign(Error(message),{status});
const ensure=(condition,message)=>{if(!condition)throw problem(message);};
export function validateWorkflow(input){
  ensure(input&&typeof input==='object','Provide a workflow.');
  ensure(typeof input.title==='string'&&input.title.trim().length>=3&&input.title.length<=100,'Use a title between 3 and 100 characters.');
  ensure(typeof input.description==='string'&&input.description.length>=20&&input.description.length<=3000,'Describe the workflow in 20–3,000 characters.');
  ensure(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(input.version||''),'Use a semantic version such as 1.0.0.');
  ensure(Number.isInteger(input.priceCents)&&input.priceCents>=0&&input.priceCents<=999900,'Use a price between $0 and $9,999 in whole cents.');
  ensure(Array.isArray(input.steps)&&input.steps.length>=1&&input.steps.length<=40,'Use 1–40 steps.');
  const ids=new Set();
  const steps=input.steps.map((s,i)=>{
    ensure(s&&safeKey(s.id)&&!ids.has(s.id),'Every step needs a unique identifier.');ids.add(s.id);
    ensure(stepTypes.includes(s.type),`Step ${i+1}: choose a supported step type.`);
    ensure(typeof s.label==='string'&&s.label.trim()&&s.label.length<=120,`Name step ${i+1}.`);
    const c=s.config||{};ensure(c&&typeof c==='object'&&!Array.isArray(c),'Step configuration must be an object.');
    let config;
    if(s.type==='validate'){ensure(Array.isArray(c.required)&&c.required.length<=30&&c.required.every(safeKey),'Validation needs a list of input field names.');config={required:c.required};}
    if(s.type==='set'){ensure(c.values&&typeof c.values==='object'&&!Array.isArray(c.values)&&Object.keys(c.values).length<=30&&Object.keys(c.values).every(safeKey),'Set fields needs a values object.');config={values:c.values};}
    if(s.type==='http'){
      ensure(safeKey(c.connection),'HTTP steps need a named connection slot.');
      ensure(['GET','POST','PUT','PATCH','DELETE'].includes(c.method),'Choose an HTTP method.');
      ensure(typeof c.path==='string'&&c.path.startsWith('/')&&!c.path.startsWith('//')&&c.path.length<=2000&&!/[\r\n\\]/.test(c.path),'Use a relative API path beginning with /.');
      ensure(!c.path.includes('{{')||/^\/[\s\S]*$/.test(c.path),'Invalid API path.');
      ensure(c.body===undefined||typeof c.body==='object','HTTP body must be a JSON object or array.');
      config={connection:c.connection,method:c.method,path:c.path,body:c.body??null,timeoutSeconds:Math.max(1,Math.min(60,Number(c.timeoutSeconds)||20))};
    }
    if(s.type==='review'){ensure(typeof c.message==='string'&&c.message.length>0&&c.message.length<=1000,'Describe what the owner must review.');config={message:c.message};}
    if(s.type==='wait'){ensure(Number.isFinite(c.seconds)&&c.seconds>=0&&c.seconds<=3600,'Wait must be between 0 and 3,600 seconds.');config={seconds:c.seconds};}
    if(s.type==='export'){ensure(Array.isArray(c.fields)&&c.fields.length<=50&&c.fields.every(safeKey),'Export needs a list of field names.');config={fields:c.fields};}
    let when=null;if(s.when){ensure(safeKey(s.when.field)&&['equals','not_equals','exists'].includes(s.when.operator),'Use a supported step condition.');when={field:s.when.field,operator:s.when.operator,value:s.when.value??null};}
    return {id:s.id,type:s.type,label:s.label.trim(),config,when};
  });
  ensure(JSON.stringify(steps).length<=100000,'Workflow configuration is too large.');
  return {title:input.title.trim(),description:input.description,version:input.version,priceCents:input.priceCents,category:String(input.category||'General').slice(0,60),steps};
}
export const workflowHash=workflow=>createHash('sha256').update(JSON.stringify(workflow)).digest('hex');
export function validateRecords(records){
  ensure(Array.isArray(records)&&records.length>0&&records.length<=500,'Import between 1 and 500 records.');
  ensure(JSON.stringify(records).length<=1000000,'Records exceed the 1 MB limit.');
  return records.map((record,i)=>{
    ensure(record&&typeof record==='object'&&!Array.isArray(record),`Record ${i+1} must be an object.`);
    ensure(Object.keys(record).length<=50&&Object.keys(record).every(safeKey),`Record ${i+1} has an invalid field name.`);
    ensure(Object.values(record).every(v=>v===null||['string','number','boolean'].includes(typeof v)),`Record ${i+1}: use simple field values.`);
    ensure(!Object.keys(record).some(k=>/password|secret|token|api.?key/i.test(k)),'Store credentials in Connections, not campaign records.');
    return structuredClone(record);
  });
}
function lookup(data,key){let value=data;for(const part of key.split('.')){if(!safeKey(part)||value==null||!Object.hasOwn(value,part))throw problem('Template field is missing: '+key);value=value[part];}return value;}
export function template(value,data,{url=false}={}){
  if(typeof value==='string'){
    const exact=/^{{\s*([a-zA-Z][\w.]*)\s*}}$/.exec(value);if(exact&&!url)return structuredClone(lookup(data,exact[1]));
    return value.replace(/{{\s*([a-zA-Z][\w.]*)\s*}}/g,(_m,key)=>{const v=lookup(data,key);if(v!==null&&typeof v==='object')throw problem('Use a primitive value inside a text template.');return url?encodeURIComponent(String(v??'')):String(v??'');});
  }
  if(Array.isArray(value))return value.map(v=>template(v,data));
  if(value&&typeof value==='object'){const result={};for(const [k,v] of Object.entries(value)){ensure(!['__proto__','prototype','constructor'].includes(k),'Unsafe template key.');result[k]=template(v,data);}return result;}
  return value;
}
export function shouldRun(when,data){if(!when)return true;if(when.operator==='exists')return Object.hasOwn(data,when.field)&&data[when.field]!=null&&data[when.field]!=='';return when.operator==='equals'?data[when.field]===when.value:data[when.field]!==when.value;}
export const starterWorkflow=()=>({title:'Record validation and owner approval',description:'Validate each input record, pause for an owner decision, and export the approved results.',version:'1.0.0',priceCents:0,category:'Operations',steps:[{id:'validate',type:'validate',label:'Check the record',config:{required:['name','email']}},{id:'review',type:'review',label:'Owner approval',config:{message:'Review {{name}} ({{email}}) before continuing.'}},{id:'export',type:'export',label:'Export approved record',config:{fields:['name','email']}}]});
