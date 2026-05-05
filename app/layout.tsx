import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { TRPCProvider } from '@/lib/trpc/provider';
import { PostHogProvider } from './PostHogProvider';
import { AppToaster } from './AppToaster';
import { themeBootScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'TreeLot',
  description: 'POS and operations platform for Christmas tree lot operators',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1c2b1a' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1410' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        </head>
        <body className="h-full">
          <PostHogProvider>
            <TRPCProvider>{children}</TRPCProvider>
          </PostHogProvider>
          <AppToaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
