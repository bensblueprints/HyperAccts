import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {problem} from './workflow-schema.mjs';

export function publicAddress(address){
  if(net.isIP(address)===4){const a=address.split('.').map(Number);return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===198&&[18,19].includes(a[1]));}
  if(net.isIP(address)===6){const [first,second]=address.toLowerCase().split(':').map(x=>parseInt(x||'0',16));return first>=0x2000&&first<=0x3fff&&first!==0x2002&&first!==0x3fff&&!(first===0x2001&&(second<0x200||second===0xdb8));}
  return false;
}
export function connectionOrigin(value,{allowPrivate=false}={}){
  let u;try{u=new URL(value);}catch{throw problem('Enter a valid API origin.');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw problem('Use an API origin without a path, credentials or query.');
  if(!allowPrivate&&u.protocol!=='https:')throw problem('Public API connections must use HTTPS.');
  return u.origin;
}
export async function requestAPI({origin,path,method,body,headers={},timeoutSeconds=20,allowPrivate=false,signal},resolve=dns.lookup){
  const url=new URL(path,origin);if(url.origin!==origin||url.username||url.password)throw problem('A workflow cannot change its connection origin.');
  const records=await resolve(url.hostname.replace(/^\[|\]$/g,''),{all:true,verbatim:true});
  if(!records.length||!allowPrivate&&records.some(r=>!publicAddress(r.address)))throw problem('This connection resolves to a private or reserved network.');
  const pinned=records[0],transport=url.protocol==='https:'?https:http;
  const data=body==null?null:JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const req=transport.request(url,{method,agent:false,signal,headers:{accept:'application/json',...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}),...headers},lookup:(_host,options,cb)=>options.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family)},res=>{
      let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>262144){res.destroy();req.destroy(problem('API response exceeded 256 KB.'));}else chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>{
        const text=Buffer.concat(chunks).toString();let value;try{value=JSON.parse(text);}catch{value=text;}
        if(res.statusCode<200||res.statusCode>=300)return reject(problem('API returned HTTP '+res.statusCode,502));
        resolve({status:res.statusCode,data:value});
      });
    });
    const timer=setTimeout(()=>req.destroy(problem('API request timed out; inspect its outcome before retrying.',504)),timeoutSeconds*1000);
    req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end(data);
  });
}
