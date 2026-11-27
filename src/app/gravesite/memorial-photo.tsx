"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import type { PublicMemorialPhoto } from "@/lib/supabase/public-memorial-photos";
import styles from "./memorial.module.css";

export function MemorialPhoto({ photo, name, priority = false }: { photo?: PublicMemorialPhoto; name: string; priority?: boolean }) {
  const [failedSrc, setFailedSrc] = useState("");
  if (!photo || failedSrc === photo.src) {
    return <div className={styles.photoPlaceholder}><Icon name="tree" size={45} /><span>Photo unavailable</span></div>;
  }
  return <Image alt={photo.caption || `Memorial photograph for ${name}`} fill preload={priority} unoptimized
    src={photo.src} onError={() => setFailedSrc(photo.src)} />;
}
