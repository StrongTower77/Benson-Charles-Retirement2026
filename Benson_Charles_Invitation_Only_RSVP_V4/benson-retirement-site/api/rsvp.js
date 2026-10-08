const { createHash } = require('node:crypto');
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'RSVP service is not yet configured. Please contact the organizer.'});
 try {
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b||typeof b!=='object'||Array.isArray(b))return res.status(400).json({error:'Invalid request.'});
  if(b.website)return res.status(200).json({ok:true}); // honeypot only; add rate limiting/Turnstile before launch
  const code=String(b.invitationCode||'').trim().toUpperCase().replace(/[\s-]/g,'');
  const fullName=String(b.fullName||'').trim(), email=String(b.email||'').trim().toLowerCase(), attendance=b.attendance;
  const guestCount=attendance==='no'?0:Number(b.guestCount), message=String(b.message||'').trim();
  if(!/^[A-F0-9]{32}$/.test(code))return res.status(400).json({error:'Enter the valid invitation code from your invitation.'});
  if(fullName.length<2||fullName.length>120||!EMAIL.test(email)||email.length>254||
    !['yes','no'].includes(attendance)||!Number.isInteger(guestCount)||guestCount<0||guestCount>12||
    (attendance==='yes'&&guestCount<1)||message.length>500)
    return res.status(400).json({error:'Please review your RSVP details.'});
  if(Date.now()>=Date.parse('2026-12-06T00:00:00-05:00'))return res.status(403).json({error:'The RSVP deadline has passed. Please contact the organizer.'});
  const codeHash=createHash('sha256').update(code).digest('hex');
  const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/submit_retirement_rsvp`,{
   method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({p_code_hash:codeHash,p_full_name:fullName,p_email:email,p_attendance:attendance,p_guest_count:guestCount,p_message:message})
  });
  if(!response.ok){console.error('RSVP database error status',response.status);return res.status(503).json({error:'Could not save your RSVP. Please try again.'});}
  const result=await response.json();
  if(!result?.ok) return res.status(400).json({error:result?.reason==='guest_limit'?'This invitation does not allow that many attendees. Please adjust your guest count.':'The invitation code could not be verified. Contact the organizer for assistance.'});
  return res.status(200).json({ok:true});
 }catch(err){console.error('RSVP error',err?.message);return res.status(400).json({error:'Unable to process RSVP.'});}
};
