"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveNavigationFrame, type NavigationMemorial } from "./live-navigation-frame";
import layout from "./map-explorer.module.css";
import { subscribeToLocation, usablePosition, type GpsPosition } from "@/lib/navigation-geo";
import { routePhaseTwo, walkingSteps, type PhaseTwoRouteState } from "@/lib/phase2-routing";
import type { PhaseTwoGeography, PhaseTwoResult } from "@/lib/phase2-geographic";

const GeographicCanvas = dynamic(() => import("./phase2-geographic-canvas"), {
  ssr: false, loading: () => <p role="status">Loading gravesite map…</p>,
});
const messages: Record<PhaseTwoRouteState, string> = {
  ready: "Follow the highlighted walking path to the gravesite approach.",
  arrived: "You are near the gravesite approach. Check the name on the grave marker.",
  policy_unavailable: "Walking directions are not available here yet. Please ask cemetery staff for assistance.",
  no_destination: "Select a memorial with an available gravesite location to check directions.",
  no_network: "Walking directions are currently unavailable. Please ask cemetery staff for assistance.",
  location_unavailable: "Waiting for your location before showing directions.",
  stale: "Your location is stale or invalid. Guidance is paused until a fresh reading arrives.",
  inaccurate: "Your GPS signal is not accurate enough. Move to an open area; guidance is paused.",
  outside: "Your location is outside this park map’s coverage.",
  off_route: "You are away from the walking path. Return to a park pathway; guidance is paused.",
  unreachable: "No permitted walking route connects this path to the gravesite access point.",
};

