'use client';

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MapConnectionEdge, MapSystemNode } from '@/types';

const NONE_VALUE = '__none__';

/**
 * Dropdown of connections incident to the active system. Each option labels
 * the other end's `alias ?? name`, optionally followed by the resolved
 * security/class (when known). Used in `SignatureModule` to bind a wormhole
 * signature to a placed connection. No API call — driven entirely off the
 * canvas's already-loaded `connections` and `systems`.
 */
export function ConnectionSelect({
  system,
  connections,
  systems,
  value,
  onValueChange,
  disabled,
}: {
  system: MapSystemNode;
  connections: MapConnectionEdge[];
  systems: MapSystemNode[];
  value: string | null;
  onValueChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const options = useMemo(() => {
    const systemsById = new Map(systems.map((s) => [s.id, s]));
    return connections
      .filter((c) => c.source === system.id || c.target === system.id)
      .map((c) => {
        const otherId = c.source === system.id ? c.target : c.source;
        const other = systemsById.get(otherId);
        if (!other) return null;
        const label = other.alias ?? other.name;
        const cls = other.security ?? '';
        return { id: c.id, label, cls };
      })
      .filter((x): x is { id: string; label: string; cls: string } => x !== null);
  }, [connections, systems, system.id]);

  const items = useMemo(() => {
    const labels: Record<string, string> = { [NONE_VALUE]: '—' };
    for (const o of options) {
      labels[o.id] = o.cls ? `${o.label} (${o.cls})` : o.label;
    }
    return labels;
  }, [options]);

  const stringValue = value ?? NONE_VALUE;

  return (
    <Select<string>
      value={stringValue}
      onValueChange={(next) => {
        if (!next || next === NONE_VALUE) onValueChange(null);
        else onValueChange(next);
      }}
      items={items}
      disabled={disabled || options.length === 0}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>—</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
            {o.cls ? (
              <span className="ml-1 text-xs text-muted-foreground">{o.cls}</span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
