"use client";

// useToast — replaces window.alert() and ad-hoc inline "Saved!" messages.
//
// Reuses the existing `#fr-toast` element already in layout.tsx so we don't have to mount
// anything new. The hook just toggles its `opacity` and text content, with auto-dismiss
// after a configurable duration. The variant changes background color (success / error / info).
//
// Usage:
//   const toast = useToast();
//   toast.success('Donor saved');
//   toast.error('Save failed');
//
// Why a hook and not a global function: the hook gives us React-component scoping for
// timer cleanup, prevents memory leaks on unmount.

import { useCallback, useEffect, useRef } from 'react';

type Variant = 'success' | 'error' | 'info';

const VARIANT_BG: Record<Variant, string> = {
  success: '#1f7a45',   // shed-green family
  error: '#c54b1a',     // cone-orange family, slightly darker
  info: 'var(--cast-iron)',
};

export interface ToastApi {
  show: (message: string, variant?: Variant, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

export function useToast(): ToastApi {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cleanup pending timer on unmount so we don't toggle a stale node.
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const show = useCallback((message: string, variant: Variant = 'info', durationMs = 2400) => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('fr-toast');
    if (!el) {
      // Fallback to console if the toast container isn't mounted (e.g. error-boundary scenes).
      console.log(`[toast:${variant}] ${message}`);
      return;
    }
    el.textContent = message;
    el.style.background = VARIANT_BG[variant];
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    el.style.pointerEvents = 'auto';
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(12px)';
      el.style.pointerEvents = 'none';
    }, durationMs);
  }, []);

  const success = useCallback((message: string, durationMs?: number) => show(message, 'success', durationMs), [show]);
  const error = useCallback((message: string, durationMs?: number) => show(message, 'error', durationMs), [show]);
  const info = useCallback((message: string, durationMs?: number) => show(message, 'info', durationMs), [show]);

  return { show, success, error, info };
}
