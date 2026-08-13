# Email auth + deliverability (G18)

Stampd sends transactional email — verification, password reset, MFA alerts,
marketing consent emails — through exactly one interface: `emailService.sendEmail`.
The provider behind it is Brevo's HTTP API (`BREVO_API_KEY`), with plain SMTP
(`SMTP_HOST`) as a fallback and a logged stub when neither is configured.

Because senders and records live at DNS level, nothing in this document is
code — but misconfiguring any of the records below will silently land
customer email in spam, and broken verification mail is a broken onboarding
funnel. Review the records after every domain or DNS change.

## Current state

| Item | Value |
| --- | --- |
| Sending domain | `stampd.co` |
| From address | `no-reply@stampd.co` (env `SMTP_FROM`) |
| Primary delivery | Brevo HTTP API (`api.brevo.com`), circuit-broken |
| Fallback | SMTP port 587 (unusable on Render free tier — SMTP ports blocked) |
| Reply/abuse handling | `support@stampd.co` (listed in `PUSH_VAPID_SUBJECT`) |

## Records to configure (Brevo side — Brevo publishes these per sender domain)

In the Brevo console, under **Senders & IPs → Domains**, add `stampd.co` and
Brevo will show the exact records it expects. Verify after adding:

```bash
# SPF — should include brevo.com
dig +short txt stampd.co
# Expected: "v=spf1 include:_spf.brevo.com ~all"

# DKIM — Brevo provides a CNAME like mail._domainkey pointing at its DKIM host
dig +short cname mail._domainkey.stampd.co

# DMARC — policy reporting first, quarantine later
dig +short txt _dmarc.stampd.co
# Expected: "v=DMARC1; p=none; rua=mailto:dmarc-reports@stampd.co"
```

Recommended DMARC progression: start at `p=none` (report-only), watch
aggregate reports for a few weeks until SPF/DKIM alignment is clean, then
move to `p=quarantine`, and finally `p=reject` once legitimate volume is
stable. Set `ruf` only if a mailbox is ready to receive forensic reports.

## Warm-up

A new sender domain should not go from zero to full marketing volume in one
day. Brevo warm-up guidance: ramp transactional first (that's protected by
nature — recipients asked for it), then marketing at ~50 sends/day doubling
every few days. Marketing consent records in `CustomerAccount.marketingConsent`
are the only gate that decides who receives the second category.

## Monitoring

Brevo's dashboard exposes bounce + block rates per campaign; a bounce rate
above ~2% on transactional mail warrants checking the address list rather
than retrying. The cron-failure alert email (Phase 2, `TRIGGER_FAILURE_ALERT_EMAIL`)
should land in the same monitored inbox so delivery problems surface there too.

## When to switch providers

Brevo's free tier covers current volume. If monthly sends exceed the free
allowance or deliverability degrades, the alternative providers worth
evaluating are Resend (developer-friendly API, `stampd.co` domain verification
in the dashboard) or Postmark (strongest transactional reputation). The
`sendViaBrevoApi` fetch call in `emailService.js` is the only provider-locked
path — switching is a single-function change plus env vars.
