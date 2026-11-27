"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import type { PublicMemorialPhoto } from "@/lib/supabase/public-memorial-photos";
import { MemorialPhoto } from "./memorial-photo";
import styles from "./memorial.module.css";

export function MemorialGallery({ photos, name }: { photos: PublicMemorialPhoto[]; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<PublicMemorialPhoto | null>(null);
  const [failed, setFailed] = useState<number[]>([]);
  const available = photos.filter(photo => !failed.includes(photo.id));

  return <section className={styles.gallery} aria-labelledby="memorial-gallery-title">
    <div className={styles.sectionTitle}>
      <h2 id="memorial-gallery-title"><Icon name="photos" size={21} />Memorial Photo Gallery</h2>
      <span>{available.length} {available.length === 1 ? "photo" : "photos"}</span>
    </div>

    {available.length ? <div className={styles.thumbnails}>
      {available.map((photo, index) => <button aria-label={photo.caption ? `Enlarge photo: ${photo.caption}` : `Enlarge memorial photo ${index + 1}`}
        key={photo.id} type="button" onClick={event => {
          opener.current = event.currentTarget;
          setSelected(photo);
          dialog.current?.showModal();
        }}>
        <Image alt="" fill unoptimized src={photo.src} onError={() => setFailed(ids => [...ids, photo.id])} />
      </button>)}
    </div> : <p className={styles.muted}>No memorial photos have been published yet.</p>}

    <dialog ref={dialog} className={styles.photoDialog} aria-label="Enlarged memorial photo" onClose={() => {
      setSelected(null);
      opener.current?.focus();
    }}>
      <button aria-label="Close photo" className={styles.closePhoto} type="button" onClick={() => dialog.current?.close()}>
        <Icon name="close" size={22} />
      </button>
      {selected ? <figure>
        <div className={styles.enlargedPhoto}><MemorialPhoto name={name} photo={selected} key={selected.id} /></div>
        {selected.caption || selected.submittedByName ? <figcaption>
          {selected.caption ? <span>{selected.caption}</span> : null}
          {selected.submittedByName ? <small className={styles.photoAttribution}>
            Shared by {selected.submittedByName}{selected.submittedByRelation ? ` · ${selected.submittedByRelation}` : ""}
          </small> : null}
        </figcaption> : null}
      </figure> : null}
    </dialog>
  </section>;
}
