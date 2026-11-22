"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type TooltipProps = {
  children: ReactNode;
  label: string;
  disabled?: boolean;
};

type TooltipPosition = {
  left: number;
  top: number;
};

export function Tooltip({ children, label, disabled = false }: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  function clearOpenTimer() {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    setPosition({
      left: bounds.right + 10,
      top: bounds.top + bounds.height / 2,
    });
  }

  function show(delay = 120) {
    if (disabled) return;
    clearOpenTimer();
    openTimerRef.current = window.setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, delay);
  }

  function hide() {
    clearOpenTimer();
    setOpen(false);
  }

  useEffect(() => {
    if (!open || disabled) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [disabled, open]);

  useEffect(() => () => clearOpenTimer(), []);

  return (
    <>
      <span
        aria-describedby={open ? id : undefined}
        className="ui-tooltip-trigger"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) hide();
        }}
        onFocus={() => show(0)}
        onMouseEnter={() => show()}
        onMouseLeave={hide}
        ref={triggerRef}
      >
        {children}
      </span>
      {open && !disabled && position
        ? createPortal(
            <span
              className="ui-tooltip"
              id={id}
              role="tooltip"
              style={{ left: position.left, top: position.top }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
