import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const base=new URL('../',import.meta.url);
const theme=readFileSync(new URL('theme.js',base),'utf8');
const privateHtml=readFileSync(new URL('event.html',base),'utf8');
const publicHtml=readFileSync(new URL('index.html',base),'utf8');
const privateCss=readFileSync(new URL('styles.css',base),'utf8');
const publicCss=readFileSync(new URL('access.css',base),'utf8');

function simulate({stored=null,storageDisabled=false,systemDark=true,noMatchMedia=false,legacyMedia=false,mediaThrows=false}={}){
 const values=new Map(stored===null?[]:[['bcr-color-theme',stored]]);
 const calls={};
 const meta={value:null,setAttribute(key,val){assert.equal(key,'content');this.value=val;}};
 const icon={textContent:''},label={textContent:''};
 const toggle={attrs:{},setAttribute(name,val){this.attrs[name]=val;},querySelector(s){
   return s==='.theme-toggle-icon'?icon:s==='.theme-toggle-label'?label:null;
 },addEventListener(name,fn){calls[name]=fn;}};
 const listeners={},mediaListeners={};
 const media={matches:systemDark,media:'(prefers-color-scheme: dark)'};
 if(legacyMedia)media.addListener=fn=>{mediaListeners.change=fn;};
 else media.addEventListener=(name,fn)=>{mediaListeners[name]=fn;};
 const doc={documentElement:{dataset:{},style:{}},
   querySelector(s){return s==='meta[name="theme-color"]'?meta:null;},
   getElementById(id){return id==='theme-toggle'?toggle:null;},
   addEventListener(name,fn){listeners[name]=fn;}};
 const storage={getItem(k){if(storageDisabled)throw Error('disabled');return values.get(k)||null;},
   setItem(k,val){if(storageDisabled)throw Error('disabled');values.set(k,val);}};
 const win={localStorage:storage};
 if(!noMatchMedia)win.matchMedia=query=>{
   assert.equal(query,'(prefers-color-scheme: dark)');
   if(mediaThrows)throw Error('restricted media query');
   return media;
 };
 runInNewContext(theme,{window:win,document:doc});
 return {doc,values,toggle,meta,icon,label,ready(){listeners.DOMContentLoaded();},click(){calls.click();},
   systemChange(dark){media.matches=dark;mediaListeners.change?.({matches:dark});}};
}
test('first paint follows OS scheme, stored preference takes priority, and unsupported APIs fall back safely',()=>{
 const dark=simulate({systemDark:true});
 assert.equal(dark.doc.documentElement.dataset.theme,'dark');
 assert.equal(dark.doc.documentElement.style.colorScheme,'dark');
 assert.equal(dark.meta.value,'#101b18');
 const light=simulate({systemDark:false});
 assert.equal(light.doc.documentElement.dataset.theme,'light');
 assert.equal(light.doc.documentElement.style.colorScheme,'light');
 assert.equal(light.meta.value,'#f7f0e4');
 const saved=simulate({stored:'dark',systemDark:false});
 assert.equal(saved.doc.documentElement.dataset.theme,'dark');
 assert.equal(simulate({stored:'light',systemDark:true}).doc.documentElement.dataset.theme,'light');
 assert.equal(simulate({stored:'invalid',systemDark:false}).doc.documentElement.dataset.theme,'light');
 assert.equal(simulate({noMatchMedia:true}).doc.documentElement.dataset.theme,'dark');
 assert.equal(simulate({mediaThrows:true}).doc.documentElement.dataset.theme,'dark');
 const fallback=simulate({storageDisabled:true,systemDark:false});
 assert.equal(fallback.doc.documentElement.dataset.theme,'light');
 fallback.ready();fallback.click();
 assert.equal(fallback.doc.documentElement.dataset.theme,'dark');
});
test('toggle is usable by keyboard and click, changes labels, and persists both modes',()=>{
 const ui=simulate();ui.ready();
 assert.equal(ui.toggle.attrs['aria-label'],'Switch to light mode');
 assert.equal(ui.toggle.attrs['aria-pressed'],undefined);
 assert.equal(ui.label.textContent,'Light mode');
 ui.click();
 assert.equal(ui.doc.documentElement.dataset.theme,'light');
 assert.equal(ui.values.get('bcr-color-theme'),'light');
 assert.equal(ui.toggle.attrs['aria-label'],'Switch to dark mode');
 assert.equal(ui.toggle.attrs['aria-pressed'],undefined);
 assert.equal(ui.icon.textContent,'☾');
 ui.click();
 assert.equal(ui.doc.documentElement.dataset.theme,'dark');
 assert.equal(ui.values.get('bcr-color-theme'),'dark');
 assert.equal(ui.toggle.attrs['aria-label'],'Switch to light mode');
});
test('a system change updates a first-time visitor live, but never overwrites a manually saved choice',()=>{
 const ui=simulate({systemDark:false});
 ui.ready();ui.systemChange(true);
 assert.equal(ui.doc.documentElement.dataset.theme,'dark');
 assert.equal(ui.meta.value,'#101b18');
 assert.equal(ui.toggle.attrs['aria-label'],'Switch to light mode');
 assert.equal(ui.values.has('bcr-color-theme'),false,'system-only preferences must not be persisted');
 ui.click(); // User chooses Light and now owns the preference.
 assert.equal(ui.doc.documentElement.dataset.theme,'light');
 assert.equal(ui.values.get('bcr-color-theme'),'light');
 ui.systemChange(false);ui.systemChange(true);
 assert.equal(ui.doc.documentElement.dataset.theme,'light');
 const saved=simulate({stored:'dark',systemDark:false});
 saved.ready();saved.systemChange(false);saved.systemChange(true);
 assert.equal(saved.doc.documentElement.dataset.theme,'dark');
});
test('older Safari and disabled storage respect live system changes until a manual toggle',()=>{
 const legacy=simulate({legacyMedia:true,systemDark:true});
 legacy.ready();legacy.systemChange(false);
 assert.equal(legacy.doc.documentElement.dataset.theme,'light');
 const privateBrowser=simulate({storageDisabled:true,systemDark:true});
 privateBrowser.ready();privateBrowser.systemChange(false);
 assert.equal(privateBrowser.doc.documentElement.dataset.theme,'light');
 privateBrowser.click();
 assert.equal(privateBrowser.doc.documentElement.dataset.theme,'dark');
 privateBrowser.systemChange(true);privateBrowser.systemChange(false);
 assert.equal(privateBrowser.doc.documentElement.dataset.theme,'dark');
});
test('both pages load the same early theme controller and expose semantic switches',()=>{
 for(const html of [privateHtml,publicHtml]){
   assert.match(html,/<script src="\/theme\.js"><\/script>/);
   assert.ok(html.indexOf('/theme.js')<html.indexOf('.css'),'Theme initializes before stylesheet');
   assert.equal((html.match(/id="theme-toggle"/g)||[]).length,1);
   assert.match(html,/<button class="[^"]*theme-toggle[^"]*" id="theme-toggle" type="button"/);
   assert.doesNotMatch(html,/aria-pressed="true"/);
   assert.match(html,/class="theme-toggle-icon" aria-hidden="true"/);
 }
 assert.match(publicHtml,/id="access-form"/);
 assert.match(privateHtml,/id="rsvp-form"/);
 assert.match(privateHtml,/class="holiday-tree"/);
 assert.match(privateHtml,/BCR-yacht-hero-loop-polished\.mp4/);
});
test('private page has contrast treatments for invitation, RSVP, map and layout',()=>{
 assert.match(privateCss,/html\[data-theme="dark"\] \.invitation\{/);
 assert.match(privateCss,/html\[data-theme="dark"\] \.invitation \.rsvp-card\{/);
 assert.match(privateCss,/html\[data-theme="dark"\] \.invitation \.rsvp-card input:not/);
 assert.match(privateCss,/html\[data-theme="dark"\] \.invitation \.rsvp-card \.attendance-option input:checked\+span/);
 assert.match(privateCss,/html\[data-theme="light"\] \.info\{/);
 assert.match(privateCss,/html\[data-theme="light"\] \.info-panel\{/);
 assert.match(privateCss,/html\[data-theme="light"\] \.dock-map figcaption/);
 assert.match(privateCss,/@media\(max-width:470px\)/);
 assert.match(privateCss,/\.theme-toggle:focus-visible\{/);
 assert.match(privateCss,/prefers-reduced-motion:reduce/);
 assert.equal((privateCss.match(/{/g)||[]).length,(privateCss.match(/}/g)||[]).length);
});
test('public entrance light mode retains verification form and readable controls',()=>{
 assert.match(publicCss,/html\[data-theme="light"\] \.access-form\{/);
 // Option A is scoped to the public entrance in light mode; night mode is untouched.
 assert.match(publicCss,/html\[data-theme="light"\] \.masthead \.masthead-mark\{background:radial-gradient\(ellipse at center,rgba\(255,248,235,\.75\) 0%,rgba\(255,248,235,\.22\) 44%,transparent 72%\)\}/);
 assert.doesNotMatch(publicCss,/html\[data-theme="light"\] \.masthead \.masthead-mark\{[^}]*rgba\(24,45,34/);
 assert.match(publicCss,/\.masthead \.official-crest-entrance\{[^}]*object-fit:contain/);

 assert.match(publicCss,/html\[data-theme="light"\] \.access-form input\{/);
 assert.match(publicCss,/\.entrance-theme-toggle:focus-visible\{/);
 assert.match(publicCss,/@media\(max-width:640px\)/);
 assert.match(publicCss,/prefers-reduced-motion:reduce/);
 assert.equal((publicCss.match(/{/g)||[]).length,(publicCss.match(/}/g)||[]).length);
});
