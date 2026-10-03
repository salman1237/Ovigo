"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Globe2,
  HeartHandshake,
  Languages,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { tourImageUrl } from "@/lib/media";
import type { PublicLocalExpertProfile } from "@/types/profile";
import { TOUR_TYPE_LABELS } from "@/types/tour";

export default function ExpertPublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [reported, setReported] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const { data: expert, isLoading, error } = useQuery({
    queryKey: ["public-expert", id],
    queryFn: () => apiClient.get<PublicLocalExpertProfile>(`/api/v1/partners/profiles/expert/${id}/public`),
    retry: false,
  });

  const submitReport = async () => {
    setReportError(null);
    if (reportReason.trim().length < 10) {
      setReportError("Please describe the issue in at least 10 characters.");
      return;
    }
    setReportBusy(true);
    try {
      await apiClient.post(`/api/v1/partners/profiles/expert/${id}/report`, { reason: reportReason.trim() }, { auth: true });
      setReported(true);
      setTimeout(() => setShowReportModal(false), 2000);
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : "Failed to submit report");
    } finally {
      setReportBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (error || !expert) {
    return <ErrorState message="Local Expert profile not found or is currently private." />;
  }

  return (
    <div className="relative min-h-screen pb-20">
      {/* Background ambient gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b from-primary-100/60 via-primary-50/20 to-transparent dark:from-primary-950/40 dark:via-primary-950/10" />

      <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/80 p-6 shadow-xl backdrop-blur-md sm:p-8 dark:border-zinc-800 dark:bg-zinc-900/80"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
            {/* Expert Avatar / Photo */}
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-primary-500/30 bg-primary-100 shadow-md sm:h-36 sm:w-36 dark:bg-zinc-800">
              {expert.has_photo && expert.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={expert.photo_url}
                  alt={expert.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-primary-700 dark:text-primary-300">
                  {expert.name.charAt(0)}
                </div>
              )}
              {expert.security_verification_status === "verified" && (
                <div className="absolute bottom-2 right-2 rounded-full bg-emerald-500 p-1 text-white shadow" title="Verified Identity & Police Checked">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              )}
            </div>

            {/* Profile Info & Badges */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="accent" className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {expert.badge_level || "Verified Local Expert"}
                    </Badge>
                    {expert.emergency_handling_capability && (
                      <Badge variant="success" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        First-Aid & Emergency Ready
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">{expert.name}</h1>
                  {expert.headline && (
                    <p className="mt-1 text-lg font-medium text-primary-700 dark:text-primary-300">{expert.headline}</p>
                  )}
                </div>

                {/* Primary CTA Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link href={`/custom-requests?expert_id=${expert.partner_role_id}`}>
                    <Button variant="primary">
                      <HeartHandshake className="h-4 w-4" />
                      Request Custom Tour
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400 hover:text-red-600"
                    onClick={() => {
                      setReported(false);
                      setReportReason("");
                      setReportError(null);
                      setShowReportModal(true);
                    }}
                    title="Report profile"
                  >
                    <Flag className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Bio */}
              {expert.bio && (
                <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-300">
                  {expert.bio}
                </p>
              )}

              {/* Languages & Experience tags */}
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                {expert.years_experience !== null && expert.years_experience > 0 && (
                  <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-200">
                    <Award className="h-4 w-4 text-primary-600" />
                    {expert.years_experience}+ Years Experience
                  </span>
                )}
                {expert.languages && expert.languages.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Languages className="h-4 w-4 text-primary-600" />
                    {expert.languages.join(", ")}
                  </span>
                )}
                {expert.primary_destination && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary-600" />
                    Based in {expert.primary_destination}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Performance Stats Strip (PRD Section 8.2) */}
          <div className="mt-8 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-6 sm:grid-cols-3 lg:grid-cols-6 dark:border-zinc-800">
            <div className="rounded-xl bg-zinc-50/80 p-3 text-center dark:bg-zinc-800/50">
              <div className="flex items-center justify-center gap-1 text-amber-500">
                <Star className="h-4 w-4 fill-amber-400" />
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {Number(expert.rating_avg).toFixed(1)}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">{expert.reviews_count} reviews</div>
            </div>

            <div className="rounded-xl bg-zinc-50/80 p-3 text-center dark:bg-zinc-800/50">
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{expert.total_tours_conducted}</div>
              <div className="mt-0.5 text-xs text-zinc-500">Tours Conducted</div>
            </div>

            <div className="rounded-xl bg-zinc-50/80 p-3 text-center dark:bg-zinc-800/50">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {expert.response_rate_percent}%
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">Response Rate</div>
            </div>

            <div className="rounded-xl bg-zinc-50/80 p-3 text-center dark:bg-zinc-800/50">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {expert.completion_rate_percent}%
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">Completion Rate</div>
            </div>

            <div className="rounded-xl bg-zinc-50/80 p-3 text-center dark:bg-zinc-800/50">
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {expert.cancellation_rate_percent}%
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">Cancellation Rate</div>
            </div>

            <div className="rounded-xl bg-zinc-50/80 p-3 text-center dark:bg-zinc-800/50">
              <div className="text-lg font-bold capitalize text-primary-600 dark:text-primary-400">
                {expert.security_verification_status}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">Identity Status</div>
            </div>
          </div>
        </motion.div>

        {/* Operating Destinations & Expertise Categories */}
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Operating Destinations */}
          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              <Globe2 className="h-4 w-4 text-primary-600" />
              Operating Destinations
            </h3>
            <p className="mt-1 text-xs text-zinc-500">Regions and areas where this expert guides and operates tours.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {expert.primary_destination && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800 dark:border-primary-900 dark:bg-primary-950/60 dark:text-primary-300">
                  <MapPin className="h-3 w-3" />
                  {expert.primary_destination} (Hub)
                </span>
              )}
              {expert.secondary_destinations && expert.secondary_destinations.map((dest, i) => (
                <span
                  key={i}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {dest}
                </span>
              ))}
              {!expert.primary_destination && (!expert.secondary_destinations || expert.secondary_destinations.length === 0) && (
                <span className="text-xs text-zinc-500">Bangladesh Nationwide</span>
              )}
            </div>
          </Card>

          {/* Expertise Categories */}
          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              <Sparkles className="h-4 w-4 text-primary-600" />
              Specialties & Expertise
            </h3>
            <p className="mt-1 text-xs text-zinc-500">Niche domains and tour styles handled by this expert.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {expert.expertise_categories && expert.expertise_categories.length > 0 ? (
                expert.expertise_categories.map((cat, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-accent-200 bg-accent-50 px-3 py-1 text-xs font-medium text-accent-800 dark:border-accent-900/50 dark:bg-accent-950/40 dark:text-accent-300"
                  >
                    {cat}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-500">Cultural tours, Nature trekking, Family excursions</span>
              )}
            </div>
          </Card>
        </div>

        {/* Published & Upcoming Tours Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Published Tours</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Verified travel packages designed and guided by {expert.name}.
              </p>
            </div>
            <span className="text-sm font-medium text-zinc-500">{expert.tours.length} available</span>
          </div>

          {expert.tours.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <p className="text-sm text-zinc-500">No active scheduled tours right now.</p>
              <Link href={`/custom-requests?expert_id=${expert.partner_role_id}`} className="mt-3 inline-block">
                <Button variant="secondary" size="sm">
                  Request a Private Custom Itinerary
                </Button>
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {expert.tours.map((tour) => (
                <Card key={tour.id} className="group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  {/* Tour Image */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    {tour.images && tour.images.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tourImageUrl(tour.id, tour.images[0].id)}
                        alt={tour.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">
                        No photo
                      </div>
                    )}
                    {tour.tour_type && (
                      <div className="absolute left-3 top-3">
                        <Badge variant="accent">
                          {TOUR_TYPE_LABELS[tour.tour_type] || tour.tour_type}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Tour Content */}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="line-clamp-2 text-lg font-bold text-zinc-900 group-hover:text-primary-600 dark:text-zinc-50 dark:group-hover:text-primary-400">
                      {tour.title}
                    </h3>

                    {tour.short_summary && (
                      <p className="mt-2 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {tour.short_summary}
                      </p>
                    )}

                    <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {tour.duration_days} day{tour.duration_days === 1 ? "" : "s"}
                      </span>
                      {tour.pickup_location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3.5 w-3.5" />
                          {tour.pickup_location}
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
                      <div>
                        <span className="text-xs text-zinc-500">From</span>
                        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                          {formatMoney(tour.base_price)}
                        </div>
                      </div>
                      <Link href={`/tours/${tour.id}`}>
                        <Button size="sm" variant="secondary">
                          View Tour
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Report Local Expert Profile</h3>
            <p className="mt-2 text-xs text-zinc-500">
              If you suspect policy violations, fraudulent listings, or unsafe practices, let our Trust & Safety team know.
            </p>
            {reported ? (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Thank you. Your report has been submitted to the Ovigo Trust & Safety moderation desk.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <textarea
                  rows={3}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the issue or policy violation..."
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                {reportError && <p className="text-xs text-red-600">{reportError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowReportModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" size="sm" onClick={submitReport} loading={reportBusy}>
                    Submit Report
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
