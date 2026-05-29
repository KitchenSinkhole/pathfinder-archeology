'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  EFFECT_CLASS_LABELS,
  SYSTEM_EFFECTS,
  type SystemEffect,
} from '@/lib/eve/systemEffects';

/**
 * Static reference dialog listing every W-space anomaly effect and its per-class
 * bonuses (Stage 17.3). One table per effect, two-up on wide viewports. Pure
 * reference data from `SYSTEM_EFFECTS` — no server call.
 */
export function SystemEffectsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>System effects</DialogTitle>
          <DialogDescription>
            Wormhole-space anomaly bonuses by system class.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-auto md:grid-cols-2">
          {SYSTEM_EFFECTS.map((effect) => (
            <EffectTable key={effect.key} effect={effect} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EffectTable({ effect }: { effect: SystemEffect }) {
  // Bonus labels are identical across classes (same source table at different
  // strengths), so the first class drives the row set; cells read by index.
  const bonusLabels = effect.classes[0]?.bonuses.map((b) => b.effect) ?? [];

  return (
    <div className="rounded-md ring-1 ring-foreground/10">
      <div className="border-b border-foreground/10 bg-muted/60 px-2.5 py-1.5 text-xs font-medium">
        {effect.name}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Bonus</th>
              {effect.classes.map((c) => (
                <th key={c.classId} className="px-2 py-1 text-right font-medium">
                  {EFFECT_CLASS_LABELS[c.classId] ?? `C${c.classId}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bonusLabels.map((label, i) => (
              <tr key={label} className="border-t border-foreground/10">
                <td className="px-2 py-1">{label}</td>
                {effect.classes.map((c) => (
                  <td key={c.classId} className="px-2 py-1 text-right font-mono tabular-nums">
                    {c.bonuses[i]?.value ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
