'use client';

import { useEffect, useRef, useState } from 'react';

/** "More" in the tab bar: a short menu for the views used less often. Escape or a click outside closes it. */
export default function MoreMenu({ items, view, onSelect }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const current = items.find((i) => i.id === view);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="more-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`viewtabs__tab more-menu__toggle${current ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-controls="more-menu-list"
        onClick={() => setOpen((v) => !v)}
      >
        {current ? current.label : 'More'}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id="more-menu-list" className="account-menu__list more-menu__list">
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="account-menu__item"
                aria-current={view === i.id ? 'page' : undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(i.id);
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
