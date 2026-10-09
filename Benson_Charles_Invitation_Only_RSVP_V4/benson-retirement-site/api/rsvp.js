import { readSession, sameOrigin } from '../lib/session.js';
import { waitUntil } from '@vercel/functions';
import { emailSettings, processRsvpEmailQueue } from '../lib/rsvp-emails.js';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
 const session=readSession(req);
 if(!session)return res.status(401).json({error:'Please unlock your private invitation again.'});
 if(!sameOrigin(req))return res.status(403).json({error:'This request could not be verified.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json') || Number(req.headers['content-length']||0)>4096)
  return res.status(400).json({error:'Invalid request.'});
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'RSVP service is not yet configured. Please contact the organizer.'});
 try {
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b||typeof b!=='object'||Array.isArray(b))return res.status(400).json({error:'Invalid request.'});
  if(b.website)return res.status(400).json({error:'Unable to process your RSVP.'});
  const fullName=String(b.fullName||'').trim(),email=String(b.email||'').trim().toLowerCase(),attendance=b.attendance;
  const guestCount=attendance==='no'?0:Number(b.guestCount),message=String(b.message||'').trim();
  if(fullName.length<2||fullName.length>120||!EMAIL.test(email)||email.length>254||!['yes','no'].includes(attendance)||
     !Number.isInteger(guestCount)||guestCount<0||guestCount>session.maxGuests||(attendance==='yes'&&guestCount<1)||message.length>500)
   return res.status(400).json({error:'Please review your RSVP details.'});
  if(Date.now()>=Date.parse('2026-12-06T00:00:00-05:00'))return res.status(403).json({error:'The RSVP deadline has passed. Please contact the organizer.'});
  const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/submit_retirement_rsvp`,{
   method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({p_code_hash:session.hash,p_full_name:fullName,p_email:email,p_attendance:attendance,p_guest_count:guestCount,p_message:message}),
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){console.error('RSVP database error status',response.status);return res.status(503).json({error:'Could not save your RSVP. Please try again.'});}
  const result=await response.json();
  if(!result?.ok)return res.status(400).json({error:result?.reason==='guest_limit'?'This invitation does not allow that many attendees. Please adjust your guest count.':'Your invitation is no longer active. Contact the organizer for assistance.'});
  // RSVP is already committed. Delivery is best-effort in the background; a provider
  // outage never changes the saved RSVP outcome. Pending jobs are retried by cron.
  if(emailSettings())waitUntil(processRsvpEmailQueue().catch(err=>console.error('RSVP mail queue:',err?.name||'error')));
  return res.status(200).json({ok:true});
 }catch(err){console.error('RSVP error',err?.name);return res.status(503).json({error:'Unable to process RSVP right now.'});}
}
