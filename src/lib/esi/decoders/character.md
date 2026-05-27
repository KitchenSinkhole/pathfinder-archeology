## character.ts

**Purpose:** Zod decoders for the three ESI character endpoints `syncCharacterAuthz` consumes — public profile, corporation roles, corporation titles.
**File:** `src/lib/esi/decoders/character.ts`

---

### characterPublicSchema
`z.object({ name, corporation_id, alliance_id? }).loose()` — `getCharacter` 200-body. Strict only on the fields Stage 15 reads (affiliation IDs); the rest of the public profile is preserved via `.loose()` so future consumers don't have to extend the schema.

### characterRolesSchema
`z.object({ roles?, roles_at_hq?, roles_at_base?, roles_at_other? }).loose()` — `getCharacterRoles` 200-body. All arrays optional and absent for characters with no corp roles. `syncCharacterAuthz` reads `roles` only and promotes to `authz_level='admin'` iff it contains `apertureConfig.AUTHZ_ADMIN_ROLE` (`'Director'`).

### characterTitleSchema / characterTitlesSchema
The single-entry schema plus the array wrapper for `getCharacterTitles`. `name` is corp-author chosen text and may contain HTML from the in-game editor — consumers treat it as untrusted.
