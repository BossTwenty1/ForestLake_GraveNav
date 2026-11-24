"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./hero-visitor-video.module.css";

const tutorialSrc = "/videos/visitor-journey-mobile.mp4";

export function HeroVisitorVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const player = video.current;
    const handlePreference = () => {
      if (preference.matches) player?.pause();
    };
    preference.addEventListener("change", handlePreference);
    return () => preference.removeEventListener("change", handlePreference);
  }, []);

  return (
    <div className={styles.panel}>
      <video
        ref={video}
        className={styles.media}
        aria-label="GraveNav visitor tutorial"
        src={tutorialSrc}
        poster="/videos/visitor-journey-mobile-poster.jpg"
        controls={hasPlayed}
        tabIndex={hasPlayed ? 0 : -1}
        playsInline
        preload="none"
        onPlay={event => {
          if (hasPlayed) return;
          setHasPlayed(true);
          event.currentTarget.focus();
        }}
        onError={() => setFailed(true)}
      >
        <track
          kind="captions"
          src="/videos/visitor-journey-mobile.en.vtt"
          srcLang="en"
          label="English"
        />
      </video>
      {!hasPlayed && !failed && (
        <button
          type="button"
          aria-label="Play visitor tutorial"
          className={styles.control}
          onClick={() => void video.current?.play().catch(() => setFailed(true))}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="m8 4 13 8-13 8z" />
          </svg>
          <span aria-hidden="true" className={styles.controlLabel}>Watch Walkthrough</span>
        </button>
      )}
      {failed && (
        <p className={styles.fallback} role="status">
          The video could not play here. <a href={tutorialSrc}>Open the tutorial video</a>.
        </p>
      )}
    </div>
  );
}
