import { createHash } from 'node:crypto';
import { createSession, COOKIE_NAME, SESSION_SECONDS, sameOrigin } from '../lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({error:'Method not allowed.'}); }
  if (!sameOrigin(req)) return res.status(403).json({error:'This request could not be verified.'});
  if (!String(req.headers['content-type']||'').startsWith('application/json') || Number(req.headers['content-length']||0)>2048)
    return res.status(400).json({error:'Invalid request.'});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.RSVP_SESSION_SECRET || process.env.RSVP_SESSION_SECRET.length<32)
    return res.status(503).json({error:'Private invitation access is not yet configured. Please contact the organizer.'});
  try {
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const code=String(body?.invitationCode||'').trim().toUpperCase().replace(/[\s-]/g,'');
    if (!(/^[A-Z0-9]{8,16}$/.test(code) || /^[A-F0-9]{32}$/.test(code)))
      return res.status(400).json({error:'Please check the code provided with your invitation.'});
    // Durable throttling protects short shared entry codes from online guessing.
    // Hash the requester identity with the server secret; no IP is stored in Supabase.
    const forwarded=String(req.headers['x-vercel-forwarded-for']||req.headers['x-real-ip']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unavailable').split(',')[0].trim();
    const fingerprint=createHash('sha256').update(process.env.RSVP_SESSION_SECRET+':'+forwarded).digest('hex');
    const limitResponse=await fetch(`${url.replace(/[/]$/,'')}/rest/v1/rpc/check_retirement_unlock_limit`,{
      method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_fingerprint:fingerprint}),signal:AbortSignal.timeout(8000),cache:'no-store'
    });
    if(!limitResponse.ok){console.error('Unlock limit check error:',limitResponse.status);return res.status(503).json({error:'Private invitation verification is temporarily unavailable.'});}
    const allowed=await limitResponse.json();
    if(allowed!==true){res.setHeader('Retry-After','600');return res.status(429).json({error:'Too many verification attempts. Please try again in 10 minutes.'});}
    const codeHash=createHash('sha256').update(code).digest('hex');
    const params=new URLSearchParams({select:'id,max_guests',code_hash:`eq.${codeHash}`,is_active:'eq.true',limit:'1'});
    const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/retirement_invitations?${params}`,{
      headers:{apikey:key,Authorization:`Bearer ${key}`,'Accept':'application/json'},signal:AbortSignal.timeout(8000),cache:'no-store'
    });
    if(!response.ok){console.error('Invitation lookup error:',response.status);return res.status(503).json({error:'Invitation verification is temporarily unavailable.'});}
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.length!==1||!Number.isInteger(rows[0].max_guests))
      return res.status(401).json({error:'We could not verify that code. Please check your invitation or contact the organizer.'});
    const token=createSession({codeHash,maxGuests:rows[0].max_guests});
    res.setHeader('Set-Cookie',`${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`);
    return res.status(200).json({ok:true});
  } catch(error){console.error('Invitation access error:',error?.name);return res.status(503).json({error:'Unable to verify your invitation right now. Please try again.'});}
}
