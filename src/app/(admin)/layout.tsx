import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Activity,
  ScrollText,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin';
import { cn } from '@/lib/utils';

const adminNavigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Pipeline', href: '/admin/processing', icon: Activity },
  { name: 'Audit Log', href: '/admin/audit', icon: ScrollText },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user.email)) {
    redirect('/');
  }

  return (
    <div className="flex h-screen">
      <aside className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        {/* Header */}
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <ShieldCheck className="h-6 w-6 text-orange-500" />
          <span className="text-lg font-bold">Admin</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {adminNavigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Footer — back to app */}
        <div className="border-t p-3">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna all&apos;app
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
