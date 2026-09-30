export function parseRecords(text){
 if(text.trim().startsWith('[')){const rows=JSON.parse(text);if(!Array.isArray(rows))throw Error('Import a JSON array.');return rows;}
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else throw Error('Invalid CSV quotation.');}
 else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV has an unclosed quotation.');row.push(cell);if(row.some(Boolean))rows.push(row);
 const keys=rows.shift()?.map(s=>s.trim());if(!keys?.length||new Set(keys).size!==keys.length)throw Error('CSV needs unique column headings.');
 return rows.map((values,i)=>{if(values.length!==keys.length)throw Error('CSV row '+(i+2)+' has the wrong number of columns.');return Object.fromEntries(keys.map((key,n)=>[key,values[n]]));});
}
export const defaultStep=type=>({validate:{required:['name','email']},set:{values:{status:'approved'}},http:{connection:'api',method:'POST',path:'/records',body:{name:'{{name}}',email:'{{email}}'},timeoutSeconds:20},review:{message:'Review {{name}} before continuing.'},wait:{seconds:1},export:{fields:['name','email']}}[type]);
export const newWorkflow=()=>({title:'My workflow',description:'Validate records, request owner approval, and export the results.',version:'1.0.0',priceCents:0,category:'Operations',steps:['validate','review','export'].map((type,i)=>({id:'step'+(i+1),label:{validate:'Validate input',review:'Owner approval',export:'Export results'}[type],type,config:defaultStep(type)}))});
