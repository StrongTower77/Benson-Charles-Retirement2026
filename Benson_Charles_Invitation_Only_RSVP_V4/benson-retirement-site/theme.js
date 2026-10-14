/* Shared, server-independent appearance preference for the public entrance and gated invitation. */
(()=>{
  'use strict';
  const KEY='bcr-color-theme';
  const modes=['dark','light'];
  let mode='dark';
  try{
    const stored=window.localStorage.getItem(KEY);
    if(modes.includes(stored))mode=stored;
  }catch{} // Private browsing or disabled storage: the switch still works for this page.
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
    toggle.setAttribute('aria-pressed',next==='dark'?'true':'false');
    const icon=toggle.querySelector('.theme-toggle-icon');
    const label=toggle.querySelector('.theme-toggle-label');
    if(icon)icon.textContent=toLight?'☀':'☾';
    if(label)label.textContent=toLight?'Light mode':'Dark mode';
  }
  apply(mode); // Synchronous head script: apply the stored preference before CSS paints.
  document.addEventListener('DOMContentLoaded',()=>{
    const toggle=document.getElementById('theme-toggle');
    if(!toggle)return;
    apply(mode);
    toggle.addEventListener('click',()=>{
      mode=mode==='dark'?'light':'dark';
      apply(mode);
      try{window.localStorage.setItem(KEY,mode);}catch{}
    });
  });
})();
