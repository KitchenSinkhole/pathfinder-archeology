/**
 * Static W-space system-effect reference data, ported from the legacy
 * `docs/spec/system_effect.js`. Each anomaly effect (Magnetar, Pulsar, …) scales
 * its bonuses by the system's class. The legacy module stored per-strength tables
 * (strength 1–6) plus a `getMultiplierByAreaId` map that resolved each class to a
 * strength; this port resolves that at module load so `SYSTEM_EFFECTS` carries the
 * final values, with no multiplier logic left for consumers.
 */

export type SystemEffectBonus = { effect: string; value: string };

export type SystemEffectKey =
  | 'magnetar'
  | 'redGiant'
  | 'pulsar'
  | 'wolfRayet'
  | 'cataclysmic'
  | 'blackHole';

export type SystemEffect = {
  key: SystemEffectKey;
  name: string;
  /** One entry per class the effect occurs in, ascending. */
  classes: { classId: number; bonuses: SystemEffectBonus[] }[];
};

/** Display labels for the class ids an effect can carry (C1–C6 + Drifter/shattered). */
export const EFFECT_CLASS_LABELS: Record<number, string> = {
  1: 'C1',
  2: 'C2',
  3: 'C3',
  4: 'C4',
  5: 'C5',
  6: 'C6',
  13: 'C13 (Shattered)',
  14: 'C14 (Sentinel)',
  15: 'C15 (Barbican)',
  16: 'C16 (Vidette)',
  17: 'C17 (Conflux)',
  18: 'C18 (Redoubt)',
};

// Legacy `getMultiplierByAreaId`: maps a class/area id to the strength tier (1–6)
// whose bonus table applies. C1–C6 use their own number; shattered frigate holes
// (13) read as C6 strength; Drifter space (14–18) reads as C2 strength.
function strengthForClassId(classId: number): number {
  if (classId >= 1 && classId <= 6) return classId;
  if (classId === 13) return 6;
  if (classId >= 14 && classId <= 18) return 2;
  return 0;
}

// Per-strength bonus tables, transcribed verbatim from system_effect.js.
const magnetar: Record<number, SystemEffectBonus[]> = {
  1: [
    { effect: 'Damage', value: '+30%' },
    { effect: 'Missile exp. radius', value: '+15%' },
    { effect: 'Drone tracking', value: '-15%' },
    { effect: 'Targeting range', value: '-15%' },
    { effect: 'Tracking speed', value: '-15%' },
    { effect: 'Target Painter strength', value: '-15%' },
  ],
  2: [
    { effect: 'Damage', value: '+44%' },
    { effect: 'Missile exp. radius', value: '+22%' },
    { effect: 'Drone tracking', value: '-22%' },
    { effect: 'Targeting range', value: '-22%' },
    { effect: 'Tracking speed', value: '-22%' },
    { effect: 'Target Painter strength', value: '-22%' },
  ],
  3: [
    { effect: 'Damage', value: '+58%' },
    { effect: 'Missile exp. radius', value: '+29%' },
    { effect: 'Drone tracking', value: '-29%' },
    { effect: 'Targeting range', value: '-29%' },
    { effect: 'Tracking speed', value: '-29%' },
    { effect: 'Target Painter strength', value: '-29%' },
  ],
  4: [
    { effect: 'Damage', value: '+72%' },
    { effect: 'Missile exp. radius', value: '+36%' },
    { effect: 'Drone tracking', value: '-36%' },
    { effect: 'Targeting range', value: '-36%' },
    { effect: 'Tracking speed', value: '-36%' },
    { effect: 'Target Painter strength', value: '-36%' },
  ],
  5: [
    { effect: 'Damage', value: '+86%' },
    { effect: 'Missile exp. radius', value: '+43%' },
    { effect: 'Drone tracking', value: '-43%' },
    { effect: 'Targeting range', value: '-43%' },
    { effect: 'Tracking speed', value: '-43%' },
    { effect: 'Target Painter strength', value: '-43%' },
  ],
  6: [
    { effect: 'Damage', value: '+100%' },
    { effect: 'Missile exp. radius', value: '+50%' },
    { effect: 'Drone tracking', value: '-50%' },
    { effect: 'Targeting range', value: '-50%' },
    { effect: 'Tracking speed', value: '-50%' },
    { effect: 'Target Painter strength', value: '-50%' },
  ],
};

