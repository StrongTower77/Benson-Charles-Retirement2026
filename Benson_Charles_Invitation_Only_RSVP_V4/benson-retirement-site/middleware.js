import { rewrite } from '@vercel/functions';
import { readSession } from './lib/session.js';

// Authentication happens BEFORE cached static files are served.
// Neither the event page nor its event images are publicly accessible.
export const config = {
  runtime: 'nodejs',
  matcher: '/:path*',
};

export default function middleware(request) {
  const path = new URL(request.url).pathname;
  const session = readSession(request);
  if (path === '/' || path === '/index.html') {
    if (session) return Response.redirect(new URL('/event', request.url), 302);
    return; // Public entrance only
  }
  // Only the entrance, its assets and code-verification API are public.
  if (['/access.css','/access.js','/robots.txt','/api/unlock','/assets/benson-charles-official-crest.png'].includes(path) || path.startsWith('/.well-known/')) return;
  if (!session) {
    if (path === '/api/rsvp') return Response.json({ error: 'Your private invitation session has expired. Please unlock your invitation again.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    return Response.redirect(new URL('/', request.url), 302);
  }
  if (path === '/event') return rewrite(new URL('/event.html', request.url));
}
