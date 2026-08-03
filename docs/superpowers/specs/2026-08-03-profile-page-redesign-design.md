# Profile page redesign (Clerk-style shell)

Date: 2026-08-03
Status: approved, not implemented

## Scope

Sub-project 3b of the UI improvements batch (3a, the org switcher, already
shipped). Covers a shared sidebar-sectioned shell applied to all three
account/profile surfaces the user selected:

1. `CustomerProfilePanel.tsx` — the customer-facing account page, reached at
   `/explore/profile` and the tenant-scoped `settings` tab.
2. `AccountSettingsForm.tsx`'s usage inside `AdminSettings`' "Account" tab.
3. `AccountSettingsForm.tsx`'s usage in `PlatformSettings.tsx`.

**Pure restructuring.** Every field, hook call, mutation, and endpoint stays
exactly as it is today — this only changes which section a given card's JSX
renders under and how the visitor navigates between sections. No backend
changes. Not in scope: the notification center (3c) and dashboard charts
(group 4), each their own spec.

## Design

### Shared shell

New `components/shared/profile/ProfileShell.tsx`. Takes sections as data,
the same convention `SettingsTabs.tsx` already uses for its own tabs:

```ts
interface ProfileSection {
  id: string;
  label: string;
  icon: LucideIcon;
  danger?: boolean;   // red-tinted link — Clerk's own convention for a
                       // destructive section (this app's one case: Delete
                       // account)
  content: ReactNode;
}
```

Renders a two-column layout ≥ the `md` breakpoint: a left rail of section
links (icon + label, active one highlighted — visually the same active-state
treatment `AdminLayout.tsx`'s own nav links already use, so this doesn't
introduce a second "selected nav item" style into the app), right pane shows
the active section's `content`. Below `md`, the rail becomes a horizontal
scrollable strip above the content — the same collapse pattern
`AdminLayout.tsx`'s rail-to-drawer already establishes for "this app's answer
to a nav rail on a narrow screen," just horizontal instead of a drawer since
a profile page has no need for the drawer's overlay behavior.

Internal state only (`useState` for the active section id) — no route
changes, no deep-linking to a specific section. Nothing today links to a
specific card by anchor, so there is nothing to preserve.

### `CustomerProfilePanel.tsx`

Today's 8 flat `Card`s regroup into 5 `ProfileSection`s. Each section's
`content` is the same `Card`(s) already there, moved under a section instead
of stacked in one long scroll — the `Card` wrapper itself is untouched:

| Section | id | Card(s) inside |
|---|---|---|
| Profile | `profile` | "Profile" (avatar + name) |
| Personal info | `personal` | "Personal info" (birthday, gender) |
| Notifications | `notifications` | "Email updates", "SMS updates", "Push notifications" |
| Security | `security` | "Email verification", "Change password" |
| Danger zone | `danger` | "Delete account" — `danger: true` |

### `AccountSettingsForm.tsx` (staff `AdminSettings` Account tab + `PlatformSettings`)

Today's 3 sections regroup into 2, using the same `ProfileShell`:

| Section | id | Content |
|---|---|---|
| Profile | `profile` | name field |
| Security | `security` | Email verification (skipped when `role === "platform"`, exactly as today's `role !== "platform"` guard already does) + Change password |

`AccountSettingsForm` keeps its own `role`/`onLogout` props and all its
hooks (`useAccount`, `useUpdateProfile`, `useChangePassword`) — only the
returned JSX's top-level structure changes, from one `flex flex-col gap-6`
stack to `<ProfileShell sections={...} />`.

### Icons

`lucide-react` (already a dependency, already used throughout these three
files): `User` (Profile), `Contact` (Personal info), `Bell` (Notifications),
`ShieldCheck` (Security), `Trash2` (Danger zone).

## Testing

Frontend-only; no backend test. Verification is `npm run lint` plus manual
browser checks on all three surfaces:

1. Every section link switches the right pane's content; the active link is
   visually distinguished.
2. Every existing action still works unchanged in its new location: saving a
   name, toggling a marketing-consent switch, the inline-OTP verify flow from
   the last batch, changing a password, deleting an account.
3. `PlatformSettings` has no "Email verification" content inside its Security
   section (same guard as today, just relocated).
4. Below `md` width, the rail collapses to a horizontal strip and every
   section is still reachable.
