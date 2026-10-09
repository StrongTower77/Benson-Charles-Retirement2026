import test from 'node:test';
import assert from 'node:assert/strict';
import rsvp from '../api/rsvp.js';
import { createSession,COOKIE_NAME } from '../lib/session.js';

const originalFetch=globalThis.fetch;
const oldEnv=Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RSVP_SESSION_SECRET','RESEND_API_KEY','RSVP_ADMIN_EMAILS','RSVP_EMAIL_FROM']
  .map(k=>[k,process.env[k]]));
function setup(){
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='local_test_service_role';
  process.env.RSVP_SESSION_SECRET='local-test-session-secret-of-more-than-32-chars';
  for(const k of ['RESEND_API_KEY','RSVP_ADMIN_EMAILS','RSVP_EMAIL_FROM'])delete process.env[k];
}
function restore(){
  globalThis.fetch=originalFetch;
  for(const [key,v] of Object.entries(oldEnv)){if(v===undefined)delete process.env[key];else process.env[key]=v;}
}
function mockRequest(){
  const token=createSession({codeHash:'a'.repeat(64),maxGuests:4});
  return {
    method:'POST',headers:{cookie:COOKIE_NAME+'='+token,host:'example.test',origin:'https://example.test','content-type':'application/json','x-vercel-forwarded-for':'203.0.113.91'},
    body:{fullName:'Casey Guest',email:'casey@example.test',attendance:'yes',guestCount:2,message:'Looking forward to it'},
    socket:{remoteAddress:'203.0.113.91'}
  };
}
function mockResponse(){
  return {headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},
    status(n){this.statusCode=n;return this;},json(x){this.body=x;return this;}};
}
test('valid RSVP checks independent rate limit before committed DB write',async()=>{
  setup();let calls=[];
  globalThis.fetch=async(url)=>{
    calls.push(String(url));
    if(String(url).includes('check_retirement_rsvp_submit_limit'))return new Response('true',{status:200});
    if(String(url).includes('submit_retirement_rsvp'))return new Response(JSON.stringify({ok:true}),{status:200});
    throw Error('unexpected_network_call');
  };
  try{
    const res=mockResponse();
    await rsvp(mockRequest(),res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(res.body,{ok:true});
    assert.equal(calls.length,2);
    assert.match(calls[0],/check_retirement_rsvp_submit_limit/);
    assert.match(calls[1],/submit_retirement_rsvp/);
  }finally{restore();}
});
test('rate limited RSVP is rejected without database write or emails',async()=>{
  setup();let calls=0;
  globalThis.fetch=async(url)=>{calls++;assert.match(String(url),/check_retirement_rsvp_submit_limit/);return new Response('false',{status:200});};
  try{
    const res=mockResponse();
    await rsvp(mockRequest(),res);
    assert.equal(res.statusCode,429);
    assert.equal(res.headers['retry-after'],'600');
    assert.equal(calls,1);
  }finally{restore();}
});