const form=document.getElementById('rsvp-form');
const statusEl=document.getElementById('form-status');
const attending=document.getElementById('attending-fields');
const submit=form.querySelector('[type=submit]');
const deadline=Date.parse('2026-12-06T00:00:00-05:00');
function updateAttendance(){const yes=form.elements.attendance.value==='yes';attending.hidden=!yes;form.elements.guestCount.disabled=!yes;}
form.querySelectorAll('[name=attendance]').forEach(el=>el.addEventListener('change',updateAttendance));updateAttendance();
const suppliedCode=new URLSearchParams(location.search).get('invite');
if(suppliedCode){form.elements.invitationCode.value=suppliedCode;window.history.replaceState(null,'',location.pathname+location.hash);}
form.addEventListener('submit',async(e)=>{
 e.preventDefault();statusEl.textContent='';
 if(Date.now()>=deadline){statusEl.textContent='The December 5 RSVP deadline has passed. Please contact the event organizer.';return;}
 const fullName=form.elements.fullName.value.trim(),email=form.elements.email.value.trim();
 if(!/^[a-fA-F0-9\s-]{32,50}$/.test(form.elements.invitationCode.value.trim())||form.elements.invitationCode.value.replace(/[\s-]/g,'').length!==32){statusEl.textContent='Please enter the 32-character invitation code.';form.elements.invitationCode.focus();return;}
 if(fullName.length<2){statusEl.textContent='Please enter your full name.';form.elements.fullName.focus();return;}
 if(!form.elements.email.validity.valid||!email){statusEl.textContent='Please enter a valid email address.';form.elements.email.focus();return;}
 const data={invitationCode:form.elements.invitationCode.value,fullName,email,attendance:form.elements.attendance.value,guestCount:form.elements.attendance.value==='yes'?Number(form.elements.guestCount.value):0,message:form.elements.message.value.trim(),website:form.elements.website.value};
 submit.disabled=true;submit.textContent='Submitting…';
 try{
  const resp=await fetch('/api/rsvp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const body=await resp.json().catch(()=>({}));
  if(!resp.ok)throw new Error(body.error||'RSVP service is currently unavailable.');
  form.hidden=true;document.getElementById('success-message').hidden=false;
  document.getElementById('success-description').textContent=data.attendance==='yes'?`We have recorded your acceptance for ${data.guestCount} attendee${data.guestCount===1?'':'s'}. You can use your invitation code again before the RSVP deadline to change your response.`:'Your decline has been recorded. Thank you for letting us know.';
 }catch(err){statusEl.textContent=err.message;}finally{submit.disabled=false;submit.innerHTML='Submit RSVP <span>↗</span>';}
});
document.getElementById('new-rsvp').addEventListener('click',()=>{form.reset();updateAttendance();form.hidden=false;document.getElementById('success-message').hidden=true;statusEl.textContent='';form.elements.invitationCode.focus();});
const links=[...document.querySelectorAll('[data-link]')];
if('IntersectionObserver' in window){const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting)links.forEach(a=>a.classList.toggle('active',a.dataset.link===e.target.id));});},{rootMargin:'-30% 0px -55% 0px'});document.querySelectorAll('main>.page').forEach(s=>obs.observe(s));}
