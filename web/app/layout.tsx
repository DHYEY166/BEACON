import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BEACON — Emergency Field Guidance',
  description: 'AI-powered emergency guidance for community first responders. Powered by Gemma 4.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-white min-h-screen antialiased">{children}</body>
    </html>
  );
}
