"use client";

import { useQuery } from "@tanstack/react-query";
import { Apple, Check, Copy, Printer, Smartphone } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { ESIM_ORDER_STATUS_LABELS, type EsimOrder } from "@/types/esim";

const STALE_MS = 2 * 60 * 60 * 1000;

export default function EsimOrderDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <EsimOrderDetailContent />
    </Suspense>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function EsimOrderDetailContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const paymentResult = searchParams.get("payment");
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [startingAgain, setStartingAgain] = useState(false);
  // Lazy initializer — reads the clock exactly once per mount, not on every
  // render, keeping the render body itself pure (per React's rules of components).
  const [now] = useState(() => Date.now());

  const { data: order, isLoading } = useQuery({
    queryKey: ["esim", "order", id],
    queryFn: () => apiClient.get<EsimOrder>(`/api/v1/esim/orders/${id}`, { auth: true }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "paid" || status === "provisioning" ? 4000 : false;
    },
  });

  if (isLoading || !order) return <Spinner />;

  const isStale = order.status === "pending_payment" && now - new Date(order.created_at).getTime() > STALE_MS;

  const pay = async () => {
    setError(null);
    setPaying(true);
    try {
      const result = await apiClient.post<{ gateway_page_url: string }>(
        `/api/v1/esim/orders/${order.id}/pay`,
        undefined,
        { auth: true }
      );
      window.location.href = result.gateway_page_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start payment");
      setPaying(false);
    }
  };

  const startAgain = async () => {
    setError(null);
    setStartingAgain(true);
    try {
      const fresh = await apiClient.post<EsimOrder>(
        "/api/v1/esim/orders",
        { product_id: order.triptel_product_id, country_iso2: order.country_iso2 },
        { auth: true }
      );
      const result = await apiClient.post<{ gateway_page_url: string }>(
        `/api/v1/esim/orders/${fresh.id}/pay`,
        undefined,
        { auth: true }
      );
      window.location.href = result.gateway_page_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start a new order");
      setStartingAgain(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 print:py-0">
      {paymentResult === "success" && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 print:hidden">
          Payment successful! We&apos;re setting up your eSIM now.
        </p>
      )}
      {paymentResult === "failed" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300 print:hidden">
          Payment failed. You can try again below.
        </p>
      )}
      {paymentResult === "cancelled" && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300 print:hidden">
          Payment was cancelled.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{order.product_title}</h1>
        <Badge variant={order.status === "completed" ? "success" : order.status === "refund_pending" ? "warning" : "primary"}>
          {ESIM_ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {order.country_name} · {order.validity_days} days · {formatMoney(order.price_bdt)}{" "}
        <ApproxPrice amountBDT={order.price_bdt} />
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {order.status === "pending_payment" && (
        <Card className="mt-6">
          {isStale ? (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This order has expired. Start again to get a fresh order at current prices.
              </p>
              <Button className="mt-3" onClick={startAgain} loading={startingAgain}>
                Start again
              </Button>
            </>
          ) : (
            <Button onClick={pay} loading={paying}>
              Pay now
            </Button>
          )}
        </Card>
      )}

      {(order.status === "paid" || order.status === "provisioning") && (
        <Card className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
          <Spinner label="" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Setting up your eSIM — this usually takes under a minute.
          </p>
        </Card>
      )}

      {order.status === "completed" && (
        <div className="mt-6 flex flex-col gap-6 print:mt-2">
          <Card className="flex flex-col items-center gap-3 text-center">
            {order.qr_code_data && <QRCodeSVG value={order.qr_code_data} size={200} marginSize={2} />}
            <p className="text-xs text-zinc-500">Scan with the phone that will use the eSIM.</p>
          </Card>

          <div className="flex flex-wrap gap-3 print:hidden">
            {order.install_links?.ios && (
              <a
                href={order.install_links.ios}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-primary-600/20"
              >
                <Apple className="h-4 w-4" /> Install on iPhone
              </a>
            )}
            {order.install_links?.android && (
              <a
                href={order.install_links.android}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                <Smartphone className="h-4 w-4" /> Install on Android
              </a>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
            >
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
          </div>
          <p className="text-xs text-zinc-400 print:hidden">
            One-tap install links only work on the phone itself (iOS 17.4+, recent Android) — otherwise scan the QR
            code above.
          </p>

          <Card>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Manual installation details</h2>
            <div className="mt-3 flex flex-col gap-3 text-sm">
              {order.lpa_string && (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400">Activation code</p>
                    <p className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">{order.lpa_string}</p>
                  </div>
                  <CopyButton value={order.lpa_string} />
                </div>
              )}
              {order.smdp_address && (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-zinc-400">SM-DP+ address</p>
                    <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{order.smdp_address}</p>
                  </div>
                  <CopyButton value={order.smdp_address} />
                </div>
              )}
              {order.matching_id && (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-zinc-400">Activation code (manual entry)</p>
                    <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{order.matching_id}</p>
                  </div>
                  <CopyButton value={order.matching_id} />
                </div>
              )}
              {order.iccid && (
                <div>
                  <p className="text-xs text-zinc-400">ICCID</p>
                  <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{order.iccid}</p>
                </div>
              )}
              {order.triptel_order_no && (
                <div>
                  <p className="text-xs text-zinc-400">Order number</p>
                  <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{order.triptel_order_no}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="print:hidden">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">How to install</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">iPhone</p>
                <ol className="mt-1.5 list-inside list-decimal space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <li>Settings → Cellular → Add eSIM</li>
                  <li>Use QR Code, or tap the install link above</li>
                  <li>Follow the on-screen steps</li>
                  <li>Label it (e.g. &quot;Travel&quot;) and set as your data line</li>
                </ol>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Android</p>
                <ol className="mt-1.5 list-inside list-decimal space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <li>Settings → Network &amp; internet → SIMs → Add SIM</li>
                  <li>Scan the QR code, or tap the install link above</li>
                  <li>Follow the on-screen steps</li>
                  <li>Turn on data roaming for this eSIM line on arrival</li>
                </ol>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              Tip: install the eSIM before you travel while you still have Wi-Fi, but don&apos;t delete your primary
              SIM. Turn on data roaming for this line only once you land.
            </p>
          </Card>
        </div>
      )}

      {order.status === "refund_pending" && (
        <Card className="mt-6">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            We couldn&apos;t issue this eSIM. Your payment of {formatMoney(order.price_bdt)} will be refunded — our
            team has been notified.
          </p>
          {order.failure_reason && <p className="mt-2 text-xs text-zinc-500">{order.failure_reason}</p>}
        </Card>
      )}

      {order.status === "refunded" && (
        <Card className="mt-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Refunded{order.refunded_at ? ` on ${new Date(order.refunded_at).toLocaleDateString()}` : ""}.
          </p>
        </Card>
      )}

      {order.status === "cancelled" && (
        <Card className="mt-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Payment was not completed for this order.</p>
        </Card>
      )}
    </div>
  );
}
