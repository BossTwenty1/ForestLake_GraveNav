import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StaffAccount } from "@/lib/supabase/types";

type AdminNavItem = {
  label: string;
  icon: IconName;
  href: string;
  adminOnly?: boolean;
  managerHidden?: boolean;
};

const mainNavItems: AdminNavItem[] = [
  { label: "Dashboard", icon: "dashboard", href: "/admin" },
  { label: "Deceased & Interments", icon: "records", href: "/admin/burial-records" },
  { label: "Cemetery Map", icon: "map", href: "/admin/cemetery-map" },
  {
    label: "Coordinate Verification",
    icon: "verification",
    href: "/admin/coordinate-verification",
    managerHidden: true,
  },
  { label: "Plot Management", icon: "grid", href: "/admin/plot-management" },
  { label: "Plot Owners", icon: "userSearch", href: "/admin/owner-data" },
  { label: "Photos", icon: "photos", href: "/admin/photos" },
];

const systemNavItems: AdminNavItem[] = [
  { label: "Reports", icon: "reports", href: "/admin/reports" },
  { label: "Audit Log", icon: "audit", href: "/admin/audit-log" },
  { label: "Recovery", icon: "audit", href: "/admin/recovery", adminOnly: true },
  {
    label: "Account Management",
    icon: "users",
    href: "/admin/accounts",
    adminOnly: true,
  },
  {
    label: "Settings",
    icon: "settings",
    href: "/admin/settings",
    managerHidden: true,
  },
];

export const adminNavItems = [...mainNavItems, ...systemNavItems];

type AdminSidebarProps = {
  active: string;
  collapsed: boolean;
  preview: boolean;
  staff: StaffAccount;
  onNavigate?: () => void;
  onClose?: () => void;
};

export function AdminSidebar({
  active,
  collapsed,
  preview,
  staff,
  onNavigate,
  onClose,
}: AdminSidebarProps) {
  function isVisible(item: AdminNavItem) {
    if (item.adminOnly) return staff.role === "ADMIN";
    if (item.managerHidden) return staff.role !== "MANAGER";
    return true;
  }

  function renderLinks(items: AdminNavItem[]) {
    return items.filter(isVisible).map((item) => {
      const isActive = item.label === active;
      return (
        <Tooltip
          disabled={!collapsed || preview}
          key={item.label}
          label={item.label}
        >
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn("admin-nav-link", isActive && "admin-nav-link--active")}
            href={item.href}
            onClick={onNavigate}
            title={collapsed && !preview ? item.label : undefined}
          >
            <Icon name={item.icon} size={18} />
            <span className="admin-nav-link__label">{item.label}</span>
            {isActive ? <span aria-hidden="true" className="admin-nav-current" /> : null}
          </Link>
        </Tooltip>
      );
    });
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__top">
        <div className="admin-sidebar__brand">
          <span className="admin-brand-mark"><Image alt="Forest Lake" height={40} sizes="40px" src="/forest-lake-logo.png" width={40} /></span>
          <span className="admin-brand-copy">
            <strong>GraveNav <span className="brand-admin-badge">Admin</span></strong>
            <span>Cemetery Management</span>
          </span>
        </div>
        {onClose ? (
          <button
            aria-label="Close administrator navigation"
            className="icon-button admin-sidebar__close"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={20} />
          </button>
        ) : null}
      </div>

      <div className="admin-sidebar__body">
        <div className="admin-nav-group">
          <p className="admin-nav-label">Main menu</p>
          <nav aria-label="Primary administrator navigation" className="admin-nav">
            {renderLinks(mainNavItems)}
          </nav>
        </div>
        <div className="admin-nav-group">
          <p className="admin-nav-label">Management &amp; system</p>
          <nav aria-label="Administrator management navigation" className="admin-nav">
            {renderLinks(systemNavItems)}
          </nav>
        </div>
      </div>

      <div className="admin-sidebar__footer">
        <nav aria-label="Administrator support navigation">
          <Tooltip
            disabled={!collapsed || preview}
            label="Support"
          >
            <Link
              aria-current={active === "Support" ? "page" : undefined}
              className={cn(
                "admin-nav-link",
                active === "Support" && "admin-nav-link--active",
              )}
              href="/admin/support"
              onClick={onNavigate}
              title={collapsed && !preview ? "Support" : undefined}
            >
              <Icon name="support" size={18} />
              <span className="admin-nav-link__label">Support</span>
            </Link>
          </Tooltip>
        </nav>
      </div>
    </aside>
  );
}
