"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { Clock, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface MapLocation {
  label: string;
  lat: number;
  lng: number;
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export function formatTravelTime(distanceKm: number): string {
  // Average inter-district travel speed in Bangladesh ~42 km/h accounting for ferry & traffic
  const hoursDecimal = (distanceKm * 1.25) / 42;
  const totalMinutes = Math.round(hoursDecimal * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} mins`;
  if (minutes === 0) return `${hours} hr${hours > 1 ? "s" : ""}`;
  return `${hours} hr${hours > 1 ? "s" : ""} ${minutes} min`;
}

// Dynamic Leaflet wrappers
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then((m) => m.Polyline), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

// Styled SVG Markers
const pickupIcon = L.divIcon({
  html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.3);color:white;font-weight:bold;font-size:14px;font-family:sans-serif;">P</div>`,
  className: "",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -18],
});

const dropoffIcon = L.divIcon({
  html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.3);color:white;font-weight:bold;font-size:14px;font-family:sans-serif;">D</div>`,
  className: "",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -18],
});

function FitBoundsHelper({ pickup, dropoff }: { pickup: MapLocation | null; dropoff: MapLocation | null }) {
  const map = useMap();

  useEffect(() => {
    if (pickup && dropoff) {
      const bounds = L.latLngBounds([
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else if (pickup) {
      map.setView([pickup.lat, pickup.lng], 12);
    } else if (dropoff) {
      map.setView([dropoff.lat, dropoff.lng], 12);
    }
  }, [map, pickup, dropoff]);

  return null;
}

function MapClickHandler({
  activeTarget,
  onLocationSelected,
}: {
  activeTarget: "pickup" | "dropoff" | null;
  onLocationSelected: (target: "pickup" | "dropoff", loc: MapLocation) => void;
}) {
  useMapEvents({
    click(e) {
      if (!activeTarget) return;
      onLocationSelected(activeTarget, {
        label: `${activeTarget === "pickup" ? "Pickup Point" : "Drop-off Point"} (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    },
  });
  return null;
}

interface RouteMapProps {
  pickup: MapLocation | null;
  dropoff: MapLocation | null;
  onPickupChange?: (loc: MapLocation) => void;
  onDropoffChange?: (loc: MapLocation) => void;
  interactive?: boolean;
  className?: string;
  height?: string;
  /** Just the map with its pin(s): no route header or pickup/drop-off legend. */
  bare?: boolean;
}

export function RouteMap({
  pickup,
  dropoff,
  onPickupChange,
  onDropoffChange,
  interactive = false,
  className = "",
  height = "h-80",
  bare = false,
}: RouteMapProps) {
  const [activePicking, setActivePicking] = useState<"pickup" | "dropoff" | null>(null);

  // Approximate default center (Dhaka, Bangladesh)
  const defaultCenter: [number, number] = [23.8103, 90.4125];

  const straightDistanceKm =
    pickup && dropoff ? calculateDistanceKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng) : null;
  // Highway road multiplier ~ 1.22
  const roadDistanceKm = straightDistanceKm ? Number((straightDistanceKm * 1.22).toFixed(1)) : null;
  const estimatedTime = roadDistanceKm ? formatTravelTime(straightDistanceKm!) : null;

  const handleSelected = (target: "pickup" | "dropoff", loc: MapLocation) => {
    if (target === "pickup" && onPickupChange) {
      onPickupChange(loc);
      setActivePicking(dropoff ? null : "dropoff");
    } else if (target === "dropoff" && onDropoffChange) {
      onDropoffChange(loc);
      setActivePicking(null);
    }
  };

  return (
    <Card className={`overflow-hidden p-0 shadow-lg ${className}`}>
      {/* Route Metrics Header */}
      {!bare && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/80 p-3.5 sm:px-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              <Navigation className="h-4 w-4 text-primary-600" />
              <span>OpenStreetMap Route</span>
            </div>

            {roadDistanceKm !== null ? (
              <div className="flex items-center gap-2">
                <Badge variant="primary" className="text-xs font-bold">
                  Distance Covered: {roadDistanceKm} km
                </Badge>
                <Badge variant="accent" className="flex items-center gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  Est. Drive: {estimatedTime}
                </Badge>
              </div>
            ) : (
              <span className="text-xs text-zinc-400">
                {interactive ? "Select pickup and drop-off points to calculate distance" : "Route details"}
              </span>
            )}
          </div>

          {interactive && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={activePicking === "pickup" ? "primary" : "secondary"}
                onClick={() => setActivePicking((c) => (c === "pickup" ? null : "pickup"))}
                className="text-xs"
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {activePicking === "pickup" ? "Click Map for Pickup" : "Set Pickup"}
              </Button>
              <Button
                size="sm"
                variant={activePicking === "dropoff" ? "primary" : "secondary"}
                onClick={() => setActivePicking((c) => (c === "dropoff" ? null : "dropoff"))}
                className="text-xs"
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />
                {activePicking === "dropoff" ? "Click Map for Drop-off" : "Set Drop-off"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Map Surface */}
      <div className={`relative w-full ${height} bg-zinc-100 dark:bg-zinc-950`}>
        <MapContainer
          center={pickup ? [pickup.lat, pickup.lng] : dropoff ? [dropoff.lat, dropoff.lng] : defaultCenter}
          zoom={pickup || dropoff ? 10 : 7}
          className="h-full w-full"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBoundsHelper pickup={pickup} dropoff={dropoff} />

          {interactive && (
            <MapClickHandler activeTarget={activePicking} onLocationSelected={handleSelected} />
          )}

          {/* Pickup Marker */}
          {pickup && (
            <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
              <Popup>
                <div className="p-1 text-xs">
                  <p className="font-bold text-emerald-700">Pickup Location</p>
                  <p className="mt-0.5 text-zinc-600">{pickup.label}</p>
                  <p className="text-[10px] text-zinc-400">
                    {pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Drop-off Marker */}
          {dropoff && (
            <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon}>
              <Popup>
                <div className="p-1 text-xs">
                  <p className="font-bold text-red-700">Drop-off Location</p>
                  <p className="mt-0.5 text-zinc-600">{dropoff.label}</p>
                  <p className="text-[10px] text-zinc-400">
                    {dropoff.lat.toFixed(4)}, {dropoff.lng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route Connecting Line */}
          {pickup && dropoff && (
            <Polyline
              positions={[
                [pickup.lat, pickup.lng],
                [dropoff.lat, dropoff.lng],
              ]}
              pathOptions={{
                color: "#6366f1",
                weight: 5,
                opacity: 0.85,
                dashArray: "8, 8",
              }}
            />
          )}
        </MapContainer>

        {/* Interactive hint banner */}
        {activePicking && (
          <div className="absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-zinc-900/90 px-4 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md">
            Click anywhere on the map to set the {activePicking === "pickup" ? "Pickup" : "Drop-off"} point
          </div>
        )}
      </div>

      {/* Location Addresses Footer */}
      {!bare && (pickup || dropoff) && (
        <div className="grid grid-cols-1 divide-y divide-zinc-100 border-t border-zinc-100 bg-white p-3 text-xs sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start gap-2 p-1.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              P
            </span>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Pickup</p>
              <p className="text-zinc-600 dark:text-zinc-400">{pickup ? pickup.label : "Not set"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-1.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-400">
              D
            </span>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Drop-off</p>
              <p className="text-zinc-600 dark:text-zinc-400">{dropoff ? dropoff.label : "Not set"}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
