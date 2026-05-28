## MemberActionsMenu

**Purpose:** Stage 16.3 client island rendered inside each `/admin/members` row. Surfaces kick/ban/activate moderation controls and (for admins only) a grant/revoke-manager toggle.
**File:** `src/components/admin/MemberActionsMenu.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| member | AdminMemberRow | yes | Row from `listAdminMembers` (`@/lib/auth/members`) — drives both the displayed controls and the optimistic strings in the toast. |
| canManageAuthz | boolean | yes | True iff the viewer is `isAdmin`. Hides the manager toggle entirely for managers (managers can moderate but not grant other managers). |

### Renders
A right-aligned row of small icon buttons. The visible set depends on `member.status`:
- Active row: three timed-kick presets (`5m` / `1h` / `24h`) + a ban icon button.
- Kicked or banned row: one **Activate** button.
- Admin viewer additionally sees a **Grant mgr** / **Revoke mgr** toggle when `authzLevel !== 'admin'` (admin rows hide the toggle entirely — Director-derived).

### Behaviour & Interactions
- Each action wraps `useTransition` and toasts the result via `sonner`. Failures show the server-side error verbatim.
- Kick presets are single-click — no confirmation, the 5/60/1440-minute cap makes the action low-blast-radius and `Activate` undoes it.
- Ban opens a `Dialog` that requires a non-empty reason (1-500 chars). Cancelling resets the textarea.
- The manager toggle picks `adminGrantManager` or `adminRevokeManager` based on the current `authzLevel`. Both refuse to act on `admin` rows server-side — the button is also hidden for them client-side as a usability hint.

### Calls
- `adminKickCharacter(id, minutes)` — `@/app/(admin)/actions/members`.
- `adminBanCharacter(id, reason)` — same.
- `adminActivateCharacter(id)` — same.
- `adminGrantManager(id)` / `adminRevokeManager(id)` — same (admin-only Server Actions; the layout's `canManageAuthz` prop controls whether the trigger is rendered).

### Depends on
- `Button`, `Dialog*`, `Input` — `@/components/ui/*`.
- `AdminMemberRow` — `@/lib/auth/members`.

### Notes
- No bulk-select / multi-row controls — Stage 16.3 is per-row only.
