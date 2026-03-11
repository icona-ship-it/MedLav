'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { csrfHeaders } from '@/lib/csrf-client';

interface CheckoutButtonProps {
  priceId: string;
  planName: string;
  className?: string;
  variant?: 'default' | 'outline';
}

interface CheckoutResponse {
  success: boolean;
  data?: { url: string };
  error?: string;
}

export function CheckoutButton({
  priceId,
  planName,
  className,
  variant = 'default',
}: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleCheckout() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ priceId }),
      });

      const data = (await res.json()) as CheckoutResponse;

      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setIsLoading(false);
      }
    } catch {
      setIsLoading(false);
    }
  }

  return (
    <Button
      className={className}
      variant={variant}
      disabled={isLoading}
      onClick={handleCheckout}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Reindirizzamento...
        </>
      ) : (
        `Passa a ${planName}`
      )}
    </Button>
  );
}
