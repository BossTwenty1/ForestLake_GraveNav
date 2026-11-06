"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StaffAccount } from "@/lib/supabase/types";
import { Icon } from "@/components/ui/icons";

type AdminAccountMenuProps = {
  busy: boolean;
  onSignOut: () => void;
  staff: StaffAccount;
};

export function AdminAccountMenu({ busy, onSignOut, staff }: AdminAccountMenuProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);
  const initials = staff.username
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "GN";

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      close();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="admin-account-menu">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account controls for ${staff.username}`}
        className="admin-account-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
          window.requestAnimationFrame(() => signOutRef.current?.focus());
        }}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="admin-avatar">{initials}</span>
        <span className="admin-account-trigger__copy">
          <strong>{staff.username}</strong>
          <span>{staff.role === "ADMIN" ? "Administrator" : "Manager"}</span>
        </span>
        <Icon className="admin-account-trigger__chevron" name="chevronDown" size={15} />
      </button>

      {open ? (
        <div className="admin-account-popover" id={panelId} ref={panelRef}>
          <div className="admin-account-popover__identity">
            <span aria-hidden="true" className="admin-avatar admin-account-popover__avatar">
              {initials}
            </span>
            <div>
              <strong>{staff.username}</strong>
              <span>{staff.role === "ADMIN" ? "Administrator" : "Manager"}</span>
            </div>
          </div>
          <div className="admin-account-popover__separator" />
          <button
            className="admin-account-popover__action"
            disabled={busy}
            onClick={onSignOut}
            ref={signOutRef}
            type="button"
          >
            <Icon name="logout" size={17} />
            <span>{busy ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
