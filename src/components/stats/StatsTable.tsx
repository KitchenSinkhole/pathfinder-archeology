'use client';

import { useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Sparkline } from './Sparkline';
import type { ActivityStatRow } from '@/types';

/**
 * StatsTable (Stage 17.7) — the rebuild's **first** `@tanstack/react-table`
 * use. Ranks characters (rolled up to account main) by activity in the selected
 * period: System / Connection / Signature create-update-delete triplets, a total
 * (default sort), and a trailing-window sparkline. Establishes the column +
 * sorting pattern that Stage 17.10 reuses to migrate the admin HTML tables.
 */
const columnHelper = createColumnHelper<ActivityStatRow>();

const columns = [
  columnHelper.display({
    id: 'rank',
    header: '#',
    cell: ({ row, table }) =>
      table.getSortedRowModel().rows.findIndex((r) => r.id === row.id) + 1,
  }),
  columnHelper.accessor('characterName', {
    header: 'Pilot',
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        {row.original.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- static EVE CDN avatar, no Next loader needed
          <img
            src={row.original.portraitUrl}
            alt=""
            width={20}
            height={20}
            className="size-5 rounded-full bg-muted"
          />
        ) : (
          <span className="size-5 rounded-full bg-muted" />
        )}
        <span className="truncate">{row.original.characterName}</span>
      </span>
    ),
  }),
  columnHelper.accessor((r) => r.system.create, { id: 'sysC', header: 'C' }),
  columnHelper.accessor((r) => r.system.update, { id: 'sysU', header: 'U' }),
  columnHelper.accessor((r) => r.system.delete, { id: 'sysD', header: 'D' }),
  columnHelper.accessor((r) => r.connection.create, { id: 'conC', header: 'C' }),
  columnHelper.accessor((r) => r.connection.update, { id: 'conU', header: 'U' }),
  columnHelper.accessor((r) => r.connection.delete, { id: 'conD', header: 'D' }),
  columnHelper.accessor((r) => r.signature.create, { id: 'sigC', header: 'C' }),
  columnHelper.accessor((r) => r.signature.update, { id: 'sigU', header: 'U' }),
  columnHelper.accessor((r) => r.signature.delete, { id: 'sigD', header: 'D' }),
  columnHelper.accessor('total', { header: 'Total' }),
  columnHelper.display({
    id: 'trend',
    header: 'Trend',
    cell: ({ row }) => (
      <Sparkline data={row.original.series} className="text-primary/70" />
    ),
  }),
];

export function StatsTable({ rows }: { rows: ActivityStatRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'total', desc: true }]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table manages its own memoization; the React Compiler correctly skips auto-memoizing this component, no stale-UI risk here.
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="max-h-[60vh] overflow-auto rounded-md ring-1 ring-foreground/10">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-muted/80 text-[10px] uppercase text-muted-foreground backdrop-blur">
          {/* Static grouping row spanning each triplet's three leaf columns. */}
          <tr className="border-b border-foreground/10">
            <th className="px-2 py-1" colSpan={2} />
            <th className="px-2 py-1 text-center font-medium" colSpan={3}>
              System
            </th>
            <th className="px-2 py-1 text-center font-medium" colSpan={3}>
              Connection
            </th>
            <th className="px-2 py-1 text-center font-medium" colSpan={3}>
              Signature
            </th>
            <th className="px-2 py-1" colSpan={2} />
          </tr>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const numeric = header.id !== 'rank' && header.id !== 'characterName';
                return (
                  <th
                    key={header.id}
                    className={`px-2 py-1.5 font-medium ${numeric ? 'text-right' : 'text-left'} ${
                      sortable ? 'cursor-pointer select-none' : ''
                    }`}
                    onClick={
                      sortable ? header.column.getToggleSortingHandler() : undefined
                    }
                  >
                    <span
                      className={`inline-flex items-center gap-0.5 ${numeric ? 'justify-end' : ''}`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t border-foreground/10 hover:bg-muted/40">
              {row.getVisibleCells().map((cell) => {
                const numeric =
                  cell.column.id !== 'rank' &&
                  cell.column.id !== 'characterName' &&
                  cell.column.id !== 'trend';
                const isZero = numeric && cell.getValue() === 0;
                return (
                  <td
                    key={cell.id}
                    className={`px-2 py-1.5 ${
                      cell.column.id === 'rank' || numeric ? 'text-right' : ''
                    } ${cell.column.id === 'total' ? 'font-medium' : ''} ${
                      isZero ? 'text-muted-foreground/40' : ''
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
