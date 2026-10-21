import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

// Google Places address lookup, shared by event creation and event editing.
// The two screens held byte-identical copies of this before; any fix had to be
// made twice and the second one was going to get missed.

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

/** Nearby results rank higher, but anywhere is still reachable. */
const BIAS_RADIUS_METRES = 50_000;
const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

export type Suggestion = {
  place_id: string;
  /** Full single-line address, what gets stored. */
  description: string;
  /** Venue or street line — the part worth emphasising. */
  mainText: string;
  /** City, region, country — context under the main line. */
  secondaryText: string;
};

export type PickedPlace = { lat: number; lon: number };

type RawPrediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};

/**
 * Session tokens are what make this affordable.
 *
 * Google bills every autocomplete request separately unless they are grouped
 * into a session. With a token, the keystroke requests are bundled and charged
 * once, when the session is closed by a Place Details call. Without one, a
 * single address entry costs ~5 autocomplete requests plus a full-rate details
 * request; with one, it costs a single session.
 *
 * A token is valid until it is used for a details lookup, so a fresh one is
 * minted after every pick and whenever the field is cleared.
 */
function newSessionToken(): string {
  // Any sufficiently unique opaque string; Google treats it as a nonce.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function usePlacesAutocomplete(address: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [userLocation, setUserLocation] = useState<PickedPlace | null>(null);
  const [pickedLatLon, setPickedLatLon] = useState<PickedPlace | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string>(newSessionToken());
  // Guards against a slow response for an old query overwriting a newer one.
  const queryIdRef = useRef(0);

  const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status !== 'granted') return;
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((loc) => setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude }))
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

  const fetchSuggestions = useCallback(
    async (text: string) => {
      if (text.length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        return;
      }
      const id = ++queryIdRef.current;
      try {
        // Location biases ranking rather than restricting results. There is
        // deliberately no country filter: this used to be locked to the US,
        // which meant anyone outside it got no suggestions at all and silently
        // fell through to the device geocoder.
        const bias = userLocation
          ? `&location=${userLocation.lat},${userLocation.lon}&radius=${BIAS_RADIUS_METRES}`
          : '';
        const res = await fetch(
          `${AUTOCOMPLETE_URL}?input=${encodeURIComponent(text)}${bias}` +
            `&sessiontoken=${sessionRef.current}&key=${PLACES_KEY}`,
        );
        const json = await res.json();
        if (id !== queryIdRef.current) return; // a newer query has since run

        const predictions: RawPrediction[] = json.predictions ?? [];
        setSuggestions(
          predictions.map((p) => ({
            place_id: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text ?? p.description,
            secondaryText: p.structured_formatting?.secondary_text ?? '',
          })),
        );
        setShowSuggestions(true);
      } catch {
        if (id === queryIdRef.current) setSuggestions([]);
      }
    },
    [userLocation, PLACES_KEY],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(address), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [address, fetchSuggestions]);

  /**
   * Resolve a suggestion to coordinates. Returns the text to put in the field
   * so the caller sets its own state; the hook does not own the address.
   */
  const pickSuggestion = useCallback(
    async (s: Suggestion): Promise<string> => {
      setSuggestions([]);
      setShowSuggestions(false);
      try {
        const res = await fetch(
          `${DETAILS_URL}?place_id=${s.place_id}&fields=geometry` +
            `&sessiontoken=${sessionRef.current}&key=${PLACES_KEY}`,
        );
        const json = await res.json();
        const loc = json.result?.geometry?.location;
        if (loc) setPickedLatLon({ lat: loc.lat, lon: loc.lng });
      } catch {
        // Leave pickedLatLon null; the caller falls back to geocoding the text.
      } finally {
        // The details call closes the billing session either way.
        sessionRef.current = newSessionToken();
      }
      return s.description;
    },
    [PLACES_KEY],
  );

  /**
   * Resolve coordinates for an address the user typed without picking a
   * suggestion.
   *
   * Prefers Google so the coordinates come from the same source as the text.
   * The device geocoder is a last resort — it is a different provider and can
   * disagree with Google about where an address is, which matters because
   * distance sorting is built on these numbers.
   */
  const resolveTypedAddress = useCallback(
    async (text: string): Promise<PickedPlace | null> => {
      const query = text.trim();
      if (!query) return null;

      try {
        const res = await fetch(
          `${AUTOCOMPLETE_URL}?input=${encodeURIComponent(query)}` +
            `&sessiontoken=${sessionRef.current}&key=${PLACES_KEY}`,
        );
        const json = await res.json();
        const first: RawPrediction | undefined = json.predictions?.[0];
        if (first) {
          const det = await fetch(
            `${DETAILS_URL}?place_id=${first.place_id}&fields=geometry` +
              `&sessiontoken=${sessionRef.current}&key=${PLACES_KEY}`,
          );
          const detJson = await det.json();
          const loc = detJson.result?.geometry?.location;
          sessionRef.current = newSessionToken();
          if (loc) return { lat: loc.lat, lon: loc.lng };
        }
      } catch {
        // fall through
      }

      try {
        const geocoded = await Location.geocodeAsync(query);
        if (geocoded.length > 0) {
          return { lat: geocoded[0].latitude, lon: geocoded[0].longitude };
        }
      } catch {
        // no coordinates available
      }
      return null;
    },
    [PLACES_KEY],
  );

  /** Re-open the list as the user types. */
  const reveal = useCallback(() => setShowSuggestions(true), []);

  /**
   * Hide the list on blur, after a beat — tapping a suggestion blurs the
   * field first, so dismissing immediately would cancel the tap.
   */
  const dismiss = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  return {
    suggestions,
    showSuggestions,
    pickedLatLon,
    setPickedLatLon,
    pickSuggestion,
    resolveTypedAddress,
    reveal,
    dismiss,
  };
}
