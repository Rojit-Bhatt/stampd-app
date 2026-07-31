import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../../lib/api";
import {
  ACCEPTED_PASTE_FORMS,
  parsePastedReviewTarget,
  reviewUrlForPlaceId,
} from "../../../lib/googleReviewUrl";

export interface SelectedPlace {
  name: string;
  address: string;
  reviewUrl: string;
}

interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

const MIN_QUERY = 3;
const DEBOUNCE_MS = 350;

const fieldClass =
  "w-full rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3 text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] outline-none focus:border-[var(--lp-green)]";

export function PlaceSearch({ onSelect }: { onSelect: (place: SelectedPlace) => void }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  // Flips permanently once the backend reports it has no key. The paste path
  // is the only path in dev and in tests, so this is the common case, not an
  // edge case.
  const [pasteMode, setPasteMode] = useState(false);

  // 350ms, so a visitor typing "himalayan brew" costs one billed call rather
  // than fourteen.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isFetching, error } = useQuery<Suggestion[]>({
    queryKey: ["places-autocomplete", debounced],
    enabled: !pasteMode && debounced.length >= MIN_QUERY,
    // Repeating a search that has already been paid for should not pay again.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest<{ results: Suggestion[] }>(
        "/api/tools/places/autocomplete",
        { method: "POST", body: { input: debounced } },
      );
      return res.results;
    },
  });

  useEffect(() => {
    const code = (error as (Error & { code?: string }) | null)?.code;
    if (code === "PLACES_UNCONFIGURED") setPasteMode(true);
  }, [error]);

  if (pasteMode) return <PasteFallback onSelect={onSelect} />;

  const message = error ? (error as Error).message : null;

  return (
    <div className="max-w-xl">
      <label htmlFor="place-search" className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
        YOUR BUSINESS
      </label>
      <input
        id="place-search"
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Start typing your business name…"
        autoComplete="off"
        className={`mt-3 ${fieldClass}`}
      />

      {isFetching ? (
        <p className="mt-3 text-sm text-[var(--lp-muted)]">Searching…</p>
      ) : null}

      {message ? (
        <p className="mt-3 text-sm text-[var(--lp-muted)]">{message}</p>
      ) : null}

      {data && data.length === 0 && !isFetching ? (
        <div className="mt-3 text-sm text-[var(--lp-muted)]">
          <p>Nothing found.</p>
          <button
            type="button"
            onClick={() => setPasteMode(true)}
            className="mt-1 underline underline-offset-4 hover:text-[var(--lp-ink)]"
          >
            Paste your review link instead
          </button>
        </div>
      ) : null}

      {data && data.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {data.map((place) => (
            <li key={place.placeId}>
              <button
                type="button"
                onClick={() =>
                  onSelect({
                    name: place.name,
                    address: place.address,
                    reviewUrl: reviewUrlForPlaceId(place.placeId),
                  })
                }
                className="w-full rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-[var(--lp-green)]"
              >
                <span className="block text-[var(--lp-ink)]">{place.name}</span>
                <span className="block text-sm text-[var(--lp-muted)]">{place.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PasteFallback({ onSelect }: { onSelect: (place: SelectedPlace) => void }) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const reviewUrl = parsePastedReviewTarget(link);
    if (!reviewUrl) {
      setProblem(`That is not a Google review link. Accepted: ${ACCEPTED_PASTE_FORMS.join(", ")}.`);
      return;
    }
    if (!name.trim()) {
      setProblem("Add your business name for the flyer.");
      return;
    }
    setProblem(null);
    onSelect({ name: name.trim(), address: "", reviewUrl });
  };

  return (
    <form onSubmit={submit} className="max-w-xl">
      <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
        YOUR REVIEW LINK
      </p>

      <label htmlFor="place-name" className="mt-4 block text-sm text-[var(--lp-muted)]">
        Business name
      </label>
      <input
        id="place-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Himalayan Brew"
        className={`mt-2 ${fieldClass}`}
      />

      <label htmlFor="place-link" className="mt-5 block text-sm text-[var(--lp-muted)]">
        Google review link or Place ID
      </label>
      <input
        id="place-link"
        type="text"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://g.page/r/…/review"
        className={`mt-2 font-mono text-sm ${fieldClass}`}
      />

      <p className="mt-3 text-sm text-[var(--lp-muted)]">
        Don't have it?{" "}
        <a
          href="https://developers.google.com/maps/documentation/places/web-service/place-id"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4 hover:text-[var(--lp-ink)]"
        >
          Find your Place ID
        </a>
        .
      </p>

      {problem ? <p className="mt-3 text-sm text-[var(--lp-ink)]">{problem}</p> : null}

      <button
        type="submit"
        className="mt-5 rounded-[74px] bg-[var(--lp-cream)] px-5 py-2.5 text-sm font-medium text-[#14201C] transition-transform duration-200 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        Make my flyer
      </button>
    </form>
  );
}
