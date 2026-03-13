'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  HelpCircle,
  Plus,
  Settings,
  LogOut,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/global-search';

export const NAV_ITEMS = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'I Miei Casi', href: '/cases', icon: FolderOpen },
] as const;

export const FOOTER_ITEMS = [
  { name: 'Aiuto', href: '/help', icon: HelpCircle, adminOnly: false, className: '' },
  { name: 'Admin', href: '/admin', icon: ShieldCheck, adminOnly: true, className: 'text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/20' },
  { name: 'Impostazioni', href: '/settings', icon: Settings, adminOnly: false, className: '' },
] as const;

// Keep backward-compat local alias
const navigation = NAV_ITEMS;

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentUrl = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  return (
    <aside role="navigation" className="hidden lg:flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Scale className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">MedLav</span>
      </div>

      {/* New Case Button */}
      <div className="px-3 pt-4 pb-2">
        <Button asChild className="w-full">
          <Link href="/cases/new">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Caso
          </Link>
        </Button>
      </div>

      {/* Global Search */}
      <div className="px-3 pb-2">
        <GlobalSearch />
      </div>

      {/* Navigation */}
      <nav aria-label="Menu principale" className="flex-1 space-y-1 px-3 py-2">
        {navigation.map((item) => {
          const isActive = currentUrl === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
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
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-muted-foreground">Tema</span>
          <ThemeToggle />
        </div>
        <Link
          href="/help"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <HelpCircle className="h-4 w-4" />
          Aiuto
        </Link>
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
