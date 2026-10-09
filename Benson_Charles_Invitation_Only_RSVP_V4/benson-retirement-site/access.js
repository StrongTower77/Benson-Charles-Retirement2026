
const accessForm=document.getElementById('access-form');
const accessStatus=document.getElementById('access-status');
const accessButton=document.getElementById('unlock-button');
accessForm.addEventListener('submit',async e=>{
 e.preventDefault();accessStatus.textContent='';
 const code=accessForm.elements.invitationCode.value.trim().toUpperCase().replace(/[\s-]/g,'');
 if(!(/^[A-Z0-9]{8,16}$/.test(code)||/^[A-F0-9]{32}$/.test(code))){accessStatus.textContent='Please enter the code provided with your invitation.';accessForm.elements.invitationCode.focus();return;}
 accessButton.disabled=true;accessButton.textContent='Verifying invitation…';
 try{
  const response=await fetch('/api/unlock',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({invitationCode:code})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'We could not verify that invitation.');
  location.replace('/event');
 }catch(error){accessStatus.textContent=error.message;accessButton.disabled=false;accessButton.innerHTML='Unlock My Invitation <span aria-hidden="true">↗</span>';}
});
