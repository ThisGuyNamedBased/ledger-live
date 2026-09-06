import { getEnv } from "@shared/env";
import type { ServiceStatusApi, ServiceStatusSummary } from "../types";
import prodApi from "./api";
import { mockLedgerStatus } from "../mocks/ledgerStatus";

/**
 * The status page is a live service, so a mock build either shows nothing or
 * an error banner. The repo already ships a status fixture for tests; serve it
 * under MOCK so the status UI has something real-shaped to render.
 */
const api: ServiceStatusApi = {
  fetchStatusSummary: () =>
    getEnv("MOCK")
      ? // The summary only carries incidents; the fixture also holds page and
        // component data the caller does not read.
        Promise.resolve({
          incidents: mockLedgerStatus.incidents as ServiceStatusSummary["incidents"],
        })
      : prodApi.fetchStatusSummary(),
};

export default api;