const redGiant: Record<number, SystemEffectBonus[]> = {
  1: [
    { effect: 'Heat damage', value: '+15%' },
    { effect: 'Overload bonus', value: '+30%' },
    { effect: 'Smart Bomb range', value: '+30%' },
    { effect: 'Smart Bomb damage', value: '+30%' },
    { effect: 'Bomb damage', value: '+30%' },
  ],
  2: [
    { effect: 'Heat damage', value: '+22%' },
    { effect: 'Overload bonus', value: '+44%' },
    { effect: 'Smart Bomb range', value: '+44%' },
    { effect: 'Smart Bomb damage', value: '+44%' },
    { effect: 'Bomb damage', value: '+44%' },
  ],
  3: [
    { effect: 'Heat damage', value: '+29%' },
    { effect: 'Overload bonus', value: '+58%' },
    { effect: 'Smart Bomb range', value: '+58%' },
    { effect: 'Smart Bomb damage', value: '+58%' },
    { effect: 'Bomb damage', value: '+58%' },
  ],
  4: [
    { effect: 'Heat damage', value: '+36%' },
    { effect: 'Overload bonus', value: '+72%' },
    { effect: 'Smart Bomb range', value: '+72%' },
    { effect: 'Smart Bomb damage', value: '+72%' },
    { effect: 'Bomb damage', value: '+72%' },
  ],
  5: [
    { effect: 'Heat damage', value: '+43%' },
    { effect: 'Overload bonus', value: '+86%' },
    { effect: 'Smart Bomb range', value: '+86%' },
    { effect: 'Smart Bomb damage', value: '+86%' },
    { effect: 'Bomb damage', value: '+86%' },
  ],
  6: [
    { effect: 'Heat damage', value: '+50%' },
    { effect: 'Overload bonus', value: '+100%' },
    { effect: 'Smart Bomb range', value: '+100%' },
    { effect: 'Smart Bomb damage', value: '+100%' },
    { effect: 'Bomb damage', value: '+100%' },
  ],
};

const pulsar: Record<number, SystemEffectBonus[]> = {
  1: [
    { effect: 'Shield HP', value: '+30%' },
    { effect: 'Armor resist', value: '-15%' },
    { effect: 'Capacitor recharge', value: '-15%' },
    { effect: 'Signature', value: '+30%' },
    { effect: 'NOS/Neut drain', value: '+30%' },
  ],
  2: [
    { effect: 'Shield HP', value: '+44%' },
    { effect: 'Armor resist', value: '-22%' },
    { effect: 'Capacitor recharge', value: '-22%' },
    { effect: 'Signature', value: '+44%' },
    { effect: 'NOS/Neut drain', value: '+44%' },
  ],
  3: [
    { effect: 'Shield HP', value: '+58%' },
    { effect: 'Armor resist', value: '-29%' },
    { effect: 'Capacitor recharge', value: '-29%' },
    { effect: 'Signature', value: '+58%' },
    { effect: 'NOS/Neut drain', value: '+58%' },
  ],
  4: [
    { effect: 'Shield HP', value: '+72%' },
    { effect: 'Armor resist', value: '-36%' },
    { effect: 'Capacitor recharge', value: '-36%' },
    { effect: 'Signature', value: '+72%' },
    { effect: 'NOS/Neut drain', value: '+72%' },
  ],
  5: [
    { effect: 'Shield HP', value: '+86%' },
    { effect: 'Armor resist', value: '-43%' },
    { effect: 'Capacitor recharge', value: '-43%' },
    { effect: 'Signature', value: '+86%' },
    { effect: 'NOS/Neut drain', value: '+86%' },
  ],
  6: [
    { effect: 'Shield HP', value: '+100%' },
    { effect: 'Armor resist', value: '-50%' },
    { effect: 'Capacitor recharge', value: '-50%' },
    { effect: 'Signature', value: '+100%' },
    { effect: 'NOS/Neut drain', value: '+100%' },
  ],
};

