// Which screen and which tabs a visitor gets. Pure, so the rules are tested in node:test and App.jsx
// only renders what these return.

// Main tabs, kept short; the views used less often sit under "More".
export const MORE_ITEMS = [
  { id: 'activities', label: 'Activities' },
  { id: 'labs', label: 'Lab baseline' },
  { id: 'standtest', label: 'Stand test' },
  { id: 'about', label: 'About' },
  { id: 'demo', label: 'Demo controls' },
];

export const MORE_TAB = { id: 'more', label: 'More', items: MORE_ITEMS };

export const TABS = [
  { id: 'dashboard', label: 'Today' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'environment', label: 'Station' },
  MORE_TAB,
];

export const CMO_TAB = { id: 'cmo', label: 'Crew' };

/**
 * 'loading' until the stored identity has been read (avoids flashing the landing screen for someone
 * already signed in), then 'landing' with no identity, else 'app'.
 */
export function screenFor({ ready, who }) {
  if (!ready) return 'loading';
  return who ? 'app' : 'landing';
}

/** Everyone gets the personal tabs; only the Crew Medical Officer also gets the whole-crew CMO tab. */
export function tabsFor(account) {
  if (!account) return [];
  return account.role === 'cmo' ? [...TABS.slice(0, -1), CMO_TAB, TABS.at(-1)] : [...TABS];
}

/** May this account open this view? Only the CMO may open the exam form. (The database enforces the same rule for CMO data with RLS, and /api/sync for exams.) */
export const canOpen = (account, viewId) =>
  viewId === 'checkin' ||
  (viewId === 'exam' && account?.role === 'cmo') ||
  tabsFor(account).some((t) => t.id === viewId || t.items?.some((i) => i.id === viewId));
