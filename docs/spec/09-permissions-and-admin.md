# 09 — Permissions & Admin

**Stage C output.** Documents the access-control model — roles, rights, character statuses, map ACLs, the `/admin*` surface, and the `/setup` gating gap. Pair with [03-backend-api.md](03-backend-api.md) for the route surface and [02-data-model.md](02-data-model.md) for the tables. ESI scopes (the CCP-side OAuth permission set) are mentioned here only where they intersect Pathfinder rights; full scope inventory lives in Stage E.

## Purpose

Pathfinder mixes three orthogonal access concepts that the codebase does not always keep cleanly separated:

1. **Pathfinder roles** — `MEMBER`, `CORPORATION`, `SUPER`. Coarse, character-scoped.
2. **Pathfinder rights** — six map-operation permissions (create, update, delete, import, export, share). Granted to corporations × roles via `corporation_right`.
3. **Map ACL** — per-map access list. Maps are private / corp / alliance, with allow-lists per type.
4. **EVE/ESI scopes** — what the EVE Online API itself allows the app to do on behalf of a character. Pathfinder requests two scope sets: the default user set and an additional admin set, the latter being a precondition for entering `/admin*`.

The runtime auth gate is whether the active character is logged in at all (`AccessController`). Anything finer is enforced inside actions.

## Auth principals

```
HTTP session  ─ holds ─►  USER (cookies + login marker)
                          │
                          └─ active CHARACTER (selected from user's characters)
                                │
                                ├─ membership: corporation, alliance
                                ├─ status:     CharacterStatusModel value (per map)
                                ├─ role:       RoleModel value (MEMBER / CORPORATION / SUPER)
                                ├─ ESI token + scopes  (CharacterAuthenticationModel)
                                └─ accessible MAPs (private + corp + alliance maps)
```

- A **user** can own multiple **characters**; the SSO tile grid lets the user switch which character is active in the current tab.
- "Logged in" means: session has a `USER`, the active character exists, its auth row is fresh, and `checkLoginTimer` says the session has not expired (`isLoggedIn(ttl=0)` reads no-cache).
- Persistent cookies (selector + hashed validator in `character_authentication`) populate the login screen but do **not** auto-log-in — the user still has to click their character tile and consent via SSO.
- Sub-domain session sharing (`[PATHFINDER.LOGIN] SESSION_SHARING`) widens the cookie scope so a single login can hand a session across hosts that share a parent domain.

References: `Controller.php:90-165, 246-400, 493-540`; `AccessController.php:23-36`.

## Roles

`app/Model/Pathfinder/RoleModel.php`. Three rows, seeded by Setup. Each character has exactly one role.

| id  | name          | label   | level | style   | Notes                                                                                               |
| --- | ------------- | ------- | ----- | ------- | --------------------------------------------------------------------------------------------------- |
| 1   | `MEMBER`      | member  | 2     | default | Default for every newly-seen character. No admin access. Map access is whatever the map ACL allows. |
| 2   | `SUPER`       | admin   | 10    | danger  | Global. Sees every map of every corp / alliance in the admin panel.                                 |
| 3   | `CORPORATION` | manager | 4     | info    | Corp-scoped admin. Sees only their corp's maps and members in the admin panel.                      |

### How roles are assigned

Resolution happens in `CharacterModel` (around lines 717-756) every time the character logs in / refreshes:

1. **Hard-coded override.** `pathfinder.ini` `[PATHFINDER.ROLES]` lets ops promote specific character IDs to `SUPER` or `CORPORATION` regardless of in-game state.
2. **In-game corp role.** Otherwise, ESI returns the character's corporation roles. If any of the `CorporationModel::ADMIN_ROLES` (`director`, `personnel_manager`, `security_officer`) are present, the character is promoted to `CORPORATION`.
3. **Default.** `MEMBER`.

Implication: a former director who lost their EVE role demotes back to `MEMBER` on next refresh. The admin role is not sticky.

## Rights

`app/Model/Pathfinder/RightModel.php`. Six rows. These name map-operation permissions; they have no behavior on their own. They become live via `corporation_right`.

