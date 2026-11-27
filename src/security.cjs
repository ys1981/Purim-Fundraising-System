const crypto=require('node:crypto');
const ITERATIONS=210000;
const MIN_VERIFY_ITERATIONS=100000;
const MAX_VERIFY_ITERATIONS=1000000;
function hashCode(code){const salt=crypto.randomBytes(16);const hash=crypto.pbkdf2Sync(String(code),salt,ITERATIONS,32,'sha256');return 'pbkdf2$'+ITERATIONS+'$'+salt.toString('hex')+'$'+hash.toString('hex')}
function verifyCode(code,encoded){
 try{
  if(typeof encoded!=='string')return false;
  const parts=encoded.split('$');
  if(parts.length!==4)return false;
  const [kind,iter,saltHex,hashHex]=parts;
  const iterations=Number(iter);
  if(kind!=='pbkdf2'||!/^\d+$/.test(iter)||!Number.isSafeInteger(iterations)||iterations<MIN_VERIFY_ITERATIONS||iterations>MAX_VERIFY_ITERATIONS)return false;
  if(!/^[a-f0-9]{32}$/i.test(saltHex)||!/^[a-f0-9]{64}$/i.test(hashHex))return false;
  const actual=crypto.pbkdf2Sync(String(code),Buffer.from(saltHex,'hex'),iterations,32,'sha256');
  const expected=Buffer.from(hashHex,'hex');
  return crypto.timingSafeEqual(actual,expected);
 }catch{return false}
}
const ROLE_PRESETS={admin:['*'],viewer:['dashboard:read','donors:read','reports:read','audit:read','diagnostics:read'],frontdesk:['dashboard:read','frontdesk:read','donations:create'],collector:['dashboard:read','routes:read','donations:create']};
function allowed(user,permission){
 if(!user||!user.active)return false;
 const now=Date.now();
 if(user.allowed_from){const from=Date.parse(user.allowed_from);if(!Number.isFinite(from)||now<from)return false}
 if(user.allowed_until){const until=Date.parse(user.allowed_until);if(!Number.isFinite(until)||now>until)return false}
 let p;
 try{const parsed=JSON.parse(user.permissions_json||'{}');p=parsed.permissions??ROLE_PRESETS[user.role]??[]}
 catch{return false}
 if(!Array.isArray(p)||!p.every(x=>typeof x==='string'))return false;
 return p.includes('*')||p.includes(permission)
}
module.exports={hashCode,verifyCode,allowed,ROLE_PRESETS};