const wolfRayet: Record<number, SystemEffectBonus[]> = {
  1: [
    { effect: 'Armor HP', value: '+30%' },
    { effect: 'Shield resist', value: '-15%' },
    { effect: 'Small Weapon damage', value: '+60%' },
    { effect: 'Signature size', value: '-15%' },
  ],
  2: [
    { effect: 'Armor HP', value: '+44%' },
    { effect: 'Shield resist', value: '-22%' },
    { effect: 'Small Weapon damage', value: '+88%' },
    { effect: 'Signature size', value: '-22%' },
  ],
  3: [
    { effect: 'Armor HP', value: '+58%' },
    { effect: 'Shield resist', value: '-29%' },
    { effect: 'Small Weapon damage', value: '+116%' },
    { effect: 'Signature size', value: '-29%' },
  ],
  4: [
    { effect: 'Armor HP', value: '+72%' },
    { effect: 'Shield resist', value: '-36%' },
    { effect: 'Small Weapon damage', value: '+144%' },
    { effect: 'Signature size', value: '-36%' },
  ],
  5: [
    { effect: 'Armor HP', value: '+86%' },
    { effect: 'Shield resist', value: '-43%' },
    { effect: 'Small Weapon damage', value: '+172%' },
    { effect: 'Signature size', value: '-43%' },
  ],
  6: [
    { effect: 'Armor HP', value: '+100%' },
    { effect: 'Shield resist', value: '-50%' },
    { effect: 'Small Weapon damage', value: '+200%' },
    { effect: 'Signature size', value: '-50%' },
  ],
};

const cataclysmic: Record<number, SystemEffectBonus[]> = {
  1: [
    { effect: 'Local armor repair amount', value: '-15%' },
    { effect: 'Local shield boost amount', value: '-15%' },
    { effect: 'Shield transfer amount', value: '+30%' },
    { effect: 'Remote repair amount', value: '+30%' },
    { effect: 'Capacitor capacity', value: '+30%' },
    { effect: 'Capacitor recharge time', value: '+15%' },
    { effect: 'Remote Capacitor Transmitter amount', value: '-15%' },
  ],
  2: [
    { effect: 'Local armor repair amount', value: '-22%' },
    { effect: 'Local shield boost amount', value: '-22%' },
    { effect: 'Shield transfer amount', value: '+44%' },
    { effect: 'Remote repair amount', value: '+44%' },
    { effect: 'Capacitor capacity', value: '+44%' },
    { effect: 'Capacitor recharge time', value: '+22%' },
    { effect: 'Remote Capacitor Transmitter amount', value: '-22%' },
  ],
  3: [
    { effect: 'Local armor repair amount', value: '-29%' },
    { effect: 'Local shield boost amount', value: '-29%' },
    { effect: 'Shield transfer amount', value: '+58%' },
    { effect: 'Remote repair amount', value: '+58%' },
    { effect: 'Capacitor capacity', value: '+58%' },
    { effect: 'Capacitor recharge time', value: '+29%' },
    { effect: 'Remote Capacitor Transmitter amount', value: '-29%' },
  ],
  4: [
    { effect: 'Local armor repair amount', value: '-36%' },
    { effect: 'Local shield boost amount', value: '-36%' },
    { effect: 'Shield transfer amount', value: '+72%' },
    { effect: 'Remote repair amount', value: '+72%' },
    { effect: 'Capacitor capacity', value: '+72%' },
    { effect: 'Capacitor recharge time', value: '+36%' },
    { effect: 'Remote Capacitor Transmitter amount', value: '-36%' },
  ],
  5: [
    { effect: 'Local armor repair amount', value: '-43%' },
    { effect: 'Local shield boost amount', value: '-43%' },
    { effect: 'Shield transfer amount', value: '+86%' },
    { effect: 'Remote repair amount', value: '+86%' },
    { effect: 'Capacitor capacity', value: '+86%' },
    { effect: 'Capacitor recharge time', value: '+43%' },
    { effect: 'Remote Capacitor Transmitter amount', value: '-43%' },
  ],
  6: [
    { effect: 'Local armor repair amount', value: '-50%' },
    { effect: 'Local shield boost amount', value: '-50%' },
    { effect: 'Shield transfer amount', value: '+100%' },
    { effect: 'Remote repair amount', value: '+100%' },
    { effect: 'Capacitor capacity', value: '+100%' },
    { effect: 'Capacitor recharge time', value: '+50%' },
    { effect: 'Remote Capacitor Transmitter amount', value: '-50%' },
  ],
};

