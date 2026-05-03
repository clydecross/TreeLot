'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin',       label: 'Orgs'  },
  { href: '/admin/sales', label: 'Sales' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#2e2e2a] px-8 flex gap-1">
      {links.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={[
              'px-3 py-2.5 text-[12px] font-mono tracking-wide border-b-2 -mb-px transition-colors',
              active
                ? 'border-[#7CB542] text-[#e8e6e0]'
                : 'border-transparent text-[#6b6960] hover:text-[#a89f8c]',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
