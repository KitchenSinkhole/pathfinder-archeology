'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CorpPickerProps = {
  corps: { id: string; name: string }[];
  selectedId: string | null;
};

const NO_CORP = '__none__';

/**
 * Admin-only picker for `/admin/settings`. Writes the chosen corp to the
 * `?corp=` query string; the server component re-renders with the selected
 * matrix.
 */
export function CorpPicker({ corps, selectedId }: CorpPickerProps) {
  const router = useRouter();
  const search = useSearchParams();

  const items = Object.fromEntries(corps.map((c) => [c.id, c.name]));
  const current = selectedId ?? NO_CORP;

  function onChange(next: string | null) {
    if (next === null) return;
    const params = new URLSearchParams(search.toString());
    if (next === NO_CORP) {
      params.delete('corp');
    } else {
      params.set('corp', next);
    }
    const qs = params.toString();
    const href = (qs.length > 0 ? `/admin/settings?${qs}` : '/admin/settings') as Route;
    router.push(href);
  }

  return (
    <label className="flex max-w-sm flex-col gap-1.5">
      <span className="text-sm font-medium">Corporation</span>
      <Select<string> value={current} onValueChange={onChange} items={items}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {corps.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
