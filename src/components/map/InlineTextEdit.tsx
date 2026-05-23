'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * Double-click-to-edit text wrapper used on `SystemNode` for alias and tag.
 *
 * Idle state: renders `value ?? placeholder` as a span. Double-clicking swaps
 * the span for an autofocused `<input>` (with the xyflow `nodrag` / `nopan`
 * classes so dragging and panning don't steal the gesture). Enter commits,
 * Esc / blur cancel. Empty string commits as `null`.
 *
 * Stateless beyond `editing`: the caller owns the value and persists the commit.
 */
export function InlineTextEdit({
  value,
  placeholder,
  className,
  inputClassName,
  ariaLabel,
  maxLength,
  onCommit,
}: {
  value: string | null;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
  maxLength?: number;
  onCommit: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    setEditing(false);
    if (next !== value) onCommit(next);
  }

  function cancel() {
    setDraft(value ?? '');
    setEditing(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={cancel}
        maxLength={maxLength}
        aria-label={ariaLabel}
        className={cn(
          'nodrag nopan h-5 rounded border border-ring/60 bg-background px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          inputClassName,
        )}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onDoubleClick={startEdit}
      aria-label={ariaLabel}
      className={cn('cursor-text select-none', className)}
      title="Double-click to edit"
    >
      {value ?? placeholder ?? ''}
    </span>
  );
}
