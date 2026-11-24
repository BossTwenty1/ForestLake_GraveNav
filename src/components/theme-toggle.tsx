"use client";

import { useLayoutEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const STORAGE_KEY = "gravenav-theme";

function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function resolveTheme(): Theme {
  return storedTheme() ?? "light";
}

function applyTheme(theme: Theme, persist: boolean) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The selected theme still applies for this page when storage is unavailable.
    }
  }
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useLayoutEffect(() => {
    const syncTheme = () => {
      const current = resolveTheme();
      applyTheme(current, false);
      setTheme(current);
    };
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next: Theme = event.newValue === "dark" ? "dark" : "light";
      applyTheme(next, false);
      setTheme(next);
    };

    syncTheme();
    window.addEventListener("storage", syncStoredTheme);
    return () => {
      window.removeEventListener("storage", syncStoredTheme);
    };
  }, []);

  function chooseTheme(next: Theme) {
    applyTheme(next, true);
    setTheme(next);
  }

  if (compact) {
    const activeTheme: Theme = theme ?? "light";
    const isDark = activeTheme === "dark";
    const nextTheme: Theme = isDark ? "light" : "dark";
    return (
      <button
        aria-checked={isDark}
        aria-label={`Switch to ${nextTheme} mode`}
        className={cn(
          "theme-toggle-button",
          isDark ? "theme-toggle-button--dark" : "theme-toggle-button--light",
        )}
        onClick={() => chooseTheme(nextTheme)}
        role="switch"
        title={`Switch to ${nextTheme} mode`}
        type="button"
      >
        <span aria-hidden="true" className="theme-toggle-button__label">
          {isDark ? "DARK" : "LIGHT"}
        </span>
        <span aria-hidden="true" className="theme-toggle-button__thumb">
          <svg
            className="theme-toggle-button__icon theme-toggle-button__icon--moon"
            fill="currentColor"
            height="21"
            viewBox="0 0 24 24"
            width="21"
          >
            <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8a8.5 8.5 0 1 0 11.3 11.3Z" />
          </svg>
          <svg
            className="theme-toggle-button__icon theme-toggle-button__icon--sun"
            fill="none"
            height="22"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.1"
            viewBox="0 0 24 24"
            width="22"
          >
            <circle cx="12" cy="12" fill="currentColor" r="4.2" stroke="none" />
            <path d="M12 2.4v2.1M12 19.5v2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2.4 12h2.1M19.5 12h2.1M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <div aria-label="Color theme" className={cn("theme-toggle")} role="group">
      <button aria-label="Use light mode" aria-pressed={theme === "light"} className="theme-toggle__option" onClick={() => chooseTheme("light")} type="button">
        <Icon name="sun" size={16} />
        <span>Light</span>
      </button>
      <button aria-label="Use dark mode" aria-pressed={theme === "dark"} className="theme-toggle__option" onClick={() => chooseTheme("dark")} type="button">
        <Icon name="moon" size={16} />
        <span>Dark</span>
      </button>
    </div>
  );
}
