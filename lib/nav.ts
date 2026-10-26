/**
 * One place that describes every page of the app: its address, its name in the sidebar,
 * and which section of the original single-page screen it corresponds to (`legacy`).
 * The sidebar, the address bar and the not-yet-converted screens all read from this list.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  /** id of the matching `page-…` section in the original screen, while that page is not yet rebuilt in React */
  legacy: string;
  badge?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard', legacy: 'dashboard' },
      { id: 'students', label: 'Students', href: '/students', legacy: 'admissions' },
      { id: 'new-admission', label: 'New Admission', href: '/students/new', legacy: 'admission-form' },
    ],
  },
  {
    label: 'Library',
    items: [
      { id: 'basement', label: 'Basement Library', href: '/library/basement', legacy: 'basement' },
      { id: 'floor2', label: '2nd Floor Library', href: '/library/second-floor', legacy: 'floor2' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'fees', label: 'Fee Management', href: '/finance/fees', legacy: 'fees' },
      { id: 'reminders', label: 'Reminders', href: '/finance/reminders', legacy: 'reminders', badge: true },
      { id: 'settings', label: 'Settings', href: '/settings', legacy: 'settings' },
      { id: 'statistics', label: 'Statistics', href: '/finance/statistics', legacy: 'statistics' },
    ],
  },
  {
    label: 'Tools',
    items: [{ id: 'export', label: 'Export Data', href: '/export', legacy: 'export' }],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

/** Addresses that are served by the original screen. Anything not listed here is a 404. */
export function legacyPageForPath(pathname: string): NavItem | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return NAV_ITEMS.find((i) => i.href === clean);
}

/** Old address `/Students` → `/students`: web addresses are case-sensitive, so we also accept capitals. */
export function normalisePath(pathname: string): string {
  return pathname.toLowerCase().replace(/\/+$/, '') || '/';
}