| id  | name         | label  | meaning                                   |
| --- | ------------ | ------ | ----------------------------------------- |
| 1   | `map_update` | update | Edit map settings                         |
| 2   | `map_delete` | delete | Delete (soft) a map                       |
| 3   | `map_import` | import | Import a map JSON export                  |
| 4   | `map_export` | export | Export a map to JSON                      |
| 5   | `map_share`  | share  | Add other entities to a map's access list |
| 6   | `map_create` | create | Create new maps                           |

### Linkage — `corporation_right`

`app/Model/Pathfinder/CorporationRightModel.php`. Three-column junction: `(corporationId, rightId, roleId)` with a unique index on `(corporationId, rightId)`. The semantics:

> Corporation **C** grants right **R** to characters whose role is **at least** **Z**.

The admin UI edits this table via `Admin::saveSettings()` (see below).

### Effective check

There is no central `Character::hasRight()` method; rights are checked at action sites (e.g. `Api\Rest\Map::delete` looks up corp delete eligibility before letting a `CORPORATION`-role character soft-delete a corp map). `SUPER` is treated as having all rights implicitly; `MEMBER` has none beyond access to their own private maps.

**Open question:** the exact resolution for a member with no corp admin role but who is the _owner_ of a private map (i.e. can they "delete" it via the right, or is private-map delete a separate path?) — flag for Stage I.

## Character statuses

`app/Model/Pathfinder/CharacterStatusModel.php`. Per-map relationship type, used for UI coloring and access type identification on `character_map` rows.

| id  | name        | UI class              | meaning                                          |
| --- | ----------- | --------------------- | ------------------------------------------------ |
| 1   | corporation | `pf-user-status-corp` | character has access via corp-map membership     |
| 2   | alliance    | `pf-user-status-ally` | character has access via alliance-map membership |
| 3   | own         | `pf-user-status-own`  | character owns the map (private map)             |

These statuses are **not** ban/inactive states. Inactive / kicked / banned state lives on `CharacterModel` directly:

- **Kick** — temporary timeout. `Admin::kickCharacter($activeChar, $kickId, $minutes)` sets a timeout (5 / 60 / 1440 min) and logs the action. Affected character is denied login until expiry.
- **Ban** — boolean flag. `Admin::banCharacter($activeChar, $banId, $value)` toggles.

Both gate at login time, not at action time.

## Map access control

`app/Model/Pathfinder/MapModel.php` (`hasAccess()` ~ lines 852-867; type predicates ~ lines 1264-1282).

### Map scope types

| typeId | predicate         | access table      | semantics                                                                                                                 |
| ------ | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 2      | `isPrivate()`     | `character_map`   | Personal map. Only the listed character(s) access it.                                                                     |
| 3      | `isCorporation()` | `corporation_map` | All members of any listed corporation access it.                                                                          |
| 4      | `isAlliance()`    | `alliance_map`    | All members of any listed alliance access it.                                                                             |
| (1)    | —                 | —                 | A "global" map type appears in code paths and config but is not present in default seed data. Treat as latent / disabled. |

`hasAccess($character)` is the gate every map-touching API action consults. It delegates to `CharacterModel::getMaps()` and checks membership of the requested mapId in the resulting set. Returns true iff:

- The character owns the private map, **or**
- The character's corporation is in the corp map's access list, **or**
- The character's alliance is in the alliance map's access list.

`SUPER` does not implicitly satisfy `hasAccess()` — the admin path uses different controllers (`Admin`) that build their own queries with the right scope filter.

### Sharing limits

Per-scope caps live in `pathfinder.ini` `[PATHFINDER.MAP.PRIVATE/CORPORATION/ALLIANCE]`:

- `MAX_COUNT` — maps per scope per principal (3/5/4 by default).
- `MAX_SYSTEMS` — systems per map (50/100/100).
- `MAX_SHARED` — max entries in the access list per map.
- `LIFETIME` — soft-delete age trigger for the `deactivateMapData` cron.

The REST `PATCH /api/rest/Map/<id>` enforces `MAX_SHARED` when updating access; the cron handles lifetime expiry (Stage D).

## `Api/Access` endpoint

Single search endpoint used by the map-settings dialog to populate access-list inputs.

`GET|POST /api/Access/search/<type>/<token>` — returns entities of type `character` / `corporation` / `alliance` whose `active = 1 AND shared = 1`. The `shared` flag is opt-in: an entity must explicitly mark itself shareable in its model to appear in search.

