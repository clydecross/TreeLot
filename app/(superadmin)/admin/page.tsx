import { prisma } from '@/lib/db';

async function getOrgs() {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id:        true,
      name:      true,
      plan:      true,
      createdAt: true,
      _count: {
        select: { locations: true, users: true, customers: true },
      },
      locations: {
        select: { _count: { select: { purchases: true } } },
      },
    },
  });

  return orgs.map(({ locations, _count, ...org }) => ({
    ...org,
    locationCount: _count.locations,
    userCount:     _count.users,
    customerCount: _count.customers,
    purchaseCount: locations.reduce((sum, l) => sum + l._count.purchases, 0),
  }));
}

function Badge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    starter:    'bg-[#2a2a26] text-[#a89f8c]',
    pro:        'bg-[#1a2e1a] text-[#6db86d]',
    enterprise: 'bg-[#1a1a2e] text-[#6d8db8]',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono ${colors[plan] ?? colors.starter}`}>
      {plan}
    </span>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <td className="px-4 py-3 text-right">
      <div className="text-[13px] tabular-nums text-[#e8e6e0]">{value.toLocaleString()}</div>
      <div className="text-[10px] text-[#6b6960] uppercase tracking-wide">{label}</div>
    </td>
  );
}

export default async function AdminOrgsPage() {
  const orgs = await getOrgs();

  return (
    <>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-[18px] font-semibold text-[#e8e6e0]">Onboarded Lots</h1>
        <span className="text-[12px] text-[#6b6960]">{orgs.length} organization{orgs.length !== 1 ? 's' : ''}</span>
      </div>

      {orgs.length === 0 ? (
        <p className="text-[13px] text-[#6b6960]">No organizations yet.</p>
      ) : (
        <div className="rounded-lg border border-[#2e2e2a] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2e2e2a] bg-[#1a1a17]">
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-[#6b6960] font-normal">Name</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-[#6b6960] font-normal">Plan</th>
                <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide text-[#6b6960] font-normal">Locations</th>
                <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide text-[#6b6960] font-normal">Users</th>
                <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide text-[#6b6960] font-normal">Customers</th>
                <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide text-[#6b6960] font-normal">Purchases</th>
                <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide text-[#6b6960] font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org, i) => (
                <tr
                  key={org.id}
                  className={`border-b border-[#2e2e2a] last:border-0 ${i % 2 === 0 ? 'bg-[#141412]' : 'bg-[#111110]'} hover:bg-[#1e1e1b] transition-colors`}
                >
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/view/${org.id}`}
                      className="block group"
                    >
                      <div className="text-[13px] font-medium text-[#e8e6e0] group-hover:text-amber-400 transition-colors">{org.name}</div>
                      <div className="text-[11px] font-mono text-[#4a4940] mt-0.5">{org.id}</div>
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <Badge plan={org.plan} />
                  </td>
                  <Stat value={org.locationCount} label="lots" />
                  <Stat value={org.userCount}     label="staff" />
                  <Stat value={org.customerCount} label="customers" />
                  <Stat value={org.purchaseCount} label="sales" />
                  <td className="px-4 py-3 text-right text-[12px] text-[#6b6960] tabular-nums whitespace-nowrap">
                    {org.createdAt.toLocaleDateString('en-US', {
                      month: 'short',
                      day:   'numeric',
                      year:  'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
