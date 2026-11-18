"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { subscribeToLocation, usablePosition, type GpsPosition } from "@/lib/navigation-geo";
import { routePhaseTwo, type PhaseTwoRouteState } from "@/lib/phase2-routing";
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

export function PhaseTwoGeographicMap({ data, burialId }: { data: PhaseTwoGeography; burialId?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [locationError, setLocationError] = useState("");
  const [serviceError, setServiceError] = useState("");
  const [checkedAt, setCheckedAt] = useState(data.checkedAt ?? 0);
  const [now, setNow] = useState(data.checkedAt ?? 0);
  const [focus, setFocus] = useState(0);

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
      if (active) { setPosition(next); setLocationError(""); setNow(Date.now()); }
    }, error => {
      if (active) {
        setPosition(null);
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
  }, [enabled, data, burialId]);

  const checking = enabled && checkedAt === 0 && !serviceError;
  const staleSnapshot = enabled && (now - checkedAt > 30000 || checkedAt > now + 1000);
  const paused = serviceError || (checking ? "Checking the map before directions start." : staleSnapshot ? "The map could not be refreshed. Guidance is paused." : "");
  const route = enabled && !paused && !locationError ? routePhaseTwo(data, position, now) : null;
  const fresh = enabled && !paused && !locationError && position && usablePosition(position, now) &&
    now - position.timestamp <= (data.navigationPolicy?.maxFixAgeMs ?? 30000) ? position : null;
  const state = checking ? "checking" : paused ? "service_unavailable" : locationError ? "gps_unavailable" : !enabled ? "idle" : route!.state;
  const destinationMessage = data.target ? data.accessPoint ? "Use your location to check walking directions to this gravesite." :
    "The gravesite is shown on the map. Walking directions are not available; please ask cemetery staff for assistance." :
    "Search for a memorial to view its gravesite location.";
  const message = paused || locationError || (!enabled ? destinationMessage : messages[route!.state]);
  function toggle() {
    if (!enabled && !navigator.geolocation) {
      setLocationError("This device does not provide browser location.");
      return;
    }
    if (!enabled) setCheckedAt(0);
    setEnabled(value => !value); setPosition(null); setLocationError("");
    setServiceError(navigator.onLine ? "" : "You are offline. Walking guidance is paused."); setNow(Date.now());
  }
  return <div className="phase-two-geographic-experience" data-navigation-state={state} data-target-lot={data.target?.properties.lotId ?? ""}
    data-remaining-distance={route?.distanceM ?? ""}>
    <GeographicCanvas data={data} position={fresh} route={route?.coordinates ?? []} focusRequest={focus} />
    <section id="walking-guidance" className="map-destination-card" aria-label="Walking guidance">
      <h2>Walking Route</h2>
      <p role="status" aria-live="polite">{message}</p>
      {route?.distanceM !== null && route?.distanceM !== undefined ? <p><strong>{Math.round(route.distanceM)} m</strong> remaining along the walking path</p> : null}
      {position && Number.isFinite(position.accuracy) ? <p>Reported GPS accuracy: ±{Math.round(position.accuracy)} m</p> : null}
      <div className="phase-two-layer-options">
        <button type="button" className="button button--primary" onClick={toggle}>{enabled ? "Stop location" : "My Location"}</button>
        <button type="button" className="button button--secondary" onClick={() => setFocus(value => value + 1)}>View on Map</button>
      </div>
      <p>Your location stays on this device. Follow the park pathways and check the grave marker on arrival.</p>
    </section>
  </div>;
}
