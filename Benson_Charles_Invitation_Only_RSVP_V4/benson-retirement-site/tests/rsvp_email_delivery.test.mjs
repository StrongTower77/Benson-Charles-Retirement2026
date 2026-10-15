import test from 'node:test';
import assert from 'node:assert/strict';
import { processRsvpEmailQueue } from '../lib/rsvp-emails.js';
import cronHandler from '../api/rsvp-email-drain.js';

const envKeys=['RSVP_ADMIN_EMAILS','RSVP_EMAIL_FROM','RESEND_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET'];
const job=(id,audience,snapshot={},attempts=1)=>({
  id,audience,event_type:'submitted',attempts,
  snapshot:{fullName:'Sample Guest',email:'guest@example.test',attendance:'yes',guestCount:2,message:'See you there',...snapshot}
});
const adminJob=job('11111111-1111-4111-8111-111111111111','admins');
const guestJob=job('22222222-2222-4222-8222-222222222222','guest');
async function withEnvironment(fn){
  const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  const originalFetch=globalThis.fetch;
  Object.assign(process.env,{
    RSVP_ADMIN_EMAILS:'admin1@example.test,admin2@example.test',
    RSVP_EMAIL_FROM:'sender@example.test',
    RESEND_API_KEY:'fake_restricted_provider_token',
    SUPABASE_URL:'https://database.example.test',
    SUPABASE_SERVICE_ROLE_KEY:'fake_server_only_database_key',
    CRON_SECRET:'test-cron-authorization-secret-of-adequate-length'
  });
  try{return await fn();}
  finally{
    globalThis.fetch=originalFetch;
    for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }
}
function mockResponse(){
  return {headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},
    status(s){this.statusCode=s;return this;},json(payload){this.body=payload;return this;}};
}

test('outbox dispatches one notice to two admins and one private confirmation to the guest',async()=>withEnvironment(async()=>{
  const deliveries=[],completed=[],claimed=[];
  globalThis.fetch=async(url,opts)=>{
    const path=String(url),payload=JSON.parse(opts.body);
    if(path.endsWith('/claim_retirement_email_outbox')){claimed.push(payload);return new Response(JSON.stringify([adminJob,guestJob]),{status:200});}
    if(path.endsWith('/complete_retirement_email_outbox')){completed.push(payload);return new Response(null,{status:204});}
    if(path==='https://api.resend.com/emails'){
      deliveries.push({payload,headers:opts.headers});
      return new Response(JSON.stringify({id:'provider-'+deliveries.length}),{status:200});
    }
    throw Error('unexpected_target');
  };
  const result=await processRsvpEmailQueue();
  assert.deepEqual(result,{configured:true,attempted:2,sent:2});
  assert.equal(claimed.length,1);
  assert.deepEqual(deliveries[0].payload.to,['admin1@example.test','admin2@example.test']);
  assert.deepEqual(deliveries[1].payload.to,['guest@example.test']);
  assert.equal(deliveries[0].headers['Idempotency-Key'],'bcr-rsvp-'+adminJob.id);
  assert.equal(deliveries[1].headers['Idempotency-Key'],'bcr-rsvp-'+guestJob.id);
  assert.deepEqual(completed.map(x=>({attempt:x.p_attempt,success:x.p_success})),[{attempt:1,success:true},{attempt:1,success:true}]);
  assert.ok(deliveries.every(x=>!JSON.stringify(x.payload).includes('400 SE 2nd')));
}));

test('provider rejection queues retry and preserves attempt-specific completion',async()=>withEnvironment(async()=>{
  const completed=[],calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push(String(url));
    if(String(url).endsWith('/claim_retirement_email_outbox'))
      return new Response(JSON.stringify([adminJob]),{status:200});
    if(String(url)==='https://api.resend.com/emails')
      return new Response(JSON.stringify({error:'temporary'}),{status:429});
    if(String(url).endsWith('/complete_retirement_email_outbox')){
      completed.push(JSON.parse(opts.body));return new Response(null,{status:204});
    }
    throw Error('unexpected_target');
  };
  assert.deepEqual(await processRsvpEmailQueue(),{configured:true,attempted:1,sent:0});
  assert.equal(calls.filter(x=>x==='https://api.resend.com/emails').length,1);
  assert.equal(completed.length,1);
  assert.equal(completed[0].p_success,false);
  assert.equal(completed[0].p_error_code,'provider_429');
  assert.equal(completed[0].p_attempt,1);
}));

test('protected retry route rejects missing credentials, bad methods and wrong bearer token',async()=>withEnvironment(async()=>{
  const req={method:'GET',headers:{}},res=mockResponse();
  await cronHandler(req,res);
  assert.equal(res.statusCode,401);
  assert.deepEqual(res.body,{error:'Unauthorized.'});
  const bad=mockResponse();
  await cronHandler({method:'GET',headers:{authorization:'Bearer incorrect'}},bad);
  assert.equal(bad.statusCode,401);
  const method=mockResponse();
  await cronHandler({method:'POST',headers:{}},method);
  assert.equal(method.statusCode,405);
  assert.equal(method.headers.allow,'GET');
}));

test('authorized cron returns no private data and handles empty outbox',async()=>withEnvironment(async()=>{
  globalThis.fetch=async(url)=>{
    assert.match(String(url),/claim_retirement_email_outbox$/);
    return new Response('[]',{status:200});
  };
  const res=mockResponse();
  await cronHandler({method:'GET',headers:{authorization:'Bearer '+process.env.CRON_SECRET}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{ok:true,configured:true,attempted:0,sent:0});
}));
