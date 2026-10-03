"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Upload, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { HostProfile, LocalExpertProfile } from "@/types/profile";

export default function ProfileSettingsPage() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <p className="px-6 py-12 text-sm text-zinc-400">Sign in to manage your public profiles.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">Public Profiles</h1>
      <p className="mt-1 text-sm text-zinc-500">
        These are shown to travelers browsing experts and hosts. Requires an approved partner role of the
        matching type.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <ExpertProfileCard />
        <HostProfileCard />
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="elevated">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {icon && <span className="text-primary-600 dark:text-primary-400">{icon}</span>}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Card>
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

function PhotoUpload({ onUpload }: { onUpload: (file: File) => void }) {
  return (
    <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm text-zinc-600 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-primary-700 dark:hover:bg-zinc-800">
      <Upload className="h-4 w-4" />
      Upload photo
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
        className="hidden"
      />
    </label>
  );
}

function ExpertProfileCard() {
  const { data: profile, isLoading, isError, error: queryError } = useQuery({
    queryKey: ["my-expert-profile"],
    queryFn: () => apiClient.get<LocalExpertProfile>("/api/v1/partners/profiles/expert", { auth: true }),
    retry: false,
  });

  const notEligible = isError && queryError instanceof ApiError && queryError.status === 403;
  const otherError = isError && !notEligible;

  return (
    <Section title="Local Expert Profile" icon={<UserRound className="h-4 w-4" />}>
      {isLoading && <Spinner />}
      {notEligible && <p className="text-sm text-zinc-500">You need an approved Local Expert role to set this up.</p>}
      {otherError && <ErrorState message="Couldn't load your expert profile. Try signing out and back in." />}
      {!isLoading && !notEligible && !otherError && (
        <ExpertProfileForm key={profile?.id ?? "new"} profile={profile ?? null} />
      )}
    </Section>
  );
}

function ExpertProfileForm({ profile }: { profile: LocalExpertProfile | null }) {
  const queryClient = useQueryClient();
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [yearsExperience, setYearsExperience] = useState<number | "">(profile?.years_experience ?? "");
  const [languages, setLanguages] = useState((profile?.languages ?? []).join(", "));
  const [secondaryDestinations, setSecondaryDestinations] = useState((profile?.secondary_destinations ?? []).join(", "));
  const [expertiseCategories, setExpertiseCategories] = useState((profile?.expertise_categories ?? []).join(", "));
  const [emergencyReady, setEmergencyReady] = useState(profile?.emergency_handling_capability ?? true);
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergency_contact_number ?? "");
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
        {
          headline,
          bio,
          years_experience: yearsExperience || null,
          languages: languages ? languages.split(",").map((s) => s.trim()).filter(Boolean) : [],
          secondary_destinations: secondaryDestinations ? secondaryDestinations.split(",").map((s) => s.trim()).filter(Boolean) : [],
          expertise_categories: expertiseCategories ? expertiseCategories.split(",").map((s) => s.trim()).filter(Boolean) : [],
          emergency_handling_capability: emergencyReady,
          emergency_contact_number: emergencyPhone || null,
          is_published: isPublished,
        },
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
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {profile?.has_photo && (
            <ProfilePhoto src={`/api/v1/partners/profiles/expert/${profile.partner_role_id}/photo/file`} alt="Profile photo" />
          )}
          <PhotoUpload onUpload={uploadPhoto} />
        </div>
        {profile?.partner_role_id && profile.is_published && (
          <Link
            href={`/experts/${profile.partner_role_id}`}
            target="_blank"
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            View Public Profile ↗
          </Link>
        )}
      </div>

      <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (e.g. Certified Sreemangal Trekking Expert)" />
      <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Professional Bio & Local Experience" rows={3} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          type="number"
          min={0}
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value ? Number(e.target.value) : "")}
          placeholder="Years of experience"
        />
        <Input
          value={languages}
          onChange={(e) => setLanguages(e.target.value)}
          placeholder="Languages (e.g. Bengali, English, Sylheti)"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          value={secondaryDestinations}
          onChange={(e) => setSecondaryDestinations(e.target.value)}
          placeholder="Operating areas (e.g. Sreemangal, Lawachara, Ratargul)"
        />
        <Input
          value={expertiseCategories}
          onChange={(e) => setExpertiseCategories(e.target.value)}
          placeholder="Specialties (e.g. Trekking, Bird Watching, Cultural)"
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/30">
        <label className="flex items-center gap-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <Switch checked={emergencyReady} onChange={setEmergencyReady} label="First Aid & Emergency Certified" />
          First Aid & Emergency Response Capability
        </label>
        <div className="mt-2.5">
          <Input
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
            placeholder="Emergency contact phone (e.g. +880 1711 000000)"
          />
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
        <Switch checked={isPublished} onChange={setIsPublished} label="Published (visible in public directory and search)" />
        Publish profile to travelers
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={save} loading={saving} className="self-start">
        {saving ? "Saving…" : "Save Profile"}
      </Button>
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
  const otherError = isError && !notEligible;

  return (
    <Section title="Host Profile" icon={<Building2 className="h-4 w-4" />}>
      {isLoading && <Spinner />}
      {notEligible && <p className="text-sm text-zinc-500">You need an approved Host or Hotel role to set this up.</p>}
      {otherError && <ErrorState message="Couldn't load your host profile. Try signing out and back in." />}
      {!isLoading && !notEligible && !otherError && (
        <HostProfileForm key={profile?.id ?? "new"} profile={profile ?? null} />
      )}
    </Section>
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {profile?.has_photo && (
          <ProfilePhoto src={`/api/v1/partners/profiles/host/${profile.partner_role_id}/photo/file`} alt="Profile photo" />
        )}
        <PhotoUpload onUpload={uploadPhoto} />
      </div>

      <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name" />
      <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio" rows={3} />
      <label className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
        <Switch checked={isPublished} onChange={setIsPublished} label="Published (visible in search)" />
        Published (visible in search)
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={save} loading={saving} className="self-start">
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
