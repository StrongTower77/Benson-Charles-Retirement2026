// Server-only transactional RSVP notifications; no guest data or API keys in client code.
const VALID_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_URL='https://benson-charles-retirement2k26.vercel.app/';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayCount=n=>Number(n)===1?'1 attendee':String(n)+' attendees';
const accepted=job=>job.snapshot.attendance==='yes';

export function emailSettings(env=process.env){
  const admins=String(env.RSVP_ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  const from=String(env.RSVP_EMAIL_FROM||'').trim();
  const key=String(env.RESEND_API_KEY||'');
  if(admins.length!==2||new Set(admins).size!==2||admins.some(v=>!VALID_EMAIL.test(v))||
     !from||!VALID_EMAIL.test(from)||!key)return null;
  return {admins,from,key};
}
export function buildRsvpEmail(job,config){
  if(!job||!['guest','admins'].includes(job.audience)||!['submitted','updated'].includes(job.event_type)||
      !job.snapshot||!VALID_EMAIL.test(String(job.snapshot.email||'')))throw Error('invalid_notification_payload');
  const s=job.snapshot,yes=accepted(job),updated=job.event_type==='updated';
  const attendanceText=yes?'Joyfully Accept':'Regretfully Decline';
  const count=yes?displayCount(s.guestCount):'Not attending';
  const note=String(s.message||'').trim();
  const name=String(s.fullName||'').trim();
  if(!name||!['yes','no'].includes(s.attendance)||!Number.isInteger(s.guestCount)||
     (yes&&s.guestCount<1)||(s.attendance==='no'&&s.guestCount!==0))throw Error('invalid_notification_payload');
  const baseStyle='font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#20332b;';
  if(job.audience==='admins'){
    const subject=(updated?'Updated':'New')+' Retirement Celebration RSVP — '+name;
    const rows=[
      ['Guest',name],['Email',s.email],['Response',attendanceText],['Party size',count],
      ['Submission',updated?'Updated RSVP':'New RSVP']
    ];
    if(note)rows.push(['Message',note]);
    const txt=['Benson Charles Retirement Celebration',subject,'',...rows.map(([a,b])=>a+': '+b)].join('\n');
    const html='<div style="'+baseStyle+'"><h2 style="color:#a38348">Benson Charles Retirement Celebration</h2>'+
      '<p><strong>'+esc(updated?'RSVP updated':'New RSVP received')+'</strong></p>'+
      rows.map(([a,b])=>'<p><strong>'+esc(a)+':</strong> '+esc(b).replace(/\n/g,'<br>')+'</p>').join('')+
      '<p style="font-size:12px;color:#637267">This notice is intended only for the event administrators.</p></div>';
    return {from:'Benson Charles Retirement <'+config.from+'>',to:config.admins,subject,text:txt,html};
  }
  const subject='Your Benson Charles Retirement RSVP '+(updated?'Update':'Confirmation');
  const response=yes?'We have recorded your acceptance.':'We have recorded your response that you will not attend.';
  const txt=['Benson Charles Retirement Celebration','','Hello '+name+',','',
    response,yes?'Party size: '+count:'',updated?'This email confirms your updated RSVP.':'Thank you for responding.',
    'Celebration date: Saturday, December 26, 2026.','Time: 6:00 PM Eastern Time.',
    'Event information is available only after entering your invitation code at '+EVENT_URL,
    'If you did not submit this RSVP, please contact the event organizer.'].filter(Boolean).join('\n');
  const html='<div style="'+baseStyle+';max-width:600px;margin:auto;padding:28px;background:#faf7ef">'+
    '<p style="color:#9f7a40;letter-spacing:2px;font-size:12px">A PRIVATE CELEBRATION</p>'+
    '<h1 style="font:normal 32px Georgia,serif;color:#183126">Benson Charles<br>Retirement Celebration</h1>'+
    '<p>Hello '+esc(name)+',</p><p>'+esc(response)+'</p>'+
    (yes?'<p><strong>Party size:</strong> '+esc(count)+'</p>':'')+
    '<p>'+esc(updated?'Your updated RSVP is confirmed.':'Thank you for responding.')+'</p>'+
    '<p><strong>Date:</strong> Saturday, December 26, 2026<br><strong>Time:</strong> 6:00 PM Eastern Time</p>'+
    '<p>To review the private event details, <a href="'+EVENT_URL+'" style="color:#946f37">open the invitation website</a> and enter your invitation code.</p>'+
    '<p style="font-size:12px;color:#637267">If you did not submit this RSVP, please contact the event organizer.</p></div>';
  return {from:'Benson Charles Retirement <'+config.from+'>',to:[s.email],subject,text:txt,html};
}
async function databaseRpc(path,payload){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw Error('email_database_not_configured');
  const result=await fetch(base+'/rest/v1/rpc/'+path,{
    method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(7000)
  });
  if(!result.ok)throw Error('email_database_'+result.status);
  const raw=await result.text();
  return raw ? JSON.parse(raw) : null;
}
async function sendQueued(job,settings){
  const msg=buildRsvpEmail(job,settings);
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+settings.key,'Content-Type':'application/json','Idempotency-Key':'bcr-rsvp-'+job.id},
    body:JSON.stringify(msg),signal:AbortSignal.timeout(7000)
  });
  if(!response.ok)throw Error('provider_'+response.status);
  const body=await response.json();
  if(!body?.id)throw Error('provider_missing_id');
  return body.id;
}
export async function processRsvpEmailQueue({maxBatches=1}={}){
  const config=emailSettings();
  if(!config)return {configured:false,attempted:0,sent:0};
  let attempted=0,sent=0;
  for(let batch=0;batch<Math.min(10,Math.max(1,maxBatches));batch++){
    const jobs=await databaseRpc('claim_retirement_email_outbox',{p_limit:6});
    if(!Array.isArray(jobs)||!jobs.length)break;
    attempted+=jobs.length;
    await Promise.all(jobs.map(async job=>{
      let id=null,error=null;
      try{id=await sendQueued(job,config);}
      catch(err){error=err?.message?.startsWith('provider_')?err.message:'delivery_failure';}
      try{
        await databaseRpc('complete_retirement_email_outbox',{
          p_id:job.id,p_success:Boolean(id),p_provider_id:id,p_error_code:error
        });
        if(id)sent++;
      }catch(err){console.error('RSVP email completion error:',err?.message?.replace(/[^a-z0-9_]/gi,'').slice(0,70));}
    }));
    if(jobs.length<6)break;
  }
  return {configured:true,attempted,sent};
}
