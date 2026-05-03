import { prisma } from '@/lib/db';
import { OrgTable } from '../OrgTable';

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

export default async function AdminOrgsPage() {
  const orgs = await getOrgs();

  return (
    <>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-[18px] font-semibold text-[#e8e6e0]">Onboarded Lots</h1>
        <span className="text-[12px] text-[#6b6960]">
          {orgs.length} organization{orgs.length !== 1 ? 's' : ''}
        </span>
      </div>
      <OrgTable orgs={orgs} />
    </>
  );
}
