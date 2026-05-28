'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  adminDeleteCorpRight,
  adminUpsertCorpRight,
} from '@/app/(admin)/actions/settings';
import { cn } from '@/lib/utils';
import type { CorpRightCell, CorpRightsMatrix } from '@/lib/admin/corpRights';
import type { AuthzLevel, MapRight } from '@/types';

const RIGHT_LABELS: Record<MapRight, string> = {
  map_create: 'Create maps',
  map_update: 'Update map state',
  map_delete: 'Soft-delete maps',
  map_import: 'Import map data',
  map_export: 'Export map data',
  map_share: 'Share maps (grant access)',
};

type Column = { value: AuthzLevel | null; label: string };

const COLUMNS: Column[] = [
  { value: null, label: 'None' },
  { value: 'member', label: 'Member' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

export type CorpRightsMatrixProps = {
  corporationId: string;
  initial: CorpRightsMatrix['rights'];
};

/**
 * Renders the 6 rights × 4-column radio matrix for a single corp. Each row's
 * radio click runs an optimistic state update, fires the matching Server
 * Action, and rolls the row back on `{ ok: false }` (toast surfaces the
 * server message).
 */
export function CorpRightsMatrix({ corporationId, initial }: CorpRightsMatrixProps) {
  const [rows, setRows] = useState<CorpRightCell[]>(initial);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Right</th>
            {COLUMNS.map((c) => (
              <th key={c.label} className="px-3 py-2 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.right}
              corporationId={corporationId}
              row={row}
              onChange={(next) =>
                setRows((prev) =>
                  prev.map((r) => (r.right === row.right ? { ...r, minAuthzLevel: next } : r)),
                )
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  corporationId,
  row,
  onChange,
}: {
  corporationId: string;
  row: CorpRightCell;
  onChange: (next: AuthzLevel | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  function pick(next: AuthzLevel | null) {
    if (next === row.minAuthzLevel) return;
    const previous = row.minAuthzLevel;
    onChange(next);
    startTransition(async () => {
      const result =
        next === null
          ? await adminDeleteCorpRight({ corporationId, right: row.right })
          : await adminUpsertCorpRight({
              corporationId,
              right: row.right,
              minAuthzLevel: next,
            });
      if (!result.ok) {
        onChange(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 align-middle font-medium">
        {RIGHT_LABELS[row.right]}
        <div className="font-mono text-xs text-muted-foreground">{row.right}</div>
      </td>
      {COLUMNS.map((column) => {
        const checked = column.value === row.minAuthzLevel;
        return (
          <td key={column.label} className="px-3 py-2 text-center align-middle">
            <label
              className={cn(
                'mx-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border transition-colors',
                checked
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
                pending && 'opacity-60',
              )}
              aria-label={`${RIGHT_LABELS[row.right]} — ${column.label}`}
            >
              <input
                type="radio"
                name={`right-${row.right}`}
                className="sr-only"
                checked={checked}
                disabled={pending}
                onChange={() => pick(column.value)}
              />
              <span
                aria-hidden
                className={cn(
                  'block size-2 rounded-full',
                  checked ? 'bg-primary' : 'bg-transparent',
                )}
              />
            </label>
          </td>
        );
      })}
    </tr>
  );
}
