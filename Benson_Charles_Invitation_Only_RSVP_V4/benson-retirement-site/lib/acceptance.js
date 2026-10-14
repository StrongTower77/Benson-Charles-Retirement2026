import { createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_SECONDS } from './session.js';

export const ACCEPTED_COOKIE='bc_accepted_rsvp';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validHash=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
function secret(){const k=process.env.RSVP_SESSION_SECRET;return typeof k==='string'&&k.length>=32?k:null;}
function hmac(value,k){return createHmac('sha256',k).update(value).digest('base64url');}
function cookieHeader(req){return typeof req.headers?.get==='function'?req.headers.get('cookie')||'':String(req.headers?.cookie||'');}
function getCookie(req,name){
 const part=cookieHeader(req).split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
 if(!part)return null;
 try{return decodeURIComponent(part.slice(name.length+1));}catch{return null;}
}
export function clearAcceptedCookie(){
 return ACCEPTED_COOKIE+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}
export function createAcceptedCookie(session,email){
 const k=secret(),normalized=String(email||'').trim().toLowerCase();
 if(!k||!validHash(session?.hash)||normalized.length>254||!EMAIL.test(normalized))throw Error('Cannot issue accepted ticket.');
 const payload={v:1,h:session.hash,e:normalized,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const part='v1.'+encoded;
 return ACCEPTED_COOKIE+'='+part+'.'+hmac(part,k)+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+SESSION_SECONDS;
}
export function readAcceptedTicket(req,session){
 const k=secret(),token=getCookie(req,ACCEPTED_COOKIE);
 if(!k||!session||!validHash(session.hash)||!token||token.length>900)return null;
 const parts=token.split('.');
 if(parts.length!==3||parts[0]!=='v1'||!parts.slice(1).every(x=>/^[A-Za-z0-9_-]+$/.test(x)))return null;
 const message=parts[0]+'.'+parts[1],a=Buffer.from(parts[2]),b=Buffer.from(hmac(message,k));
 if(a.length!==b.length||!timingSafeEqual(a,b))return null;
 try{
  const data=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  const now=Math.floor(Date.now()/1000);
  if(data.v!==1||data.h!==session.hash||typeof data.e!=='string'||
     data.e.length>254||!EMAIL.test(data.e)||data.e!==data.e.toLowerCase()||
     !Number.isInteger(data.exp)||data.exp<=now||data.exp>now+SESSION_SECONDS+60)return null;
  return {hash:data.h,email:data.e};
 }catch{return null;}
}
// This check is authoritative on EVERY private details/map request: a copied/old
// accepted ticket cannot resurrect a changed-to-no RSVP or an inactive invitation.
export async function hasAcceptedDetails(req,session){
 const ticket=readAcceptedTicket(req,session);
 if(!ticket)return false;
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return false;
 const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
 const fetchRows=async(table,params)=>{
  const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/'+table+'?'+params.toString(),
    {headers,signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(!r.ok)throw Error('Acceptance verification unavailable');
  const rows=await r.json();
  if(!Array.isArray(rows))throw Error('Unexpected verification result');
  return rows;
 };
 try{
  const invitations=await fetchRows('retirement_invitations',new URLSearchParams({
   select:'id',code_hash:'eq.'+ticket.hash,is_active:'eq.true',limit:'1'
  }));
  if(invitations.length!==1||typeof invitations[0].id!=='string')return false;
  const records=await fetchRows('retirement_rsvps',new URLSearchParams({
   select:'attendance',invitation_id:'eq.'+invitations[0].id,email:'eq.'+ticket.email,limit:'1'
  }));
  return records.length===1&&records[0].attendance==='yes';
 }catch(err){
  console.error('RSVP acceptance verification failed:',err?.name||'unknown');
  return false;
 }
}
