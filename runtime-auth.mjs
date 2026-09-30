import {randomBytes,randomUUID,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {problem} from './workflow-schema.mjs';
const derive=promisify(scrypt),digest=value=>createHash('sha256').update(value).digest('hex');
const publicUser=u=>u?{id:u.id,name:u.name,email:u.email,admin:!!u.admin}:null;
export async function createAuth({store,hosted=false,adminEmail=process.env.HYPERACCTS_ADMIN_EMAIL,adminPassword=process.env.HYPERACCTS_ADMIN_PASSWORD}){
  const attempts=new Map();
  async function passwordHash(password){const salt=randomBytes(16).toString('hex'),hash=await derive(password,salt,64);return salt+':'+hash.toString('hex');}
  async function add({email,password,name},admin=false){
    if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>200)throw problem('Enter a valid email.');email=email.toLowerCase().trim();
    if(typeof password!=='string'||password.length<12||password.length>200)throw problem('Use a password with 12–200 characters.');
    if(typeof name!=='string'||!name.trim()||name.length>80)throw problem('Enter a name with up to 80 characters.');
    const hash=await passwordHash(password);
    return store.transaction(()=>{if(store.list('user').some(u=>u.email===email))throw problem('An account with this email already exists.',409);return publicUser(store.put('user',{id:randomUUID(),email,name:name.trim(),password:hash,admin}));});
  }
  let local=store.get('user','local-owner');
  if(!hosted&&!local){local={id:'local-owner',name:'My workspace',email:'local@hyperaccts.invalid',admin:true};store.put('user',local);}
  if(hosted&&adminEmail&&!store.list('user').some(u=>u.email===adminEmail.toLowerCase())){
    if(!adminPassword)throw Error('Set HYPERACCTS_ADMIN_PASSWORD to bootstrap the marketplace administrator.');await add({email:adminEmail,password:adminPassword,name:'Marketplace administrator'},true);
  }
  if(hosted&&!store.list('user').some(u=>u.admin&&u.password))throw Error('Configure HYPERACCTS_ADMIN_EMAIL and HYPERACCTS_ADMIN_PASSWORD before hosting the marketplace.');
  function rate(key){const now=Date.now(),a=(attempts.get(key)||[]).filter(t=>now-t<600000);if(a.length>=12)throw problem('Too many sign-in attempts. Try again in ten minutes.',429);a.push(now);attempts.set(key,a);if(attempts.size>5000)for(const [k,v]of attempts)if(v.at(-1)<now-600000)attempts.delete(k);}
  function open(user){const token=randomBytes(32).toString('hex');store.put('session',{id:digest(token),owner:user.id,expires:Date.now()+86400000*7});return {user:publicUser(user),token};}
  function current(req){if(!hosted)return publicUser(local);const token=/\bhyper_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];if(!token)return null;const s=store.get('session',digest(token));return s&&s.expires>Date.now()?publicUser(store.get('user',s.owner)):null;}
  return {current,publicUser,hosted,
    async register(input,key){if(!hosted)throw problem('Local mode already has a workspace owner.');rate(key);const user=await add(input);return open(store.get('user',user.id));},
    async login({email,password},key){rate(key);const user=store.list('user').find(u=>u.email===String(email).toLowerCase().trim()),[salt,hash]=(user?.password||'0:').split(':');const supplied=await derive(String(password||'').slice(0,200),salt,64);if(!hash||!timingSafeEqual(supplied,Buffer.from(hash,'hex')))throw problem('Email or password is incorrect.',401);return open(user);},
    logout(req){const token=/\bhyper_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];if(token)store.remove('session',digest(token));},
  };
}
