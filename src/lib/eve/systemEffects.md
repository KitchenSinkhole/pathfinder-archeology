## systemEffects.ts

**Purpose:** Typed, resolved W-space system-effect reference data ported from the legacy `docs/spec/system_effect.js`, for the System Effects dialog.
**File:** `src/lib/eve/systemEffects.ts`

---

### SYSTEM_EFFECTS: SystemEffect[]
The six W-space anomaly effects (Magnetar, Red Giant, Pulsar, Wolf-Rayet Star, Cataclysmic Variable, Black Hole), each with its per-class bonus list already resolved to final values (no multiplier logic for consumers). Built at module load from the legacy per-strength tables + class→strength resolution.

Each `SystemEffect` is `{ key, name, classes: { classId, bonuses: { effect, value }[] }[] }`. `classes` holds one entry per class the effect occurs in (C1–C6 plus the relevant Drifter/shattered class), ascending by id.

### EFFECT_CLASS_LABELS: Record<number, string>
Display labels for the class ids an effect can carry — `1→'C1'` … `6→'C6'`, plus shattered/Drifter (`13→'C13 (Shattered)'`, `14→'C14 (Sentinel)'`, `15→'C15 (Barbican)'`, `16→'C16 (Vidette)'`, `17→'C17 (Conflux)'`, `18→'C18 (Redoubt)'`).

### Types
- `SystemEffectBonus` — `{ effect: string; value: string }`.
- `SystemEffectKey` — union of the six effect keys.
- `SystemEffect` — see above. Re-exported (with `SystemEffectBonus`) from `src/types/index.ts`.

### Notes
Class→strength resolution mirrors legacy `getMultiplierByAreaId`: C1–C6 use their own number; shattered frigate holes (13) read as C6 strength; Drifter space (14–18) reads as C2 strength.
