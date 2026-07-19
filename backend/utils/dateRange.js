const DAY_MS = 24 * 60 * 60 * 1000;

// Parses "YYYY-MM-DD" query params into a [start, end] Date range, defaulting
// to the last 30 days when either is missing or invalid.
//
// Lives as a standalone util rather than inside reportService (its original
// home) because pointsService needs it too, and reportService itself
// requires pointsService — pointsService requiring reportService back would
// be a circular require.
const resolveDateRange = (startDateParam, endDateParam) => {
  const now = new Date();
  let start = startDateParam ? new Date(startDateParam) : null;
  let end = endDateParam ? new Date(endDateParam) : null;

  if (!start || Number.isNaN(start.getTime())) {
    start = new Date(now.getTime() - 30 * DAY_MS);
  }
  if (!end || Number.isNaN(end.getTime())) {
    end = now;
  } else {
    // Treat the end date as inclusive of its whole day.
    end = new Date(end.getTime() + DAY_MS - 1);
  }

  return { start, end };
};

module.exports = { resolveDateRange };
