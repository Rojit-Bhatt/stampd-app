const { PLATFORM_TIMEZONE } = require("../config/platform");

const DAY_MS = 24 * 60 * 60 * 1000;

// The UTC instant that reads as `date`'s wall-clock time in `timeZone`. Used
// below to turn "what UTC instant is this local instant" into a lookup
// instead of a fixed offset, so the platform survives PLATFORM_TIMEZONE being
// pointed anywhere else — same reasoning as campaignService's localDayOfWeek.
const zonedWallClockAsUTC = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = Number(p.value);
    return acc;
  }, {});
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};

// The UTC instant of local midnight for a "YYYY-MM-DD" calendar date, in
// PLATFORM_TIMEZONE. Two passes: the first guess (treating the date as if it
// were already UTC) is corrected by the offset actually observed at that
// guess, which is exact for a fixed-offset zone like Asia/Kathmandu and
// correct to the minute across a DST boundary for any other zone.
const localMidnightUTC = (dateStr, timeZone) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = zonedWallClockAsUTC(new Date(guess), timeZone) - guess;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offset);
};

// Parses "YYYY-MM-DD" query params into a [start, end] Date range, defaulting
// to the last 30 days when either is missing or invalid. Day boundaries are
// resolved in PLATFORM_TIMEZONE (Asia/Kathmandu, UTC+5:45) — a plain
// `new Date("2026-07-22")` reads as UTC midnight, which is 05:45 local, so a
// report for "July 22" would silently exclude that morning's early sales and
// attribute them to the day before instead.
//
// Lives as a standalone util rather than inside reportService (its original
// home) because pointsService needs it too, and reportService itself
// requires pointsService — pointsService requiring reportService back would
// be a circular require.
const resolveDateRange = (startDateParam, endDateParam) => {
  const now = new Date();
  let start = startDateParam ? localMidnightUTC(startDateParam, PLATFORM_TIMEZONE) : null;
  let end = endDateParam ? localMidnightUTC(endDateParam, PLATFORM_TIMEZONE) : null;

  if (!start || Number.isNaN(start.getTime())) {
    start = new Date(now.getTime() - 30 * DAY_MS);
  }
  if (!end || Number.isNaN(end.getTime())) {
    end = now;
  } else {
    // Treat the end date as inclusive of its whole (local) day.
    end = new Date(end.getTime() + DAY_MS - 1);
  }

  return { start, end };
};

module.exports = { resolveDateRange };
