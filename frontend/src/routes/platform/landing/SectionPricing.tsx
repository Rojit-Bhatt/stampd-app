import { usePublicPlans } from "../../../hooks/usePublicPlans";
import { PRICING } from "./data";
import { CtaPill, SectionHead } from "./primitives";

/** Whole rupees, as the platform stores them. */
const formatNpr = (n: number) => (n === 0 ? "Rs 0" : `Rs ${n.toLocaleString()}`);

/**
 * Strip every non-digit character from a phone number so it can be used in a
 * WhatsApp link. The platform contact phone may be stored with "+", spaces, or
 * dashes — the WhatsApp URL scheme accepts digits only.
 */
const toWaNumber = (phone: string) => phone.replace(/[^\d]/g, "");

/**
 * One pre-filled WhatsApp message template per tier. Each carries the exact
 * plan a visitor clicked from (name + price) so the sales conversation can
 * pick up immediately — no guessing which plan they came from.
 */
const planMessage = (name: string, priceNpr: number): string =>
  `Hi Stampd! I'm interested in the ${name} plan (${formatNpr(priceNpr)}/year). Can you tell me more about getting started?`;

/**
 * Build the CTA URL for a tier. WhatsApp deep link with a pre-filled message
 * when the platform has a contact number configured; otherwise fall back to
 * the in-page pricing anchor so the visitor still lands on the plan they
 * clicked.
 */
const planContactHref = (phone: string, name: string, priceNpr: number): string =>
  phone
    ? `https://api.whatsapp.com/send?phone=${toWaNumber(phone)}&text=${encodeURIComponent(planMessage(name, priceNpr))}`
    : "#pricing";

export function PricingSection({ contactHref }: { contactHref: string }) {
  const { data: plans, isLoading } = usePublicPlans();

  // An unconfigured platform shows no pricing section rather than an empty
  // shell promising tiers that do not exist.
  if (!isLoading && (!plans || plans.length === 0)) return null;

  // The shared contactHref carries the platform's WhatsApp number. Accept
  // both legacy wa.me links and the newer api.whatsapp.com/send URLs, then
  // build per-tier api.whatsapp.com/send links with pre-filled messages —
  // the api.whatsapp.com host reliably keeps the pre-filled text on both
  // Android and iOS where plain wa.me links sometimes lose it.
  const phone = /https:\/\/(wa\.me|api\.whatsapp\.com\/send)/.test(contactHref)
    ? decodeURIComponent(contactHref).replace(/^https:\/\/(wa\.me|api\.whatsapp\.com\/send)/, "").replace(/^\/?(\?phone=)?/, "").split("&")[0]
    : "";

  return (
    <section id="pricing" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={PRICING.eyebrow} title={PRICING.title} />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {isLoading
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]"
                />
              ))
            : (plans ?? []).map((plan) => (
                <div
                  key={plan.slug}
                  className={`flex flex-col rounded-3xl border bg-[var(--lp-panel)] p-8 ${
                    plan.isMostPopular
                      ? "border-[var(--lp-green)]"
                      : "border-[var(--lp-line)]"
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-muted)]">
                    {plan.name}
                  </p>
                  <p className="mt-4 font-numeral text-4xl text-[var(--lp-ink)]">
                    {formatNpr(plan.priceNpr)}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="text-sm text-[var(--lp-muted)]">
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <CtaPill
                    href={planContactHref(phone, plan.name, plan.priceNpr)}
                    tone={plan.isMostPopular ? "cream" : "outline"}
                    className="mt-8 w-full"
                  >
                    {PRICING.cta}
                  </CtaPill>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
