"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { LocateFixed, Loader2, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { useMapEvents } from "react-leaflet";

import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api-client";

export interface MapLocation {
  label: string;
  lat: number;
  lng: number;
}

interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

// Leaflet touches `window`/`document` at import time, so the map itself must never
// render during SSR — dynamic-imported with ssr:false rather than making the whole
// picker a client component's problem to solve on its own.
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });

// A plain colored-pin SVG as a divIcon, rather than Leaflet's default marker image —
// sidesteps the well-known bundler issue where Leaflet's default icon asset paths
// break under Next.js/webpack, with no external image request needed either.
const pinIcon = L.divIcon({
  html: `<svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27c0-8.3-6.7-15-15-15z" fill="#4f46e5"/>
    <circle cx="15" cy="15" r="6" fill="white"/>
  </svg>`,
  className: "",
  iconSize: [30, 42],
  iconAnchor: [15, 42],
});

const DEFAULT_CENTER: [number, number] = [23.685, 90.3563]; // Bangladesh centroid

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function LocationMapPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MapLocation | null;
  onChange: (location: MapLocation) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const found = await apiClient.get<GeocodeResult[]>(`/api/v1/geocode/search?q=${encodeURIComponent(q)}`);
        setResults(found);
      } catch {
        setError("Search failed — try again");
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const selectResult = (result: GeocodeResult) => {
    onChange({ label: result.label, lat: result.lat, lng: result.lng });
    setQuery(result.label);
    setResults([]);
  };

  const handleMapClick = async (lat: number, lng: number) => {
    onChange({ label: "Locating address…", lat, lng });
    try {
      const result = await apiClient.get<GeocodeResult>(`/api/v1/geocode/reverse?lat=${lat}&lng=${lng}`);
      onChange({ label: result.label, lat, lng });
      setQuery(result.label);
    } catch {
      onChange({ label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location access");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await handleMapClick(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setError("Couldn't access your location");
        setLocating(false);
      }
    );
  };

  const center: [number, number] = value ? [value.lat, value.lng] : DEFAULT_CENTER;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search an address or place…"
          className="pr-9"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </span>
        {results.length > 0 && (
          <ul className="absolute z-[1000] mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => selectResult(r)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-950/40"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={locating}
        className="flex items-center gap-1.5 self-start text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 dark:text-primary-400"
      >
        {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
        Use my current location
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="h-56 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        {/* MapContainer only applies center/zoom on first mount (react-leaflet v4+
            behavior) — keying on the rounded center forces a remount so picking a new
            search result or "use my location" actually re-centers the view. */}
        <MapContainer
          key={`${center[0].toFixed(4)},${center[1].toFixed(4)}`}
          center={center}
          zoom={value ? 14 : 7}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onClick={handleMapClick} />
          {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
        </MapContainer>
      </div>
      {value && <p className="text-xs text-zinc-500">{value.label}</p>}
    </div>
  );
}
