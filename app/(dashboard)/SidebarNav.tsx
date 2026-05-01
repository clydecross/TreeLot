'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'owner' | 'manager' | 'staff' | 'driver';

type NavItem = {
  href: string;
  label: string;
  allowedRoles: Role[];
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    href: '/pos',
    label: 'POS / Checkout',
    allowedRoles: ['owner', 'manager', 'staff'],
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
        <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" />
        <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" />
        <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/deliveries',
    label: 'Deliveries',
    allowedRoles: ['owner', 'manager', 'staff'],
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="5" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10 7.5h2.5L14 10v2h-4V7.5z" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="4.5" cy="13" r="1.2" fill="currentColor" />
        <circle cx="12" cy="13" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
];

const navItemsLower: NavItem[] = [
  {
    href: '/customers',
    label: 'Customers',
    allowedRoles: ['owner', 'manager', 'staff'],
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/analytics',
    label: 'Analytics',
    allowedRoles: ['owner'],
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" />
        <rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" />
        <rect x="11" y="3" width="3" height="11" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/sales',
    label: 'Sales',
    allowedRoles: ['owner', 'manager'],
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3.5-4 3 2.5L12 5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="14" cy="5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/shift',
    label: 'End of shift',
    allowedRoles: ['owner', 'manager', 'staff'],
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 4.5v3.8l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    allowedRoles: ['owner', 'manager'],
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

function NavItem({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={`flex items-center gap-[9px] px-[10px] py-2.5 lg:py-2 min-h-[44px] lg:min-h-0 rounded-lg w-full text-left transition-colors duration-[140ms] ease-out ${
        isActive
          ? 'bg-chrome-active text-chrome-fg'
          : 'text-chrome-fg-muted hover:bg-white/5 hover:text-chrome-fg'
      }`}
    >
      <span>{icon}</span>
      <span className="text-[13px] lg:text-[12px] font-[inherit]">{label}</span>
    </Link>
  );
}

function filterByRole(items: NavItem[], role: Role | null): NavItem[] {
  // Fallback: Clerk user without a DB row should only see /pos.
  if (role === null) {
    return items.filter((item) => item.href === '/pos');
  }
  return items.filter((item) => item.allowedRoles.includes(role));
}

export function SidebarNav({ role }: { role: Role | null }) {
  const upper = filterByRole(navItems, role);
  const lower = filterByRole(navItemsLower, role);

  return (
    <>
      {upper.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}
      {upper.length > 0 && lower.length > 0 && (
        <div className="h-px bg-chrome-divider/40 mx-1 my-[5px]" />
      )}
      {lower.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}
    </>
  );
}
