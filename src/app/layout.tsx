import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
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

export const metadata: Metadata = {
  title: 'MedLav - Cronistoria Medico-Legale',
  description: 'Piattaforma per medici legali: caricamento documentazione clinica e generazione automatica di report medico-legali strutturati.',
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
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster position="bottom-right" richColors closeButton />
        <CookieConsent />
      </body>
    </html>
  );
}
