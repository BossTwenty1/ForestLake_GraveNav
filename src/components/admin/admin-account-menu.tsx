"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { StaffAccount } from "@/lib/supabase/types";
import { getBrowserSupabase } from "@/lib/supabase/config";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

type AdminAccountMenuProps = {
  busy: boolean;
  onSignOut: () => void;
  staff: StaffAccount;
};

export function AdminAccountMenu({ busy, onSignOut, staff }: AdminAccountMenuProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
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

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Password confirmation does not match.");
      return;
    }
    const client = getBrowserSupabase();
    if (!client) {
      setPasswordError("Authentication service is not configured.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message || "Password could not be updated.");
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Your password has been updated.");
    } finally {
      setSavingPassword(false);
    }
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
          <span>{staff.role === "SUPER_ADMIN" ? "Super Administrator" : staff.role === "ADMIN" ? "Administrator" : "Staff"}</span>
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
              <span>{staff.role === "SUPER_ADMIN" ? "Super Administrator" : staff.role === "ADMIN" ? "Administrator" : "Staff"}</span>
            </div>
          </div>
          <div className="admin-account-popover__separator" />
          <button
            className="admin-account-popover__action"
            onClick={() => {
              setOpen(false);
              setPasswordError("");
              setPasswordMessage("");
              setPasswordOpen(true);
            }}
            type="button"
          >
            <Icon name="shield" size={17} />
            <span>Change password</span>
          </button>
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

      {passwordOpen ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!savingPassword) setPasswordOpen(false); }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Change password" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialog-topline">
              <span className="dialog-icon"><Icon name="shield" size={22} /></span>
              <button aria-label="Close change password dialog" className="icon-button" onClick={() => setPasswordOpen(false)} type="button">
                <Icon name="x" size={20} />
              </button>
            </div>
            <h2>Change password</h2>
            <form className="admin-form" onSubmit={(e) => void updatePassword(e)}>
              <Input
                autoComplete="new-password"
                hint="Minimum 8 characters."
                label="New password"
                minLength={8}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                type="password"
                value={newPassword}
              />
              <Input
                autoComplete="new-password"
                label="Confirm new password"
                minLength={8}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
              {passwordError ? <Alert title="Could not update password" variant="danger">{passwordError}</Alert> : null}
              {passwordMessage ? <Alert title="Password updated" variant="success">{passwordMessage}</Alert> : null}
              <div className="dialog-actions">
                <Button disabled={savingPassword} onClick={() => setPasswordOpen(false)} type="button" variant="secondary">Close</Button>
                <Button disabled={savingPassword} type="submit">{savingPassword ? "Saving…" : "Update password"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
