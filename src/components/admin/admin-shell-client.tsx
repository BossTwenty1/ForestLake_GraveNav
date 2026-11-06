"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type {
  FocusEvent as ReactFocusEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { signOut } from "@/lib/auth-client";
import type { StaffAccount } from "@/lib/supabase/types";
import { localSupabaseConfig } from "@/lib/supabase/config";
import { AdminAccountMenu } from "./admin-account-menu";
import { AdminSidebar } from "./admin-sidebar";
import { StaffContext } from "./staff-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

type AdminShellClientProps = {
  children: ReactNode;
  active: string;
  staff: StaffAccount;
};

const SIDEBAR_STORAGE_KEY = "gravenav-admin-sidebar";
const SIDEBAR_COOKIE_KEY = "gravenav_admin_sidebar";
const SIDEBAR_PREFERENCE_EVENT = "gravenav:sidebar-preference";
const DESKTOP_SIDEBAR_MEDIA = "(min-width: 960px)";

function getSidebarPreference() {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "collapsed" || stored === "expanded") return stored === "collapsed";
  } catch {
    // Fall through to the cookie preference when storage is unavailable.
  }

  const cookiePreference = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${SIDEBAR_COOKIE_KEY}=`))
    ?.split("=")[1];
  return cookiePreference === "collapsed";
}

function subscribeToSidebarPreference(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === SIDEBAR_STORAGE_KEY) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_PREFERENCE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, onStoreChange);
  };
}

function persistSidebarPreference(collapsed: boolean) {
  const preference = collapsed ? "collapsed" : "expanded";
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, preference);
  } catch {
    // The cookie below preserves the preference when storage is unavailable.
  }
  document.cookie = `${SIDEBAR_COOKIE_KEY}=${preference}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_EVENT));
}

export function AdminShellClient({ children, active, staff }: AdminShellClientProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    getSidebarPreference,
    () => false,
  );
  const [sidebarPreview, setSidebarPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<number | null>(null);

  const toggleSidebarPreference = useCallback(() => {
    persistSidebarPreference(!sidebarCollapsed);
    setSidebarPreview(false);
  }, [sidebarCollapsed]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await signOut();
    router.push("/admin/login");
  }

  function closeDrawer() {
    setSidebarOpen(false);
    menuButtonRef.current?.focus();
  }

  function clearPreviewTimer() {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }

  function scheduleSidebarPreview() {
    if (!sidebarCollapsed || !window.matchMedia(DESKTOP_SIDEBAR_MEDIA).matches) return;
    clearPreviewTimer();
    previewTimerRef.current = window.setTimeout(() => setSidebarPreview(true), 240);
  }

  function closeSidebarPreview() {
    clearPreviewTimer();
    setSidebarPreview(false);
  }

  function handleSidebarBlur(event: ReactFocusEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    closeSidebarPreview();
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    router.push(`/admin/burial-records?query=${encodeURIComponent(query)}`);
    setSearch("");
  }

  function trapDrawerFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !sidebarOpen || window.innerWidth >= 960) return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "b") return;
      if (!window.matchMedia(DESKTOP_SIDEBAR_MEDIA).matches) return;
      event.preventDefault();
      toggleSidebarPreference();
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toggleSidebarPreference]);

  useEffect(() => () => clearPreviewTimer(), []);

  return (
    <div
      className="admin-shell"
      data-sidebar-preview={sidebarPreview || undefined}
      data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}
    >
      <a className="skip-link" href="#admin-main-content">Skip to main content</a>
      {sidebarOpen ? (
        <button
          aria-label="Close administrator navigation"
          className="admin-dimmer admin-dimmer--open"
          onClick={closeDrawer}
          type="button"
        />
      ) : null}
      <div
        aria-label="Administrator navigation drawer"
        aria-modal={sidebarOpen ? "true" : undefined}
        className={`admin-drawer ${sidebarOpen ? "admin-drawer--open" : ""} ${sidebarPreview ? "admin-drawer--preview" : ""}`}
        id="admin-navigation-drawer"
        onBlur={handleSidebarBlur}
        onFocus={() => {
          if (sidebarCollapsed && window.matchMedia(DESKTOP_SIDEBAR_MEDIA).matches) {
            setSidebarPreview(true);
          }
        }}
        onKeyDown={trapDrawerFocus}
        onMouseEnter={scheduleSidebarPreview}
        onMouseLeave={closeSidebarPreview}
        ref={drawerRef}
        role={sidebarOpen ? "dialog" : undefined}
      >
        <AdminSidebar
          active={active}
          collapsed={sidebarCollapsed}
          onClose={closeDrawer}
          onNavigate={() => setSidebarOpen(false)}
          preview={sidebarPreview}
          staff={staff}
        />
      </div>
      <div className="admin-main">
        <header className="admin-header">
          <Button
            aria-controls="admin-navigation-drawer"
            aria-expanded={sidebarOpen}
            aria-label="Open administrator navigation"
            className="admin-menu-button admin-menu-button--mobile"
            icon="menu"
            onClick={() => setSidebarOpen(true)}
            ref={menuButtonRef}
            size="sm"
            variant="quiet"
          >
            <span className="sr-only">Open menu</span>
          </Button>
          <Button
            aria-controls="admin-navigation-drawer"
            aria-keyshortcuts="Control+B Meta+B"
            aria-label={sidebarCollapsed ? "Expand administrator navigation" : "Collapse administrator navigation"}
            aria-pressed={sidebarCollapsed}
            className="admin-sidebar-toggle"
            icon="panelLeft"
            onClick={toggleSidebarPreference}
            size="sm"
            title={`${sidebarCollapsed ? "Expand" : "Collapse"} navigation (Ctrl+B)`}
            variant="quiet"
          >
            <span className="sr-only">
              {sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            </span>
          </Button>
          <form className="admin-search" onSubmit={submitSearch} role="search">
            <Input
              aria-label="Search burial records"
              icon="search"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              placeholder="Search burial records..."
              type="search"
              value={search}
            />
            <button className="sr-only" type="submit">Search burial records</button>
          </form>
          <div className="admin-header__actions">
            <Link className="admin-public-link" href="/">
              <Icon name="arrowUpRight" size={16} />
              <span>Open Public Site</span>
            </Link>
            <span className="admin-environment-badge">{localSupabaseConfig.environmentLabel}</span>
            <ThemeToggle compact />
            <AdminAccountMenu busy={loggingOut} onSignOut={() => void logout()} staff={staff} />
          </div>
        </header>
        <main className="admin-content" id="admin-main-content" tabIndex={-1}>
          <StaffContext.Provider value={staff}>{children}</StaffContext.Provider>
        </main>
      </div>
    </div>
  );
}
