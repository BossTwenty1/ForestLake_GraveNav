"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "@/components/ui/icons";

export function AdminEditMenu({
  viewHref,
  viewLabel = "View",
  actionLabel,
  href,
  label,
  disabled = false,
  deleteLabel,
  onDelete,
}: {
  viewHref?: string;
  viewLabel?: string;
  actionLabel: string;
  href: string;
  label: string;
  disabled?: boolean;
  deleteLabel?: string;
  onDelete?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function toggle() {
    setOpen((current) => {
      if (!current && trigger.current) {
        const rect = trigger.current.getBoundingClientRect();
        setPosition({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.right - 190, window.innerWidth - 202)) });
      }
      return !current;
    });
  }

  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1;
    items[next]?.focus();
  }

  const menu = open ? <div className="admin-record-menu__popover admin-record-menu__popover--portal" id={id} onKeyDown={navigateMenu} ref={panel} role="menu" style={position}>
    {viewHref ? <Link href={viewHref} onClick={() => setOpen(false)} role="menuitem"><Icon name="eye" size={16} />{viewLabel}</Link> : null}
    <Link href={href} onClick={() => setOpen(false)} role="menuitem"><Icon name="edit" size={16} />{actionLabel}</Link>
    {deleteLabel && onDelete ? <><span className="admin-record-menu__separator" /><button className="admin-record-menu__danger" disabled={disabled} onClick={() => { setOpen(false); trigger.current?.focus(); onDelete(); }} role="menuitem" type="button"><Icon name="trash" size={16} />{deleteLabel}</button></> : null}
  </div> : null;

  return <div className="admin-record-actions"><div className="admin-record-menu">
    <button aria-controls={id} aria-expanded={open} aria-haspopup="menu" aria-label={label} disabled={disabled} onClick={toggle} ref={trigger} type="button"><Icon name="more" size={18} /></button>
    {menu ? createPortal(menu, document.body) : null}
  </div></div>;
}
