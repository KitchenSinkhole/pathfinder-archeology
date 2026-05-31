'use client';

import type { CSSProperties } from 'react';
import type { UnderglowConfig } from '@/types';

// Pure presentational glow rendered *behind* a SystemNode. Notification-agnostic
// — it only knows color/brightness/speed. Driven entirely by CSS (the
// `animate-underglow` utility + keyframe in globals.css); the config rides in as
// CSS custom properties so one keyframe serves every preset. The owning node is
// `relative`; this sits absolutely behind it (`-z-10`) and is blurred to read as
// a glow rather than a box. Pointer-events off so it never eats node clicks.

type CSSVars = CSSProperties & {
  '--underglow-color': string;
  '--underglow-brightness': string;
  '--underglow-speed': string;
};

export function SystemUnderglow({ color, brightness, speedMs }: UnderglowConfig) {
  const style: CSSVars = {
    '--underglow-color': color,
    '--underglow-brightness': String(brightness),
    '--underglow-speed': `${speedMs}ms`,
  };
  return (
    <div
      aria-hidden
      className="animate-underglow pointer-events-none absolute -inset-1 -z-10 rounded-lg"
      style={style}
    />
  );
}
