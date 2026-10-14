import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../event.html',import.meta.url),'utf8');
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
  assert.match(html,/id="info-title">The Details <em>&amp; Directions<\/em>/);
  assert.match(html,/<strong>Ladies:<\/strong> dinner dresses or pantsuits\.<br\/><strong>Men:<\/strong> jacket, with or without tie\.<br\/><span>Festive cocktail attire encouraged\.<\/span>/);
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


test('Page 2 omits the eyebrow and maintains independent spaced title lines',()=>{
  const section=html.match(/<section aria-labelledby="invite-title"[\s\S]*?<div class="invitation-grid">/)?.[0]||'';
  assert.doesNotMatch(section,/Page Two\s*·\s*You.re invited/);
  assert.match(section,/<h2 id="invite-title">A Special Evening<em>of Celebration<\/em><\/h2>/);
  assert.match(css,/\.invitation \.section-intro #invite-title\{line-height:1\.12\}/);
  assert.match(css,/\.invitation \.section-intro #invite-title em\{display:block;margin-top:\.12em\}/);
  assert.match(css,/@media\(max-width:470px\)\{\.invitation \.section-intro #invite-title em\{margin-top:\.15em\}\}/);
});
