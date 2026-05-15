// Design tokens — central place for spacing, radius, font sizes, and tints.
//
// Why: the codebase had 4 different border-radius scales (6, 8, 10, 12) and similar
// drift in font sizes / paddings. Going forward, every new style should pull from this
// file so the visual language stays consistent.
//
// We export plain numbers + React.CSSProperties helpers — not CSS custom properties —
// because the platform uses inline-style components, not a stylesheet system.

export const radius = {
  /** Small: chips, inputs, secondary buttons, badges. */
  sm: 6,
  /** Medium: panels, cards, primary buttons, modals. */
  md: 10,
  /** Large: hero blocks, large modals (rare). */
  lg: 14,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fontSize = {
  /** Labels, microcopy, captions. ALL-CAPS letterspacing labels use this. */
  micro: 11,
  /** Helpers, secondary info. */
  small: 12,
  /** Default body. */
  body: 13,
  /** Emphasized body (numbers, names). */
  emphasis: 15,
  /** Subhead / section title. */
  subhead: 18,
  /** Page heading. */
  heading: 22,
  /** Hero / dashboard date. */
  hero: 30,
} as const;

export const colors = {
  ink: 'var(--cast-iron)',
  ink70: 'rgba(10,16,25,0.7)',
  ink55: 'rgba(10,16,25,0.55)',
  ink30: 'rgba(10,16,25,0.3)',
  ink14: 'rgba(10,16,25,0.14)',
  ink08: 'rgba(10,16,25,0.08)',
  paper: 'var(--paper)',
  blueprint: 'var(--blueprint)',
  shedGreen: 'var(--shed-green)',
  coneOrange: 'var(--cone-orange)',
} as const;

// Shared style fragments — import these instead of re-declaring inline.
import type { CSSProperties } from 'react';

export const styles = {
  panel: {
    background: '#fff',
    border: `1px solid ${colors.ink08}`,
    borderRadius: radius.md,
  } as CSSProperties,

  input: {
    padding: '8px 12px',
    border: `1px solid ${colors.ink14}`,
    borderRadius: radius.sm,
    fontSize: fontSize.body,
    width: '100%',
    outline: 'none',
    background: '#fff',
    boxSizing: 'border-box',
  } as CSSProperties,

  primaryBtn: {
    padding: '8px 16px',
    background: colors.ink,
    color: '#fff',
    border: 'none',
    borderRadius: radius.sm,
    fontWeight: 700,
    fontSize: fontSize.body,
    cursor: 'pointer',
  } as CSSProperties,

  secondaryBtn: {
    padding: '8px 16px',
    background: 'transparent',
    color: colors.ink,
    border: `1px solid ${colors.ink14}`,
    borderRadius: radius.sm,
    fontWeight: 600,
    fontSize: fontSize.body,
    cursor: 'pointer',
  } as CSSProperties,

  dangerBtn: {
    padding: '8px 14px',
    background: '#fff',
    color: colors.coneOrange,
    border: '1px solid rgba(232,93,31,0.4)',
    borderRadius: radius.sm,
    fontSize: fontSize.small,
    fontWeight: 700,
    cursor: 'pointer',
  } as CSSProperties,

  // Sticky table header — use on `<thead>` row TH cells.
  stickyTh: {
    position: 'sticky',
    top: 0,
    background: '#fff',
    zIndex: 2,
  } as CSSProperties,

  microLabel: {
    fontSize: fontSize.micro,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    opacity: 0.55,
  } as CSSProperties,
} as const;
