'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Backdrop — A full-screen invisible overlay that:
 * - Sits below the target panel (z-index is panel's z - 1)
 * - Captures ALL clicks outside the panel
 * - Stops propagation so nothing behind it fires
 * - Calls onClose to dismiss the panel
 *
 * Usage: render inside the panel component when open={true}
 * <Backdrop onClose={() => setOpen(false)} zIndex={49} />
 */
export default function Backdrop({
  onClose,
  zIndex = 49,
}: {
  onClose: () => void;
  zIndex?: number;
}) {
  // Also close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'transparent',
        cursor: 'default',
      }}
      // Stop the click here — don't let it reach anything behind
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    />,
    document.body
  );
}
