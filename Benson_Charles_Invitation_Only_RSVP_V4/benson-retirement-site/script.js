const form=document.getElementById('rsvp-form');
const statusEl=document.getElementById('form-status');
const attending=document.getElementById('attending-fields');
const submit=form.querySelector('[type=submit]');
const deadline=Date.parse('2026-12-06T00:00:00-05:00');
function updateAttendance(){const yes=form.elements.attendance.value==='yes';attending.hidden=!yes;form.elements.guestCount.disabled=!yes;}
form.querySelectorAll('[name=attendance]').forEach(el=>el.addEventListener('change',updateAttendance));updateAttendance();
fetch('/api/session',{credentials:'same-origin',cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Access expired');const body=await response.json();const select=form.elements.guestCount;select.replaceChildren();for(let n=1;n<=Math.max(1,Math.min(12,body.maxGuests));n++){const option=document.createElement('option');option.value=String(n);option.textContent=`${n} Guest${n===1?'':'s'}`;select.append(option);}}).catch(()=>{location.replace('/');});
form.addEventListener('submit',async(e)=>{
 e.preventDefault();statusEl.textContent='';
 if(Date.now()>=deadline){statusEl.textContent='The December 5 RSVP deadline has passed. Please contact the event organizer.';return;}
 const fullName=form.elements.fullName.value.trim(),email=form.elements.email.value.trim();
 if(fullName.length<2){statusEl.textContent='Please enter your full name.';form.elements.fullName.focus();return;}
 if(!form.elements.email.validity.valid||!email){statusEl.textContent='Please enter a valid email address.';form.elements.email.focus();return;}
 const data={fullName,email,attendance:form.elements.attendance.value,guestCount:form.elements.attendance.value==='yes'?Number(form.elements.guestCount.value):0,message:form.elements.message.value.trim(),website:form.elements.website.value};
 submit.disabled=true;submit.textContent='Submitting…';
 try{
  const resp=await fetch('/api/rsvp',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const body=await resp.json().catch(()=>({}));
  if(resp.status===401){location.replace('/');return;}
  if(!resp.ok)throw new Error(body.error||'RSVP service is currently unavailable.');
  form.hidden=true;document.getElementById('success-message').hidden=false;
  document.getElementById('success-description').textContent=data.attendance==='yes'?`We have recorded your acceptance for ${data.guestCount} attendee${data.guestCount===1?'':'s'}. You may return before the RSVP deadline to update your response.`:'Your decline has been recorded. Thank you for letting us know.';
 }catch(err){statusEl.textContent=err.message;}finally{submit.disabled=false;submit.innerHTML='Submit RSVP <span>↗</span>';}
});
document.getElementById('new-rsvp').addEventListener('click',()=>{form.reset();updateAttendance();form.hidden=false;document.getElementById('success-message').hidden=true;statusEl.textContent='';});
const links=[...document.querySelectorAll('[data-link]')];
if('IntersectionObserver' in window){const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting)links.forEach(a=>a.classList.toggle('active',a.dataset.link===e.target.id));});},{rootMargin:'-30% 0px -55% 0px'});document.querySelectorAll('main>.page').forEach(s=>obs.observe(s));}


/* V7 hero playback: defer network cost for reduced-motion/data-saving clients. */
(()=> {
 const video=document.querySelector('.hero-yacht-video');
 if(!video)return;
 const scene=video.closest('.hero-art');
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
 const dataSaver=navigator.connection && navigator.connection.saveData;
 if(dataSaver||reduce.matches)return;
 video.addEventListener('playing',()=>scene.classList.add('is-playing'));
 video.addEventListener('error',()=>{scene.classList.remove('is-playing');video.pause()});
 const safePlay=()=>{if(!reduce.matches&&!document.hidden)video.play().catch(()=>scene.classList.remove('is-playing'));};
 const pause=()=>{video.pause();scene.classList.remove('is-playing');};
 document.addEventListener('visibilitychange',()=>document.hidden?pause():safePlay());
 reduce.addEventListener?.('change',()=>reduce.matches?pause():safePlay());
 if('IntersectionObserver' in window){
   const observer=new IntersectionObserver(entries=>entries[0]?.isIntersecting?safePlay():pause(),{threshold:.08});
   observer.observe(video.closest('.hero'));
 }else safePlay();
})();
