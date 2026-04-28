import { currentUser } from '@clerk/nextjs/server';
import { SidebarNav } from './SidebarNav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const displayName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.emailAddresses[0]?.emailAddress
    : '';

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: 46, background: '#1c2b1a' }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: '#C0DD97' }}>TreeLot</span>

        <span
          style={{
            fontSize: 12,
            color: '#639922',
            background: '#27500A',
            padding: '3px 12px',
            borderRadius: 20,
          }}
        >
          Main St Lot — Dallas, TX
        </span>

        <div className="flex items-center gap-3">
          {displayName && (
            <span style={{ fontSize: 12, color: '#9FE1CB' }}>{displayName}</span>
          )}
          <span style={{ fontSize: 12, color: '#5F5E5A' }}>
            <CurrentTime />
          </span>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav
          className="flex flex-col flex-shrink-0 p-[10px_8px] gap-[2px]"
          style={{ width: 160, background: '#243322' }}
        >
          <SidebarNav />
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-hidden bg-off-white">
          {children}
        </main>
      </div>
    </div>
  );
}

function CurrentTime() {
  const now = new Date();
  return (
    <>{now.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })}</>
  );
}
