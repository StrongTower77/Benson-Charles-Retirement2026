import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import unlock from '../api/unlock.js';

const originalFetch=globalThis.fetch;
const oldEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,secret:process.env.RSVP_SESSION_SECRET};
function setup(){
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
 process.env.RSVP_SESSION_SECRET='long-and-non-production-test-secret-with-extra-entropy';
}
function makeResponse(){
 const headers={};
 return {
  headers,
  setHeader(k,v){headers[k.toLowerCase()]=v;},
  status(n){this.statusCode=n;return this;},
  json(obj){this.payload=obj;return this;}
 };
}
function makeRequest(code){
 return {method:'POST',headers:{origin:'https://example.test',host:'example.test','content-type':'application/json','x-vercel-forwarded-for':'203.0.113.91'},body:{invitationCode:code}};
}

test('short mixed-character shared access code is normalized, hashed, and session-issued',async()=>{
 setup();
 let lookupHash,throttleChecked=false,lookups=0;
 globalThis.fetch=async (url,init)=>{
  if(String(url).includes('check_retirement_unlock_limit')){
   throttleChecked=true;
   assert.equal(init.method,'POST');
   const params=JSON.parse(init.body);
   assert.match(params.p_fingerprint,/^[a-f0-9]{64}$/);
   return new Response(JSON.stringify(true),{status:200});
  }
  lookups++;
  lookupHash=new URL(url).searchParams.get('code_hash');
  return new Response(JSON.stringify([{id:'shared-test',max_guests:4}]),{status:200});
 };
 try{
  const res=makeResponse();
  await unlock(makeRequest('WLYB2k26'),res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.payload,{ok:true});
  assert.equal(lookupHash,'eq.'+createHash('sha256').update('WLYB2K26').digest('hex'));
  assert.equal(throttleChecked,true);
  assert.equal(lookups,1);
  assert.match(res.headers['set-cookie'],/HttpOnly; Secure; SameSite=Lax/);
 }finally{globalThis.fetch=originalFetch;restore();}
});

test('short-code attempts are blocked at the rate limit',async()=>{
 setup();
 let lookups=0;
 globalThis.fetch=async(url)=>{
  if(String(url).includes('check_retirement_unlock_limit')) return new Response('false',{status:200});
  lookups++;return new Response('[]',{status:200});
 };
 try{
  const res=makeResponse();
  await unlock(makeRequest('WLYB2k26'),res);
  assert.equal(res.statusCode,429);
  assert.equal(res.headers['retry-after'],'600');
  assert.equal(lookups,0);
 }finally{globalThis.fetch=originalFetch;restore();}
});

test('existing 32-character hex codes remain supported',async()=>{
 setup();
 let hashSeen=false;
 globalThis.fetch=async(url)=>{
  if(String(url).includes('check_retirement_unlock_limit')) return new Response('true',{status:200});
  hashSeen=new URL(url).searchParams.get('code_hash')==='eq.'+createHash('sha256').update('ABCDEF0123456789ABCDEF0123456789').digest('hex');
  return new Response(JSON.stringify([{max_guests:2}]),{status:200});
 };
 try{
  const res=makeResponse();
  await unlock(makeRequest('abcdef0123456789abcdef0123456789'),res);
  assert.equal(res.statusCode,200);
  assert.equal(hashSeen,true);
 }finally{globalThis.fetch=originalFetch;restore();}
});

function restore(){
 if(oldEnv.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldEnv.url;
 if(oldEnv.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldEnv.key;
 if(oldEnv.secret===undefined)delete process.env.RSVP_SESSION_SECRET;else process.env.RSVP_SESSION_SECRET=oldEnv.secret;
}
