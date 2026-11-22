"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icons";
import styles from "./memorial.module.css";

const storageEvent = "gravenav:memorial-saved";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(storageEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(storageEvent, onChange);
  };
}

export function MemorialActions({ id, name }: { id: string; name: string }) {
  const key = `gravenav:saved-memorial:${id}`;
  const saved = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) === "1"; } catch { return false; }
  }, () => false);
  const [status, setStatus] = useState("");
  const [copyValue, setCopyValue] = useState("");

  function toggleSave() {
    try {
      if (saved) localStorage.removeItem(key);
      else localStorage.setItem(key, "1");
      window.dispatchEvent(new Event(storageEvent));
      setStatus(saved ? "Memorial removed from this browser." : "Memorial saved in this browser.");
    } catch {
      setStatus("This browser could not update saved memorials.");
    }
  }

  async function share() {
    const url = new URL("/gravesite", window.location.origin);
    url.searchParams.set("id", id);
    setStatus("");
    setCopyValue("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${name} · GraveNav`, url: url.href });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url.href);
      setStatus("Memorial link copied.");
    } catch {
      setCopyValue(url.href);
      setStatus("Select and copy the memorial link below.");
    }
  }

  return <div className={styles.personalActions}>
    <div className={styles.actionRow}>
      <button aria-label="Save Memorial" aria-pressed={saved} onClick={toggleSave} type="button">
        <Icon name={saved ? "check" : "bookmark"} size={18} />{saved ? "Saved Memorial" : "Save Memorial"}
      </button>
      <button onClick={share} type="button"><Icon name="share" size={18} />Share Memorial</button>
    </div>
    <p role="status" className={styles.actionStatus}>{status}</p>
    {copyValue ? <input aria-label="Memorial link" className={styles.copyField} onFocus={event => event.currentTarget.select()}
      readOnly value={copyValue} /> : null}
  </div>;
}
