import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import { CookieConsent } from '@/components/cookie-consent';
import { ErrorBoundary } from '@/components/error-boundary';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://medlav.it';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'MedLav - Cronistoria Medico-Legale',
    template: '%s | MedLav',
  },
  description: 'Piattaforma per medici legali: caricamento documentazione clinica e generazione automatica di report medico-legali strutturati.',
  openGraph: {
    type: 'website',
    locale: 'it_IT',
    siteName: 'MedLav',
    title: 'MedLav - Cronistoria Medico-Legale',
    description: 'Trasforma la documentazione clinica in cronistorie strutturate per perizie medico-legali. Conforme GDPR Art. 9.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MedLav - Cronistoria Medico-Legale',
    description: 'Trasforma la documentazione clinica in cronistorie strutturate per perizie medico-legali.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground">Vai al contenuto principale</a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster position="bottom-right" richColors closeButton />
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
