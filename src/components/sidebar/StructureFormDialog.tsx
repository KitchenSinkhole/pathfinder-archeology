'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchStructureTypes } from '@/lib/structures/client';
import type { StructureIntel, UpwellStructureType } from '@/types';

export type StructureFormValues = {
  name: string;
  structureTypeId: number;
  ownerName: string | null;
  notes: string | null;
};

/**
 * Create/edit dialog for a manual structure. `initial` present ⇒ edit mode.
 * Loads the Upwell type catalog (cached) the first time it opens.
 */
export function StructureFormDialog({
  open,
  onOpenChange,
  systemName,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string;
  initial?: StructureIntel;
  onSubmit: (values: StructureFormValues) => void;
}) {
  const [types, setTypes] = useState<UpwellStructureType[]>([]);

  useEffect(() => {
    if (!open || types.length > 0) return;
    let cancelled = false;
    void fetchStructureTypes().then((result) => {
      if (!cancelled && result.ok) setTypes(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, types.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit structure' : 'Add structure'}</DialogTitle>
          <DialogDescription>Manual intel for {systemName}.</DialogDescription>
        </DialogHeader>

        {/* The dialog popup unmounts on close, so StructureForm remounts on each
            open and its useState initializers reset the fields from `initial`.
            The key guards the in-place edit→edit case if the popup ever keeps
            mounted. */}
        <StructureForm
          key={initial?.id ?? 'new'}
          initial={initial}
          types={types}
          onSubmit={onSubmit}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function StructureForm({
  initial,
  types,
  onSubmit,
  onClose,
}: {
  initial?: StructureIntel;
  types: UpwellStructureType[];
  onSubmit: (values: StructureFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [typeId, setTypeId] = useState(initial ? String(initial.structureTypeId) : '');
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const typeLabels = useMemo(
    () => Object.fromEntries(types.map((t) => [String(t.typeId), t.name])),
    [types],
  );
  // Sort by group then name so related structures cluster in the flat list.
  const sortedTypes = useMemo(
    () =>
      [...types].sort(
        (a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name),
      ),
    [types],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required.');
      return;
    }
    const numericTypeId = Number(typeId);
    if (!Number.isInteger(numericTypeId) || numericTypeId <= 0) {
      toast.error('Pick a structure type.');
      return;
    }
    onSubmit({
      name: trimmed,
      structureTypeId: numericTypeId,
      ownerName: ownerName.trim() || null,
      notes: notes.trim() || null,
    });
    onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="structure-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="structure-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Astrahus on the sun"
          autoFocus
          maxLength={100}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Type</span>
        <Select<string> value={typeId} onValueChange={(v) => v && setTypeId(v)} items={typeLabels}>
          <SelectTrigger>
            <SelectValue placeholder={types.length === 0 ? 'Loading…' : 'Select a type'} />
          </SelectTrigger>
          <SelectContent>
            {sortedTypes.map((t) => (
              <SelectItem key={t.typeId} value={String(t.typeId)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="structure-owner" className="text-sm font-medium">
          Owner <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="structure-owner"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Corp / alliance name"
          maxLength={100}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="structure-notes" className="text-sm font-medium">
          Notes <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="structure-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reinforced until…, anchoring, etc."
          rows={3}
          maxLength={2000}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{initial ? 'Save' : 'Add structure'}</Button>
      </DialogFooter>
    </form>
  );
}
