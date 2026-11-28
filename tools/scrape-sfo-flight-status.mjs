#!/usr/bin/env node

const ENDPOINT = "https://www.flysfo.com/flysfo/api/flight-status";

export function normalizeFlight(raw) {
  return {
    id: raw.flight_id,
    direction: raw.flight_kind,
    airline: raw.airline?.airline_display_name || raw.airline?.airline_name || raw.airline?.iata_code || "Unknown",
    flightNumber: raw.flight_number,
    origin: raw.flight_kind === "Arrival" ? raw.airport?.airport_city || raw.airport?.iata_code : "SFO",
    destination: raw.flight_kind === "Departure" ? raw.airport?.airport_city || raw.airport?.iata_code : "SFO",
    scheduled: raw.scheduled_aod_time,
    estimated: raw.estimated_aod_time,
    actual: raw.actual_aod_time,
    gate: raw.gate?.gate_number || null,
    status: raw.remark || "Scheduled",
    baggageCarousel: raw.baggage_carousel?.carousel_number || null,
  };
}

export function filterFlights(flights, { direction, airline, limit = 25 } = {}) {
  return flights
    .filter((flight) => !direction || flight.direction.toLowerCase() === direction.toLowerCase())
    .filter((flight) => !airline || flight.airline.toLowerCase().includes(airline.toLowerCase()))
    .slice(0, limit);
}

export async function fetchSfoFlights(fetchImpl = fetch) {
  const response = await fetchImpl(ENDPOINT, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`SFO flight API returned HTTP ${response.status}`);
  const payload = await response.json();
  return {
    source: ENDPOINT,
    lastUpdate: payload.last_update || null,
    flights: (payload.data || []).map(normalizeFlight),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || true];
  }));
  const result = await fetchSfoFlights();
  result.flights = filterFlights(result.flights, { direction: args.direction, airline: args.airline, limit: Number(args.limit) || 25 });
  console.log(JSON.stringify(result, null, 2));
}
