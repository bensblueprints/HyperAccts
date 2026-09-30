export const platforms = [
  {id:'gmail',name:'Gmail',mark:'G',color:'#c94c40',group:'Email',evidence:'Setup inspected',legacy:'Gmail',summary:'Account details, recovery contact, and mailbox preferences.',fields:[['recoveryEmail','Recovery email','email'],['mailAccess','Mailbox access','select','Off|On']],stages:['Account details','Recovery contact','Verification','Mailbox preferences'],note:'Main Gmail wizard inspected. The separate Gmail variant exposed by the legacy API is unavailable.'},
  {id:'youtube',name:'YouTube',mark:'▶',color:'#d64747',group:'Video',evidence:'Mock draft tested',legacy:'YouTube',summary:'Use an existing Google account and review channel setup.',fields:[['channelName','Channel name','text'],['recoveryEmail','Recovery email','email']],stages:['Google account','Channel details','Verification','Review'],note:'A mock username without a password passed the legacy wizard. No live YouTube action was run.'},
  {id:'outlook',name:'Outlook',mark:'O',color:'#247ccc',group:'Email',evidence:'Setup inspected',legacy:'Outlook',summary:'Mailbox identity, domain, and mail-access preferences.',fields:[['domain','Email domain','select','outlook.com|hotmail.com'],['mailAccess','Mailbox access','select','Off|On']],stages:['Mailbox identity','Account details','Verification','Mailbox preferences'],note:'Campaign creation works through the legacy API. Its account endpoints returned “Campaign not found” for that same campaign.'},
  {id:'facebook',name:'Facebook',mark:'f',color:'#3268d9',group:'Social',evidence:'Setup inspected',legacy:'Facebook',summary:'Choose a contact method and review profile details.',fields:[['contactMethod','Contact method','select','Email|Phone'],['profileName','Profile name','text']],stages:['Contact method','Profile details','Verification','Review'],note:'Inspected the setup sequence and saved an empty audit campaign. No live account registration was tested.'},
  {id:'reddit',name:'Reddit',mark:'r',color:'#da602a',group:'Social',evidence:'Catalog only',legacy:'Reddit',summary:'A proposed username and email workflow for the next adapter.',fields:[['communityNote','Workspace note','text']],stages:['Account details','Email contact','Verification','Review'],note:'Found in the installed catalog. Detailed wizard and runtime behavior remain unverified.'},
  {id:'instagram',name:'Instagram',mark:'◎',color:'#af438a',group:'Social',evidence:'Catalog only',legacy:'Instagram',summary:'A proposed profile and contact workflow for the next adapter.',fields:[['profileName','Profile name','text'],['contactMethod','Contact method','select','Email|Phone']],stages:['Profile details','Contact method','Verification','Review'],note:'Found in the installed catalog. Detailed wizard and runtime behavior remain unverified.'},
  {id:'amazon',name:'Amazon',mark:'a',color:'#b47b1d',group:'Commerce',evidence:'Setup inspected',legacy:'Amazon',summary:'Account contact, marketplace, and optional delivery details.',fields:[['marketplace','Marketplace','select','United States|United Kingdom|Germany|France|Canada|Saudi Arabia'],['deliveryAddress','Delivery note (optional)','text']],stages:['Account contact','Marketplace','Verification','Delivery details'],note:'Inspected all wizard stages through the final URL field. Required email fields allowed progression while empty.'},
  {id:'apple',name:'Apple',mark:'A',color:'#555e6d',group:'Developer',evidence:'Partial coverage',legacy:'AppleID',summary:'Separate ordinary Apple accounts from developer enrollment.',fields:[['accountType','Account type','select','Apple account|Apple Developer enrollment'],['organization','Organization (optional)','text']],stages:['Apple account','Enrollment details','Owner review','Review'],note:'AppleID wizard found. No dedicated Apple Developer module was found in the installed catalog. Enrollment here is a proposed workflow.'},
  {id:'google-play',name:'Google Play',mark:'▷',color:'#258676',group:'Developer',evidence:'New workflow',legacy:null,summary:'Separate a Google account from Play Console enrollment.',fields:[['accountType','Account type','select','Google account|Play Console enrollment'],['organization','Organization (optional)','text']],stages:['Google account','Enrollment details','Owner review','Review'],note:'No dedicated Google Play or Play Console module was found in the installed catalog. This is a proposed workflow.'}
];

export const sampleRecords = () => [
  {id:'r1',username:'morgan.demo',email:'morgan@example.invalid',firstName:'Morgan',lastName:'Demo',mockOutcome:'success',status:'pending'},
  {id:'r2',username:'river.demo',email:'river@example.invalid',firstName:'River',lastName:'Demo',mockOutcome:'review',status:'pending'},
  {id:'r3',username:'alex.demo',email:'alex@example.invalid',firstName:'Alex',lastName:'Demo',mockOutcome:'failure',status:'pending'}
];