const blackHole: Record<number, SystemEffectBonus[]> = {
  1: [
    { effect: 'Missile velocity', value: '+15%' },
    { effect: 'Missile exp. velocity', value: '+30%' },
    { effect: 'Ship velocity', value: '+30%' },
    { effect: 'Stasis Webifier strength', value: '-15%' },
    { effect: 'Inertia', value: '+15%' },
    { effect: 'Targeting range', value: '+30%' },
  ],
  2: [
    { effect: 'Missile velocity', value: '+22%' },
    { effect: 'Missile exp. velocity', value: '+44%' },
    { effect: 'Ship velocity', value: '+44%' },
    { effect: 'Stasis Webifier strength', value: '-22%' },
    { effect: 'Inertia', value: '+22%' },
    { effect: 'Targeting range', value: '+44%' },
  ],
  3: [
    { effect: 'Missile velocity', value: '+29%' },
    { effect: 'Missile exp. velocity', value: '+58%' },
    { effect: 'Ship velocity', value: '+58%' },
    { effect: 'Stasis Webifier strength', value: '-29%' },
    { effect: 'Inertia', value: '+29%' },
    { effect: 'Targeting range', value: '+58%' },
  ],
  4: [
    { effect: 'Missile velocity', value: '+36%' },
    { effect: 'Missile exp. velocity', value: '+72%' },
    { effect: 'Ship velocity', value: '+72%' },
    { effect: 'Stasis Webifier strength', value: '-36%' },
    { effect: 'Inertia', value: '+36%' },
    { effect: 'Targeting range', value: '+72%' },
  ],
  5: [
    { effect: 'Missile velocity', value: '+43%' },
    { effect: 'Missile exp. velocity', value: '+86%' },
    { effect: 'Ship velocity', value: '+86%' },
    { effect: 'Stasis Webifier strength', value: '-43%' },
    { effect: 'Inertia', value: '+43%' },
    { effect: 'Targeting range', value: '+86%' },
  ],
  6: [
    { effect: 'Missile velocity', value: '+50%' },
    { effect: 'Missile exp. velocity', value: '+100%' },
    { effect: 'Ship velocity', value: '+100%' },
    { effect: 'Stasis Webifier strength', value: '-50%' },
    { effect: 'Inertia', value: '+50%' },
    { effect: 'Targeting range', value: '+100%' },
  ],
};

// Per-effect class membership, mirroring the `wh` export in system_effect.js.
const EFFECT_DEFS: { key: SystemEffectKey; name: string; table: Record<number, SystemEffectBonus[]>; classIds: number[] }[] = [
  { key: 'magnetar', name: 'Magnetar', table: magnetar, classIds: [1, 2, 3, 4, 5, 6, 16] },
  { key: 'redGiant', name: 'Red Giant', table: redGiant, classIds: [1, 2, 3, 4, 5, 6, 14] },
  { key: 'pulsar', name: 'Pulsar', table: pulsar, classIds: [1, 2, 3, 4, 5, 6, 17] },
  { key: 'wolfRayet', name: 'Wolf-Rayet Star', table: wolfRayet, classIds: [1, 2, 3, 4, 5, 6, 13, 18] },
  { key: 'cataclysmic', name: 'Cataclysmic Variable', table: cataclysmic, classIds: [1, 2, 3, 4, 5, 6, 15] },
  { key: 'blackHole', name: 'Black Hole', table: blackHole, classIds: [1, 2, 3, 4, 5, 6] },
];

export const SYSTEM_EFFECTS: SystemEffect[] = EFFECT_DEFS.map((def) => ({
  key: def.key,
  name: def.name,
  classes: def.classIds.map((classId) => ({
    classId,
    bonuses: def.table[strengthForClassId(classId)] ?? [],
  })),
}));
