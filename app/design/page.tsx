'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const SECTIONS = [
  { id: 'tokens',     label: 'Tokens' },
  { id: 'buttons',    label: 'Buttons' },
  { id: 'inputs',     label: 'Inputs' },
  { id: 'cards',      label: 'Cards' },
  { id: 'badges',     label: 'Badges' },
  { id: 'sample',     label: 'Sample screen' },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[11px] uppercase tracking-[0.08em] font-semibold text-fg-muted mb-3 scroll-mt-20">
      {children}
    </h2>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

const SURFACE_TOKENS = [
  { name: 'bg-app',      cls: 'bg-bg-app' },
  { name: 'bg-surface',  cls: 'bg-bg-surface' },
  { name: 'bg-elevated', cls: 'bg-bg-elevated' },
  { name: 'bg-inset',    cls: 'bg-bg-inset' },
];
const TEXT_TOKENS = [
  { name: 'fg-default', cls: 'text-fg-default' },
  { name: 'fg-muted',   cls: 'text-fg-muted' },
  { name: 'fg-subtle',  cls: 'text-fg-subtle' },
];
const BRAND_TOKENS = [
  { name: 'brand',         cls: 'bg-brand text-brand-fg' },
  { name: 'brand-soft',    cls: 'bg-brand-soft text-brand-softfg' },
];
const STATUS_TOKENS = [
  { name: 'success',  cls: 'bg-success-bg text-success-fg' },
  { name: 'info',     cls: 'bg-info-bg text-info-fg' },
  { name: 'warn',     cls: 'bg-warn-bg text-warn-fg' },
  { name: 'error',    cls: 'bg-error-bg text-error-fg' },
];

