import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';

export function createStore(directory){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const keyFile=path.join(directory,'credentials.key');
  if(!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600});
  const key=readFileSync(keyFile);if(key.length!==32)throw Error('Invalid credential encryption key.');
  const file=path.join(directory,'workspace.sqlite'),db=new DatabaseSync(file);
  try{chmodSync(file,0o600);}catch{}
  db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));CREATE INDEX IF NOT EXISTS entities_owner ON entities(kind,owner);');
  const get=(kind,id)=>{const row=db.prepare('SELECT data FROM entities WHERE kind=? AND id=?').get(kind,id);return row?JSON.parse(row.data):null;};
  const list=(kind,owner)=>db.prepare('SELECT data FROM entities WHERE kind=?'+(owner===undefined?'':' AND owner=?')).all(...(owner===undefined?[kind]:[kind,owner])).map(r=>JSON.parse(r.data));
  function put(kind,item){const row={...item,updatedAt:new Date().toISOString()};db.prepare('INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET owner=excluded.owner,data=excluded.data').run(kind,row.id,row.owner||'',JSON.stringify(row));return row;}
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
  function encrypt(value,scope){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(scope));const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');}
  function decrypt(value,scope){const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAAD(Buffer.from(scope));cipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString());}
  return {get,list,put,transaction,encrypt,decrypt,remove:(kind,id)=>db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run(kind,id),close:()=>db.close()};
}
