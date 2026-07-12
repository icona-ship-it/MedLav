'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function cycleTheme() {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  }

  // Il `title` dipende dal tema risolto, noto solo lato client → il valore del
  // server e quello del primo render client differiscono legittimamente.
  // suppressHydrationWarning silenzia il mismatch atteso su questo solo elemento
  // (niente console error, niente guard mounted che React 19 sconsiglia).
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label="Cambia tema"
      suppressHydrationWarning
      title={theme === 'light' ? 'Tema chiaro' : theme === 'dark' ? 'Tema scuro' : 'Tema sistema'}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <Monitor className="absolute h-4 w-4 scale-0" />
      <span className="sr-only">Cambia tema</span>
    </Button>
  );
}
