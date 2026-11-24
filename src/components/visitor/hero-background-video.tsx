"use client";

import { useEffect, useRef, useState } from "react";

export function HeroBackgroundVideo({
  className,
  src,
}: {
  className?: string;
  src: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = true;
    video.muted = true;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (motionQuery.matches) {
        video.pause();
      } else {
        void video.play().catch(() => {});
      }
    };

    syncPlayback();
    motionQuery.addEventListener("change", syncPlayback);
    return () => motionQuery.removeEventListener("change", syncPlayback);
  }, []);

  if (failed) return null;

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      autoPlay
      className={className}
      disablePictureInPicture
      loop
      muted
      onError={() => setFailed(true)}
      playsInline
      preload="metadata"
      tabIndex={-1}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
