'use client';

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SIGNATURE_GROUP_CATALOG } from '@/lib/map/signatureGroups';
import type { SignatureGroupKey } from '@/types';

const NONE_VALUE = '__none__';

/**
 * Fixed dropdown of the seven scanner-level signature groups + an "unknown"
 * sentinel. Used in `SignatureModule` (both the per-row Group cell and the
 * draft-input row). Pure-client, no fetch — the catalog is static.
 */
export function SignatureGroupSelect({
  value,
  onValueChange,
  disabled,
}: {
  value: SignatureGroupKey | null;
  onValueChange: (next: SignatureGroupKey | null) => void;
  disabled?: boolean;
}) {
  const items = useMemo(() => {
    const labels: Record<string, string> = { [NONE_VALUE]: 'unknown' };
    for (const g of SIGNATURE_GROUP_CATALOG) labels[g.key] = g.label;
    return labels;
  }, []);

  const stringValue = value ?? NONE_VALUE;

  return (
    <Select<string>
      value={stringValue}
      onValueChange={(next) => {
        if (!next || next === NONE_VALUE) onValueChange(null);
        else onValueChange(next as SignatureGroupKey);
      }}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>unknown</SelectItem>
        {SIGNATURE_GROUP_CATALOG.map((g) => (
          <SelectItem key={g.key} value={g.key}>
            {g.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
