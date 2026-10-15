/* Shared, server-independent appearance preference for the public entrance and gated invitation. */
(()=>{
  'use strict';
  const KEY='bcr-color-theme';
  const modes=['dark','light'];
  let systemPreference=null;
  try{
    if(typeof window.matchMedia==='function')
      systemPreference=window.matchMedia('(prefers-color-scheme: dark)');
  }catch{} // Older/restricted browsers retain the previous dark default.
  let mode=systemPreference?(systemPreference.matches?'dark':'light'):'dark';
  let manualChoice=false;
  try{
    const stored=window.localStorage.getItem(KEY);
    if(modes.includes(stored)){mode=stored;manualChoice=true;}
  }catch{} // Storage-disabled browsers can still follow the OS and toggle manually.
  const root=document.documentElement;
  const themeColor=document.querySelector('meta[name="theme-color"]');
  function apply(next){
    root.dataset.theme=next;
    root.style.colorScheme=next;
    if(themeColor)themeColor.setAttribute('content',next==='light'?'#f7f0e4':'#101b18');
    const toggle=document.getElementById('theme-toggle');
    if(!toggle)return;
    const toLight=next==='dark';
    toggle.setAttribute('aria-label',toLight?'Switch to light mode':'Switch to dark mode');
    toggle.setAttribute('title',toLight?'Switch to light mode':'Switch to dark mode');
    // Action-labelled button: its name states the destination mode.
    const icon=toggle.querySelector('.theme-toggle-icon');
    const label=toggle.querySelector('.theme-toggle-label');
    if(icon)icon.textContent=toLight?'☀':'☾';
    if(label)label.textContent=toLight?'Light mode':'Dark mode';
  }
  // Run synchronously in <head> on both pages, before either stylesheet paints.
  apply(mode);
  if(systemPreference){
    const onSystemChange=event=>{
      if(manualChoice)return; // An explicit user preference always wins.
      mode=event.matches?'dark':'light';
      apply(mode);
    };
    if(typeof systemPreference.addEventListener==='function')
      systemPreference.addEventListener('change',onSystemChange);
    else if(typeof systemPreference.addListener==='function')
      systemPreference.addListener(onSystemChange); // Older Safari.
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const toggle=document.getElementById('theme-toggle');
    if(!toggle)return;
    apply(mode);
    toggle.addEventListener('click',()=>{
      mode=mode==='dark'?'light':'dark';
      manualChoice=true; // Persist the choice or keep it for this storage-disabled page.
      apply(mode);
      try{window.localStorage.setItem(KEY,mode);}catch{}
    });
  });
})();
