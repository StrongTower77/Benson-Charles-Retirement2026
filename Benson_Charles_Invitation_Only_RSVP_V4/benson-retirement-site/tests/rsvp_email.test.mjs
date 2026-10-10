import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRsvpEmail, emailSettings, processRsvpEmailQueue } from '../lib/rsvp-emails.js';
const settings={admins:['one@example.com','two@example.com'],from:'invite@example.com',key:'fake_test_key'};
const base={id:'2ca9e9e6-a534-484b-b88d-5026c1acf95e',event_type:'submitted',
  snapshot:{fullName:'Taylor Guest',email:'taylor@example.com',attendance:'yes',guestCount:2,message:'Happy retirement!'}};

test('configuration requires exactly two distinct valid administrator emails, sender and private key',()=>{
  assert.equal(emailSettings({}),null);
  assert.equal(emailSettings({RSVP_ADMIN_EMAILS:'one@example.com',RSVP_EMAIL_FROM:'invite@example.com',RESEND_API_KEY:'test'}),null);
  assert.equal(emailSettings({RSVP_ADMIN_EMAILS:'one@example.com,one@example.com',RSVP_EMAIL_FROM:'invite@example.com',RESEND_API_KEY:'test'}),null);
  assert.deepEqual(emailSettings({RSVP_ADMIN_EMAILS:'one@example.com,two@example.com',RSVP_EMAIL_FROM:'invite@example.com',RESEND_API_KEY:'test'}).admins,settings.admins);
});
test('administrator mail contains guest data and reaches exactly two configured admins',()=>{
  const m=buildRsvpEmail({...base,audience:'admins'},settings);
  assert.deepEqual(m.to,settings.admins);
  assert.match(m.subject,/New Retirement Celebration RSVP/);
  assert.match(m.text,/Taylor Guest/);
  assert.match(m.text,/taylor@example.com/);
  assert.match(m.text,/2 attendees/);
  assert.match(m.text,/Happy retirement/);
});
test('guest accepts: sends to submitted address with date and private entrance, not venue',()=>{
  const m=buildRsvpEmail({...base,audience:'guest'},settings);
  assert.deepEqual(m.to,['taylor@example.com']);
  assert.match(m.subject,/Confirmation/);
  assert.match(m.text,/2 attendees/);
  assert.match(m.text,/December 26, 2026/);
  assert.match(m.html,/benson-charles-retirement2k26\.vercel\.app/);
  assert.doesNotMatch(m.text+m.html,/Hyatt|400 SE 2nd|Marina|WLYB2k26/i);
});
test('guest decline and RSVP update get appropriate confirmations',()=>{
  const d=buildRsvpEmail({...base,audience:'guest',event_type:'updated',
    snapshot:{...base.snapshot,attendance:'no',guestCount:0}},settings);
  assert.match(d.subject,/Update/);
  assert.match(d.text,/will not attend/);
  assert.doesNotMatch(d.text,/Party size:/);
});
test('untrusted RSVP text is safely escaped in administrator HTML',()=>{
  const malicious='<img src=x onerror=alert(1)>';
  const m=buildRsvpEmail({...base,audience:'admins',
    snapshot:{...base.snapshot,fullName:malicious,message:malicious}},settings);
  assert.doesNotMatch(m.html,/<img/);
  assert.match(m.html,/&lt;img/);
});
test('invalid recipient, attendance and counts cannot generate email',()=>{
  assert.throws(()=>buildRsvpEmail({...base,audience:'guest',snapshot:{...base.snapshot,email:'wrong'}},settings));
  assert.throws(()=>buildRsvpEmail({...base,audience:'guest',snapshot:{...base.snapshot,attendance:'yes',guestCount:0}},settings));
});
test('without environment configuration, queue does not claim or deliver emails',async()=>{
  const old={...process.env};
  for(const key of ['RESEND_API_KEY','RSVP_ADMIN_EMAILS','RSVP_EMAIL_FROM'])delete process.env[key];
  try{assert.deepEqual(await processRsvpEmailQueue(),{configured:false,attempted:0,sent:0});}
  finally{Object.assign(process.env,old);}
});