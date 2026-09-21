"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  BID_STATUS_LABELS,
  BidWithBooking,
  CustomTourRequest,
  REQUEST_STATUS_LABELS,
  RequestQuestion,
  TourBid,
} from "@/types/bidding";

export default function CustomRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);

  const { data: request, isLoading } = useQuery({
    queryKey: ["custom-requests", id],
    queryFn: () => apiClient.get<CustomTourRequest>(`/api/v1/custom-requests/${id}`, { auth: true }),
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["custom-requests", id, "bids"],
    queryFn: () => apiClient.get<TourBid[]>(`/api/v1/custom-requests/${id}/bids`, { auth: true }),
  });

  const { data: questions } = useQuery({
    queryKey: ["custom-requests", id, "questions"],
    queryFn: () => apiClient.get<RequestQuestion[]>(`/api/v1/custom-requests/${id}/questions`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["custom-requests", id] });

  const cancelRequest = async () => {
    setError(null);
    try {
      await apiClient.post(`/api/v1/custom-requests/${id}/cancel`, undefined, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    }
  };

  const acceptBid = async (bidId: string) => {
    setError(null);
    setBusyBidId(bidId);
    try {
      const result = await apiClient.post<BidWithBooking>(
        `/api/v1/custom-requests/${id}/bids/${bidId}/accept`,
        undefined,
        { auth: true }
      );
      router.push(`/bookings/${result.booking_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept bid");
      setBusyBidId(null);
    }
  };

  const toggleShortlist = async (bidId: string) => {
    setError(null);
    try {
      await apiClient.post(`/api/v1/custom-requests/${id}/bids/${bidId}/shortlist`, undefined, { auth: true });
      queryClient.invalidateQueries({ queryKey: ["custom-requests", id, "bids"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to shortlist");
    }
  };

  const answerQuestion = async (questionId: string, answer: string) => {
    setError(null);
    try {
      await apiClient.post(`/api/v1/custom-requests/${id}/questions/${questionId}/answer`, { answer }, { auth: true });
      queryClient.invalidateQueries({ queryKey: ["custom-requests", id, "questions"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to answer");
    }
  };

  if (isLoading || !request) return <Spinner />;

  const sortedBids = [...(bids ?? [])].sort((a, b) => Number(b.is_shortlisted) - Number(a.is_shortlisted));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{request.title}</h1>
        <Badge variant="primary">{REQUEST_STATUS_LABELS[request.status]}</Badge>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{request.description}</p>
      <p className="mt-2 text-xs text-zinc-500">
        {request.start_date} → {request.end_date} · {request.adults} adult{request.adults === 1 ? "" : "s"}
        {request.children > 0 ? `, ${request.children} child${request.children === 1 ? "" : "ren"}` : ""}
        {request.infants > 0 ? `, ${request.infants} infant${request.infants === 1 ? "" : "s"}` : ""}
        {request.budget_min && request.budget_max && (
          <> · Budget: {formatMoney(request.budget_min)} – {formatMoney(request.budget_max)}</>
        )}
        {request.bid_deadline && <> · Bids close {request.bid_deadline}</>}
      </p>

      {(request.pickup_location ||
        request.food_preference ||
        request.accessibility_needs ||
        request.safety_privacy_notes ||
        request.guide_requested ||
        request.special_occasion ||
        request.additional_notes) && (
        <Card className="mt-4 flex flex-col gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          {request.pickup_location && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Pickup: </span>{request.pickup_location}</p>}
          {request.food_preference && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Food: </span>{request.food_preference}</p>}
          {request.accessibility_needs && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Accessibility: </span>{request.accessibility_needs}</p>}
          {request.safety_privacy_notes && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Safety/privacy: </span>{request.safety_privacy_notes}</p>}
          {request.guide_requested && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Guide requested</span></p>}
          {request.special_occasion && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Occasion: </span>{request.special_occasion}</p>}
          {request.additional_notes && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Notes: </span>{request.additional_notes}</p>}
        </Card>
      )}

      {request.status === "open" && (
        <Button variant="destructive" size="sm" onClick={cancelRequest} className="mt-4">
          Cancel request
        </Button>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {(questions ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Questions from experts</h2>
          <div className="mt-3 flex flex-col gap-3">
            {(questions ?? []).map((q) => (
              <QuestionCard key={q.id} question={q} onAnswer={(answer) => answerQuestion(q.id, answer)} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Bids ({bids?.length ?? 0})
        </h2>
        {bidsLoading && <Spinner />}
        {!bidsLoading && (bids ?? []).length === 0 && (
          <div className="mt-2">
            <EmptyState title="No bids yet" description="Check back soon — local experts will bid on this request." />
          </div>
        )}
        <div className="mt-3 flex flex-col gap-3">
          {sortedBids.map((bid) => (
            <Card key={bid.id} variant={bid.is_shortlisted ? "elevated" : "flat"}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{bid.expert.full_name}</h3>
                <span className="text-lg font-semibold text-primary-600 dark:text-primary-400">
                  {formatMoney(bid.price)}
                </span>
              </div>
              {bid.message && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{bid.message}</p>}
              {bid.itinerary.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500">
                  {bid.itinerary.map((day) => (
                    <li key={day.day_number}>
                      <span className="font-medium">Day {day.day_number}:</span> {day.title}
                      {day.description && ` — ${day.description}`}
                    </li>
                  ))}
                </ul>
              )}
              {(bid.stay_name || bid.transport_details || bid.food_menu) && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500">
                  {bid.stay_name && <li><span className="font-medium text-zinc-600 dark:text-zinc-400">Stay: </span>{bid.stay_name}</li>}
                  {bid.transport_details && <li><span className="font-medium text-zinc-600 dark:text-zinc-400">Transport: </span>{bid.transport_details}</li>}
                  {bid.food_menu && <li><span className="font-medium text-zinc-600 dark:text-zinc-400">Food: </span>{bid.food_menu}</li>}
                </ul>
              )}
              {(bid.included_services || bid.excluded_services) && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  {bid.included_services && <p><span className="font-medium text-zinc-600 dark:text-zinc-400">Included: </span>{bid.included_services}</p>}
                  {bid.excluded_services && <p><span className="font-medium text-zinc-600 dark:text-zinc-400">Excluded: </span>{bid.excluded_services}</p>}
                </div>
              )}
              {bid.addons.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {bid.addons.map((a, i) => (
                    <li key={i} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {a.name} +{formatMoney(a.price)}
                    </li>
                  ))}
                </ul>
              )}
              {(bid.tax_amount || bid.deposit_amount || bid.cancellation_terms || bid.valid_until) && (
                <p className="mt-2 text-xs text-zinc-400">
                  {bid.tax_amount && <>+{formatMoney(bid.tax_amount)} tax</>}
                  {bid.deposit_amount && <> · {formatMoney(bid.deposit_amount)} deposit</>}
                  {bid.valid_until && <> · valid until {bid.valid_until}</>}
                  {bid.cancellation_terms && <> · {bid.cancellation_terms}</>}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs capitalize text-zinc-400">{BID_STATUS_LABELS[bid.status]}</span>
                <div className="flex items-center gap-2">
                  {bid.status === "pending" && request.status === "open" && (
                    <button
                      onClick={() => toggleShortlist(bid.id)}
                      aria-label={bid.is_shortlisted ? "Remove from shortlist" : "Shortlist"}
                      className="rounded-full p-1.5 text-zinc-400 hover:bg-accent-50 hover:text-accent-600 dark:hover:bg-accent-950/40"
                    >
                      <Star className={`h-4 w-4 ${bid.is_shortlisted ? "fill-accent-500 text-accent-500" : ""}`} />
                    </button>
                  )}
                  {bid.status === "pending" && request.status === "open" && (
                    <Button size="sm" onClick={() => acceptBid(bid.id)} loading={busyBidId === bid.id}>
                      Accept &amp; book
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ question, onAnswer }: { question: RequestQuestion; onAnswer: (answer: string) => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <Card>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        <span className="font-medium">{question.expert.full_name}: </span>
        {question.question}
      </p>
      {question.answer ? (
        <p className="mt-2 text-sm text-primary-600 dark:text-primary-400">
          <span className="font-medium">Your answer: </span>
          {question.answer}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type an answer…" className="flex-1" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onAnswer(answer);
              setAnswer("");
            }}
            disabled={!answer.trim()}
          >
            Answer
          </Button>
        </div>
      )}
    </Card>
  );
}
