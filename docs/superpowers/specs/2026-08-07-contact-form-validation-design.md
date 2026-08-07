# Group F — Contact & location form validation

## Problem
`AdminContact.tsx`'s `EMAIL_RE` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) accepts any syntactically valid domain, so `company@g.com` passes even though `g.com` isn't a real known provider. `PHONE_RE` (`/^\+?[0-9\s\-()]{7,20}$/`) accepts 7-20 digits in any shape, not a real Nepali 10-digit number.

## Design
- **Email**: keep the format regex as a first gate, then check the domain against an allowlist of common providers: `gmail.com`, `yahoo.com`, `outlook.com`, `hotmail.com`, `icloud.com`. Reject anything else with a clear inline error ("Use a Gmail, Yahoo, Outlook, or other major provider address.").
- **Phone**: strip an optional leading `+977`/`977`, then require exactly 10 digits (`/^[0-9]{10}$/` after stripping non-digits and the country-code prefix). Error message: "Enter a valid 10-digit phone number."
- Scope: frontend-only (`AdminContact.tsx`), matching what was reported. Note for the record: there's no backend validation of this field either (it's outlet-displayed contact info, not an auth/security boundary), so this isn't flagged as a gap requiring action now.

## Testing
- Manual: enter `company@g.com` → rejected; `company@gmail.com` → accepted; a 9-digit or 11-digit phone → rejected; a valid 10-digit number with/without `+977` prefix → accepted.
