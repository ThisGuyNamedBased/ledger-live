import { getEnv } from "@shared/env";
import * as prodAPI from "./countervalues";
import * as mockAPI from "./market.mock";

/**
 * The market endpoints are otherwise unmocked, which leaves the Market tab
 * empty in a mock build. Routed the same way countervalues are.
 */
export const fetchList: typeof prodAPI.fetchList = params =>
  getEnv("MOCK") ? mockAPI.fetchList(params) : prodAPI.fetchList(params);

export const fetchCurrency: typeof prodAPI.fetchCurrency = params =>
  getEnv("MOCK") ? mockAPI.fetchCurrency(params) : prodAPI.fetchCurrency(params);
