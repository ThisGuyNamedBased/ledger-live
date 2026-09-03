import type { CounterValuesAPI, RateGranularity } from "../types";
import { getEnv } from "@ledgerhq/live-env";
import { getBTCValues, BTCtoUSD, referenceSnapshotDate, TICKER_TO_ID_AND_VALUE } from "../mock";
import { formatPerGranularity } from "../helpers";
import Prando from "prando";

const DAY = 24 * 60 * 60 * 1000;

function btcTrend(t: number) {
  const daysSinceGenesis = (t - 1230937200000) / DAY;
  return Math.pow(daysSinceGenesis / 693, 5.526);
}

const randomCache: Record<string, number> = {};

function fromToRandom(id: string) {
  if (randomCache[id]) return randomCache[id];
  return (randomCache[id] = new Prando(getEnv("MOCK") + id).next());
}

function temporalFactor(from: string, to: string, maybeDate: Date | undefined) {
  const t = (maybeDate || new Date()).getTime();
  const r = fromToRandom(from); // make it varies between rates...

  const wave1 = Math.cos(r * 0.5 + t / (200 * DAY * (0.5 + 0.5 * r)));
  // long term wave
  const wave2 = Math.sin(r + t / (30 * DAY)); // short term wave

  const wave3 = // random market perturbation
    Math.max(0, Math.sin(t / (66 * DAY))) *
    Math.cos(wave2 + Math.cos(r) + t / (3 * DAY * (1 - 0.1 * r)));

  // This is essentially randomness!
  if (maybeDate && Math.cos(7 * r + t * 0.1) > 0.9 + 0.1 * r) {
    return 0; // intentionally set a GAP into the data
  }

  const res =
    (0.2 - 0.2 * r * r) * wave1 +
    (0.1 + 0.05 * Math.sin(r)) * wave2 +
    0.05 * wave3 +
    btcTrend(t) / btcTrend(referenceSnapshotDate.getTime());
  return Math.max(0, res);
}

/**
 * Rough USD parities for the fiats the app offers as countervalues.
 *
 * Without these, `rate()` resolves only BTC and USD: any other fiat falls
 * through to a recursive lookup of its own BTC value, which does not exist, so
 * the rate comes back undefined and balances never load once the user switches
 * currency. Values are approximate on purpose - this is mock data.
 */
const FIAT_PER_USD: Record<string, number> = {
  EUR: 0.92,
  GBP: 0.79,
  CHF: 0.88,
  JPY: 157,
  CNY: 7.24,
  AUD: 1.52,
  CAD: 1.37,
  SEK: 10.7,
  NOK: 10.8,
  DKK: 6.87,
  PLN: 3.97,
  CZK: 23.2,
  HUF: 360,
  RON: 4.58,
  BGN: 1.8,
  TRY: 33.5,
  RUB: 89,
  INR: 83.5,
  BRL: 5.45,
  MXN: 18.3,
  ZAR: 18.6,
  KRW: 1370,
  SGD: 1.35,
  HKD: 7.81,
  NZD: 1.66,
  AED: 3.67,
  ILS: 3.72,
  UAH: 41,
};

function rate(from: string, to: string, date?: Date): number | undefined {
  const asBTC = getBTCValues()[from];
  if (!asBTC) return;

  if (to === "BTC") {
    return asBTC * temporalFactor(from, to, date);
  }

  if (to === "USD") {
    return asBTC * BTCtoUSD * temporalFactor(from, to, date);
  }

  const perUSD = FIAT_PER_USD[to];
  if (perUSD) {
    return asBTC * BTCtoUSD * perUSD * temporalFactor(from, to, date);
  }

  if (from === "BTC") {
    const r = rate(to, from, date);
    if (!r) return;
    return 1 / r;
  }

  const btcTO = rate("BTC", to, date);

  if (btcTO) {
    return asBTC * btcTO * temporalFactor(from, to, date);
  }
}

const increment = {
  daily: DAY,
  hourly: 60 * 60 * 1000,
};

async function getIds(): Promise<string[]> {
  return Object.values(TICKER_TO_ID_AND_VALUE).map(([id]) => id);
}

function getDates(granularity: RateGranularity, start: Date): Date[] {
  const array: Date[] = [];
  const f = formatPerGranularity[granularity];
  const incr = increment[granularity];
  const initial = new Date(f(start || new Date())).getTime();
  const now = Date.now();

  for (let t = initial; t < now; t += incr) {
    array.push(new Date(t));
  }

  return array;
}

const api: CounterValuesAPI = {
  fetchHistorical: (granularity, { from, to, startDate }) => {
    const r: Record<string, number> = {};
    const f = formatPerGranularity[granularity];
    getDates(granularity, startDate).forEach(date => {
      const v = rate(from.ticker, to.ticker, date);
      if (v) {
        r[f(date)] = v;
      }
    });
    return Promise.resolve(r);
  },
  fetchLatest: pairs => Promise.resolve(pairs.map(({ from, to }) => rate(from.ticker, to.ticker))),
  fetchIdsSortedByMarketcap: () => getIds(),
};
export default api;
