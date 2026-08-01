// Landing page copy. COPY ONLY — no figures, no prices, no phone numbers.
// Everything numeric on this page comes from an API, which is what keeps the
// marketing site honest as the product changes.
//
// Three answers from the source concept were corrected or removed here
// because they described things Stampd does not do: offline scan queueing
// (the service worker never caches /api — loyalty actions are online), a
// stamps model (the product is points-only), and self-serve signup (a
// company is registered by the platform owner, so every CTA is "Talk to us").

// Rewards and Campaigns used to be separate items pointing at two cards INSIDE
// the features section — an anchor into the middle of a grid, not a
// destination. They are folded into Services, which is the section that lists
// everything the product does. Product is gone for the same reason: it pointed
// at that same section, so keeping both would be two labels for one place.
export type NavLink =
  | { label: string; kind: "anchor"; href: string }
  | { label: string; kind: "route"; to: string };

export const NAV_LINKS: readonly NavLink[] = [
  { label: "Services", kind: "anchor", href: "#services" },
  { label: "Review QR", kind: "route", to: "/review-qr" },
  { label: "Pricing", kind: "anchor", href: "#pricing" },
  { label: "FAQ", kind: "anchor", href: "#faq" },
];

export const HERO = {
  eyebrow: "LOYALTY FOR NEPALI BUSINESSES",
  headline: ["Points that", "bring them back."],
  primaryCta: "Talk to us",
  secondaryCta: "See how it works",
  statLabels: {
    outlets: "OUTLETS",
    pointsIssuedMonth: "POINTS / MO",
    customers: "CUSTOMERS",
  },
} as const;

// One card per step of the loop. `subline` replaces the hero sub-paragraph as
// each card advances, so the copy and the card always describe the same
// moment.
export const HERO_CARDS = [
  {
    id: "earn",
    step: "EARN",
    subline: "Every visit adds points. No cards, no punches.",
    kicker: "POINTS BALANCE",
    tag: "YOUR CARD",
    headline: "1,240 pts",
    detail: "260 pts to your next reward",
  },
  {
    id: "engage",
    step: "ENGAGE",
    subline: "Launch a campaign and it lands on their phone.",
    kicker: "CAMPAIGN · LIVE",
    tag: "FRI–SUN",
    headline: "Double points weekend",
    detail: "Sent to 1,280 customers · 41% opened",
  },
  {
    id: "reward",
    step: "REWARD",
    subline: "You decide what points are worth.",
    kicker: "REWARD CATALOGUE",
    tag: "ACTIVE",
    headline: "Free flat white",
    detail: "500 pts · redeemed 214 times",
  },
  {
    id: "redeem",
    step: "REDEEM",
    subline: "One tap at the counter and it is done.",
    kicker: "REDEEMED",
    tag: "2 MIN AGO",
    headline: "− 500 pts",
    detail: "Himalayan Brew · balance now 740 pts",
  },
] as const;

export const FEATURES = {
  eyebrow: "WHAT YOU GET",
  // Revealed word by word as the section passes the viewport.
  statement:
    "Everything the counter needs. Nothing it does not. One programme for points, campaigns, rewards and redemption — run from a phone.",
  blocks: [
    {
      // Not "services" — the enclosing section owns that id for the nav
      // anchor, and two elements sharing one id makes the anchor ambiguous.
      id: "points-engine",
      kicker: "POINTS ENGINE",
      title: "Points, on your terms",
      body: "Set what a rupee earns and what a reward costs. Change it whenever you like, for one outlet or all of them.",
    },
    {
      id: "campaigns",
      kicker: "CAMPAIGNS",
      title: "Reach them without a poster",
      body: "Double points on a slow Tuesday. A win-back for anyone who has not been in a month.",
    },
    {
      id: "rewards",
      kicker: "REWARDS",
      title: "You set what points buy",
      body: "A free coffee, a discount, a birthday gift.",
    },
    {
      id: "redeem",
      kicker: "REDEEM",
      title: "One tap at the counter",
      body: "Scan, points come off, done.",
    },
    {
      id: "insights",
      kicker: "INSIGHTS",
      title: "Know your regulars by name",
      body: "Visits, repeat rate and what each reward actually costs you — on one screen.",
    },
    {
      id: "multi-outlet",
      kicker: "MULTI-OUTLET",
      title: "One programme, every branch",
      body: "Give each outlet its own rules, or run the same programme across all of them.",
    },
  ],
} as const;

export const PRICING = {
  eyebrow: "PRICING",
  title: "Priced for a tea shop, not a chain of hotels.",
  cta: "Talk to us",
} as const;

export const FAQ = {
  eyebrow: "QUESTIONS",
  title: "The things shop owners ask first.",
  subtitle: "Still unsure about something? Ask us — we answer in Nepali or English.",
  items: [
    {
      q: "Do my customers need to download an app?",
      a: "No. They open a link and their card is there. If they want it on their home screen it installs straight from the browser — no store, no download.",
    },
    {
      q: "How long does setup take?",
      a: "Most shops are live the same day. Set your earn rate, add one reward, print the QR for the counter.",
    },
    {
      q: "Does it need internet at the counter?",
      a: "Yes. Balances and rewards are always read live, so a point is never awarded twice or spent twice. The scan itself is instant.",
    },
    {
      q: "Can I see who gave away points?",
      a: "Every earn and every redemption is written to a ledger that is only ever added to, never edited. A correction is a new line, so the history always adds up.",
    },
  ],
} as const;

export const CTA = {
  eyebrow: "GET STARTED",
  title: "Your regulars are already coming in. Give them a reason to come back.",
  primary: "Talk to us",
  secondary: "See pricing",
  footnote: "We set your outlet up with you — usually the same day.",
} as const;

export const FOOTER_LINKS = NAV_LINKS;