export default function DesignShowcasePage() {
  const [query, setQuery] = useState('');

  return (
    <div className="min-h-screen bg-bg-app text-fg-default">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border-default bg-bg-app/85 backdrop-blur-md">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-[15px] font-semibold tracking-tight">TreeLot Design</span>
            <span className="text-[12px] text-fg-muted">v0 · preview</span>
          </div>
          <div className="flex items-center gap-3">
            <nav className="hidden md:flex items-center gap-1 text-[12px]">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="px-2.5 py-1.5 rounded-[var(--radius-sm)] text-fg-muted hover:text-fg-default hover:bg-bg-elevated transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-14">

        {/* Intro */}
        <section>
          <h1 className="text-[28px] font-semibold tracking-tight leading-[1.1]">
            One system. Two skins. Built for the lot.
          </h1>
          <p className="mt-3 text-[14px] text-fg-muted max-w-[640px] leading-relaxed">
            All UI on this page draws from the same semantic tokens. Toggle the theme in the top right —
            every surface, border, and brand colour swaps in place. Nothing here is hardcoded.
          </p>
        </section>

        {/* Tokens */}
        <section>
          <H2 id="tokens">Tokens</H2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SURFACE_TOKENS.map((t) => (
              <Card key={t.name} variant="outline" padding="none">
                <div className={`${t.cls} h-16 rounded-t-[var(--radius-lg)] border-b border-border-subtle`} />
                <div className="px-3 py-2">
                  <div className="text-[12px] font-medium">{t.name}</div>
                  <div className="text-[10.5px] text-fg-muted font-mono">--{t.name.replace('bg-', 'bg-')}</div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card padding="md">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted mb-2">Text</div>
              <div className="space-y-1.5 text-[13px]">
                {TEXT_TOKENS.map((t) => (
                  <div key={t.name} className="flex items-center justify-between">
                    <span className={t.cls}>The quick brown fox</span>
                    <span className="text-[10.5px] text-fg-muted font-mono">{t.name}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="md">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted mb-2">Brand</div>
              <div className="space-y-1.5">
                {BRAND_TOKENS.map((t) => (
                  <div key={t.name} className={`${t.cls} px-2.5 py-1.5 rounded-[var(--radius-sm)] flex items-center justify-between text-[12px] font-medium`}>
                    <span>{t.name}</span>
                    <span className="opacity-70 font-mono text-[10.5px]">tokenised</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="md">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted mb-2">Status</div>
              <div className="grid grid-cols-2 gap-1.5">
                {STATUS_TOKENS.map((t) => (
                  <div key={t.name} className={`${t.cls} px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[12px] font-medium text-center`}>
                    {t.name}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* Buttons */}
        <section>
          <H2 id="buttons">Buttons</H2>
          <Card padding="lg" className="space-y-5">
            <div>
              <div className="text-[11px] text-fg-muted mb-2">Variants</div>
              <Row>
                <Button variant="primary">Complete sale</Button>
                <Button variant="secondary">Save draft</Button>
                <Button variant="soft">Add customer</Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger">Void</Button>
              </Row>
            </div>
            <div>
              <div className="text-[11px] text-fg-muted mb-2">Sizes</div>
              <Row>
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </Row>
            </div>
            <div>
              <div className="text-[11px] text-fg-muted mb-2">States</div>
              <Row>
                <Button>Default</Button>
                <Button loading>Saving</Button>
                <Button disabled>Disabled</Button>
                <Button leading={<span>+</span>}>With icon</Button>
              </Row>
            </div>
          </Card>
        </section>

        {/* Inputs */}
        <section>
          <H2 id="inputs">Inputs</H2>
          <Card padding="lg" className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-fg-muted mb-1.5 block">Default</label>
                <Input placeholder="Customer name" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-fg-muted mb-1.5 block">With leading icon</label>
                <Input
                  placeholder="Search customers…"
                  leading={
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  }
                />
              </div>
              <div>
                <label className="text-[11px] text-fg-muted mb-1.5 block">Invalid</label>
                <Input placeholder="bad@input" invalid defaultValue="not-an-email" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-fg-muted mb-1.5 block">Select (default)</label>
                <Select defaultValue="anytime">
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="anytime">Anytime</option>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-fg-muted mb-1.5 block">Select (small)</label>
                <Select selectSize="sm">
                  <option>Today</option>
                  <option>This week</option>
                  <option>This season</option>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-fg-muted mb-1.5 block">Select (large)</label>
                <Select selectSize="lg">
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Venmo</option>
                  <option>Zelle</option>
                </Select>
              </div>
            </div>
          </Card>
        </section>

        {/* Cards */}
        <section>
          <H2 id="cards">Cards</H2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card variant="surface" padding="md">
              <div className="text-[12px] font-semibold mb-1">Surface</div>
              <div className="text-[11.5px] text-fg-muted leading-relaxed">Default container. Subtle border + tiny shadow.</div>
            </Card>
            <Card variant="elevated" padding="md">
              <div className="text-[12px] font-semibold mb-1">Elevated</div>
              <div className="text-[11.5px] text-fg-muted leading-relaxed">Slightly more lift — popovers, modals, hero cards.</div>
            </Card>
            <Card variant="inset" padding="md">
              <div className="text-[12px] font-semibold mb-1">Inset</div>
              <div className="text-[11.5px] text-fg-muted leading-relaxed">Recessed surface — search bar background, attached panels.</div>
            </Card>
            <Card variant="outline" padding="md">
              <div className="text-[12px] font-semibold mb-1">Outline</div>
              <div className="text-[11.5px] text-fg-muted leading-relaxed">No fill — for ghost regions and skeletons.</div>
            </Card>
          </div>
          <div className="mt-3">
            <Card padding="md" selected className="cursor-pointer">
              <div className="text-[12px] font-semibold mb-1">Selected card</div>
              <div className="text-[11.5px] text-fg-muted">Soft brand background + 2px brand left-border. Replaces the solid green block.</div>
            </Card>
          </div>
        </section>

        {/* Badges */}
        <section>
          <H2 id="badges">Badges</H2>
          <Card padding="lg">
            <Row>
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="brand">Brand</Badge>
              <Badge variant="success" dot>Scheduled</Badge>
              <Badge variant="info" dot>Out for delivery</Badge>
              <Badge variant="warn" dot>Pending</Badge>
              <Badge variant="error" dot>Failed</Badge>
            </Row>
          </Card>
        </section>

        {/* Sample screen */}
        <section>
          <H2 id="sample">Sample screen — delivery card</H2>
          <p className="text-[12.5px] text-fg-muted mb-3 max-w-[640px]">
            How the deliveries page list-row reads with the new system. Compare against the current dark-mode build.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card padding="md" className="cursor-pointer hover:border-border-strong transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[13px] font-semibold">Sarah Henderson</span>
                <Badge variant="success" size="sm" dot>Scheduled</Badge>
              </div>
              <div className="text-[11.5px] text-fg-muted">4218 Cole Ave, Dallas</div>
              <div className="text-[11px] mt-1 text-brand-softfg">Fraser Fir · 6–8ft · stand · lights</div>
              <div className="text-[11px] mt-1 text-fg-muted">→ Marcus D.</div>
            </Card>
            <Card padding="md" selected className="cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[13px] font-semibold">James Okafor</span>
                <Badge variant="info" size="sm" dot>Out</Badge>
              </div>
              <div className="text-[11.5px] text-fg-muted">8800 Park Ln, Dallas</div>
              <div className="text-[11px] mt-1 text-brand-softfg">Noble Fir · 9–10ft · install</div>
              <div className="text-[11px] mt-1 text-fg-muted">→ Marcus D.</div>
            </Card>
            <Card padding="md" className="cursor-pointer hover:border-border-strong transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[13px] font-semibold">Linda Pham</span>
                <Badge variant="error" size="sm" dot>Failed</Badge>
              </div>
              <div className="text-[11.5px] text-fg-muted">1120 Beverly Dr, Dallas</div>
              <div className="text-[11px] mt-1 text-brand-softfg">Fraser Fir · 6–8ft · lights</div>
              <div className="text-[11px] mt-1 text-fg-muted">Customer not home</div>
            </Card>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-[12.5px] text-fg-muted max-w-[480px]">
              When this looks right, I&rsquo;ll migrate POS and Deliveries to use these primitives — same visual system,
              dark-mode parity, focus rings everywhere, no more inline hex.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost">Adjust</Button>
              <Button variant="primary">Looks good — ship it</Button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
