"use client";

// useEscape — bind an Escape key handler to a stable callback for the lifetime of the
// component. Standardizes the "press Esc to close" pattern across every modal in the app.
//
// Usage:
//   useEscape(onClose, isOpen);
//
// Passing `enabled=false` (e.g. when the modal is closed) prevents stray keystrokes from
// triggering a phantom callback when no modal is visible.

import { useEffect } from 'react';

export function useEscape(callback: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') callback();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [callback, enabled]);
}