The endpoint does not check whether the calling character has the `map_share` right — that gate lives on the REST map PATCH that uses the results.

## Admin panel — `/admin*`

`app/Controller/Admin.php`. Renders the operator UI, served via the page route `GET @admin: /admin*`. Unlike `MapController`, `Admin` extends `Controller` directly and supplies its own auth via `beforeRoute → getAdminCharacter()`.

### Admin gate

`getAdminCharacter()` (Admin.php:89-116):

1. `parent::getCharacter(0)` — must have an active logged-in character.
2. `roleId.name ∈ {SUPER, CORPORATION}` — otherwise denied with the "Insufficient in-game roles" error, listing the EVE corp roles required.
3. `hasAdminScopes()` — character must have authorized the **admin ESI scope set** in addition to default scopes. The scope list comes from `CCP_ESI_SCOPES_ADMIN` (see `pathfinder.ini`; defaults to empty, in which case this check is a no-op — flag in open questions).
4. If both pass, the character is admitted; `dispatch()` runs.

If a `MEMBER`-role character hits `/admin*`, they see only the SSO login form rendered by `dispatch` with `parts[0]` falling into the `login` branch.

### Dispatch table

`Admin::dispatch($f3, $params, $character)` parses the URL wildcard (`$params['*']`) and routes. All routes are **GET**.

| URL                                      | Handler                                        | Action                                                                       |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `/admin/login` (or unmatched)            | (inline)                                       | Render SSO login form                                                        |
| `/admin/settings`                        | `initSettings($char)`                          | Show corporation rights config table                                         |
| `/admin/settings/save/<corpId>`          | `saveSettings($char, $corpId, $settingsArray)` | Insert/update/delete `corporation_right` rows; redirect to `/admin/settings` |
| `/admin/members`                         | `initMembers($char)`                           | Show corporation members table                                               |
| `/admin/members/kick/<charId>/<minutes>` | `kickCharacter($char, $kickId, $minutes)`      | Apply kick timeout. `minutes ∈ {5, 60, 1440}`                                |
| `/admin/members/ban/<charId>/<value>`    | `banCharacter($char, $banId, $value)`          | Toggle ban flag                                                              |
| `/admin/maps`                            | `initMaps($char)`                              | Show corporation maps (including inactive)                                   |
| `/admin/maps/active/<mapId>/<value>`     | `activateMap($char, $mapId, value)`            | Toggle map active flag                                                       |
| `/admin/maps/delete/<mapId>`             | `deleteMap($char, $mapId)`                     | Hard-delete a map (immediate; bypasses cron soft-delete)                     |

### SUPER vs CORPORATION scoping

The scoping is **inside the helpers**, not in the route table:

- `filterValidCharacters($char, $kickId)` — SUPER returns the target unconditionally; CORPORATION returns it only if it shares a corp with the active character.
- `filterValidMaps($char, $mapId)` — same pattern; SUPER sees inactive maps too, CORPORATION sees only their corp's maps.
- `saveSettings()` iterates the active character's accessible corporations; CORPORATION admins can only modify their own corp's rights.

There is no application of these filters at the route level — every admin action consults them inline. **No CSRF tokens; state-mutating admin routes are GET.**

References: Admin.php:125-187 (dispatch), :196-444 (helpers).

### Logging

Admin actions write to `logs/admin.log` (see [01-config-and-deployment.md](01-config-and-deployment.md) for log channel inventory). Activity-log entries are also buffered per-request via `LogController` and flushed in `Controller::unload()`.

## `/setup` — gating warning

`app/Controller/Setup.php` is the one-shot setup wizard at `GET /setup` (page) plus `Api\Setup` (AJAX power tools). **Neither has any auth check.** This is intentional bootstrapping behavior: the route exists so the operator can create the DB on a fresh deploy.

Risks if left enabled:

- `?action=bootstrapDB` truncates and recreates every model's table.
- `?action=flushRedisDb` empties the Redis cache.
- `?action=invalidateCookies` deletes every persistent-login cookie.
- `Api\Setup::cronExecute` runs a named cron job synchronously over HTTP.
- `Api\Setup::buildIndex` triggers ESI-backed bulk imports.

`routes.ini:5-6` carries the inline warning:

> `; IMPORTANT: remove/comment this line after setup/update is finished!`

