"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Circle, Marker, LayerGroup } from "leaflet";
import type { TransportFareSlab } from "@nkps/shared/types";

// Plain Leaflet (no react-leaflet) keeps the dep surface small. The map is
// instantiated lazily on mount; re-renders only redraw the slab layers, the
// tile layer and marker are reused.

const SCHOOL = { lat: 27.0688458, lng: 75.7495752 };

// Concentric rings are easier to read when the inner band is bright/warm
// and rings step outward through cooler tones. Keep these pastels — admin
// reads through them at a glance; saturated fills make the map noisy.
const RING_PALETTE = [
  { fill: "#86efac", stroke: "#16a34a" }, // light green
  { fill: "#93c5fd", stroke: "#2563eb" }, // light blue
  { fill: "#fcd34d", stroke: "#d97706" }, // amber
  { fill: "#f9a8d4", stroke: "#db2777" }, // pink
  { fill: "#c4b5fd", stroke: "#7c3aed" }, // violet
  { fill: "#fca5a5", stroke: "#dc2626" }, // red
  { fill: "#5eead4", stroke: "#0d9488" }, // teal
] as const;

interface Props {
  slabs: TransportFareSlab[];
  // When set, this address pin is shown on the map (used by the address
  // lookup feature so admins can sanity-check the auto-picked slab).
  pickupMarker?: {
    lat: number;
    lng: number;
    label?: string;
    distanceKm?: number;
  } | null;
}

interface SlabRing {
  id: string;
  name: string;
  outerKm: number;
  innerKm: number | null;
  amount: number;
  frequency: string;
}

function toRings(slabs: TransportFareSlab[]): SlabRing[] {
  // Only active slabs with an outer distance are drawable. Sort by outer
  // radius ascending so the innermost band renders first (and ends up
  // visually on top when overlaps happen). Unbounded slabs go last.
  const rings = slabs
    .filter((s) => s.is_active && s.distance_km_max != null)
    .map<SlabRing>((s) => ({
      id: s.id,
      name: s.name,
      outerKm: Number(s.distance_km_max),
      innerKm: s.distance_km_min != null ? Number(s.distance_km_min) : null,
      amount: Number(s.amount),
      frequency: s.frequency,
    }))
    .sort((a, b) => a.outerKm - b.outerKm);
  return rings;
}

function formatAmount(amount: number, frequency: string) {
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
  if (frequency === "one_time") return formatted;
  return `${formatted}/${frequency.replace("_", " ")}`;
}

export function TransportSlabsMap({ slabs, pickupMarker }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const ringsLayerRef = useRef<LayerGroup | null>(null);
  const schoolMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const pickupCircleRef = useRef<Circle | null>(null);

  // Mount the map exactly once. We dynamic-import leaflet so SSR doesn't
  // try to access `window` while bundling.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      // Side-effect import: Leaflet CSS lives in node_modules. Importing
      // from inside the dynamic import keeps it out of the SSR bundle and
      // away from the global CSS pipeline.
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false, // prevents page-scroll hijack
      }).setView([SCHOOL.lat, SCHOOL.lng], 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Custom school marker — Leaflet's default marker assets break under
      // bundlers (it looks for relative URLs that webpack/turbopack rewrite).
      // A divIcon side-steps that entirely.
      const schoolIcon = L.divIcon({
        className: "",
        html:
          '<div style="background:#0A1628;color:#D4A843;border:2px solid #D4A843;border-radius:9999px;padding:6px 10px;font-size:11px;font-weight:700;font-family:system-ui;box-shadow:0 4px 12px rgba(0,0,0,0.25);white-space:nowrap;">NKPS</div>',
        iconSize: [40, 26],
        iconAnchor: [20, 13],
      });
      schoolMarkerRef.current = L.marker([SCHOOL.lat, SCHOOL.lng], {
        icon: schoolIcon,
      })
        .addTo(map)
        .bindPopup("<strong>NK Public School</strong>");

      ringsLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Redraw the slab rings whenever the slab list changes. Wipes the layer
  // group rather than diffing — slab counts are small, the redraw is cheap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || !ringsLayerRef.current) return;
      ringsLayerRef.current.clearLayers();

      const rings = toRings(slabs);
      if (rings.length === 0) return;

      rings.forEach((ring, idx) => {
        const palette = RING_PALETTE[idx % RING_PALETTE.length];
        const circle = L.circle([SCHOOL.lat, SCHOOL.lng], {
          radius: ring.outerKm * 1000,
          color: palette.stroke,
          weight: 1.5,
          fillColor: palette.fill,
          // Each successive ring is drawn slightly transparent so inner
          // rings show through. Outer rings fade more aggressively so the
          // overall map doesn't go opaque past 4-5 slabs.
          fillOpacity: Math.max(0.32 - idx * 0.04, 0.12),
        });
        const innerLabel =
          ring.innerKm != null ? `${ring.innerKm}–${ring.outerKm} km` : `≤ ${ring.outerKm} km`;
        circle.bindTooltip(
          `<strong>${ring.name}</strong><br/>${innerLabel} · ${formatAmount(ring.amount, ring.frequency)}`,
          { sticky: true }
        );
        circle.addTo(ringsLayerRef.current!);
      });

      // Fit bounds to the outermost ring so the admin sees the whole reach
      // without manual zooming. Add a small padding so the ring isn't flush
      // against the viewport edge.
      const maxKm = rings[rings.length - 1].outerKm;
      const bounds = L.latLng(SCHOOL.lat, SCHOOL.lng).toBounds(maxKm * 2000);
      mapRef.current.fitBounds(bounds, { padding: [20, 20] });
    })();
    return () => {
      cancelled = true;
    };
  }, [slabs]);

  // Pickup pin layer — separate from rings so address lookups don't force
  // a full redraw.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.remove();
        pickupMarkerRef.current = null;
      }
      if (pickupCircleRef.current) {
        pickupCircleRef.current.remove();
        pickupCircleRef.current = null;
      }
      if (!pickupMarker) return;

      const pin = L.divIcon({
        className: "",
        html:
          '<div style="background:#dc2626;border:2px solid white;border-radius:9999px;width:14px;height:14px;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const m = L.marker([pickupMarker.lat, pickupMarker.lng], { icon: pin })
        .addTo(mapRef.current)
        .bindPopup(
          pickupMarker.label
            ? `<strong>${pickupMarker.label}</strong>${pickupMarker.distanceKm != null ? `<br/>${pickupMarker.distanceKm.toFixed(2)} km from school` : ""}`
            : `${pickupMarker.distanceKm != null ? `${pickupMarker.distanceKm.toFixed(2)} km from school` : "Pickup"}`
        );
      pickupMarkerRef.current = m;

      // Dashed line from school to pickup so admins can eyeball direction.
      pickupCircleRef.current = L.circle([SCHOOL.lat, SCHOOL.lng], {
        radius:
          (pickupMarker.distanceKm ??
            haversineKm(SCHOOL.lat, SCHOOL.lng, pickupMarker.lat, pickupMarker.lng)) * 1000,
        color: "#dc2626",
        weight: 1,
        fill: false,
        dashArray: "4 4",
      }).addTo(mapRef.current);

      mapRef.current.flyTo([pickupMarker.lat, pickupMarker.lng], 14, {
        duration: 0.6,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pickupMarker]);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/30">
      <div ref={containerRef} className="h-[420px] w-full" />
    </div>
  );
}

// Great-circle distance in km. Used as a fallback when the caller didn't
// pre-compute distance for the pickup marker.
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const SCHOOL_LOCATION = SCHOOL;
