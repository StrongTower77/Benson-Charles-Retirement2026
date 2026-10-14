import test from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';

function guest(path){return new Request('https://example.test'+path);}
test('the small, non-sensitive theme script is public so both entrance and event can load it',()=>{
  assert.equal(middleware(guest('/theme.js')),undefined);
  assert.equal(middleware(guest('/access.js')),undefined);
  assert.equal(middleware(guest('/access.css')),undefined);
  assert.equal(middleware(guest('/')),undefined);
});
test('private event media and event HTML remain gated without a session',()=>{
  for(const path of ['/event','/event.html','/styles.css','/assets/BCR-yacht-hero-loop-polished.mp4']){
    const response=middleware(guest(path));
    assert.equal(response.status,302);
    assert.equal(response.headers.get('location'),'https://example.test/');
  }
  const rsvp=middleware(guest('/api/rsvp'));
  assert.equal(rsvp.status,401);
});
