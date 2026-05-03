import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AdminNav } from './AdminNav';

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const user = await currentUser();

  const primaryEmail = user?.emailAddresses
    .find(e => e.id === user.primaryEmailAddressId)
    ?.emailAddress;

  if (!user || primaryEmail?.toLowerCase() !== adminEmail?.toLowerCase()) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-[#0f0f0d] text-[#e8e6e0]">
      <header className="border-b border-[#2e2e2a] px-8 py-4 flex items-center gap-3">
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#6b6960] select-none">
          treelot
        </span>
        <span className="text-[#2e2e2a]">/</span>
        <span className="text-[12px] font-mono text-[#a89f8c]">superadmin</span>
      </header>
      <AdminNav />
      <main className="px-8 py-8 max-w-[1200px] mx-auto">
        {children}
      </main>
    </div>
  );
}
