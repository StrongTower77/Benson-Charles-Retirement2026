# Benson Charles Retirement — Invitation-Only RSVP Site

Three scrollable pages/sections: Announcement, Invitation & RSVP, Event Information.

**Target custom domain:** `www.bensoncharlesretirement.com` (not yet connected).

## Setup (Vercel + Supabase)

1. Create a new Supabase project. Paste `schema.sql` into the Supabase SQL editor and execute it. Do not run the old public-RSVP schema. Check that both tables and the `submit_retirement_rsvp` function exist.
2. Import this project into Vercel from Git or deploy via Vercel CLI. Framework preset: **Other**. Root: this folder. No build command needed.
3. In Vercel project settings > Environment Variables add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the privileged Supabase secret, **server-side only**). Never store the service-role key in client JavaScript or Git.
4. Generate invitation code + SQL, e.g. `node scripts/generate-invitations.cjs 'Mejia household' 2` . Copy the **SQL from stdout** to Supabase SQL editor and run it. Deliver the **private code from stderr** to the invitee. Each invitation code can RSVP for up to its `max_guests` count. Codes are cryptographically random; database stores only their SHA-256 hashes.
5. Invite guests with the unique code. They can enter it manually on Page 2 or use `https://www.bensoncharlesretirement.com/?invite=CODE#invitation`. Note: a code-bearing URL can leak in browser history; manually delivered codes are more private.
6. Test an authorized RSVP, excess guest count, invalid code, decline, and response update. Confirm rows appear in `public.retirement_rsvps` in Supabase Table Editor. A successful API response must mean a committed record.
7. Configure `www.bensoncharlesretirement.com` in Vercel Domains, then update DNS at your registrar using **the exact DNS records Vercel provides**. Configure apex-to-www redirect if desired. Do not change DNS records blindly.

## Organizer management

For the first launch, use **Supabase Table Editor** (authenticated project administrators only) to view, filter and export `retirement_rsvps`. This avoids exposing a new admin login endpoint. An optional separate secured dashboard can be built later. Do **not** expose a public read policy for the RSVP tables.

Attendance summary (Supabase SQL editor):

```sql
select attendance, count(*) as households, coalesce(sum(guest_count),0) as attendees
from public.retirement_rsvps group by attendance;
```

You may update `max_guests`, set `is_active=false` to revoke a code, and delete an unwanted RSVP from the authenticated Table Editor. **Revoking the code blocks future changes, not an already stored RSVP; review existing row separately.**

## Security and launch checklist

- The backend validates invitation-code hashes and guest limits; the database applies atomic upsert keyed to the invitation. A second response with the same code **replaces** the earlier response, preventing double counting.
- Anyone with a valid code can overwrite its RSVP; share codes only with intended recipients. No email identity verification is provided. For stricter security, add email OTP and invitation-email binding.
- Add managed rate limiting / bot protection (e.g. Cloudflare Turnstile and Vercel WAF) before widely sharing the site. Current honeypot alone does not prevent API abuse.
- Check event capacity, boarding time, maximum guests per invitation, and deadline (December 5, 2026, Miami time).
- No automated email is sent; on-screen acknowledgement only. Confirm before sending out invitations.
- This code has not been deployed, and no live Supabase connection has been configured. Test against a real Supabase project before declaring the site live.

## V3 content update (October 8, 2026)

## V4 corrections — October 8, 2026
- Use the latest organizer-provided invitation: Venetian Lady Silver Yacht; Hyatt Miami Marina, 400 SE 2nd Avenue, Miami, FL 33131. The obsolete address has been removed from all website assets and documentation.
- RSVP closes at the end of December 5, 2026, America/New_York (the server begins rejecting requests December 6 at midnight EST).
- The 305-824-7777 phone number is for questions, as supplied in the new Details document.
- RSVP codes supplied via query links are removed from the browser address bar after prefilling the input to reduce accidental sharing.


## Shared entry codes

Shared event entry codes can contain 8–16 alphanumeric characters. They are stored only as uppercase SHA-256 hashes in Supabase, never in the GitHub repository. A shared invitation must have `is_shared = true` on `retirement_invitations`. Shared RSVPs remain separate by normalized email; individual invitation codes retain their one-response-per-invitation behavior. Per-requester code verification is throttled to 12 attempts per 10 minutes. Apply the `shared_invitation_codes_individual_rsvps_and_unlock_throttle` Supabase migration before deploying this version. To rotate the shared entry code, deactivate the old invitation row and insert a new hashed code.


## RSVP transactional email notifications (staged / activation required)

An RSVP is committed to Supabase first. A database trigger queues two independent delivery jobs:
a notice to **both administrators** and a confirmation to the guest's submitted email.
A changed response sends an updated notice; an identical resubmission does not create
more mail. Acceptances and declines both receive acknowledgements.

1. Create or connect a Resend account, verify the sending domain using the provider's
   DNS instructions (SPF/DKIM; DMARC recommended), and issue a sending API key.
2. In Supabase project vzzcksexvopgowwkggau, apply the SQL migration
   migrations/20261009_rsvp_email_outbox.sql using the migration interface.
   Do not reapply the old schema.sql file.
3. Configure **server-side encrypted** environment variables for production on Vercel:
   - RESEND_API_KEY: the Resend API key.
   - RSVP_EMAIL_FROM: a sender address on your verified domain.
   - RSVP_ADMIN_EMAILS: two distinct administrator addresses separated by a comma.
   - CRON_SECRET: at least 32 random characters, for Vercel Cron authentication.
4. Deploy preview and test first: admin notice to both inboxes, guest acceptance and
   decline confirmation, update notice, duplicate submission, and failure/retry.
5. The RSVP API schedules background delivery with @vercel/functions waitUntil only
   after Supabase commits. A protected daily UTC Vercel Cron (0 10 * * *) retries
   pending jobs. This frequency is compatible with the Vercel Hobby plan.
6. Outbox jobs are attempted up to five times with exponential backoff. Resend requests
   have stable idempotency keys. A successful provider response is not a guarantee that
   the recipient inbox accepted or displayed the email.
7. The retry endpoint is routable without an invitation session but requires CRON_SECRET
   in its bearer authorization header; it never exposes guest records. No keys should
   be committed to GitHub or exposed in the client.

For anti-abuse protection, RSVP submissions have a dedicated per-invitation/per-requester
limit of 12 attempts in 10 minutes, independent of the invitation unlock throttle.
The migration and API change must deploy together, otherwise submissions fail closed.

Guest confirmations intentionally omit the private location, marina, address and invitation
code. The guest must enter their code at the website to view directions. If the sending
configuration is incomplete, the RSVP still saves and new email jobs remain pending.
**Do not describe delivery as active until an end-to-end acceptance test has passed.**
