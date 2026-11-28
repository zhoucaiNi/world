import test from "node:test";
import assert from "node:assert/strict";
import { filterFlights, normalizeFlight } from "./scrape-sfo-flight-status.mjs";

test("normalizes SFO flight records", () => {
  const flight = normalizeFlight({ flight_id: "UA/1/A/2026-11-27", flight_kind: "Arrival", flight_number: "1", airline: { airline_display_name: "United" }, airport: { airport_city: "Tokyo" }, gate: { gate_number: "G12" }, remark: "Landed", scheduled_aod_time: "2026-11-27T12:00:00-08:00" });
  assert.deepEqual(flight, { id: "UA/1/A/2026-11-27", direction: "Arrival", airline: "United", flightNumber: "1", origin: "Tokyo", destination: "SFO", scheduled: "2026-11-27T12:00:00-08:00", estimated: undefined, actual: undefined, gate: "G12", status: "Landed", baggageCarousel: null });
});

test("filters by direction and airline", () => {
  const flights = [{ direction: "Arrival", airline: "United" }, { direction: "Departure", airline: "Delta" }];
  assert.equal(filterFlights(flights, { direction: "departure", airline: "delta" }).length, 1);
});
