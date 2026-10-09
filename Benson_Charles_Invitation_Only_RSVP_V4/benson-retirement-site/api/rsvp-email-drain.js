import { timingSafeEqual } from 'node:crypto';
import { processRsvpEmailQueue } from '../lib/rsvp-emails.js';

// Vercel Cron calls this route with Authorization: Bearer CRON_SECRET.
// Middleware allows routing here, but this function never exposes records.
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
  const secret=String(process.env.CRON_SECRET||'');
  if(secret.length<32)return res.status(503).json({error:'Service unavailable.'});
  const provided=String(req.headers.authorization||'');
  const expected='Bearer '+secret;
  const authorized=Buffer.byteLength(provided)===Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(provided),Buffer.from(expected));
  if(!authorized)return res.status(401).json({error:'Unauthorized.'});
  try{
    const result=await processRsvpEmailQueue({maxBatches:10});
    return res.status(200).json({ok:true,configured:result.configured,attempted:result.attempted,sent:result.sent});
  }catch(err){
    console.error('RSVP notification retry error',err?.name||'unknown');
    return res.status(503).json({error:'Notification retries temporarily unavailable.'});
  }
}
