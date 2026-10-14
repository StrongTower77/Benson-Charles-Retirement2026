import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../event.html',import.meta.url),'utf8');
const details=readFileSync(new URL('../lib/accepted-details.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('announcement has the exact approved copy and opening emphasis',()=>{
  assert.match(html,/<p class="eyebrow hero-opening">A life of dedication\.<br\/>A legacy to celebrate\.<\/p>/);
  assert.match(html,/<p class="hero-subhead"><strong>YOU<\/strong> are invited<\/p>/);
  assert.match(html,/hero-copy hero-copy-feature"><strong>Celebrate a remarkable career, Christmas cheer, and a joyful new chapter aboard the Venetian Lady yacht in Miami\.<\/strong>/);
  assert.doesNotMatch(html,/And you are invited to his party/);
});
test('invitation lead stays paragraph copy, attendee warning removed without changing the form',()=>{
  assert.match(html,/<p class="intro-copy"><span class="invite-lead">A Toast to Retirement &amp; Christmas Cheer\.<\/span>/);
  assert.match(html,/class="eyebrow rsvp-prompt">Kindly Respond/);
  assert.doesNotMatch(html,/Your invitation determines the permitted number of attendees/);
  assert.match(html,/id="rsvp-form"/);
  assert.match(html,/name="guestCount"/);
});
test('details and attire match the organizer wording',()=>{
  assert.match(details,/id="info-title">The Details <em>&amp; Directions<\/em>/);
  assert.match(details,/<strong>Ladies:<\/strong> dinner dresses or pantsuits\.<br\/><strong>Men:<\/strong> jacket, with or without tie\.<br\/><span>Festive cocktail attire encouraged\.<\/span>/);
});
test('approved hero media and access separation remain unchanged',()=>{
  assert.match(html,/BCR-yacht-hero-loop-polished\.mp4/);
  assert.match(html,/BCR-yacht-hero-poster\.jpg/);
  assert.match(html,/hero-official-crest/);
  assert.equal((html.match(/class="hero-sparkle hero-sparkle-/g)||[]).length,16);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
test('responsive emphasis is present without changing structural CSS',()=>{
  assert.match(css,/\.hero \.hero-copy-feature/);
  assert.match(css,/\.invitation \.section-intro \.intro-copy/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});

test('details and directions heading stays together at desktop and mobile widths',()=>{
  assert.match(css,/\.info \.section-intro #info-title\s*\{[^}]*white-space:nowrap/s);
  assert.match(css,/\.info \.section-intro #info-title\s*\{[^}]*font-size:clamp\(24px,5\.6vw,59px\)/s);
  assert.match(css,/@media\(max-width:470px\)\s*\{\s*\.info \.section-intro #info-title\s*\{\s*font-size:clamp\(24px,7vw,32px\)/s);
});


test('Page 2 uses the approved question instead of page numbering and keeps heading spacing',()=>{
  const section=html.match(/<section aria-labelledby="invite-title"[\s\S]*?<div class="invitation-grid">/)?.[0]||'';
  assert.doesNotMatch(section,/Page Two\s*·\s*You.re invited/);
  assert.match(section,/<div class="section-intro"><p class="eyebrow">Will we see you there\?<\/p><div class="ornament">/);
  assert.match(section,/<h2 id="invite-title">A Special Evening<em>of Celebration<\/em><\/h2>/);
  assert.match(css,/\.invitation \.section-intro #invite-title\{line-height:1\.12\}/);
  assert.match(css,/\.invitation \.section-intro #invite-title em\{display:block;margin-top:\.12em\}/);
  assert.match(css,/@media\(max-width:470px\)\{\.invitation \.section-intro #invite-title em\{margin-top:\.15em\}\}/);
});


test('festive decorations stay on Page 2, behind content and independent of RSVP behavior',()=>{
  const invitation=html.match(/<section aria-labelledby="invite-title"[\s\S]*?<\/section><\/main>/)?.[0]||'';
  assert.match(invitation,/class="holiday-garland" aria-hidden="true"/);
  assert.match(invitation,/class="holiday-tree" aria-hidden="true"/);
  assert.equal((invitation.match(/class="holiday-tree-star"/g)||[]).length,1);
  assert.equal((invitation.match(/class="holiday-tree-lights"/g)||[]).length,1);
  assert.equal((invitation.match(/class="holiday-bulbs"/g)||[]).length,1);
  assert.match(css,/\.invitation \.holiday-garland\{[^}]*z-index:0[^}]*pointer-events:none/);
  assert.match(css,/\.invitation \.section-intro,\.invitation \.invitation-grid\{position:relative;z-index:1\}/);
  assert.match(css,/@media\(max-width:1250px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\s*\.invitation \.holiday-bulbs circle/);
  assert.match(invitation,/id="rsvp-form"/);
  assert.match(html,/BCR-yacht-hero-loop-polished\.mp4/);
});


test('Page 3 removes the page number but preserves event information heading',()=>{
  const section=details.match(/<section aria-labelledby="info-title"[\s\S]*?<div class="info-grid">/)?.[0]||'';
  assert.match(section,/<div class="section-intro"><p class="eyebrow">Everything You Need to Know<\/p>/);
  assert.doesNotMatch(section,/Page Three|Page 3/);
  assert.match(section,/<h2 id="info-title">The Details <em>&amp; Directions<\/em><\/h2>/);
});

test('initial invitation contains just Pages 1 and 2, not the protected address/map',()=>{
  assert.doesNotMatch(html,/id="information"|Hyatt Miami Marina|400 SE 2nd Avenue|hyatt-docking-map\.png/);
  assert.match(html,/href="#information" hidden/);
  assert.match(html,/Boarding details unlock after an accepted RSVP/);
  assert.match(details,/hyatt-docking-map\.png/);
});
