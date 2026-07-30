import { usePublicPlans } from "../../../hooks/usePublicPlans";
import { PRICING } from "./data";
import { CtaPill, SectionHead } from "./primitives";

/** Whole rupees, as the platform stores them. */
const formatNpr = (n: number) => (n === 0 ? "Rs 0" : `Rs ${n.toLocaleString()}`);

export function PricingSection({ contactHref }: { contactHref: string }) {
  const { data: plans, isLoading } = usePublicPlans();

  // An unconfigured platform shows no pricing section rather than an empty
  // shell promising tiers that do not exist.
  if (!isLoading && (!plans || plans.length === 0)) return null;

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
                    href={contactHref}
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
