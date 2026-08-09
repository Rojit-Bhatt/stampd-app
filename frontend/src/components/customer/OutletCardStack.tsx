import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";

import { useMyTenants, type MyTenantMembership } from "../../hooks/useMyTenants";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { formatPoints } from "../../hooks/usePoints";
import { resolveImageUrl } from "../../lib/images";
import { tenantPath } from "../../lib/tenantPath";
import { useMotion } from "../../lib/motion";
import { CustomerAvatar } from "./CustomerAvatar";

// Front card + this many peeking layers behind it = 3 visible cards max,
// regardless of how many outlets the customer belongs to.
const MAX_PEEK_DEPTH = 2;

export function OutletCardStack() {
  const { data: memberships = [] } = useMyTenants();
  const { globalAccount } = useCustomerAuth();
  const [activeIndex, setActiveIndex] = useState(0);

  if (memberships.length === 0) return null;

  const clampedIndex = Math.min(activeIndex, memberships.length - 1);

  return (
    <section className="relative mb-7 flex justify-center" style={{ height: "min(50vh, 380px)" }}>
      <div className="relative w-full max-w-sm">
        {memberships.map((m, i) => {
          const depth = i - clampedIndex;
          if (depth < 0 || depth > MAX_PEEK_DEPTH) return null;
          return (
            <Fragment key={m.organizationId}>
              {depth === 0 && (
                <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2">
                  <CustomerAvatar
                    accountId={globalAccount?.id}
                    avatarVersion={globalAccount?.avatarVersion}
                    name={globalAccount?.name}
                    size={40}
                    className="rounded-full border-2 border-white shadow-modal"
                  />
                </div>
              )}
              <OutletCard membership={m} depth={depth} onTap={() => setActiveIndex(i)} />
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function OutletCard({
  membership,
  depth,
  onTap,
}: {
  membership: MyTenantMembership;
  depth: number;
  onTap: () => void;
}) {
  const m = useMotion();
  const logo = resolveImageUrl(membership.branding.logoImageId, membership.branding.logoUrl);
  const initial = membership.name.charAt(0).toUpperCase();

  const content = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="h-11 w-11 rounded-[var(--radius-field)] bg-white object-cover shadow-modal"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-field)] font-display text-lg font-bold text-white shadow-modal"
            style={{ background: membership.branding.primaryColor }}
          >
            {initial}
          </div>
        )}
        <div className="truncate font-display text-base font-bold text-[var(--ink)]">{membership.name}</div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-numeral text-4xl leading-none text-[var(--primary)]">
          {formatPoints(membership.balance)}
        </span>
        <span className="text-sm text-[var(--soft)]">pts</span>
      </div>
    </div>
  );

  const cardClassName =
    "absolute inset-x-0 top-0 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient";
  const animate = {
    y: depth * -14,
    scale: 1 - depth * 0.06,
    opacity: depth === 0 ? 1 : 1 - depth * 0.18,
  };
  const transition = m.spring("settle");

  if (depth === 0) {
    return (
      <motion.div className={cardClassName} style={{ zIndex: 10 - depth }} animate={animate} transition={transition}>
        <Link to={tenantPath(membership.companySlug, membership.slug, "dashboard")}>{content}</Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onTap}
      aria-label={`Show ${membership.name}`}
      className={`${cardClassName} text-left`}
      style={{ zIndex: 10 - depth }}
      animate={animate}
      transition={transition}
    >
      {content}
    </motion.button>
  );
}