`pathfinder.ini` `[PATHFINDER.SETUP] SHOW_SETUP_WARNING=1` renders a banner on the login page while the setup route is wired. The Stage J rebuild should put this behind an env-gated feature flag or an admin-only sub-route.

## ESI scopes vs Pathfinder rights

Two different things. Easily confused.

| concept              | where granted                                     | what it allows                                                                 | example                                               |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **ESI scope**        | CCP SSO consent screen during login               | The Pathfinder server to call specific ESI endpoints on the character's behalf | `esi-location.read_location.v1` — read pilot location |
| **Pathfinder right** | `corporation_right` table, edited via admin panel | A Pathfinder character to perform a specific map operation                     | `map_delete` — soft-delete a map                      |

The two intersect at one point: entering `/admin*` requires both the `CORPORATION`/`SUPER` role and the admin ESI scope set. ESI scope handling itself is documented in [05-external-integrations.md](05-external-integrations.md) (Stage E, pending).

## Known issues / quirks

- **No CSRF.** Admin mutations are GET. A logged-in admin who visits an attacker's page can be made to issue admin actions cross-site if cookie SameSite isn't restrictive. Confirm SameSite policy.
- **`Api\Setup` and `/setup` are unauthenticated.** The intended mitigation is "operator removes the route after install". In practice the AJAX side is rarely removed; check whether the web layer (nginx) is expected to block `/api/Setup` and `/setup` in production.
- **No `hasRight()` method.** Right checks are inlined per-action and inconsistent — only Map delete and a handful of admin operations actually consult `corporation_right`. The rest of the rights (`map_export`, `map_import`, `map_share`) may be enforced only by UI gating, not server-side. Audit during rebuild.
- **Roles refresh on every login.** A character who loses their EVE corp role demotes to `MEMBER` immediately; ongoing sessions might keep the old role until next `isLoggedIn(0)` check.
- **`CCP_ESI_SCOPES_ADMIN` is empty by default.** That neuters `hasAdminScopes()` in default deploys, leaving only the role check between any `CORPORATION`-role character and the admin panel.
- **Kick/ban scope.** Kick durations are hardcoded to `{5, 60, 1440}` minutes; there is no permanent kick distinct from ban.
- **Soft 200 on access fail.** REST endpoints return `[]` rather than 401/403 on `hasAccess()` failure — leaks no information but also tells the client nothing useful.
- **Session suspect detection logs but does not act.** `Mysql\Session`'s `onSuspect` callback logs to `session_suspect.log`; nothing is automatically invalidated.

## Open questions

1. Is there a server-side check for `map_share`, `map_import`, `map_export`, or are these UI-only? If UI-only, a hand-crafted request bypasses them.
2. What is the deployment policy for `/setup` and `/api/Setup` in production? Is removing the route from `routes.ini` the recommended approach, or is there a documented web-layer block?
   **A:** Setup is protected by HTTP Basic Authentication by the proxy that serves the app. It is intended as a route that does not require SSO for initial setup and troubleshooting.
3. `CCP_ESI_SCOPES_ADMIN` is empty in the default config — confirm that this is intentional (admin scope check becomes a no-op) and whether a hardened default is desired in the rebuild.
4. What rights, if any, can be granted to a `MEMBER` role through `corporation_right`? Default seed seems to bind rights to `CORPORATION` and above only.
5. Owner-of-private-map vs `map_delete` right semantics — see Rights section.
6. Cookie SameSite / Secure flags — confirm in deployment guide; matters for the no-CSRF posture.
7. Are kick / ban states cleared on user account deletion, or do they orphan? (`deleteAccount` flow + `deleteAuthenticationData` cron interaction.)
   **A:** *(SPEC §11 Q10 — closed by Stage 16.1.)* Kick and ban states live on `ap_character.status` and die with the character row. `ap_character` is linked to `ap_user` with `ON DELETE CASCADE`, so deleting the account removes the kick/ban alongside it. If a player returns under a new account and re-claims the same character (CCP `character_owner_hash` match), `syncCharacterAuthz` reinstates the row with `status='active'` — the prior kick/ban does **not** revive. Permanent character-level blocks that survive account churn are out of scope; the documented extension point is a future `ap_blocklist (owner_hash)` table consulted at login.
