"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { Addon, BID_STATUS_LABELS, CustomTourRequest, ItineraryDay, RequestQuestion, TourBid } from "@/types/bidding";

type Tab = "eligible" | "mine";

export default function ExpertBidsPage() {
  const [tab, setTab] = useState<Tab>("eligible");
  const queryClient = useQueryClient();

  const { data: eligible, isLoading: eligibleLoading, isError: eligibleError, error: eligibleErr } = useQuery({
    queryKey: ["bids", "eligible-requests"],
    queryFn: () => apiClient.get<CustomTourRequest[]>("/api/v1/bids/eligible-requests", { auth: true }),
    retry: false,
  });

  const { data: myBids, isLoading: myBidsLoading } = useQuery({
    queryKey: ["bids", "mine"],
    queryFn: () => apiClient.get<TourBid[]>("/api/v1/bids/mine", { auth: true }),
    retry: false,
    enabled: tab === "mine",
  });

  const notEligibleRole = eligibleError && eligibleErr instanceof ApiError && eligibleErr.status === 403;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["bids"] });

  if (notEligibleRole) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Custom Tour Bids</h1>
        <p className="mt-4 text-sm text-zinc-500">
          This is for approved Local Experts only. Apply to become one from &quot;Become a Partner&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Custom Tour Bids</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Requests here are filtered to destinations you&apos;re tagged for.
      </p>

      <div className="mt-4 flex gap-2">
        {(["eligible", "mine"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t === "eligible" ? "Open requests" : "My bids"}
          </button>
        ))}
      </div>

      {tab === "eligible" && (
        <div className="mt-6 flex flex-col gap-4">
          {eligibleLoading && <Spinner />}
          {!eligibleLoading && (eligible ?? []).length === 0 && (
            <EmptyState title="No open requests" description="No requests match your tagged destinations right now." />
          )}
          {(eligible ?? []).map((r) => (
            <RequestCard key={r.id} request={r} onBidSubmitted={refetch} />
          ))}
        </div>
      )}

      {tab === "mine" && (
        <div className="mt-6 flex flex-col gap-3">
          {myBidsLoading && <Spinner />}
          {!myBidsLoading && (myBids ?? []).length === 0 && (
            <EmptyState title="No bids yet" description="You haven't placed any bids yet." />
          )}
          {(myBids ?? []).map((bid) => (
            <MyBidCard key={bid.id} bid={bid} onChange={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

const emptyBidForm = {
  price: "",
  message: "",
  stayName: "",
  transportDetails: "",
  foodMenu: "",
  includedServices: "",
  excludedServices: "",
  taxAmount: "",
  depositAmount: "",
  cancellationTerms: "",
  validUntil: "",
};

function RequestCard({ request, onBidSubmitted }: { request: CustomTourRequest; onBidSubmitted: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [questionBusy, setQuestionBusy] = useState(false);
  const [form, setForm] = useState(emptyBidForm);
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([{ day_number: 1, title: "", description: "" }]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: myQuestions } = useQuery({
    queryKey: ["bids", "questions", "mine", request.id],
    queryFn: () => apiClient.get<RequestQuestion[]>(`/api/v1/custom-requests/${request.id}/questions/mine`, { auth: true }),
  });

  const addDay = () =>
    setItinerary((days) => [...days, { day_number: days.length + 1, title: "", description: "" }]);

  const updateDay = (index: number, field: "title" | "description", value: string) =>
    setItinerary((days) => days.map((d, i) => (i === index ? { ...d, [field]: value } : d)));

  const addAddon = () => setAddons((prev) => [...prev, { name: "", price: "" }]);
  const updateAddon = (index: number, field: keyof Addon, value: string) =>
    setAddons((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));

  const submit = async () => {
    setError(null);
    if (!form.price || itinerary.some((d) => !d.title.trim())) {
      setError("Add a price and a title for every itinerary day.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        `/api/v1/custom-requests/${request.id}/bids`,
        {
          price: form.price,
          message: form.message || undefined,
          itinerary,
          stay_name: form.stayName || undefined,
          transport_details: form.transportDetails || undefined,
          food_menu: form.foodMenu || undefined,
          included_services: form.includedServices || undefined,
          excluded_services: form.excludedServices || undefined,
          addons: addons.filter((a) => a.name.trim() && a.price.trim()),
          tax_amount: form.taxAmount || undefined,
          deposit_amount: form.depositAmount || undefined,
          cancellation_terms: form.cancellationTerms || undefined,
          valid_until: form.validUntil || undefined,
        },
        { auth: true }
      );
      setShowForm(false);
      onBidSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit bid");
    } finally {
      setBusy(false);
    }
  };

  const askQuestion = async () => {
    setQuestionError(null);
    setQuestionBusy(true);
    try {
      await apiClient.post(`/api/v1/custom-requests/${request.id}/questions`, { question: questionText }, { auth: true });
      setQuestionText("");
      setShowQuestion(false);
    } catch (err) {
      setQuestionError(err instanceof ApiError ? err.message : "Failed to ask question");
    } finally {
      setQuestionBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{request.title}</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{request.description}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {request.start_date} → {request.end_date} · {request.adults} adult{request.adults === 1 ? "" : "s"}
        {request.children > 0 ? `, ${request.children} child${request.children === 1 ? "" : "ren"}` : ""}
        {request.infants > 0 ? `, ${request.infants} infant${request.infants === 1 ? "" : "s"}` : ""}
        {request.budget_min && request.budget_max && (
          <> · Budget: {formatMoney(request.budget_min)} – {formatMoney(request.budget_max)}</>
        )}
        {request.bid_deadline && <> · Bids close {request.bid_deadline}</>}
      </p>
      {(request.pickup_location || request.food_preference || request.accessibility_needs || request.guide_requested) && (
        <p className="mt-1 text-xs text-zinc-400">
          {request.pickup_location && <>Pickup: {request.pickup_location} · </>}
          {request.food_preference && <>Food: {request.food_preference} · </>}
          {request.accessibility_needs && <>Accessibility: {request.accessibility_needs} · </>}
          {request.guide_requested && <>Guide requested</>}
        </p>
      )}

      {(myQuestions ?? []).length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-800">
          {(myQuestions ?? []).map((q) => (
            <p key={q.id}>
              <span className="text-zinc-500">Q: {q.question}</span>
              {q.answer ? (
                <span className="block text-primary-600 dark:text-primary-400">A: {q.answer}</span>
              ) : (
                <span className="block text-zinc-400">Awaiting an answer…</span>
              )}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {!showForm && (
          <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
            Place a bid
          </Button>
        )}
        {!showQuestion && (
          <Button size="sm" variant="ghost" onClick={() => setShowQuestion(true)}>
            Ask a question
          </Button>
        )}
      </div>

      {showQuestion && (
        <div className="mt-3 flex gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <Input value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Ask the traveler something…" className="flex-1" />
          <Button size="sm" onClick={askQuestion} loading={questionBusy} disabled={!questionText.trim()}>
            Send
          </Button>
        </div>
      )}
      {questionError && <p className="mt-1 text-xs text-red-600">{questionError}</p>}

      {showForm && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="Your price (৳)" />
            <Input type="date" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} placeholder="Bid valid until" />
          </div>
          <Textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Message to the traveler (optional)" rows={2} />

          <p className="text-xs font-medium text-zinc-500">Itinerary</p>
          {itinerary.map((day, i) => (
            <div key={i} className="flex gap-2">
              <span className="mt-2 text-xs text-zinc-400">Day {day.day_number}</span>
              <Input value={day.title} onChange={(e) => updateDay(i, "title", e.target.value)} placeholder="Title" className="flex-1" />
              <Input value={day.description ?? ""} onChange={(e) => updateDay(i, "description", e.target.value)} placeholder="Details (optional)" className="flex-1" />
            </div>
          ))}
          <button onClick={addDay} type="button" className="self-start text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            + Add another day
          </button>

          <div className="grid grid-cols-3 gap-2">
            <Input value={form.stayName} onChange={(e) => setForm((f) => ({ ...f, stayName: e.target.value }))} placeholder="Stay name" />
            <Input value={form.transportDetails} onChange={(e) => setForm((f) => ({ ...f, transportDetails: e.target.value }))} placeholder="Transport details" />
            <Input value={form.foodMenu} onChange={(e) => setForm((f) => ({ ...f, foodMenu: e.target.value }))} placeholder="Food menu" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={form.includedServices} onChange={(e) => setForm((f) => ({ ...f, includedServices: e.target.value }))} placeholder="Included services" />
            <Input value={form.excludedServices} onChange={(e) => setForm((f) => ({ ...f, excludedServices: e.target.value }))} placeholder="Excluded services" />
          </div>

          <p className="text-xs font-medium text-zinc-500">Add-ons</p>
          {addons.map((a, i) => (
            <div key={i} className="flex gap-2">
              <Input value={a.name} onChange={(e) => updateAddon(i, "name", e.target.value)} placeholder="Add-on name" className="flex-1" />
              <Input value={a.price} onChange={(e) => updateAddon(i, "price", e.target.value)} placeholder="Price" className="w-28" />
            </div>
          ))}
          <button onClick={addAddon} type="button" className="self-start text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            + Add an add-on
          </button>

          <div className="grid grid-cols-2 gap-2">
            <Input value={form.taxAmount} onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))} placeholder="Tax amount (৳)" />
            <Input value={form.depositAmount} onChange={(e) => setForm((f) => ({ ...f, depositAmount: e.target.value }))} placeholder="Deposit amount (৳)" />
          </div>
          <Textarea value={form.cancellationTerms} onChange={(e) => setForm((f) => ({ ...f, cancellationTerms: e.target.value }))} placeholder="Cancellation terms" rows={2} />

          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} loading={busy}>
              Submit bid
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function MyBidCard({ bid, onChange }: { bid: TourBid; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(bid.price);
  const [message, setMessage] = useState(bid.message ?? "");

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/bids/${bid.id}/withdraw`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to withdraw");
    } finally {
      setBusy(false);
    }
  };

  const revise = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.put(`/api/v1/bids/${bid.id}`, { price, message: message || undefined }, { auth: true });
      setEditing(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revise bid");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant={bid.is_shortlisted ? "elevated" : "flat"}>
      <div className="flex items-center justify-between">
        {editing ? (
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-32" />
        ) : (
          <span className="text-lg font-semibold text-primary-600 dark:text-primary-400">{formatMoney(bid.price)}</span>
        )}
        <span className="text-xs capitalize text-zinc-500">
          {BID_STATUS_LABELS[bid.status]}
          {bid.is_shortlisted && " · Shortlisted"}
        </span>
      </div>
      {editing ? (
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="mt-2" />
      ) : (
        bid.message && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{bid.message}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {bid.status === "pending" && (
        <div className="mt-2 flex gap-2">
          {editing ? (
            <>
              <Button size="sm" onClick={revise} loading={busy}>
                Save revision
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Revise
              </Button>
              <Button size="sm" variant="destructive" onClick={withdraw} loading={busy}>
                Withdraw
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