export function PhaseTwoGeographicMap({ data, burialId, memorial }: { data: PhaseTwoGeography; burialId?: string; memorial?: NavigationMemorial }) {
  const [enabled, setEnabled] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const preflight = useMemo(() => routePhaseTwo(data, null), [data]);
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [locationError, setLocationError] = useState("");
  const [serviceError, setServiceError] = useState("");
  const [checkedAt, setCheckedAt] = useState(data.checkedAt ?? 0);
  const [now, setNow] = useState(data.checkedAt ?? 0);
  const [focus, setFocus] = useState(0);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function checkPublication() {
      if (pending) return;
      pending = true;
      const request = new AbortController();
      const cancel = () => request.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      if (controller.signal.aborted) cancel();
      const timeout = window.setTimeout(cancel, 10000);
      try {
        const response = await fetch("/api/map/phase2" + (burialId ? "?id=" + encodeURIComponent(burialId) : ""),
          { cache: "no-store", signal: request.signal });
        if (!response.ok) throw Error("unavailable");
        const next: PhaseTwoResult = await response.json();
        if (!next.data || next.data.releaseId !== data.releaseId || next.data.scopeRevision !== data.scopeRevision ||
            JSON.stringify(next.data.target) !== JSON.stringify(data.target) ||
            JSON.stringify(next.data.accessPoint) !== JSON.stringify(data.accessPoint) ||
            JSON.stringify(next.data.navigationPolicy) !== JSON.stringify(data.navigationPolicy) ||
            !Number.isFinite(next.data.checkedAt)) throw Error("changed");
        if (active) { setCheckedAt(Date.now()); setServiceError(""); }
      } catch {
        if (active) setServiceError("The map could not be refreshed. Guidance is paused; reload the map to try again.");
      } finally {
        window.clearTimeout(timeout); controller.signal.removeEventListener("abort", cancel); pending = false;
      }
    }
    void checkPublication();
    let stop = () => {};
    if (navigator.geolocation) stop = subscribeToLocation(navigator.geolocation, next => {
      if (active) { setPosition(next); setLocationError(""); setPermissionDenied(false); setNow(Date.now()); }
    }, error => {
      if (active) {
        setPosition(null);
        setPermissionDenied(error.code === 1);
        setLocationError(error.code === 1 ? "Location permission was denied. Allow location and try again to use GPS guidance." :
          "Your location is unavailable. Try again with a clear view of the sky.");
      }
    });
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    // Revalidate publication while moving. Expire guidance after a missed refresh.
    const refresh = window.setInterval(() => void checkPublication(), 15000);
    const offline = () => setServiceError("You are offline. Walking guidance is paused.");
    window.addEventListener("offline", offline);
    return () => {
      active = false; controller.abort(); stop();
      window.clearInterval(clock); window.clearInterval(refresh); window.removeEventListener("offline", offline);
    };
  }, [enabled, data, burialId, locationAttempt]);

  const checking = enabled && checkedAt === 0 && !serviceError;
  const staleSnapshot = enabled && (now - checkedAt > 30000 || checkedAt > now + 1000);
  const paused = enabled ? serviceError || (checking ? "Checking the map before directions start." : staleSnapshot ? "The map could not be refreshed. Guidance is paused." : "") : "";
  const route = enabled && !paused && !locationError ? routePhaseTwo(data, position, now) : null;
  const fresh = enabled && !paused && !locationError && position && usablePosition(position, now) &&
    now - position.timestamp <= (data.navigationPolicy?.maxFixAgeMs ?? 30000) ? position : null;
  const state = checking ? "checking" : paused ? "service_unavailable" : locationError ? "gps_unavailable" : !enabled ? (stopped ? "stopped" : "idle") : route!.state;
  const canGuide = preflight.state === "location_unavailable";
  const noDestinationTitle = burialId ? "Gravesite location unavailable" : "No gravesite selected";
  const noDestinationMessage = burialId
    ? "The selected memorial has no available map location. Please ask cemetery staff for assistance."
    : "Search for a memorial to view its gravesite location.";
  const destinationMessage = !data.target ? noDestinationMessage : canGuide
    ? "Use your location to check walking directions to this gravesite."
    : "The gravesite is shown on the map. Walking directions are unavailable. Please ask cemetery staff for assistance.";
  const statusTitle = state === "ready" ? "Walking directions available"
    : state === "arrived" ? "Near the gravesite approach"
    : state === "checking" || state === "location_unavailable" ? "Finding your location"
    : state === "policy_unavailable" || state === "no_network" || state === "unreachable" || (!enabled && data.target && !canGuide) ? "Walking directions unavailable"
    : state === "no_destination" || (!enabled && !data.target) ? noDestinationTitle
    : locationError || paused || enabled ? "Walking guidance paused"
    : "Ready to check directions";
  const message = paused || locationError || (!enabled ? destinationMessage : route!.state === "no_destination" ? noDestinationMessage : messages[route!.state]);
  function toggle() {
    if (!enabled && memorial && !canGuide) return;
    if (!enabled && !navigator.geolocation) {
      setLocationError("This device does not provide browser location.");
      return;
    }
    if (!enabled) setCheckedAt(0);
    setStopped(enabled); setPermissionDenied(false);
    setEnabled(value => !value); setPosition(null); setLocationError("");
    setServiceError(navigator.onLine ? "" : "You are offline. Walking guidance is paused."); setNow(Date.now());
  }
  if (memorial) {
    const displayState = !enabled && !locationError && !canGuide ? "route_unavailable" : state;
    const titles: Record<string, string> = {
      idle: "Navigation ready",
      ready: "Active guidance",
      arrived: "Near the gravesite approach",
      checking: "Checking map availability",
      location_unavailable: "Waiting for your location",
      stale: "GPS signal lost",
      inaccurate: "GPS accuracy too low",
      off_route: "Off route",
      outside: "Outside park coverage",
      stopped: "Navigation stopped",
      route_unavailable: data.target ? "Route unavailable" : "Gravesite location unavailable",
      service_unavailable: "Route unavailable",
      gps_unavailable: permissionDenied ? "GPS permission required" : "GPS signal unavailable",
    };
    const detail = displayState === "stopped" ? "Location tracking has ended. Start again when you’re ready." : message;
    return <LiveNavigationFrame memorial={memorial} state={displayState} status={titles[displayState] ?? "Route unavailable"}
      message={detail} distance={route?.distanceM ?? null} accuracy={fresh?.accuracy ?? null} steps={route ? walkingSteps(route) : []}
      lotId={data.target?.properties.lotId} onRecenter={() => setFocus(value => value + 1)}
      onStart={!enabled && canGuide ? toggle : undefined} onStop={enabled ? toggle : undefined}
      retryLabel={serviceError ? "Reload map" : "Try location again"}
      onRetry={serviceError && enabled ? () => window.location.reload() : locationError && enabled ? () => {
        setLocationError(""); setPermissionDenied(false); setCheckedAt(0); setLocationAttempt(value => value + 1);
      } : undefined}
      map={<GeographicCanvas data={data} position={fresh} route={route?.coordinates ?? []} focusRequest={focus} wideNavigation routeActive={state === "ready"} />} />;
  }
  return <div className="phase-two-geographic-experience" data-navigation-state={state} data-target-lot={data.target?.properties.lotId ?? ""}
    data-remaining-distance={route?.distanceM ?? ""}>
    <div ref={canvas} className={layout.geographicCanvas}>
      <GeographicCanvas data={data} position={fresh} route={route?.coordinates ?? []} focusRequest={focus} />
    </div>
    <section id="walking-guidance" className="map-destination-card" aria-label="Walking guidance">
      <h2>Walking guidance</h2>
      <div className={layout.guidanceStatus} role="status">
        <h3>{statusTitle}</h3>
        <p>{message}</p>
      </div>
      {route?.distanceM !== null && route?.distanceM !== undefined ? <p className={layout.distance}><strong>{Math.round(route.distanceM)} m</strong> remaining along the walking path</p> : null}
      {position && Number.isFinite(position.accuracy) ? <p>Reported GPS accuracy: ±{Math.round(position.accuracy)} m</p> : null}
      <div className="phase-two-layer-options">
        <button type="button" className="button button--primary" onClick={toggle}>{enabled ? "Stop location" : "My Location"}</button>
        <button type="button" className="button button--secondary" onClick={() => {
          setFocus(value => value + 1);
          canvas.current?.scrollIntoView({ block: "nearest" });
        }}>View on Map</button>
        {serviceError ? <button type="button" className="button button--secondary" onClick={() => window.location.reload()}>Reload map</button> : null}
      </div>
      <p>Your location stays on this device. Follow the park pathways and check the grave marker on arrival.</p>
    </section>
  </div>;
}