export function parseCSV(text) {
  const input=String(text).replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false,afterQuote=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
    if(afterQuote&&c!==','&&c!=='\r'&&c!=='\n'&&c!==' '&&c!=='\t')throw new Error('Unexpected text after a quoted CSV field.');
    if(c==='"'){if(field.trim())throw new Error('A quote must begin a CSV field.');quoted=true;field='';}
    else if(c===','){row.push(field);field='';afterQuote=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';afterQuote=false;}
    else if(!afterQuote)field+=c;
  }
  if(quoted)throw new Error('A quoted CSV field is not closed.');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  if(!rows.length)throw new Error('The CSV file is empty.');
  const headers=rows.shift().map(v=>v.trim());
  if(new Set(headers).size!==headers.length)throw new Error('CSV headers must be unique.');
  for(const h of ['username','email'])if(!headers.includes(h))throw new Error(`Missing CSV column: ${h}.`);
  if(rows.length>500)throw new Error('Use up to 500 mock records per campaign.');
  const allowed=['username','email','firstName','lastName','mockOutcome'];
  if(headers.some(h=>!allowed.includes(h)))throw new Error('Use the template columns only. Passwords and service keys are not accepted in this demo.');
  return rows.map((r,i)=>{
    if(r.length!==headers.length)throw new Error(`CSV row ${i+2} has ${r.length} fields; expected ${headers.length}.`);
    const record={id:`import-${i+1}`,firstName:'',lastName:'',mockOutcome:'success',status:'pending'};
    headers.forEach((h,j)=>record[h]=r[j].trim());
    record.mockOutcome=record.mockOutcome||'success';return record;
  });
}

export function validateCampaign(c) {
  const errors=[];
  if(!c.name?.trim())errors.push({field:'name',message:'Give this campaign a name.'});
  if((c.name||'').length>80)errors.push({field:'name',message:'Keep the campaign name under 81 characters.'});
  if(!platforms.some(p=>p.id===c.platform))errors.push({field:'platform',message:'Choose a platform.'});
  if(!Array.isArray(c.records)||!c.records.length)errors.push({field:'records',message:'Add at least one mock record.'});
  if((c.records||[]).length>500)errors.push({field:'records',message:'Use up to 500 mock records.'});
  const seen=new Set();
  (c.records||[]).forEach((r,i)=>{
    const prefix=`Row ${i+1}: `;
    if(!r.username?.trim())errors.push({field:'records',row:i,message:prefix+'username is missing.'});
    if(!/^[^\s@]+@[^\s@]+\.invalid$/i.test(r.email||''))errors.push({field:'records',row:i,message:prefix+'use a mock email ending in .invalid.'});
    if(!['success','review','failure'].includes(r.mockOutcome))errors.push({field:'records',row:i,message:prefix+'outcome must be success, review, or failure.'});
    const key=(r.username||'').trim().toLowerCase();
    if(key&&seen.has(key))errors.push({field:'records',row:i,message:prefix+'duplicate username.'});seen.add(key);
  });
  return errors;
}

export function summary(c){const records=c.records||[];return {total:records.length,success:records.filter(r=>r.status==='success').length,review:records.filter(r=>r.status==='review').length,failure:records.filter(r=>r.status==='failure').length,done:records.filter(r=>['success','review','failure'].includes(r.status)).length};}
const event=(c,text)=>({...c,events:[...(c.events||[]),{time:new Date().toISOString(),text}].slice(-150)});
export function transition(c,action){
  let next=structuredClone(c);
  if(action==='start'){
    if(['running','paused'].includes(c.status))throw new Error('This campaign already has an active simulation.');
    const errors=validateCampaign(c);if(errors.length)throw new Error(errors[0].message);
    next.records=next.records.map(r=>({...r,status:'pending',message:''}));next.status='running';next.startedAt=new Date().toISOString();
    return event(next,'Simulation started. No external services are contacted.');
  }
  if(action==='pause'){if(c.status!=='running')throw new Error('Only a running simulation can be paused.');next.status='paused';return event(next,'Simulation paused.');}
  if(action==='resume'){if(c.status!=='paused')throw new Error('Only a paused simulation can be resumed.');next.status='running';return event(next,'Simulation resumed.');}
  if(action==='stop'){if(!['paused','running'].includes(c.status))throw new Error('There is no active simulation to stop.');next.status='stopped';next.records=next.records.map(r=>r.status==='running'?{...r,status:'pending'}:r);return event(next,'Simulation stopped. Completed records were preserved.');}
  if(action==='retry'){
    if(['running','paused'].includes(c.status))throw new Error('Finish or stop the current simulation first.');
    if(!next.records.some(r=>r.status==='failure'))throw new Error('There are no failed records to retry.');
    next.records=next.records.map(r=>r.status==='failure'?{...r,status:'pending',message:''}:r);next.status='running';return event(next,'Retrying failed records only. Demo outcomes remain as configured.');
  }
  if(action==='tick'){
    if(c.status!=='running')return c;
    const active=next.records.find(r=>r.status==='running');
    if(active){active.status=active.mockOutcome;active.message={success:'Simulated completion.',review:'Simulated owner review required.',failure:'Simulated connection timeout.'}[active.status];next=event(next,`${active.username}: ${active.message}`);}
    else {const pending=next.records.find(r=>r.status==='pending');if(pending){pending.status='running';next=event(next,`Processing mock record: ${pending.username}.`);}}
    if(!next.records.some(r=>['running','pending'].includes(r.status))){next.status='completed';next=event(next,'Simulation complete. Review the results below.');}
    return next;
  }
  throw new Error('Unknown action.');
}

export function recoverCampaigns(campaigns){return campaigns.map(c=>c.status==='running'?event({...c,status:'paused'},'Paused after the workspace was reopened. Resume when ready.'):c);}
export function makeCampaign(platform='youtube',name='YouTube onboarding demo'){
  return {id:crypto.randomUUID(),name,platform,status:'draft',createdAt:new Date().toISOString(),settings:{},records:sampleRecords(),events:[]};
}
