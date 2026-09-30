import {platforms} from './domain.mjs';
export const stepKinds=['Collect data','Validate inputs','Prepare workspace','Owner review','Export results'];
export const initialSolutions=()=>platforms.map((p,i)=>({
  id:`studio-${p.id}`,platform:p.id,title:`${p.name} workspace`,creator:'HyperAccts',version:'0.1.0',price:[0,0,0,29,19,29,39,49,49][i],
  description:p.summary,status:'published',origin:'built-in',evidence:p.evidence,
  steps:[{kind:'Collect data',label:p.stages[0]},{kind:'Validate inputs',label:'Check required fields'},{kind:'Owner review',label:p.stages[2]},{kind:'Export results',label:'Review and export'}],
  requirements:['reddit','instagram','apple','google-play'].includes(p.id)?[]:p.id==='gmail'?['SMS']:p.id==='outlook'?['CAPTCHA']:['SMS','CAPTCHA'],
  capabilities:['Mock data only','Local simulation','No external services'],publishedAt:'2026-09-30T00:00:00.000Z'
}));
export const initialLicenses=()=>['gmail','youtube','outlook','amazon'].map(p=>({solutionId:`studio-${p}`,version:'0.1.0',kind:'demo-unlock',unlockedAt:'2026-09-30T00:00:00.000Z',amount:0}));
export function validateSolution(s){
  const errors=[];
  if(!s.title?.trim())errors.push('Add a solution title.');
  if((s.title||'').length>70)errors.push('Keep the title under 71 characters.');
  if(!s.creator?.trim())errors.push('Add your creator name.');
  if((s.description||'').trim().length<20)errors.push('Describe your solution in at least 20 characters.');
  if(!/^\d+\.\d+\.\d+$/.test(s.version||''))errors.push('Use a version such as 1.0.0.');
  if(!Number.isFinite(Number(s.price))||Number(s.price)<0||Number(s.price)>9999)errors.push('Set a demo price between $0 and $9,999.');
  if(!platforms.some(p=>p.id===s.platform))errors.push('Choose a supported platform.');
  if(!Array.isArray(s.steps)||s.steps.length<2||s.steps.length>12)errors.push('Use between 2 and 12 workflow steps.');
  for(const [i,step] of (s.steps||[]).entries())if(!stepKinds.includes(step.kind)||!step.label?.trim())errors.push(`Complete workflow step ${i+1}.`);
  if(!(s.steps||[]).some(s=>s.kind==='Validate inputs'))errors.push('Include a Validate inputs step.');
  if((s.requirements||[]).some(r=>!['SMS','CAPTCHA'].includes(r)))errors.push('Choose SMS or CAPTCHA as connector requirements.');
  return errors;
}
export function unlockSolution(solution,licenses){
  if(solution.status!=='published')throw new Error('This solution is not published.');
  if(licenses.some(l=>l.solutionId===solution.id))throw new Error('This solution is already installed.');
  return [...licenses,{solutionId:solution.id,version:solution.version,kind:'demo-unlock',amount:Number(solution.price),unlockedAt:new Date().toISOString()}];
}
export function snapshotSolution(solution,licenses){
  if(!licenses.some(l=>l.solutionId===solution.id))throw new Error('Unlock this solution before creating a campaign.');
  return {solutionId:solution.id,solutionVersion:solution.version,solutionTitle:solution.title,creator:solution.creator,workflow:structuredClone(solution.steps),requirements:[...(solution.requirements||[])]};
}
