// Google Places Autocomplete, reshaped for the public /review-qr tool.
//
// Deliberately NOT paired with a Place Details call: autocomplete alone
// returns the place id, the business name and the address, which is
// everything the flyer needs. That halves both the code and the per-lookup
// bill. It is also why no session token is sent — session tokens only reduce
// billing when a run of autocomplete calls is closed by a Details call, so
// here they would save nothing and be one more thing to get wrong.
//
// The base URL is overridable so the test suite can point a child process at a
// local stub; nothing else should ever set it.

const PLACES_API_BASE_URL = () =>
  process.env.PLACES_API_BASE_URL || "https://places.googleapis.com";

// A dead/slow Google fast-fails here (no hanging past timeoutMs), and
// repeated failures open the circuit so every Places caller sees the
// degraded state at once. Breaker trips and timeouts map onto the existing
// 502 PLACES_UPSTREAM contract — the public tool can't tell the difference
// and neither should its callers.
const { placesApiBreaker, DependencyUnavailableError } = require("../utils/dependencyBreakers");

const MIN_INPUT = 3;
const MAX_INPUT = 120;
const MAX_RESULTS = 5;

class PlacesError extends Error {
  constructor(message, { status, code }) {
    super(message);
    this.name = "PlacesError";
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {string} rawInput
 * @returns {Promise<Array<{placeId: string, name: string, address: string}>>}
 */
async function autocompleteBusinesses(rawInput) {
  const input = String(rawInput || "").trim();

  // Validated BEFORE the key check and before any outbound call, so a one- or
  // two-character keystroke can never bill, and so the 400 is deterministic
  // regardless of whether a key happens to be configured.
  if (input.length < MIN_INPUT || input.length > MAX_INPUT) {
    throw new PlacesError(
      `Enter between ${MIN_INPUT} and ${MAX_INPUT} characters.`,
      { status: 400, code: "INVALID_INPUT" }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new PlacesError(
      "Business search is not configured.",
      { status: 503, code: "PLACES_UNCONFIGURED" }
    );
  }

  let response;
  try {
    response = await placesApiBreaker.exec(async () =>
      fetch(`${PLACES_API_BASE_URL()}/v1/places:autocomplete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        // includedRegionCodes keeps a search for "java" from returning results
        // on the other side of the planet — this product is sold in Nepal.
        body: JSON.stringify({
          input,
          includedRegionCodes: ["np"],
          languageCode: "en",
        }),
      })
    );
  } catch (err) {
    // Breaker trip, concurrency limit and timeout are all surfaced as the
    // same 502 upstream error the route already handles — only the wait is
    // gone.
    if (err instanceof DependencyUnavailableError) {
      throw new PlacesError(
        "Could not reach Google right now. Please try again.",
        { status: 502, code: "PLACES_UPSTREAM" }
      );
    }
    throw new PlacesError(
      "Could not reach Google right now. Please try again.",
      { status: 502, code: "PLACES_UPSTREAM" }
    );
  }

  if (!response.ok) {
    throw new PlacesError(
      "Could not reach Google right now. Please try again.",
      { status: 502, code: "PLACES_UPSTREAM" }
    );
  }

  const data = await response.json().catch(() => ({}));

  // Reshaped, never forwarded: Google's payload carries fields the page has no
  // use for and would pin this response to a third party's schema.
  return (data.suggestions || [])
    .map((suggestion) => suggestion && suggestion.placePrediction)
    .filter(Boolean)
    .map((prediction) => ({
      placeId: prediction.placeId || "",
      name:
        (prediction.structuredFormat &&
          prediction.structuredFormat.mainText &&
          prediction.structuredFormat.mainText.text) ||
        (prediction.text && prediction.text.text) ||
        "",
      address:
        (prediction.structuredFormat &&
          prediction.structuredFormat.secondaryText &&
          prediction.structuredFormat.secondaryText.text) ||
        "",
    }))
    .filter((entry) => entry.placeId && entry.name)
    .slice(0, MAX_RESULTS);
}

module.exports = { autocompleteBusinesses, PlacesError, MIN_INPUT, MAX_INPUT };
