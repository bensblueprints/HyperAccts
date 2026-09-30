export const providers=[
 {id:'daisysms',name:'DaisySMS',category:'SMS',mark:'D',docs:'https://daisysms.io/docs/api',source:'Requested provider · official API documented',description:'A second number provider with its own workspace connection and balance check.'},
 {id:'5sim',name:'5SIM',category:'SMS',mark:'5',docs:'https://5sim.net/docs',source:'Observed in PVA Creator',description:'Named country, service, and operator settings.'},
 {id:'smspva',name:'SMSPVA',category:'SMS',mark:'S',docs:'https://docs.smspva.com/',source:'Observed in PVA Creator',description:'Activation and rental account configuration.'},
 {id:'hero-sms',name:'Hero SMS',category:'SMS',mark:'H',docs:null,source:'Observed in PVA Creator',description:'Provider profile for the service listed in the YouTube wizard. Current API contract remains to be verified.'},
 {id:'smsactivate',name:'SMS-Activate',category:'SMS',mark:'A',docs:null,source:'Listed in vendor API reference',description:'Legacy provider slot. Current availability and API compatibility require verification.'},
 {id:'2captcha',name:'2Captcha',category:'CAPTCHA',mark:'2',docs:'https://2captcha.com/api-docs',source:'Installed PVA extension found',description:'A reusable provider profile with consistent error and balance handling.'},
 {id:'anticaptcha',name:'Anti-Captcha',category:'CAPTCHA',mark:'A',docs:'https://anti-captcha.com/apidoc',source:'Installed PVA library found',description:'A named provider connection that solutions can request by capability.'},
 {id:'yescaptcha',name:'YesCaptcha',category:'CAPTCHA',mark:'Y',docs:'https://yescaptcha.com/',source:'Observed in PVA Creator',description:'Replaces repeated per-campaign API-key tables with one connection profile.'},
 {id:'nopecha',name:'NopeCHA',category:'CAPTCHA',mark:'N',docs:'https://developers.nopecha.com/',source:'Observed in PVA Creator',description:'Reusable connection settings and explicit timeouts.'}
];
export const initialConnections=()=>[
 {id:'mock-daisy',provider:'daisysms',name:'DaisySMS · alternative numbers',country:'United States',budget:5,timeout:180,mode:'mock',status:'untested'},
 {id:'mock-sms',provider:'smspva',name:'SMSPVA · default numbers',country:'United States',budget:5,timeout:180,mode:'mock',status:'untested'},
 {id:'mock-captcha',provider:'2captcha',name:'2Captcha · default CAPTCHA',country:'',budget:5,timeout:180,mode:'mock',status:'untested'}
];
export function validateConnection(c){const errors=[];if(!providers.some(p=>p.id===c.provider))errors.push('Choose a provider.');if(!c.name?.trim())errors.push('Give the connection a name.');if(!Number.isFinite(Number(c.budget))||Number(c.budget)<0)errors.push('Budget must be zero or a positive amount.');if(!Number.isFinite(Number(c.timeout))||Number(c.timeout)<10||Number(c.timeout)>600)errors.push('Set the timeout between 10 and 600 seconds.');if(c.mode!=='mock'&&!(c.mode==='balance-only'&&['2captcha','smspva','daisysms'].includes(c.provider)))errors.push('Only 2Captcha, SMSPVA, and DaisySMS support a live balance check in this version.');return errors;}
export function mockConnectionCheck(c){const errors=validateConnection(c);return errors.length?{ok:false,message:errors[0]}:{ok:true,message:'Mock connection check passed. No provider was contacted.',balance:'Simulated',checkedAt:new Date().toISOString()};}
export function requirementsFor(s){return s.requirements||[];}
export function checkRequirements(solution,connections,bindings={}){return requirementsFor(solution).flatMap(category=>{const connection=connections.find(c=>c.id===bindings[category]);if(!connection)return [`Choose a ${category} connection.`];const provider=providers.find(p=>p.id===connection.provider);if(provider?.category!==category)return [`Choose a compatible ${category} connection.`];return validateConnection(connection);});}
