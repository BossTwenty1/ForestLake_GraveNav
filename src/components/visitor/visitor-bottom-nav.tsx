"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icons";
import type { IconName } from "@/components/ui/icons";

const destinations: Array<{ id: string; label: string; icon: IconName; href: string }> = [
  { id: "home", label: "Home", icon: "home", href: "/" },
  { id: "search", label: "Search", icon: "search", href: "/search" },
  { id: "map", label: "Map", icon: "map", href: "/map" },
];

function activeDestination(pathname: string) {
  if (pathname === "/") return "home";
  if (["/search", "/results", "/record-not-found", "/gravesite"].some((path) => pathname === path || pathname.startsWith(`${path}/`))) return "search";
  if (["/map", "/navigation", "/phase2-map"].some((path) => pathname === path || pathname.startsWith(`${path}/`))) return "map";
  return null;
}

export function VisitorBottomNav({ searchInputId }: { searchInputId?: string }) {
  return <VisitorNavigation variant="mobile" searchInputId={searchInputId} />;
}

export function VisitorDesktopNav({ searchInputId }: { searchInputId?: string }) {
  return <VisitorNavigation variant="desktop" searchInputId={searchInputId} />;
}

function VisitorNavigation({ variant, searchInputId }: { variant: "mobile" | "desktop"; searchInputId?: string }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const active = activeDestination(pathname);
  const navClass = variant === "desktop" ? "visitor-desktop-nav" : "visitor-bottom-nav";

  return (
    <nav aria-label={variant === "desktop" ? "Primary visitor navigation" : "Visitor navigation"} className={navClass}>
      <div className={`${navClass}__inner`}>
        {destinations.map((destination) => {
          const isActive = destination.id === active;
          return <Link aria-current={isActive ? "page" : undefined} className={cn("visitor-nav-link", isActive && "visitor-nav-link--active")} href={destination.href} key={destination.id}
            onNavigate={destination.id === "search" && searchInputId ? event => {
              const field = document.getElementById(searchInputId);
              const query = field instanceof HTMLInputElement ? field.value.slice(0, 160).trim() : "";
              if (query) {
                event.preventDefault();
                router.push("/search?" + new URLSearchParams({ query }));
              }
            } : undefined}><Icon name={destination.icon} size={19} /><span>{destination.label}</span></Link>;
        })}
      </div>
    </nav>
  );
}
