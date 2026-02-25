'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderPlus,
  FolderOpen,
  Archive,
  Settings,
  LogOut,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { name: 'I Miei Casi', href: '/cases', icon: FolderOpen, exact: true },
  { name: 'Nuovo Caso', href: '/cases/new', icon: FolderPlus, exact: false },
  { name: 'Archivio', href: '/cases?status=archiviato', icon: Archive, exact: false },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Scale className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">MedLav</span>
      </div>

      {/* Navigation */}
      <nav aria-label="Menu principale" className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-3">
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/20"
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </Link>
        )}
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Settings className="h-4 w-4" />
          Impostazioni
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Esci
          </button>
        </form>
      </div>
    </aside>
  );
}
