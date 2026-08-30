"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { HostProfile, LocalExpertProfile } from "@/types/profile";

export default function ProfileSettingsPage() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <p className="px-6 py-12 text-sm text-zinc-400">Sign in to manage your public profiles.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Public Profiles</h1>
      <p className="mt-1 text-sm text-zinc-500">
        These are shown to travelers browsing experts and hosts. Requires an approved partner role of the
        matching type.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <ExpertProfileCard />
        <HostProfileCard />
      </div>
    </div>
  );
}

function ProfilePhoto({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    apiClient.getBlob(src, { auth: true }).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!url) return <div className="h-16 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="h-16 w-16 rounded-full object-cover" />;
}

function ExpertProfileCard() {
  const { data: profile, isLoading, isError, error: queryError } = useQuery({
    queryKey: ["my-expert-profile"],
    queryFn: () => apiClient.get<LocalExpertProfile>("/api/v1/partners/profiles/expert", { auth: true }),
    retry: false,
  });

  const notEligible = isError && queryError instanceof ApiError && queryError.status === 403;

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Local Expert Profile</h2>
      {isLoading && <p className="mt-2 text-sm text-zinc-400">Loading…</p>}
      {notEligible && <p className="mt-2 text-sm text-zinc-500">You need an approved Local Expert role to set this up.</p>}
      {!isLoading && !notEligible && (
        <ExpertProfileForm key={profile?.id ?? "new"} profile={profile ?? null} />
      )}
    </div>
  );
}

function ExpertProfileForm({ profile }: { profile: LocalExpertProfile | null }) {
  const queryClient = useQueryClient();
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [yearsExperience, setYearsExperience] = useState<number | "">(profile?.years_experience ?? "");
  const [isPublished, setIsPublished] = useState(profile?.is_published ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["my-expert-profile"] });

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await apiClient.put(
        "/api/v1/partners/profiles/expert",
        { headline, bio, years_experience: yearsExperience || null, is_published: isPublished },
        { auth: true }
      );
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiClient.postForm("/api/v1/partners/profiles/expert/photo", formData, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Photo upload failed");
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {profile?.has_photo && (
          <ProfilePhoto src={`/api/v1/partners/profiles/expert/${profile.partner_role_id}/photo/file`} alt="Profile photo" />
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadPhoto(file);
            e.target.value = "";
          }}
          className="text-xs"
        />
      </div>

      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="Headline (e.g. Cox's Bazar specialist)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Bio"
        rows={3}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="number"
        min={0}
        value={yearsExperience}
        onChange={(e) => setYearsExperience(e.target.value ? Number(e.target.value) : "")}
        placeholder="Years of experience"
        className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published (visible in search)
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function HostProfileCard() {
  const { data: profile, isLoading, isError, error: queryError } = useQuery({
    queryKey: ["my-host-profile"],
    queryFn: () => apiClient.get<HostProfile>("/api/v1/partners/profiles/host", { auth: true }),
    retry: false,
  });

  const notEligible = isError && queryError instanceof ApiError && queryError.status === 403;

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Host Profile</h2>
      {isLoading && <p className="mt-2 text-sm text-zinc-400">Loading…</p>}
      {notEligible && <p className="mt-2 text-sm text-zinc-500">You need an approved Host or Hotel role to set this up.</p>}
      {!isLoading && !notEligible && (
        <HostProfileForm key={profile?.id ?? "new"} profile={profile ?? null} />
      )}
    </div>
  );
}

function HostProfileForm({ profile }: { profile: HostProfile | null }) {
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState(profile?.business_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [isPublished, setIsPublished] = useState(profile?.is_published ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["my-host-profile"] });

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await apiClient.put(
        "/api/v1/partners/profiles/host",
        { business_name: businessName, bio, is_published: isPublished },
        { auth: true }
      );
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiClient.postForm("/api/v1/partners/profiles/host/photo", formData, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Photo upload failed");
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {profile?.has_photo && (
          <ProfilePhoto src={`/api/v1/partners/profiles/host/${profile.partner_role_id}/photo/file`} alt="Profile photo" />
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadPhoto(file);
            e.target.value = "";
          }}
          className="text-xs"
        />
      </div>

      <input
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        placeholder="Business name"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Bio"
        rows={3}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published (visible in search)
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
