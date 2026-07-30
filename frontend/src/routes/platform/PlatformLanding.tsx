import { useEffect } from "react";

import { usePlatformContact } from "../../hooks/usePlatformContact";
import { HeroStack } from "./landing/HeroStack";
import { LandingFooter } from "./landing/LandingFooter";
import { LandingNav } from "./landing/LandingNav";
import { CtaSection } from "./landing/SectionCta";
import { FaqSection } from "./landing/SectionFaq";
import { PricingSection } from "./landing/SectionPricing";
import { FeaturesSection } from "./landing/SectionsFeatures";
import { WhatsAppFloat, toWaNumber } from "./landing/WhatsAppFloat";

// The marketing site. A dark, self-contained surface with its own tokens,
// scoped by the `landing-dark` class added to <html> for the lifetime of this
// route only — so the dark background covers overscroll without leaking into
// the consoles, which stay light.
//
// Concept: docs/superpowers/specs/2026-07-30-platform-landing-stampd-concept-design.md

export default function PlatformLanding() {
  const { data: contact } = usePlatformContact();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Loyalty points for Nepali businesses | Stampd";
    document.documentElement.classList.add("landing-dark");

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  // There is no self-serve signup — a company is registered by the platform
  // owner — so every CTA on this page resolves to a real conversation.
  // Falls back to the pricing anchor until contact details are configured,
  // which is still a live destination rather than a dead link.
  const phone = contact?.phone ? toWaNumber(contact.phone) : "";
  const contactHref = phone ? `https://wa.me/${phone}` : "#pricing";

  return (
    // No overflow clipping on this element, deliberately: any overflow value
    // other than `visible` turns it into the sticky scrollport, and the hero's
    // sticky pin then scrolls away with the page instead of pinning.
    <main className="min-h-screen bg-[var(--lp-bg)] font-sans antialiased">
      <LandingNav contactHref={contactHref} />

      {/* The rounded step belongs to the page content's bottom edge, not the
          footer's top: the footer is uncovered rather than slid in, so it is
          the dark surface that ends in rounded corners and sweeps away. */}
      <div className="relative z-10 rounded-b-[40px] bg-[var(--lp-bg)]">
        <HeroStack contactHref={contactHref} />
        <FeaturesSection />
        <PricingSection contactHref={contactHref} />
        <FaqSection />
        <CtaSection contactHref={contactHref} />
      </div>

      <LandingFooter />
      <WhatsAppFloat />
    </main>
  );
}
