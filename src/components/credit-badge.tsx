'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Coins } from 'lucide-react';
import type { CreditBalance } from '@/services/credits/credit-service';

/**
 * Displays the user's credit balance in the sidebar.
 * Fetches from /api/credits/balance on mount and after visibility change.
 */
export function CreditBadge() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchBalance() {
      try {
        const res = await fetch('/api/credits/balance');
        const data = await res.json() as { success: boolean; data?: CreditBalance };
        if (mounted && data.success && data.data) {
          setBalance(data.data);
        }
      } catch {
        // Silently fail — badge just won't show
      }
    }

    fetchBalance();

    // Refresh on tab focus (user may have purchased credits in another tab)
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        fetchBalance();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  if (!balance) return null;

  const isLow = balance.total <= 10;

  return (
    <Link
      href="/settings"
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
        isLow ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
      }`}
    >
      <Coins className="h-4 w-4" />
      <span className="font-medium">{balance.total}</span>
      <span className="text-xs">crediti</span>
    </Link>
  );
}
