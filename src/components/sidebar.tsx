'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/global-search';
import { CreditBadge } from '@/components/credit-badge';

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

const COLLAPSED_COOKIE = 'legmed-sidebar-collapsed';

export function Sidebar({ isAdmin = false, initialCollapsed = false }: { isAdmin?: boolean; initialCollapsed?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Collassabile (founder 2026-07-17: "il menù laterale non so quanto senso
  // abbia"): dentro un caso lo spazio serve al report. La persistenza è in un
  // COOKIE letto dal layout server: il primo render è già nello stato giusto —
  // niente mismatch di idratazione, niente effect (pattern del repo).
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      document.cookie = `${COLLAPSED_COOKIE}=${c ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  };

  const currentUrl = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  return (
    <aside
      role="navigation"
      className={cn(
        'hidden lg:flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo + toggle */}
      <div className={cn('flex h-16 items-center border-b', collapsed ? 'justify-center px-0' : 'gap-2 px-6')}>
        <Scale className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && <span className="text-lg font-bold">LegMed</span>}
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Comprimi il menu"
            aria-label="Comprimi il menu"
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* New Case Button */}
      <div className={cn('pt-4 pb-2', collapsed ? 'px-2' : 'px-3')}>
        <Button asChild className="w-full" size={collapsed ? 'icon' : 'default'} title="Nuovo Caso">
          <Link href="/cases/new" aria-label="Nuovo Caso">
            <Plus className={cn('h-4 w-4', !collapsed && 'mr-2')} />
            {!collapsed && 'Nuovo Caso'}
          </Link>
        </Button>
      </div>

      {/* Global Search — nascosta (non smontata) da compresso: il listener ⌘K resta attivo */}
      <div className={cn('px-3 pb-2', collapsed && 'hidden')}>
        <GlobalSearch />
      </div>

      {/* Navigation */}
      <nav aria-label="Menu principale" className={cn('flex-1 space-y-1 py-2', collapsed ? 'px-2' : 'px-3')}>
        {navigation.map((item) => {
          const isActive = currentUrl === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.name : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'px-3',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn('border-t', collapsed ? 'p-2' : 'p-3')}>
        {/* Credit balance — nascosto (non smontato) da compresso */}
        <div className={cn(collapsed && 'hidden')}>
          <CreditBadge />
        </div>

        <div className={cn('flex items-center justify-between px-3 py-1', collapsed && 'hidden')}>
          <span className="text-xs text-muted-foreground">Tema</span>
          <ThemeToggle />
        </div>
        {FOOTER_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <Link
            key={item.name}
            href={item.href}
            title={collapsed ? item.name : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md py-2 text-sm font-medium',
              collapsed ? 'justify-center px-0' : 'px-3',
              item.className || 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.name}
          </Link>
        ))}
        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? 'Esci' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && 'Esci'}
          </button>
        </form>
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Espandi il menu"
            aria-label="Espandi il menu"
            className="mt-1 flex w-full items-center justify-center rounded-md py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
