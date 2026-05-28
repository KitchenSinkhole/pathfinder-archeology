## AdminMembersPage

**Purpose:** `/admin/members` — table of every character in the actor's `AdminVisibilityScope` with the moderation + authz action surface (`MemberActionsMenu`). Stage 16.3.
**File:** `src/app/(admin)/admin/members/page.tsx`

### Renders
A scope label header and an HTML table with columns: Name, Corp (`corporationId` string or em-dash), Level (authz badge — admin/manager pill or plain "Member" text), Status (status badge — `Active` neutral pill, `Kicked (until <date>)` amber pill with reason on hover, `Banned` destructive pill with reason on hover), Last seen (`lastLocationAt` formatted, em-dash when null), and the per-row action cell.

### Behaviour & Interactions
- `auth()` then `adminVisibilityScope(session)`; `null` scope redirects to `/maps` (defence in depth — the layout already gates).
- `isAdmin(session)` resolved in parallel; threaded into each row as `canManageAuthz` so the menu can decide whether to render the manager toggle.
- Rows order by `(status, name)` — DB enum order puts active first, then kicked, then banned; banned rows sink to the bottom.
- Server component. Action menus are client islands that `revalidatePath('/admin/members')` on success.

### Depends On
- `auth`, `adminVisibilityScope`, `isAdmin` — `@/lib/auth/rights` / `@/lib/auth`.
- `listAdminMembers` — `@/lib/auth/members`.
- `MemberActionsMenu` — `@/components/admin/MemberActionsMenu`.
