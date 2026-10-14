import { rewrite } from '@vercel/functions';
import { readSession } from './lib/session.js';
import { hasAcceptedDetails } from './lib/acceptance.js';

// Authentication happens BEFORE cached static files are served.
// Neither the event page nor its event images are publicly accessible.
export const config = {
  runtime: 'nodejs',
  matcher: '/:path*',
};

export default function middleware(request) {
  const path = new URL(request.url).pathname;
  // Never expose server-side templates, source, tests, or migrations as static assets.
  if(/^\/(?:lib|migrations|tests)\//.test(path))return new Response('Not found',{status:404});
  const session = readSession(request);
  if (path === '/' || path === '/index.html') {
    if (session) return Response.redirect(new URL('/event', request.url), 302);
    return; // Public entrance only
  }
  // Only the entrance, its assets and code-verification API are public.
  if (['/access.css','/access.js','/theme.js','/robots.txt','/api/unlock','/api/rsvp-email-drain','/assets/benson-charles-official-crest.png'].includes(path) || path.startsWith('/.well-known/')) return;
  if (!session) {
    if (path === '/api/rsvp') return Response.json({ error: 'Your private invitation session has expired. Please unlock your invitation again.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    return Response.redirect(new URL('/', request.url), 302);
  }
  // The docking map is a separately requested static asset: it requires the same
  // live, respondent-bound acceptance check as the server-rendered directions.
  if (path === '/assets/hyatt-docking-map.png')
    return hasAcceptedDetails(request,session).then(allowed=>allowed?undefined:new Response('Not available',{status:403,headers:{'Cache-Control':'private, no-store'}}));
  if (path === '/event') return rewrite(new URL('/event.html', request.url));
}
