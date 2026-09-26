"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { cmsBannerImageUrl, cmsHeroImageUrl, cmsTileImageUrl } from "@/lib/media";
import type { CategoryTile, FeaturedListing, HomepageSettings } from "@/types/cms";

interface AdminListingOption {
  id: string;
  label: string;
}

export default function AdminCmsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Homepage</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Everything shown on the public homepage — text, images, which listings are featured, and the category
          tiles — is editable here. Changes go live immediately, no redeploy needed.
        </p>
      </div>
      <SettingsSection />
      <HeroImageSection />
      <BannerImageSection />
      <FeaturedSection entityType="tour" title="Featured tours" endpoint="/api/v1/admin/tours" labelField="title" />
      <FeaturedSection entityType="property" title="Featured stays" endpoint="/api/v1/admin/properties" labelField="name" />
      <TilesSection />
    </div>
  );
}

function SettingsSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-cms", "settings"],
    queryFn: () => apiClient.get<HomepageSettings>("/api/v1/admin/cms/homepage", { auth: true }),
  });

  const [form, setForm] = useState<HomepageSettings | null>(null);
  const current = form ?? settings;

  const field = (key: keyof HomepageSettings) => ({
    value: (current?.[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...(current as HomepageSettings), [key]: e.target.value }),
  });

  const save = async () => {
    if (!form) return;
    setError(null);
    setSaved(false);
    try {
      await apiClient.put("/api/v1/admin/cms/homepage", form, { auth: true });
      queryClient.invalidateQueries({ queryKey: ["admin-cms", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  if (isLoading || !current) return <Spinner />;

  return (
    <Card>
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Text content</h2>
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Hero</p>
          <div className="flex flex-col gap-3">
            <Input label="Badge text" {...field("hero_badge_text")} />
            <Input label="Headline" {...field("hero_headline")} />
            <Textarea label="Subheadline" rows={2} {...field("hero_subheadline")} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Section headings</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Destinations heading" {...field("destinations_heading")} />
            <Input label="Destinations subheading" {...field("destinations_subheading")} />
            <Input label="Tours heading" {...field("tours_heading")} />
            <Input label="Tours subheading" {...field("tours_subheading")} />
            <Input label="Stays heading" {...field("stays_heading")} />
            <Input label="Stays subheading" {...field("stays_subheading")} />
            <Input label="Category heading" {...field("category_heading")} />
            <Input label="Category subheading" {...field("category_subheading")} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Promo banner</p>
          <div className="flex flex-col gap-3">
            <Input label="Heading" {...field("banner_heading")} />
            <Textarea label="Text" rows={2} {...field("banner_text")} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Button label" {...field("banner_cta_label")} />
              <Input label="Button link" {...field("banner_cta_link")} />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={!form}>
          Save changes
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function HeroImageSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["admin-cms", "settings"],
    queryFn: () => apiClient.get<HomepageSettings>("/api/v1/admin/cms/homepage", { auth: true }),
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-cms", "settings"] });
    queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] });
  };

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiClient.postForm("/api/v1/admin/cms/homepage/hero-image", formData, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clear = async () => {
    await apiClient.delete("/api/v1/admin/cms/homepage/hero-image", { auth: true });
    refetch();
  };

  return (
    <Card>
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Hero background image</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Falls back to the top destination&apos;s photo automatically when nothing is set here.
      </p>
      {settings?.has_hero_image && (
        <div className="mt-3 h-40 w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cmsHeroImageUrl(new Date(settings.updated_at).getTime())} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          className="text-xs"
        />
        {uploading && <Spinner />}
        {settings?.has_hero_image && (
          <Button size="sm" variant="ghost" onClick={clear}>
            Remove
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function BannerImageSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["admin-cms", "settings"],
    queryFn: () => apiClient.get<HomepageSettings>("/api/v1/admin/cms/homepage", { auth: true }),
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-cms", "settings"] });
    queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] });
  };

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiClient.postForm("/api/v1/admin/cms/homepage/banner-image", formData, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clear = async () => {
    await apiClient.delete("/api/v1/admin/cms/homepage/banner-image", { auth: true });
    refetch();
  };

  return (
    <Card>
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Promo banner image</h2>
      <p className="mt-1 text-xs text-zinc-500">Falls back to a plain color gradient when nothing is set here.</p>
      {settings?.has_banner_image && (
        <div className="mt-3 h-32 w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cmsBannerImageUrl(new Date(settings.updated_at).getTime())} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          className="text-xs"
        />
        {uploading && <Spinner />}
        {settings?.has_banner_image && (
          <Button size="sm" variant="ghost" onClick={clear}>
            Remove
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function FeaturedSection({
  entityType,
  title,
  endpoint,
  labelField,
}: {
  entityType: "tour" | "property";
  title: string;
  endpoint: string;
  labelField: "title" | "name";
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState("");

  const { data: featured, isLoading } = useQuery({
    queryKey: ["admin-cms", "featured", entityType],
    queryFn: () => apiClient.get<FeaturedListing[]>(`/api/v1/admin/cms/homepage/featured?entity_type=${entityType}`, { auth: true }),
  });

  const { data: allListings } = useQuery({
    queryKey: ["admin-cms", "listing-options", entityType],
    queryFn: async () => {
      const rows = await apiClient.get<Record<string, unknown>[]>(`${endpoint}?status=published`, { auth: true });
      return rows.map((r) => ({ id: r.id as string, label: r[labelField] as string })) as AdminListingOption[];
    },
  });

  const save = async (entityIds: string[]) => {
    setError(null);
    try {
      await apiClient.put(
        `/api/v1/admin/cms/homepage/featured?entity_type=${entityType}`,
        { entity_ids: entityIds },
        { auth: true }
      );
      queryClient.invalidateQueries({ queryKey: ["admin-cms", "featured", entityType] });
      queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  const addOne = () => {
    if (!pickerValue) return;
    const current = (featured ?? []).map((f) => f.entity_id);
    if (!current.includes(pickerValue)) save([...current, pickerValue]);
    setPickerValue("");
  };

  const remove = (id: string) => {
    save((featured ?? []).map((f) => f.entity_id).filter((eid) => eid !== id));
  };

  const move = (index: number, direction: -1 | 1) => {
    const ids = (featured ?? []).map((f) => f.entity_id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    save(ids);
  };

  const availableOptions = (allListings ?? []).filter((o) => !(featured ?? []).some((f) => f.entity_id === o.id));

  return (
    <Card>
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Pin specific listings in a specific order. With none pinned, the homepage shows the first few published
        listings automatically.
      </p>

      {isLoading && <Spinner />}

      <div className="mt-3 flex flex-col gap-2">
        {(featured ?? []).map((f, i) => (
          <div key={f.entity_id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            <span>{f.title}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200">
                ↑
              </button>
              <button onClick={() => move(i, 1)} disabled={i === (featured?.length ?? 0) - 1} className="px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200">
                ↓
              </button>
              <button onClick={() => remove(f.entity_id)} className="ml-2 text-xs font-medium text-red-600 hover:text-red-700">
                Remove
              </button>
            </div>
          </div>
        ))}
        {(featured ?? []).length === 0 && <p className="text-xs text-zinc-400">Nothing pinned — showing automatic selection.</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <Select value={pickerValue} onChange={(e) => setPickerValue(e.target.value)} className="flex-1">
          <option value="">Pin a listing…</option>
          {availableOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={addOne} disabled={!pickerValue}>
          Add
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function TilesSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newLink, setNewLink] = useState("");

  const { data: tiles, isLoading } = useQuery({
    queryKey: ["admin-cms", "tiles"],
    queryFn: () => apiClient.get<CategoryTile[]>("/api/v1/admin/cms/homepage/tiles", { auth: true }),
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-cms", "tiles"] });
    queryClient.invalidateQueries({ queryKey: ["cms", "homepage"] });
  };

  const createTile = async () => {
    if (!newTitle.trim() || !newLink.trim()) return;
    setError(null);
    try {
      await apiClient.post("/api/v1/admin/cms/homepage/tiles", { title: newTitle, link: newLink }, { auth: true });
      setNewTitle("");
      setNewLink("");
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create tile");
    }
  };

  const reorder = async (tileIds: string[]) => {
    await apiClient.put("/api/v1/admin/cms/homepage/tiles/reorder", { tile_ids: tileIds }, { auth: true });
    refetch();
  };

  const move = (index: number, direction: -1 | 1) => {
    const ids = (tiles ?? []).map((t) => t.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder(ids);
  };

  const removeTile = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/cms/homepage/tiles/${id}`, { auth: true });
    refetch();
  };

  return (
    <Card>
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Category tiles</h2>
      <p className="mt-1 text-xs text-zinc-500">
        The &quot;Explore by category&quot; grid — add, edit, reorder, or remove tiles freely. Upload an image or
        leave it blank to use a color gradient.
      </p>

      {isLoading && <Spinner />}

      <div className="mt-3 flex flex-col gap-3">
        {(tiles ?? []).map((tile, i) => (
          <TileRow key={tile.id} tile={tile} onChange={refetch} onMove={(dir) => move(i, dir)} onRemove={() => removeTile(tile.id)} isFirst={i === 0} isLast={i === (tiles?.length ?? 0) - 1} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <Input label="New tile title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-48" />
        <Input label="Link (e.g. /tours)" value={newLink} onChange={(e) => setNewLink(e.target.value)} className="w-48" />
        <Button size="sm" variant="secondary" onClick={createTile} disabled={!newTitle.trim() || !newLink.trim()}>
          Add tile
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function TileRow({
  tile,
  onChange,
  onMove,
  onRemove,
  isFirst,
  isLast,
}: {
  tile: CategoryTile;
  onChange: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(tile.title);
  const [subtitle, setSubtitle] = useState(tile.subtitle ?? "");
  const [link, setLink] = useState(tile.link);
  const [gradientFrom, setGradientFrom] = useState(tile.gradient_from);
  const [gradientTo, setGradientTo] = useState(tile.gradient_to);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    setError(null);
    try {
      await apiClient.put(
        `/api/v1/admin/cms/homepage/tiles/${tile.id}`,
        { title, subtitle: subtitle || null, link, gradient_from: gradientFrom, gradient_to: gradientTo },
        { auth: true }
      );
      setEditing(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  const toggleActive = async () => {
    await apiClient.put(`/api/v1/admin/cms/homepage/tiles/${tile.id}`, { is_active: !tile.is_active }, { auth: true });
    onChange();
  };

  const uploadImage = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiClient.postForm(`/api/v1/admin/cms/homepage/tiles/${tile.id}/image`, formData, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
            {tile.has_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cmsTileImageUrl(tile.id, new Date(tile.updated_at).getTime())} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${tile.gradient_from}, ${tile.gradient_to})` }} />
            )}
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {tile.title} {!tile.is_active && <Badge variant="neutral">Hidden</Badge>}
            </p>
            <p className="text-xs text-zinc-500">{tile.subtitle} · {tile.link}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onMove(-1)} disabled={isFirst} className="px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200">
            ↑
          </button>
          <button onClick={() => onMove(1)} disabled={isLast} className="px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200">
            ↓
          </button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((s) => !s)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleActive}>
            {tile.is_active ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="destructive" onClick={onRemove}>
            Delete
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input label="Subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            <Input label="Link" value={link} onChange={(e) => setLink(e.target.value)} />
            <div className="flex gap-2">
              <Input label="Gradient from" type="color" value={gradientFrom} onChange={(e) => setGradientFrom(e.target.value)} className="w-20" />
              <Input label="Gradient to" type="color" value={gradientTo} onChange={(e) => setGradientTo(e.target.value)} className="w-20" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
              }}
              className="text-xs"
            />
            {uploading && <Spinner />}
          </div>
          <div>
            <Button size="sm" onClick={save}>
              Save tile
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
