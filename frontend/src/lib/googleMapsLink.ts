// Building a Maps search link from free-text location rather than storing
// coordinates or a pasted URL — the event location field is just a string
// ("Magic Cups Cafe, Pimbahal, Lalitpur"), and a search query resolves named
// places well enough without adding a geocoding step to event creation.
export function buildMapsSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
