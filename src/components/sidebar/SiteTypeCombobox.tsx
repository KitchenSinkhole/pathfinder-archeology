'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { sitesForClassAndGroup } from '@/lib/map/signatureSites';
import type { CosmicSignatureGroupKey } from '@/types';

/**
 * Editable combobox for a cosmic signature's site name. Suggests names from the
 * static catalog filtered by the system's class and the signature group, but
 * always accepts free text (the catalog is intentionally sparse for
 * drifter/shattered/k-space classes, and CCP drift is expected).
 *
 * Mirrors `SignatureModule`'s `EditableTextCell` pattern: a controlled draft
 * that commits on blur (avoiding per-keystroke PATCHes) and re-syncs from
 * `value` only when not focused, so optimistic apply / realtime updates don't
 * clobber mid-edit typing. When the catalog has no entries for the class+group,
 * it degrades to a plain free-text input.
 */
export function SiteTypeCombobox({
  security,
  groupKey,
  value,
  onValueChange,
  disabled,
}: {
  security: string | null;
  groupKey: CosmicSignatureGroupKey;
  value: string | null;
  onValueChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const focusedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? '');
  }, [value]);

  const suggestions = useMemo(
    () => sitesForClassAndGroup(security, groupKey),
    [security, groupKey],
  );

  // Substring match on the draft; an empty/unchanged draft shows the full list.
  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q || q === (value ?? '').toLowerCase()) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [draft, value, suggestions]);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed !== draft) setDraft(trimmed);
    const normalized = trimmed || null;
    if (normalized !== value) onValueChange(normalized);
  }

  const placeholder = `${groupKey} site`;

  function openDropdown() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    focusedRef.current = true;
    setOpen(true);
  }

  return (
    <div>
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!open) openDropdown();
        }}
        onFocus={openDropdown}
        onBlur={() => {
          focusedRef.current = false;
          setOpen(false);
          commit(draft);
        }}
        className="h-8 text-sm"
        placeholder={placeholder}
        disabled={disabled}
      />
      {open && filtered.length > 0 && typeof document !== 'undefined' &&
        createPortal(
          <ul
            style={dropdownStyle}
            className="z-50 max-h-56 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
            role="listbox"
          >
            {filtered.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={name === value}
                  // mousedown fires before the input's blur, so the value is set
                  // before the list unmounts.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraft(name);
                    setOpen(false);
                    if (name !== value) onValueChange(name);
                  }}
                  className={cn(
                    'w-full cursor-pointer rounded-md px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    name === value && 'bg-accent text-accent-foreground',
                  )}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      }
    </div>
  );
}
