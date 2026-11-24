"use client";

import L from "leaflet";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Popup, useMap } from "react-leaflet";
import { Icon } from "@/components/ui/icons";
import type { CadFeature } from "@/lib/phase2-planning";
import type { CapstonePlanningMemorial } from "@/lib/supabase/phase2-data";
import styles from "./planning-lot-popup.module.css";

export type PlanningLotPopupOptions = {
  preferredId?: string;
  returnTo?: string;
  onClose: () => void;
  project?: (xy: [number, number]) => L.LatLng;
};

const compactQuery = "(max-width: 899px)";
const compactSnapshot = () => window.matchMedia(compactQuery).matches;
function subscribeToCompact(change: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

export function PlanningLotPopup({ feature, preferredId, returnTo, onClose, project }: PlanningLotPopupOptions & { feature: CadFeature }) {
  const map = useMap();
  const compact = useSyncExternalStore(subscribeToCompact, compactSnapshot, () => false);
  const heading = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const anchor = useMemo(() => {
    const [minX, minY, maxX, maxY] = feature.bounds;
    const center: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
    return project ? project(center) : L.latLng(center[1], center[0]);
  }, [feature, project]);
  const [records, setRecords] = useState<CapstonePlanningMemorial[] | null>(null);
  const [chosenId, setChosenId] = useState<string | undefined>(preferredId);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = records?.find(person => person.id === chosenId) ?? records?.[0];
  const others = records?.filter(person => person.id !== active?.id) ?? [];

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/map/planning-memorials?" + new URLSearchParams({ candidate: feature.id }), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Memorial details unavailable");
        const data: CapstonePlanningMemorial[] = await response.json();
        if (!controller.signal.aborted) setRecords(data);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [feature.id, attempt]);

  useEffect(() => {
    if (!compact || !sheet.current) return;
    L.DomEvent.disableClickPropagation(sheet.current);
    L.DomEvent.disableScrollPropagation(sheet.current);
    const point = map.latLngToContainerPoint(anchor);
    const size = map.getSize();
    map.panBy(point.subtract(L.point(size.x / 2, size.y * 0.27)), { animate: false });
  }, [anchor, compact, map]);

  function close() {
    onClose();
    map.getContainer().focus({ preventScroll: true });
  }

  const card = <section ref={sheet} aria-labelledby={heading} onClick={event => event.stopPropagation()}
    className={styles.card + (compact ? " " + styles.sheet : "")} data-lot-popup={compact ? "sheet" : "anchored"}>
    <div className={styles.header}>
      <div className={styles.identity}>
        <p className={styles.source}>Park layout</p>
        <h2 id={heading} ref={title} tabIndex={-1} aria-live="polite">{active?.name ?? "Gravesite details"}</h2>
        {active?.dates ? <p className={styles.dates}>{active.dates}</p> : null}
      </div>
      <button type="button" className={styles.close} onClick={close} aria-label="Close gravesite popup" title="Close gravesite popup">
        <Icon name="close" size={20} />
      </button>
    </div>
    <div className={styles.body}>
      {active ? <>
        {active.reference ? <p className={styles.reference}><Icon name="location" size={16} />{active.reference}</p> : null}
        {others.length ? <div className={styles.roster} aria-label="Other memorials at this gravesite" role="group">
          <p>Also at this gravesite</p>
          {others.map(person => <button key={person.id} type="button" onClick={() => {
            setChosenId(person.id);
            requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
          }}>{person.name}</button>)}
        </div> : null}
      </> : failed ? <p role="status">Memorial details are temporarily unavailable.{" "}
        <button type="button" className={styles.retry} onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
      </p> : <p role="status">{records ? "No public memorial details available." : "Loading memorial details…"}</p>}
    </div>
    {active ? <Link className={styles.profile} href={"/gravesite?" + new URLSearchParams({
      id: active.id, ...(returnTo ? { returnTo } : {}),
    })}>View Memorial Profile <Icon name="chevronRight" size={17} /></Link> : null}
  </section>;

  return compact ? card : <Popup position={anchor} className={styles.popup} offset={[0, -27]} maxWidth={340}
    closeButton={false} closeOnClick={false} closeOnEscapeKey={false} autoPanPadding={[20, 20]}>
    {card}
  </Popup>;
}
