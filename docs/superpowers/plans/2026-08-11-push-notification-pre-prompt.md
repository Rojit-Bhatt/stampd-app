# Push Notification Soft Pre-Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop firing the native browser notification-permission dialog the instant the push toggle is clicked. Show an in-app explanation card first (Enable / Not now); only "Enable" calls `Notification.requestPermission()`. Show a "blocked in browser settings" message instead of a dead toggle when permission is already `"denied"`.

**Architecture:** `CustomerProfilePanel`'s Notifications section gains a `permissionState` (mirrors `Notification.permission`, read on mount) and a `showPushPrePrompt` boolean. The push row renders one of four states from these two flags plus the existing `pushEnabled`: blocked (denied), enabled (normal toggle, off-switch unchanged), pre-prompt (Enable/Not now), or off (plain checkbox that opens the pre-prompt instead of subscribing directly). `savePushOptIn` — the existing subscribe/unsubscribe function — is unchanged in what it does, only in when it's called and it now also records the resulting `Notification.permission` value.

**Tech Stack:** React, TypeScript, browser Notification/Push APIs — no new dependencies, no backend changes.

## Global Constraints

- No new npm dependencies, no backend changes — `POST`/`DELETE /api/customer-auth/push-subscription` and the VAPID subscribe flow are untouched.
- No frontend unit test runner; verification = `tsc --noEmit` + manual browser check. Simulating a `"denied"` permission state requires either a real browser's site settings or `chrome://settings/content/notifications` in dev tools — this is manual-only.
- This plan only touches the customer app (`CustomerProfilePanel.tsx`) — there is no equivalent push-notification UI in the admin/staff/platform settings surfaces to update.
- Toggling notifications **off** keeps firing immediately, with no pre-prompt — only turning **on** goes through the pre-prompt. Disabling something the user already granted needs no persuasion step.

---

### Task 1: Track permission state and gate the native prompt behind a pre-prompt

**Files:**
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx:70-71` (state), `:210-249` (`savePushOptIn`)

**Interfaces:**
- Produces: `permissionState: NotificationPermission | null` — `null` until the mount effect reads the browser's actual value (avoids assuming `"default"` on servers/browsers without the API). `showPushPrePrompt: boolean`.

- [ ] **Step 1: Add the new state**

Replace lines 70–71:

```tsx
  const [pushEnabled, setPushEnabled] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
```

with:

```tsx
  const [pushEnabled, setPushEnabled] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | null>(null);
  const [showPushPrePrompt, setShowPushPrePrompt] = useState(false);
```

- [ ] **Step 2: Read the current permission on mount**

Immediately after the existing subscription-check effect (originally lines 87–92, still reads `navigator.serviceWorker?.ready...`), add a new effect:

```tsx
  // Read once on mount, not derived reactively — the browser doesn't push
  // permission changes to the page; the next accurate read is whatever
  // Notification.requestPermission() itself resolves to, captured below.
  useEffect(() => {
    if (typeof Notification !== "undefined") setPermissionState(Notification.permission);
  }, []);
```

- [ ] **Step 3: Record the resolved permission in `savePushOptIn`**

Within `savePushOptIn` (lines 210–249), the branch that requests permission currently reads:

```tsx
        if (!VAPID_PUBLIC_KEY) throw new Error("Push isn't set up for this app yet.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification permission wasn't granted.");
```

Replace it with:

```tsx
        if (!VAPID_PUBLIC_KEY) throw new Error("Push isn't set up for this app yet.");
        const permission = await Notification.requestPermission();
        setPermissionState(permission);
        if (permission !== "granted") throw new Error("Notification permission wasn't granted.");
```

The rest of `savePushOptIn` (subscribe, POST to the backend, `setPushEnabled(true)`/`(false)`, the `else` unsubscribe branch) is unchanged.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/CustomerProfilePanel.tsx
git commit -m "feat(notifications): track Notification.permission state for the pre-prompt"
```

---

### Task 2: Rewrite the push notification row with the pre-prompt / blocked states

**Files:**
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx:368-378` (the `<Card title="Push notifications">` block)

**Interfaces:**
- Consumes: `permissionState`, `showPushPrePrompt`, `setShowPushPrePrompt`, `pushEnabled`, `savingPush`, `savePushOptIn` — all already in scope in this component after Task 1.

- [ ] **Step 1: Replace the card**

Replace lines 368–378:

```tsx
          <Card title="Push notifications">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={savingPush}
                onChange={(e) => savePushOptIn(e.target.checked)}
              />
              Send me updates as push notifications
            </label>
          </Card>
```

with:

```tsx
          <Card title="Push notifications">
            {permissionState === "denied" ? (
              <p className="text-[13px] text-[var(--muted)]">
                Notifications are blocked in your browser. To turn them back on, open this site's notification
                settings in your browser and allow them, then reload this page.
              </p>
            ) : pushEnabled ? (
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked
                  disabled={savingPush}
                  onChange={(e) => savePushOptIn(e.target.checked)}
                />
                Send me updates as push notifications
              </label>
            ) : showPushPrePrompt ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-[var(--muted)]">
                  Get notified the moment your order's ready, or when there's a reward waiting for you.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      setShowPushPrePrompt(false);
                      await savePushOptIn(true);
                    }}
                    disabled={savingPush}
                  >
                    {savingPush ? "Enabling…" : "Enable"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowPushPrePrompt(false)} disabled={savingPush}>
                    Not now
                  </Button>
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={savingPush}
                  onChange={(e) => {
                    if (e.target.checked) setShowPushPrePrompt(true);
                  }}
                />
                Send me updates as push notifications
              </label>
            )}
          </Card>
```

Note: the browser's native permission dialog is now reachable only through the `Enable` button's call to `savePushOptIn(true)` (which internally calls `Notification.requestPermission()`, per Task 1). Clicking the off-state checkbox no longer calls `savePushOptIn` at all — it only opens the pre-prompt.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/customer/CustomerProfilePanel.tsx
git commit -m "feat(notifications): soft pre-prompt before the native push permission dialog"
```

---

### Task 3: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Fresh permission (never asked)**

In a browser profile that's never granted or denied notifications for this site (or after clearing site data), navigate to customer Profile → Notifications. Verify: the push row shows the plain unchecked checkbox with its label, no native dialog fires yet.

Click the checkbox. Verify: no native browser dialog appears; instead the row switches to the explanation text with "Enable" / "Not now" buttons.

Click "Not now". Verify: row reverts to the plain unchecked checkbox, still no native dialog has fired at any point (check via the browser's own notification-permission indicator in the address bar, or `Notification.permission` in devtools console — should still read `"default"`).

- [ ] **Step 2: Enable flow**

Repeat: check the box → pre-prompt appears → click "Enable". Verify: the native browser permission dialog now appears. Accept it. Verify: row switches to the checked/enabled state, a "Push notifications on!" toast appears, and `Notification.permission` is now `"granted"`.

- [ ] **Step 3: Denied state**

In a browser where this site's notification permission is set to "Block" (via browser site settings), reload the Profile page and navigate to Notifications. Verify: the row shows the "Notifications are blocked in your browser…" message with no checkbox at all.

- [ ] **Step 4: Turn off (unchanged path)**

With push enabled from Step 2, uncheck the box. Verify: unsubscribes immediately with no pre-prompt (turning off was never gated), shows "Push notifications off." toast, row reverts to the plain unchecked checkbox.
