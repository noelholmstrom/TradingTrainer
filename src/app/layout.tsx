import type { Metadata, Viewport } from 'next';
import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './trainer.css';
import './globals.css';
import SiteNav from '@/components/SiteNav';
import { supabaseConfigured } from '@/lib/supabase/config';
import { getUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: { default: 'TradingTrainer', template: '%s · TradingTrainer' },
  description: 'Practise trading Nasdaq-100 futures on replayed sessions, with coaching on every trade, short lessons and progress stats.',
  applicationName: 'TradingTrainer',
  appleWebApp: { capable: true, title: 'TradingTrainer', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0f16' },
    { media: '(prefers-color-scheme: light)', color: '#edf0f4' }
  ]
};

// Applies a saved theme choice before the first paint.
const themeScript = "(function(){try{var t=localStorage.getItem('tt.theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})()";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteNav user={user} accounts={supabaseConfigured} />
        {children}
      </body>
    </html>
  );
}
