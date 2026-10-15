import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSession, COOKIE_NAME} from '../lib/session.js';
import {ACCEPTED_COOKIE,createAcceptedCookie,clearAcceptedCookie,readAcceptedTicket,hasAcceptedDetails} from '../lib/acceptance.js';
import details from '../api/accepted-details.js';
import rsvp from '../api/rsvp.js';
import middleware from '../middleware.js';

const secrets=['RSVP_SESSION_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const hash='a'.repeat(64),otherHash='b'.repeat(64),invitationId='11111111-1111-4111-8111-111111111111';
const email='respondent@example.test';
function setup(){
 const prior=Object.fromEntries(secrets.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 Object.assign(process.env,{
   RSVP_SESSION_SECRET:'mock-accepted-test-secret-kept-server-side-very-long',
   SUPABASE_URL:'https://example.supabase.test',
   SUPABASE_SERVICE_ROLE_KEY:'mock-role-key-not-real'
 });
 const session={hash,maxGuests:4},sessionToken=createSession({codeHash:hash,maxGuests:4});
 function request(cookie='',method='GET'){
  return {method,headers:{cookie,origin:'https://example.test',host:'example.test','content-type':'application/json'}};
 }
 function response(){
  return {headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
   status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;},
   send(v){this.payload=v;return this;}};
 }
 const acceptedCookie=createAcceptedCookie(session,email).split(';')[0];
 const cookies=COOKIE_NAME+'='+sessionToken+'; '+acceptedCookie;
 function database(attendance='yes',active=true){
  globalThis.fetch=async(url,opts)=>{
   const path=String(url);
   if(path.includes('/check_retirement_rsvp_submit_limit'))return new Response('true',{status:200});
   if(path.includes('/retirement_invitations?'))return new Response(JSON.stringify(active?[{id:invitationId}]:[]),{status:200});
   if(path.includes('/retirement_rsvps?'))return new Response(JSON.stringify(attendance?[{attendance}]:[]),{status:200});
   if(path.includes('/rpc/submit_retirement_rsvp'))return new Response(JSON.stringify({ok:true,maxGuests:4}),{status:200});
   throw Error('Unexpected database target '+path);
  };
 }
 function restore(){globalThis.fetch=originalFetch;for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 return {session,acceptedCookie,cookies,request,response,database,restore};
}
test('signed ticket is bound to invitation and respondent and cannot be forged',()=>{
 const c=setup();
 try{
  const ticket=readAcceptedTicket(c.request(c.cookies),c.session);
  assert.equal(ticket.hash,hash);assert.equal(ticket.email,email);
  assert.equal(readAcceptedTicket(c.request(c.cookies),{hash:otherHash,maxGuests:4}),null);
  assert.equal(readAcceptedTicket(c.request(c.cookies.replace(/.$/,'x')),c.session),null);
  assert.match(clearAcceptedCookie(),/Max-Age=0/);
 }finally{c.restore();}
});
test('live database revokes details immediately when RSVP declines or invitation deactivates',async()=>{
 const c=setup();
 try{
  c.database('yes');assert.equal(await hasAcceptedDetails(c.request(c.cookies),c.session),true);
  c.database('no');assert.equal(await hasAcceptedDetails(c.request(c.cookies),c.session),false);
  c.database('yes',false);assert.equal(await hasAcceptedDetails(c.request(c.cookies),c.session),false);
  c.database('yes');assert.equal(await hasAcceptedDetails(c.request(''),c.session),false);
 }finally{c.restore();}
});
test('details API forbids absent or declined RSVP and returns protected markup only to an accepted ticket',async()=>{
 const c=setup();
 try{
  c.database('yes');
  const noTicket=c.response();await details(c.request(COOKIE_NAME+'='+c.cookies.split(COOKIE_NAME+'=')[1].split(';')[0]),noTicket);
  assert.equal(noTicket.statusCode,403);assert.doesNotMatch(JSON.stringify(noTicket.payload),/Hyatt/);
  c.database('no');const declined=c.response();await details(c.request(c.cookies),declined);
  assert.equal(declined.statusCode,403);
  c.database('yes');const accepted=c.response();await details(c.request(c.cookies),accepted);
  assert.equal(accepted.statusCode,200);
  assert.match(accepted.headers['cache-control'],/no-store/);
  assert.match(accepted.payload,/id="information"/);
  assert.match(accepted.payload,/hyatt-docking-map\.png/);
  const post=c.response();await details(c.request(c.cookies,'POST'),post);
  assert.equal(post.statusCode,405);
 }finally{c.restore();}
});
test('middleware blocks static docking map unless database confirms this respondent',async()=>{
 const c=setup();
 try{
  const url='https://example.test/assets/hyatt-docking-map.png';
  const req=new Request(url,{headers:{cookie:c.cookies}});
  c.database('no');
  assert.equal((await middleware(req)).status,403);
  c.database('yes');
  assert.equal(await middleware(req),undefined);
  c.database('yes',false);
  assert.equal((await middleware(req)).status,403);
  const publicReq=new Request('https://example.test/lib/accepted-details.js');
  assert.equal(middleware(publicReq).status,404);
  const noCookie=new Request(url);
  assert.equal(middleware(noCookie).status,302);
 }finally{c.restore();}
});
test('RSVP endpoint issues a ticket only after committed yes and clears it after committed no',async()=>{
 const c=setup();
 try{
  c.database('yes');
  const makeBody=attendance=>({fullName:'Sample Guest',email,attendance,guestCount:attendance==='yes'?2:0,message:'',website:''});
  const yesReq=c.request(COOKIE_NAME+'='+c.cookies.split(COOKIE_NAME+'=')[1].split(';')[0],'POST');
  yesReq.body=makeBody('yes');
  const y=c.response();await rsvp(yesReq,y);
  assert.equal(y.statusCode,200);assert.equal(y.payload.detailsUnlocked,true);
  assert.match(y.headers['set-cookie'],/^bc_accepted_rsvp=v1\./);
  assert.match(y.headers['set-cookie'],/HttpOnly; Secure; SameSite=Lax/);
  const noReq={...yesReq,body:makeBody('no')};
  const n=c.response();await rsvp(noReq,n);
  assert.equal(n.statusCode,200);assert.equal(n.payload.detailsUnlocked,false);
  assert.match(n.headers['set-cookie'],/Max-Age=0/);
  assert.equal((readFileSync(new URL('../event.html',import.meta.url),'utf8').match(/Hyatt Miami Marina|hyatt-docking-map\.png/g)||[]).length,0);
 }finally{c.restore();}
});
