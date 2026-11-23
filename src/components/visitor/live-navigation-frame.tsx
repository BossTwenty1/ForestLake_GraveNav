import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import type { WalkingStep } from "@/lib/phase2-routing";
import styles from "./live-navigation.module.css";

export type NavigationMemorial = { name: string; dates: string; reference: string; profileHref: string; parkHref: string };

export function LiveNavigationFrame({ memorial, map, state, status, message, distance, accuracy, steps, onStart, onStop, onRetry, retryLabel, onRecenter, lotId, entrancePreviewActive, onToggleEntrancePreview, externalDirectionsUrl }: {
  memorial: NavigationMemorial;
  map: ReactNode;
  state: string;
  status: string;
  message: string;
  distance: number | null;
  accuracy: number | null;
  steps: WalkingStep[];
  onStart?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  onRecenter: () => void;
  lotId?: unknown;
  entrancePreviewActive?: boolean;
  onToggleEntrancePreview?: () => void;
  externalDirectionsUrl?: string;
}) {
  const active = state === "ready";
  const firstStep = steps[0];

  return <article className={"phase-two-geographic-experience " + styles.workspace}
    data-navigation-state={state} data-target-lot={String(lotId ?? "")} data-remaining-distance={distance ?? ""}>
    <header className={styles.identity}>
      <span className={styles.identityIcon}><Icon name="location" size={22} /></span>
      <div><h1>{memorial.name}</h1><p>{memorial.reference}{memorial.dates ? <> · {memorial.dates}</> : null}</p></div>
      <span className={styles.badge} data-active={active}><i />{active ? "GPS active" : status}</span>
      {onStart ? <button type="button" className={styles.start + " " + styles.primaryAction} onClick={onStart}><Icon name="walk" size={18} />Start Navigation</button> : null}
      {onStop ? <button type="button" className={styles.stop + " " + styles.primaryAction} onClick={onStop}><Icon name="close" size={18} />Stop Navigation</button> : null}
    </header>
    <section className={styles.map} aria-label="Interactive gravesite map">
      {map}
      <div className={styles.mapTools}>
        <button aria-label="Recenter map" title="Recenter map" type="button" onClick={onRecenter}><Icon name="target" size={21} /></button>
      </div>
      {accuracy !== null ? <span className={styles.accuracy}><Icon name="target" size={15} /> GPS accuracy ±{Math.round(accuracy)} m</span> : null}
    </section>
    <section id="walking-guidance" className={styles.guidance} aria-label="Walking guidance">
      <span aria-hidden="true" className={styles.handle} />
      {distance !== null ? <div className={styles.summary}><Icon name="walk" size={19} /><span><strong>{Math.round(distance)} m</strong> remaining</span></div> : null}
      <div className={styles.instruction} data-active={active}>
        <span className={styles.instructionIcon}><Icon name={active ? "navigation" : state === "arrived" ? "location" : "info"} size={22} /></span>
        <div role="status">
          <h2>{active && firstStep ? firstStep.instruction : status}</h2>
          <p>{active && firstStep?.distanceM ? `About ${Math.round(firstStep.distanceM)} m along the highlighted path.` : message}</p>
        </div>
      </div>
      {steps.length ? <details className={styles.steps}>
        <summary>View route steps<Icon name="chevronDown" size={17} /></summary>
        <ol>{steps.map((step, index) => <li key={index}><span>{step.instruction}</span>{step.distanceM !== null ? <strong>{Math.round(step.distanceM)} m</strong> : null}</li>)}</ol>
      </details> : null}
      {onToggleEntrancePreview ? <button type="button" className={styles.secondary} onClick={onToggleEntrancePreview}>
        <Icon name="map" size={16} />{entrancePreviewActive ? "Hide Entrance Route Preview" : "Preview Route from Entrance"}
      </button> : null}
      {externalDirectionsUrl ? <a className={styles.secondary} href={externalDirectionsUrl} rel="noopener noreferrer" target="_blank">
        <Icon name="navigation" size={16} />Directions to Park Entrance
      </a> : null}
      {onRetry ? <button type="button" className={styles.secondary} onClick={onRetry}>{retryLabel}</button> : null}
      <div className={styles.links}>
        <Link href={memorial.profileHref}>Memorial Profile</Link>
        <Link href={memorial.parkHref}>Park map</Link>
      </div>
    </section>
  </article>;
}
