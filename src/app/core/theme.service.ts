import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

/**
 * Light / dark mode. The OS preference is the default; the user can pin a
 * theme, which is remembered in localStorage and applied via `data-theme`
 * on <html> (see the inline script in index.html for the pre-paint apply).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(readStoredPreference());
  readonly resolved = signal<ResolvedTheme>(this.resolve(this.preference()));

  constructor() {
    this.apply(this.preference());

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = (): void => {
        if (this.preference() === 'system') {
          this.resolved.set(this.resolve('system'));
        }
      };
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onChange);
      }
    }
  }

  /** Switches between light and dark, pinning the choice. */
  toggle(): void {
    this.setPreference(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.apply(preference);
    try {
      if (typeof localStorage !== 'undefined') {
        if (preference === 'system') {
          localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
          localStorage.setItem(THEME_STORAGE_KEY, preference);
        }
      }
    } catch {
      // Storage unavailable; the theme still applies for this page view.
    }
  }

  private resolve(preference: ThemePreference): ResolvedTheme {
    if (preference === 'system') {
      return systemPrefersDark() ? 'dark' : 'light';
    }
    return preference;
  }

  private apply(preference: ThemePreference): void {
    this.resolved.set(this.resolve(preference));
    if (typeof document === 'undefined') {
      return;
    }
    if (preference === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', preference);
    }
  }
}
