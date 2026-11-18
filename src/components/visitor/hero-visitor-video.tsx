"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./hero-visitor-video.module.css";

export function HeroVisitorVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const player = video.current;
    if (!preference.matches) void player?.play().catch(() => {});
    const handlePreference = () => {
      if (preference.matches) player?.pause();
    };
    preference.addEventListener("change", handlePreference);
    return () => preference.removeEventListener("change", handlePreference);
  }, []);

  function togglePlayback() {
    const player = video.current;
    if (!player) return;
    if (player.paused) void player.play().catch(() => {});
    else player.pause();
  }

  return (
    <div className={`stitch-radar ${styles.panel}`}>
      <Image
        alt="GraveNav visitor homepage with the search field ready for a name"
        fill
        preload
        sizes="(min-width: 1500px) 560px, (min-width: 700px) 45vw, 400px"
        src="/videos/visitor-journey-poster.jpg"
        className={styles.media}
      />
      <video
        ref={video}
        className={styles.media}
        style={failed ? { visibility: "hidden" } : undefined}
        aria-label="Visitor tutorial with fictional records showing name search, gravesite selection, the Phase 2 map, walking guidance and a return home"
        loop
        muted
        playsInline
        poster="/videos/visitor-journey-poster.jpg"
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setFailed(true); setPlaying(false); }}
      >
        <source src="/videos/visitor-journey.webm" type="video/webm" />
        <source src="/videos/visitor-journey.mp4" type="video/mp4" />
      </video>
      {!failed && <button
        aria-label={playing ? "Pause visitor tutorial" : "Play visitor tutorial"}
        className={styles.control}
        onClick={togglePlayback}
        type="button"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          {playing
            ? <path d="M7 4h4v16H7zm6 0h4v16h-4z" />
            : <path d="m8 4 13 8-13 8z" />}
        </svg>
      </button>}
    </div>
  );
}
