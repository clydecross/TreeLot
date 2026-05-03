'use client';

import { useState, useTransition } from 'react';
import { updateOrg, deleteOrg } from './orgActions';

type Org = {
  id:            string;
  name:          string;
  plan:          string;
  createdAt:     Date;
  locationCount: number;
  userCount:     number;
  customerCount: number;
  purchaseCount: number;
};

const PLANS = ['starter', 'pro', 'enterprise'] as const;

const planColors: Record<string, string> = {
  starter:    'bg-[#2a2a26] text-[#a89f8c]',
  pro:        'bg-[#1a2e1a] text-[#6db86d]',
  enterprise: 'bg-[#1a1a2e] text-[#6d8db8]',
};

export function OrgTable({ orgs }: { orgs: Org[] }) {
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editName,  setEditName]  = useState('');
  const [editPlan,  setEditPlan]  = useState('');
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(org: Org) {
    setDeleteId(null);
    setEditId(org.id);
    setEditName(org.name);
    setEditPlan(org.plan);
  }

  function cancelEdit() { setEditId(null); }

  function startDelete(org: Org) {
    setEditId(null);
    setDeleteId(org.id);
  }

  function cancelDelete() { setDeleteId(null); }

  function handleSave(orgId: string) {
    if (!editName.trim()) return;
    startTransition(async () => {
      await updateOrg(orgId, { name: editName, plan: editPlan });
      setEditId(null);
    });
  }

  function handleDelete(orgId: string) {
    startTransition(async () => {
      await deleteOrg(orgId);
      setDeleteId(null);
    });
  }

  if (orgs.length === 0) {
    return <p className="text-[13px] text-[#6b6960]">No organizations yet.</p>;
  }

  return (
    <div className="rounded-lg border border-[#2e2e2a] overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[#2e2e2a] bg-[#1a1a17]">
            {['Name', 'Plan', 'Locations', 'Users', 'Customers', 'Purchases', 'Created', ''].map(h => (
              <th
                key={h}
                className={`px-4 py-2.5 text-[11px] uppercase tracking-wide text-[#6b6960] font-normal ${h === '' || h === 'Locations' || h === 'Users' || h === 'Customers' || h === 'Purchases' || h === 'Created' ? 'text-right' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orgs.map((org, i) => {
            const rowBg = i % 2 === 0 ? 'bg-[#141412]' : 'bg-[#111110]';

            // ── Delete confirmation row ──────────────────────────────────────
            if (deleteId === org.id) {
              return (
                <tr key={org.id} className="border-b border-[#2e2e2a] last:border-0 bg-[#2a1212]">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-[13px] text-[#e05c5c]">
                        Delete <strong className="text-[#e8e6e0]">{org.name}</strong>?
                        {' '}This permanently removes {org.customerCount} customer{org.customerCount !== 1 ? 's' : ''} and {org.purchaseCount} purchase{org.purchaseCount !== 1 ? 's' : ''}.
                      </span>
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={cancelDelete}
                          disabled={isPending}
                          className="px-3 py-1 text-[12px] font-mono text-[#a89f8c] border border-[#3e3e3a] rounded hover:border-[#6b6960] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(org.id)}
                          disabled={isPending}
                          className="px-3 py-1 text-[12px] font-mono text-white bg-[#8b2020] hover:bg-[#a02525] rounded transition-colors disabled:opacity-50"
                        >
                          {isPending ? 'Deleting…' : 'Delete forever'}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            }

            // ── Edit row ─────────────────────────────────────────────────────
            if (editId === org.id) {
              return (
                <tr key={org.id} className={`border-b border-[#2e2e2a] last:border-0 ${rowBg}`}>
                  {/* Name input */}
                  <td className="px-4 py-2.5" colSpan={2}>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(org.id); if (e.key === 'Escape') cancelEdit(); }}
                        className="bg-[#0f0f0d] border border-[#3e3e3a] rounded px-2 py-1 text-[13px] text-[#e8e6e0] font-medium focus:outline-none focus:border-[#7CB542] w-[200px]"
                      />
                      <select
                        value={editPlan}
                        onChange={e => setEditPlan(e.target.value)}
                        className="bg-[#0f0f0d] border border-[#3e3e3a] rounded px-2 py-1 text-[12px] text-[#a89f8c] font-mono focus:outline-none focus:border-[#7CB542]"
                      >
                        {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </td>
                  {/* Stats — dimmed */}
                  <td className="px-4 py-2.5 text-right text-[13px] text-[#4a4940] tabular-nums">{org.locationCount}</td>
                  <td className="px-4 py-2.5 text-right text-[13px] text-[#4a4940] tabular-nums">{org.userCount}</td>
                  <td className="px-4 py-2.5 text-right text-[13px] text-[#4a4940] tabular-nums">{org.customerCount}</td>
                  <td className="px-4 py-2.5 text-right text-[13px] text-[#4a4940] tabular-nums">{org.purchaseCount}</td>
                  <td className="px-4 py-2.5 text-right text-[12px] text-[#4a4940]">
                    {org.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  {/* Save / Cancel */}
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSave(org.id)}
                        disabled={isPending || !editName.trim()}
                        className="text-[#7CB542] hover:text-[#9ad456] transition-colors disabled:opacity-40 text-[18px] leading-none"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isPending}
                        className="text-[#6b6960] hover:text-[#a89f8c] transition-colors text-[16px] leading-none"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }

            // ── Normal row ───────────────────────────────────────────────────
            return (
              <tr key={org.id} className={`border-b border-[#2e2e2a] last:border-0 ${rowBg} group`}>
                {/* Name + edit toggle */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-[13px] font-medium text-[#e8e6e0]">{org.name}</div>
                      <div className="text-[11px] font-mono text-[#4a4940] mt-0.5">{org.id}</div>
                    </div>
                    <button
                      onClick={() => startEdit(org)}
                      title="Edit"
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-[#6b6960] hover:text-[#a89f8c] text-[13px] flex-shrink-0"
                    >
                      ✎
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono ${planColors[org.plan] ?? planColors.starter}`}>
                    {org.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-[13px] tabular-nums text-[#e8e6e0]">{org.locationCount}</div>
                  <div className="text-[10px] text-[#6b6960] uppercase tracking-wide">lots</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-[13px] tabular-nums text-[#e8e6e0]">{org.userCount}</div>
                  <div className="text-[10px] text-[#6b6960] uppercase tracking-wide">staff</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-[13px] tabular-nums text-[#e8e6e0]">{org.customerCount}</div>
                  <div className="text-[10px] text-[#6b6960] uppercase tracking-wide">customers</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-[13px] tabular-nums text-[#e8e6e0]">{org.purchaseCount}</div>
                  <div className="text-[10px] text-[#6b6960] uppercase tracking-wide">sales</div>
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-[#6b6960] tabular-nums whitespace-nowrap">
                  {org.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                {/* Delete toggle */}
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => startDelete(org)}
                    title="Delete organization"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#4a4940] hover:text-[#e05c5c] text-[14px]"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
