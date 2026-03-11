import { Suspense } from 'react';
import { Sidebar } from '@/components/sidebar';
import { MobileSidebar } from '@/components/mobile-sidebar';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin';
import { OnboardingDialog } from '@/components/onboarding-dialog';
import { Scale } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = isAdminUser(user?.email);

  return (
    <div className="flex h-screen">
      <Suspense>
        <Sidebar isAdmin={isAdmin} />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center gap-2 border-b px-4 lg:hidden">
          <Suspense>
            <MobileSidebar isAdmin={isAdmin} />
          </Suspense>
          <Scale className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold">MedLav</span>
        </header>
        <main id="main-content" className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
      <OnboardingDialog />
    </div>
  );
}
