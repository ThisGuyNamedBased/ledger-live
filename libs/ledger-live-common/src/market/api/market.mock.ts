/**
 * Mock market data.
 *
 * The market endpoints are not covered by MOCK, so the Market tab is empty or
 * errors in a mock build. Prices here are derived from the same synthetic
 * source the mock countervalues use, so a coin's market price agrees with the
 * value its accounts are shown at instead of contradicting it.
 *
 * These are invented numbers, not real market data.
 */
import Prando from "prando";
import { getBTCValues, BTCtoUSD, TICKER_TO_ID_AND_VALUE } from "@ledgerhq/live-countervalues/mock";
import type {
  MarketCurrencyRequestParams,
  MarketItemResponse,
  MarketListRequestParams,
} from "../utils/types";

const SPARKLINE_POINTS = 24;

/** Deterministic per-ticker jitter, so the same coin looks the same each load. */
function seeded(ticker: string, salt: string): number {
  return new Prando(`${ticker}:${salt}`).next();
}

function buildItem(ticker: string, id: string, index: number, counterCurrency: string): MarketItemResponse {
  const btcValue = getBTCValues()[ticker] ?? 0;
  // Countervalues price everything through BTC, then USD. Follow the same path
  // so the Market tab cannot disagree with the portfolio.
  const price = btcValue * BTCtoUSD;
  const change24h = (seeded(ticker, "24h") - 0.45) * 12;
  const rank = index + 1;
  const supply = Math.floor(1e6 + seeded(ticker, "supply") * 5e8);

  const sparkline = Array.from({ length: SPARKLINE_POINTS }, (_, i) => {
    const wave = Math.sin(i / 3 + seeded(ticker, "phase") * Math.PI * 2);
    return price * (1 + wave * 0.04);
  });

  return {
    id,
    currencyId: id,
    ledgerIds: [id],
    name: id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " "),
    ticker: ticker.toLowerCase(),
    image: "",
    price,
    priceChange24h: (price * change24h) / 100,
    priceChangePercentage1h: (seeded(ticker, "1h") - 0.5) * 2,
    priceChangePercentage24h: change24h,
    priceChangePercentage7d: (seeded(ticker, "7d") - 0.45) * 25,
    priceChangePercentage30d: (seeded(ticker, "30d") - 0.4) * 50,
    priceChangePercentage1y: (seeded(ticker, "1y") - 0.35) * 150,
    marketCap: price * supply,
    marketCapChange24h: ((price * supply) / 100) * change24h,
    marketCapChangePercentage24h: change24h,
    marketCapRank: rank,
    totalVolume: price * supply * 0.05,
    high24h: price * 1.05,
    low24h: price * 0.95,
    allTimeHigh: price * 2.5,
    allTimeHighDate: new Date(Date.now() - 200 * 86400000).toISOString(),
    allTimeLow: price * 0.1,
    allTimeLowDate: new Date(Date.now() - 900 * 86400000).toISOString(),
    circulatingSupply: supply,
    totalSupply: supply * 1.2,
    maxSupply: supply * 1.5,
    fullyDilutedValuation: price * supply * 1.5,
    sparkline,
    updatedAt: new Date().toISOString(),
    // counterCurrency is echoed by the real API through the price it returns;
    // the synthetic price is USD-based, which is what the mock rates assume.
    ...(counterCurrency ? {} : {}),
  };
}

/** Every ticker the mock countervalues can price, largest first. */
function allItems(counterCurrency: string): MarketItemResponse[] {
  return Object.entries(TICKER_TO_ID_AND_VALUE)
    .map(([ticker, [id]], index) => buildItem(ticker, id, index, counterCurrency))
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((item, index) => ({ ...item, marketCapRank: index + 1 }));
}

export async function fetchList({
  counterCurrency = "usd",
  limit = 50,
  page = 1,
  search = "",
  starred = [],
}: MarketListRequestParams): Promise<MarketItemResponse[]> {
  let items = allItems(counterCurrency);

  if (starred.length > 0) {
    items = items.filter(i => starred.includes(i.id));
  }
  if (search.length >= 2) {
    const needle = search.toLowerCase();
    items = items.filter(i => i.id.includes(needle) || i.ticker.includes(needle));
  }

  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
}

export async function fetchCurrency({
  counterCurrency = "usd",
  id,
}: MarketCurrencyRequestParams): Promise<MarketItemResponse> {
  const items = allItems(counterCurrency);
  const found = items.find(i => i.id === id);
  if (found) return found;
  // Unknown ids still resolve, so a detail screen never dead-ends in mock.
  return buildItem("BTC", id ?? "bitcoin", 0, counterCurrency);
}
