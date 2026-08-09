import { useEffect, useState } from "react";

import { usePlatformContact } from "../../hooks/usePlatformContact";
import { LandingFooter } from "./landing/LandingFooter";
import { LandingNav } from "./landing/LandingNav";
import { toWaNumber } from "./landing/WhatsAppFloat";
import { PlaceSearch, type SelectedPlace } from "./reviewqr/PlaceSearch";
import { ReviewFlyer } from "./reviewqr/ReviewFlyer";

// A free tool on the marketing site: paste or find your Google listing, get a
// printable flyer with the review QR on it. Public, unauthenticated, and
// deliberately useful to a shop that has never heard of Stampd.
//
// It renders inside the same `landing-dark` scope as the landing page, so the
// dark tokens and the nav/footer chrome are identical. The class is added to
// <html> for this route's lifetime only — the consoles stay light.

export default function ReviewQrGenerator() {
  const { data: contact } = usePlatformContact();
  const [place, setPlace] = useState<SelectedPlace | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Free Google review QR generator | Stampd";
    document.documentElement.classList.add("landing-dark");

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  const phone = contact?.phone ? toWaNumber(contact.phone) : "";
  const contactHref = phone ? `https://wa.me/${phone}` : "/#pricing";

  return (
    <main className="min-h-screen font-sans antialiased">
      <LandingNav contactHref={contactHref} />

      <div className="relative z-10 rounded-b-[40px] bg-[var(--lp-bg)]">
        <section
          data-testid="review-qr-shell"
          className="lp-grid px-6 pt-40 pb-28 md:px-10"
        >
          <div className="mx-auto max-w-6xl">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
              FREE TOOL
            </p>
            <h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.1] tracking-[-0.02em] text-[var(--lp-ink)] sm:text-5xl md:text-6xl">
              Get more Google reviews.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--lp-muted)]">
              Find your business, download the flyer, put it on the counter.
              Customers scan it and land straight on your review form. No
              account needed.
            </p>

            <div className="mt-12">
              <PlaceSearch onSelect={setPlace} />
            </div>

            {place ? <ReviewFlyer place={place} /> : null}
          </div>
        </section>
      </div>

      <LandingFooter />
    </main>
  );
}
