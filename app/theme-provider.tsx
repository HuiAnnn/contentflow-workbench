'use client';

import {ThemeProvider as NextThemesProvider, useTheme} from 'next-themes';
import {useEffect, useState} from 'react';
import {Moon} from 'lucide-react';
import {Switch} from '@/components/ui/switch';

export function ThemeProvider({children}: {children: React.ReactNode}) {
  return <NextThemesProvider attribute="class" defaultTheme="system" enableSystem storageKey="contentflow-theme" disableTransitionOnChange>{children}</NextThemesProvider>;
}

export function ThemeToggle() {
  const {resolvedTheme, setTheme} = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <label className="theme-toggle" htmlFor="dark-mode-switch">
    <Moon size={16} aria-hidden="true"/>
    <span>深色模式</span>
    <Switch id="dark-mode-switch" aria-label="深色模式" disabled={!mounted} checked={mounted && resolvedTheme === 'dark'} onCheckedChange={dark => setTheme(dark ? 'dark' : 'light')}/>
  </label>;
}
