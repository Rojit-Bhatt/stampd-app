const fetch = globalThis.fetch;
const { googleReviewsBreaker, DependencyUnavailableError } = require("../utils/dependencyBreakers");

/**
 * Fetch and proxy Google reviews for Cafe Coffesarowar
 */
const getGoogleReviews = async (req, res, next) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  // Default to the requested Place ID: ChIJuTDdFgC1pjkRhjJ4vtKcFeM
  const placeId = process.env.GOOGLE_PLACE_ID || "ChIJuTDdFgC1pjkRhjJ4vtKcFeM";

  if (!apiKey) {
    console.warn("[Reviews Controller] GOOGLE_PLACES_API_KEY is not set.");
    return res.status(200).json({
      success: false,
      source: "no_api_key",
      message: "Google reviews are currently unavailable.",
      reviews: []
    });
  }

  try {
    const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}`;

    // Circuit-broken: a dead/slow Google fast-fails instead of hanging the
    // page render, and repeated failures open the circuit for the whole
    // dependency. Either way the catch block below returns the same
    // graceful empty-review response the route already guarantees.
    let response;
    try {
      response = await googleReviewsBreaker.exec(async () => fetch(googleUrl));
    } catch (err) {
      if (err instanceof DependencyUnavailableError) {
        throw new Error(`Google Places API unavailable (${err.code}).`);
      }
      throw err;
    }
    if (!response.ok) {
      throw new Error(`Google Places API responded with status ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "OK") {
      throw new Error(`Google Places API status: ${data.status}. Details: ${data.error_message || "None"}`);
    }

    const rawReviews = data.result?.reviews || [];

    // Filter reviews rated 4 stars and above
    const highRatedReviews = rawReviews.filter(review => review.rating >= 4);

    // Sort by time (most recent first) to get the most recent/relevant high-rated reviews
    highRatedReviews.sort((a, b) => b.time - a.time);

    // Take top 3
    const selectedReviews = highRatedReviews.slice(0, 3).map(review => ({
      author_name: review.author_name,
      rating: review.rating,
      text: review.text,
      relative_time_description: review.relative_time_description || "recently",
      profile_photo_url: review.profile_photo_url || null
    }));

    return res.status(200).json({
      success: true,
      source: "google_api",
      reviews: selectedReviews
    });
  } catch (error) {
    console.error("[Reviews Controller] Error fetching Google Reviews:", error.message);
    return res.status(200).json({
      success: false,
      source: "google_api_error",
      message: error.message,
      reviews: []
    });
  }
};

module.exports = {
  getGoogleReviews
};
