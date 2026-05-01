import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'TreeLot Driver',
  manifest: '/driver-manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#27500A',
};

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{ background: '#1a1a18', color: '#E8E6E0' }}
    >
      <div style={{ maxWidth: 430, margin: '0 auto' }}>{children}</div>
    </div>
  );
}
