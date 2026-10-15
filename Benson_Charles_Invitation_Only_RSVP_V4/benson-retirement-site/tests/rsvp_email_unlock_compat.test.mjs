import test from 'node:test';
import assert from 'node:assert/strict';
import rsvp from '../api/rsvp.js';
import {createSession,COOKIE_NAME} from '../lib/session.js';
import {ACCEPTED_COOKIE,readAcceptedTicket} from '../lib/acceptance.js';
import {buildRsvpEmail} from '../lib/rsvp-emails.js';

const variables=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RSVP_SESSION_SECRET',
  'RESEND_API_KEY','RSVP_ADMIN_EMAILS','RSVP_EMAIL_FROM'];
const HASH='a'.repeat(64);
async function setup(fn){
 const saved=Object.fromEntries(variables.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 Object.assign(process.env,{
  SUPABASE_URL:'https://example.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY:'fake_database_key_for_tests_only',
  RSVP_SESSION_SECRET:'mock-session-secret-for-accepted-details-in-tests',
  RESEND_API_KEY:'fake_provider_key_for_tests_only',
  RSVP_ADMIN_EMAILS:'one@example.test,two@example.test',
  RSVP_EMAIL_FROM:'invitations@example.test'
 });
 const cookie=COOKIE_NAME+'='+createSession({codeHash:HASH,maxGuests:4});
 const request=(attendance='yes')=>({
  method:'POST',headers:{cookie,origin:'https://example.test',host:'example.test',
   'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.23'},
  body:{fullName:'Sample Guest',email:'guest@example.test',attendance,
    guestCount:attendance==='yes'?2:0,message:'',website:''}
 });
 const response=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},
  status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;}});
 try{await fn({request,response,cookie});}
 finally{
  globalThis.fetch=originalFetch;
  for(const [k,v] of Object.entries(saved)){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
}
test('configured email flow keeps committed acceptance and signed access even if delivery is deferred',async()=>setup(async ctx=>{
 const calls=[];
 globalThis.fetch=async(url,init)=>{
  const target=String(url);calls.push(target);
  if(target.endsWith('/check_retirement_rsvp_submit_limit'))return new Response('true',{status:200});
  if(target.endsWith('/submit_retirement_rsvp')){
   assert.equal(JSON.parse(init.body).p_attendance,'yes');
   return new Response(JSON.stringify({ok:true}),{status:200});
  }
  if(target.endsWith('/claim_retirement_email_outbox'))return new Response('[]',{status:200});
  throw Error('No real provider or unexpected call: '+target);
 };
 const res=ctx.response();await rsvp(ctx.request('yes'),res);
 assert.equal(res.statusCode,200);
 assert.deepEqual(res.payload,{ok:true,detailsUnlocked:true});
 assert.match(res.headers['set-cookie'],/^bc_accepted_rsvp=v1\./);
 assert.match(res.headers['set-cookie'],/HttpOnly; Secure; SameSite=Lax/);
 const signed=res.headers['set-cookie'].split(';')[0];
 const s={hash:HASH,maxGuests:4};
 assert.equal(readAcceptedTicket({headers:{cookie:ctx.cookie+'; '+signed}},s).email,'guest@example.test');
 assert.deepEqual(calls.slice(0,2).map(x=>x.split('/').at(-1)),
  ['check_retirement_rsvp_submit_limit','submit_retirement_rsvp']);
 assert.ok(calls.some(x=>x.endsWith('/claim_retirement_email_outbox')));
 assert.ok(calls.every(x=>!x.includes('api.resend.com')),'mocked integration must not send real email');
}));
test('configured email flow does not preserve Page Three entitlement after committed decline',async()=>setup(async ctx=>{
 globalThis.fetch=async(url,init)=>{
  const path=String(url);
  if(path.endsWith('/check_retirement_rsvp_submit_limit'))return new Response('true',{status:200});
  if(path.endsWith('/submit_retirement_rsvp')){
   assert.equal(JSON.parse(init.body).p_attendance,'no');
   return new Response(JSON.stringify({ok:true}),{status:200});
  }
  if(path.endsWith('/claim_retirement_email_outbox'))return new Response('[]',{status:200});
  throw Error('unexpected mock target');
 };
 const res=ctx.response();await rsvp(ctx.request('no'),res);
 assert.equal(res.statusCode,200);
 assert.deepEqual(res.payload,{ok:true,detailsUnlocked:false});
 assert.match(res.headers['set-cookie'],/^bc_accepted_rsvp=;/);
 assert.match(res.headers['set-cookie'],/Max-Age=0/);
}));
test('failed or throttled RSVP never issues Page Three access or dispatches mail',async()=>setup(async ctx=>{
 const calls=[];
 let allowed=true;
 globalThis.fetch=async url=>{
  const target=String(url);calls.push(target);
  if(target.endsWith('/check_retirement_rsvp_submit_limit'))
   return new Response(allowed?'true':'false',{status:200});
  if(target.endsWith('/submit_retirement_rsvp'))
   return new Response(JSON.stringify({ok:false,reason:'guest_limit'}),{status:200});
  throw Error('No mail should be attempted on failed RSVP');
 };
 const bad=ctx.response();await rsvp(ctx.request(),bad);
 assert.equal(bad.statusCode,400);assert.equal(bad.headers['set-cookie'],undefined);
 allowed=false;
 const limited=ctx.response();await rsvp(ctx.request(),limited);
 assert.equal(limited.statusCode,429);assert.equal(limited.headers['set-cookie'],undefined);
 assert.ok(calls.every(x=>!x.includes('claim_retirement_email_outbox')));
}));
test('confirmation templates distinguish access rights; neither attendance result emails private directions',()=>{
 const config={admins:['one@example.test','two@example.test'],from:'sender@example.test'};
 const accepted={id:'11111111-1111-4111-8111-111111111111',audience:'guest',event_type:'submitted',
  snapshot:{fullName:'Sample Guest',email:'guest@example.test',attendance:'yes',guestCount:2,message:''}};
 const yes=buildRsvpEmail(accepted,config);
 const no=buildRsvpEmail({...accepted,event_type:'updated',snapshot:{...accepted.snapshot,attendance:'no',guestCount:0}},config);
 assert.match(yes.text,/Page 3.*accepted RSVP/);
 assert.match(yes.text,/resubmit your acceptance/);
 assert.match(no.text,/declined RSVP does not unlock/i);
 for(const msg of [yes,no]){
  assert.doesNotMatch(msg.text+msg.html,/Hyatt|400 SE 2nd|Marina|WLYB2k26|hyatt-docking-map|api\/accepted-details/i);
 }
});
