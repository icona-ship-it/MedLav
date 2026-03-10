import { Suspense } from 'react';
import { Sidebar } from '@/components/sidebar';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin';
import { OnboardingDialog } from '@/components/onboarding-dialog';

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
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-6">
          {children}
        </div>
      </main>
      <OnboardingDialog />
    </div>
  );
}
