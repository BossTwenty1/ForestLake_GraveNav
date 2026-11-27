"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import styles from "./memorial.module.css";

export function MemorialActions({ id, name }: { id: string; name: string }) {
  const [status, setStatus] = useState("");
  const [copyValue, setCopyValue] = useState("");

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
      <button onClick={share} type="button"><Icon name="share" size={18} />Share Memorial</button>
    </div>
    <p role="status" className={styles.actionStatus}>{status}</p>
    {copyValue ? <input aria-label="Memorial link" className={styles.copyField} onFocus={event => event.currentTarget.select()}
      readOnly value={copyValue} /> : null}
  </div>;
}
