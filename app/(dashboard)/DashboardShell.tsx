'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarNav } from './SidebarNav';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

type Role = 'owner' | 'manager' | 'staff' | 'driver';

type DashboardShellProps = {
  role: Role | null;
  displayName: string;
  currentTime: string;
  orgName: string;
  locationName: string;
  children: React.ReactNode;
};

export function DashboardShell({ role, displayName, currentTime, orgName, locationName, children }: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close drawer on Escape key.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-app text-fg-default">
      {/* Top bar */}
      <header className="safe-area-inset-top h-[46px] flex items-center justify-between px-3 sm:px-5 flex-shrink-0 bg-chrome-topbar gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="lg:hidden flex items-center justify-center w-9 h-9 -ml-1 rounded-md text-chrome-fg hover:bg-white/5 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-[15px] font-medium text-chrome-fg tracking-tight">TreeLot</span>
        </div>

        <span className="hidden sm:inline md:hidden text-[12px] text-mid-green bg-deep-green px-3 py-[3px] rounded-full whitespace-nowrap">
          {orgName}
        </span>
        <span className="hidden md:inline text-[12px] text-mid-green bg-deep-green px-3 py-[3px] rounded-full whitespace-nowrap">
          {orgName}{locationName ? ` — ${locationName}` : ''}
        </span>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ThemeToggle tone="chrome" />
          {displayName && (
            <span className="hidden md:inline text-[12px] text-chrome-fg-muted truncate max-w-[160px]">
              {displayName}
            </span>
          )}
          {role && (
            <span className="hidden sm:inline text-[10px] tracking-[0.08em] uppercase text-chrome-fg-muted/60">
              {role}
            </span>
          )}
          <span className="hidden md:inline text-[12px] text-chrome-fg-muted/70 whitespace-nowrap">
            {currentTime}
          </span>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop sidebar — static */}
        <nav className="hidden lg:flex flex-col flex-shrink-0 w-[160px] p-[10px_8px] gap-[2px] bg-chrome-sidebar">
          <SidebarNav role={role} />
        </nav>

        {/* Mobile drawer — overlay */}
        {drawerOpen && (
          <>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="lg:hidden fixed inset-0 bg-bg-overlay z-40"
            />
            <nav
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[240px] bg-chrome-sidebar z-50 flex flex-col p-[10px_8px] gap-[2px] safe-area-inset-top"
              aria-label="Primary navigation"
            >
              <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-chrome-divider/40">
                <span className="text-[13px] font-medium text-chrome-fg tracking-tight">Menu</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation"
                  className="flex items-center justify-center w-9 h-9 rounded-md text-chrome-fg-muted hover:bg-white/5 hover:text-chrome-fg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <SidebarNav role={role} />
            </nav>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-hidden bg-bg-app">{children}</main>
      </div>
    </div>
  );
}

