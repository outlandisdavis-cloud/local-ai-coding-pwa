import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Forge — Your local AI workspace',
  description: 'A little less friction. A little more flow. A local-first AI coding workspace with an editor, live preview, and llama.cpp-powered agents.',
  applicationName: 'Forge',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Forge' },
  icons: { icon: '/icon.svg', apple: '/icons/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1b2129' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
