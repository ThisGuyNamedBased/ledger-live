/**
 * Dev-only portfolio playground, toggled with Ctrl+H (Esc closes).
 *
 * Only mounts when MOCK is on. It exists so the app can be driven through
 * realistic states without a device:
 *  - build a portfolio from presets or per-coin counts;
 *  - attach ERC20 token accounts (USDC & co) to Ethereum;
 *  - stretch operation history over a chosen time span so the portfolio graph
 *    and analytics have something to plot;
 *  - answer the mock device event bus, automatically or event by event.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "LLD/hooks/redux";
import styled from "styled-components";
import { getEnv } from "@shared/env";
import BigNumber from "bignumber.js";
import { Account, AccountLike, Operation, TokenCurrency } from "@ledgerhq/types-live";
import { genAccount } from "@ledgerhq/live-common/mock/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { getCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import { generateHistoryFromOperations } from "@ledgerhq/ledger-wallet-framework/account/balanceHistoryCache";
import { deviceInfo155, mockListAppsResult } from "@ledgerhq/live-common/apps/mock";
import { replaceAccounts } from "~/renderer/actions/accounts";
import { addDevice, removeDevice, resetDevices } from "~/renderer/actions/devices";
import { DeviceModelId } from "@ledgerhq/devices";
import { accountsSelector } from "~/renderer/reducers/accounts";
import type { State } from "~/renderer/reducers";

/** Currencies that have a mock bridge. Anything else throws CurrencyNotSupported. */
const COINS = [
  { id: "bitcoin", label: "BTC" },
  { id: "ethereum", label: "ETH" },
  { id: "arbitrum", label: "ARB" },
  { id: "base", label: "BASE" },
  { id: "optimism", label: "OP" },
  { id: "polygon", label: "POL" },
  { id: "bsc", label: "BNB" },
  { id: "avalanche_c_chain", label: "AVAX" },
  { id: "solana", label: "SOL" },
  { id: "cardano", label: "ADA" },
  { id: "polkadot", label: "DOT" },
  { id: "cosmos", label: "ATOM" },
  { id: "tezos", label: "XTZ" },
  { id: "stellar", label: "XLM" },
  { id: "algorand", label: "ALGO" },
  { id: "ripple", label: "XRP" },
  { id: "tron", label: "TRX" },
  { id: "elrond", label: "EGLD" },
  { id: "icon", label: "ICX" },
  { id: "casper", label: "CSPR" },
];

/**
 * ERC20s the mock generator can attach as sub-accounts. Only ethereum, tron,
 * algorand and solana accept sub-accounts at all - see genAccount.
 */
const TOKENS = [
  { id: "ethereum/erc20/usd__coin", label: "USDC" },
  { id: "ethereum/erc20/usd_tether__erc20_", label: "USDT" },
  { id: "ethereum/erc20/dai_stablecoin_v2_0", label: "DAI" },
  { id: "ethereum/erc20/link_chainlink", label: "LINK" },
  { id: "ethereum/erc20/uniswap", label: "UNI" },
  { id: "ethereum/erc20/wrapped_bitcoin", label: "WBTC" },
  { id: "ethereum/erc20/shiba_inu", label: "SHIB" },
];

type Row = { id: string; count: number };

type Preset = {
  name: string;
  hint: string;
  rows: Row[];
  tokens: string[];
  ops: number;
  days: number;
};

const PRESETS: Preset[] = [
  {
    name: "starter",
    hint: "1 BTC + 1 ETH, 3 months",
    rows: [
      { id: "bitcoin", count: 1 },
      { id: "ethereum", count: 1 },
    ],
    tokens: [],
    ops: 40,
    days: 90,
  },
  {
    name: "usdc",
    hint: "ETH holding USDC + USDT",
    rows: [{ id: "ethereum", count: 1 }],
    tokens: ["ethereum/erc20/usd__coin", "ethereum/erc20/usd_tether__erc20_"],
    ops: 60,
    days: 180,
  },
  {
    name: "long history",
    hint: "3 coins, 2 years, dense",
    rows: [
      { id: "bitcoin", count: 1 },
      { id: "ethereum", count: 1 },
      { id: "solana", count: 1 },
    ],
    tokens: ["ethereum/erc20/usd__coin"],
    ops: 300,
    days: 730,
  },
  {
    name: "whale",
    hint: "many coins & tokens",
    rows: COINS.slice(0, 8).map(c => ({ id: c.id, count: 2 })),
    tokens: TOKENS.map(t => t.id),
    ops: 150,
    days: 365,
  },
  {
    name: "sparse",
    hint: "few ops, edge cases",
    rows: [{ id: "bitcoin", count: 1 }],
    tokens: [],
    ops: 2,
    days: 14,
  },
  {
    name: "empty",
    hint: "no accounts at all",
    rows: [],
    tokens: [],
    ops: 0,
    days: 30,
  },
];

const DAY = 24 * 60 * 60 * 1000;

/** Models the panel can present as the connected device. */
const MOCK_DEVICES = [
  { label: "Nano S", modelId: DeviceModelId.nanoS },
  { label: "Nano X", modelId: DeviceModelId.nanoX },
  { label: "Stax", modelId: DeviceModelId.stax },
  { label: "Flex", modelId: DeviceModelId.europa },
];

/**
 * Operations come out of the generator only hours apart, so even 100 of them
 * cover a couple of weeks and the portfolio graph has nothing to show over a
 * year. Rescale every date onto the requested span, keeping relative spacing
 * and ordering, then rebuild the balance history the graph actually reads.
 */
function spreadHistory<A extends AccountLike>(account: A, days: number): A {
  const ops: Operation[] = account.operations;
  if (ops.length > 1) {
    const now = Date.now();
    const newest = ops[0].date.getTime();
    const oldest = ops[ops.length - 1].date.getTime();
    const span = newest - oldest;
    if (span > 0) {
      const scale = (days * DAY) / span;
      account.operations = ops.map(op => ({
        ...op,
        date: new Date(now - (newest - op.date.getTime()) * scale),
      }));
    }
  }
  if (account.operations.length > 0) {
    account.creationDate = account.operations[account.operations.length - 1].date;
  }
  account.balanceHistoryCache = generateHistoryFromOperations(account);
  return account;
}

/** A transaction the user typed in, in whole display units (BTC, ETH...). */
type ManualTx = {
  key: number;
  amount: string;
  direction: "IN" | "OUT";
  daysAgo: number;
  fee: string;
};

const hex = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => "0123456789abcdef"[(seed * 31 + i * 7) % 16]).join("");

/**
 * Rewrites an account's operations from hand-entered rows: amounts are exact,
 * dates are exact, and the balance is their arithmetic rather than a generated
 * number. Newest operation must be first - the app relies on that ordering.
 */
function applyManualTxs(account: Account, txs: ManualTx[]): Account {
  const magnitude = account.currency.units[0].magnitude;
  const toSmallest = (v: string) =>
    new BigNumber(v || "0").times(new BigNumber(10).pow(magnitude)).integerValue();
  const now = Date.now();

  const ordered = [...txs].sort((a, b) => a.daysAgo - b.daysAgo); // newest (fewest days ago) first
  const operations: Operation[] = ordered.map((t, i) => {
    const value = toSmallest(t.amount);
    const fee = toSmallest(t.fee);
    const date = new Date(now - t.daysAgo * DAY);
    const peer = `0x${hex(40, i + 1)}`;
    return {
      id: `mock_manual_${i}_${account.id}`,
      hash: hex(64, i + 3),
      type: t.direction,
      value,
      fee,
      senders: [t.direction === "IN" ? peer : account.freshAddress],
      recipients: [t.direction === "IN" ? account.freshAddress : peer],
      blockHash: hex(64, i + 5),
      blockHeight: account.blockHeight - Math.floor((t.daysAgo * DAY) / 900000),
      accountId: account.id,
      date,
      extra: {},
    };
  });

  // IN adds, OUT subtracts the amount and its fee. Clamped at zero so a portfolio
  // that spends more than it received still renders instead of going negative.
  const balance = operations.reduce(
    (sum, op) => (op.type === "IN" ? sum.plus(op.value) : sum.minus(op.value.plus(op.fee))),
    new BigNumber(0),
  );

  account.operations = operations;
  account.operationsCount = operations.length;
  account.balance = BigNumber.max(balance, 0);
  account.spendableBalance = account.balance;
  account.used = operations.length > 0;
  account.creationDate = operations.length
    ? operations[operations.length - 1].date
    : new Date(now);
  account.balanceHistoryCache = generateHistoryFromOperations(account);
  return account;
}

/** Formats a smallest-unit balance back into display units for the readout. */
function formatUnits(value: BigNumber, magnitude: number): string {
  return value.div(new BigNumber(10).pow(magnitude)).toFixed(Math.min(magnitude, 8));
}

const Panel = styled.div`
  position: fixed;
  top: 40px;
  right: 16px;
  z-index: 100000;
  width: 340px;
  border-radius: 8px;
  background: #17171a;
  border: 1px solid #3a3aff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #e8e8ea;
  font-size: 12px;
  font-family: ui-monospace, monospace;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #2a2a2e;
  font-weight: bold;
  color: #9b9bff;
`;

const Tabs = styled.div`
  display: flex;
  border-bottom: 1px solid #2a2a2e;
`;

const Tab = styled.button<{ $on: boolean }>`
  flex: 1;
  padding: 8px 0;
  cursor: pointer;
  background: ${p => (p.$on ? "#22222a" : "transparent")};
  color: ${p => (p.$on ? "#9b9bff" : "#777")};
  border: none;
  border-bottom: 2px solid ${p => (p.$on ? "#3a3aff" : "transparent")};
  font-family: inherit;
  font-size: 11px;
`;

const Body = styled.div`
  padding: 12px;
  overflow-y: auto;
`;

const Section = styled.div`
  color: #6a6a72;
  font-size: 10px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  margin: 12px 0 6px;
  &:first-child {
    margin-top: 0;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
`;

const Chip = styled.button<{ $on?: boolean }>`
  padding: 5px 7px;
  cursor: pointer;
  border-radius: 4px;
  font-family: inherit;
  font-size: 11px;
  text-align: left;
  border: 1px solid ${p => (p.$on ? "#3a3aff" : "#333")};
  background: ${p => (p.$on ? "#26268f" : "#1e1e22")};
  color: ${p => (p.$on ? "#fff" : "#9a9aa2")};
  &:hover {
    border-color: #5a5aff;
  }
`;

const Stepper = styled.div<{ $on: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 5px;
  border-radius: 4px;
  border: 1px solid ${p => (p.$on ? "#3a3aff" : "#333")};
  background: ${p => (p.$on ? "#22224a" : "#1e1e22")};
`;

const Step = styled.button`
  width: 18px;
  cursor: pointer;
  background: transparent;
  color: #8a8a92;
  border: none;
  font-family: inherit;
  font-size: 13px;
  &:hover {
    color: #fff;
  }
`;

const Slider = styled.input`
  width: 100%;
  accent-color: #3a3aff;
`;

const Label = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
  color: #9a9aa2;
`;

const Actions = styled.div`
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid #2a2a2e;
`;

const Button = styled.button<{ $primary?: boolean }>`
  flex: 1;
  padding: 7px;
  cursor: pointer;
  border-radius: 4px;
  font-family: inherit;
  font-size: 11px;
  border: 1px solid ${p => (p.$primary ? "#3a3aff" : "#333")};
  background: ${p => (p.$primary ? "#3a3aff" : "transparent")};
  color: ${p => (p.$primary ? "#fff" : "#9a9aa2")};
  &:hover {
    opacity: 0.85;
  }
`;

const Field = styled.input`
  min-width: 0;
  background: #1e1e22;
  color: #e8e8ea;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 4px 6px;
  font-family: inherit;
  font-size: 11px;
  &:focus {
    outline: none;
    border-color: #3a3aff;
  }
`;

const Select = styled.select`
  width: 100%;
  background: #1e1e22;
  color: #e8e8ea;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 5px 6px;
  font-family: inherit;
  font-size: 11px;
`;

const TxRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 46px 52px 20px;
  gap: 4px;
  align-items: center;
  margin-bottom: 4px;
`;

const Status = styled.div`
  padding: 0 12px 10px;
  color: #6ac06a;
  font-size: 11px;
  min-height: 14px;
`;

const Note = styled.div`
  color: #6a6a72;
  font-size: 10px;
  line-height: 1.5;
  margin-top: 6px;
`;

/** Canned success sequence: "opened" satisfies the app action, listingApps/result the manager one. */
const successSequence = () => [
  { type: "listingApps", deviceInfo: deviceInfo155 },
  {
    type: "result",
    result: mockListAppsResult(
      "Bitcoin,Tron,Litecoin,Ethereum,Ripple,Stellar",
      "Bitcoin,Tron,Litecoin,Ethereum",
      deviceInfo155,
    ),
  },
  { type: "device-permission-requested" },
  { type: "device-permission-granted" },
  { type: "opened" },
];

const DEVICE_EVENTS: { name: string; hint: string; events: Record<string, unknown>[] }[] = [
  { name: "success", hint: "full happy path", events: successSequence() },
  { name: "opened", hint: "app opened only", events: [{ type: "opened" }] },
  {
    name: "ask open app",
    hint: "prompts to open",
    events: [{ type: "ask-open-app", appName: "Bitcoin" }],
  },
  { name: "locked", hint: "device locked", events: [{ type: "lockedDevice" }] },
  { name: "unresponsive", hint: "spinner state", events: [{ type: "unresponsiveDevice" }] },
  {
    name: "error",
    hint: "generic failure",
    events: [{ type: "error", error: { name: "Error", message: "mocked failure" } }],
  },
  { name: "disconnect", hint: "cable pulled", events: [{ type: "deviceChange", device: null }] },
  { name: "complete", hint: "ends the stream", events: [{ type: "complete" }] },
];

function useAutoDevice(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let answered = false;
    const timer = setInterval(() => {
      const events = window.mock?.events;
      if (!events) return;
      if (events.subject.observers.length === 0) {
        answered = false; // flow ended; arm for the next one
        return;
      }
      if (answered || events.queue.length > 0) return;
      answered = true;
      events.mockDeviceEvent(...successSequence());
    }, 300);
    return () => clearInterval(timer);
  }, [enabled]);
}

const DevPortfolioPanel = () => {
  const dispatch = useDispatch();
  const accounts = useSelector(accountsSelector);
  // reducers/devices exports no list selector; read the slice directly.
  const connectedDevices = useSelector((state: State) => state.devices.devices);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"portfolio" | "history" | "manual" | "devices">("portfolio");
  const [rows, setRows] = useState<Row[]>(PRESETS[0].rows);
  const [tokens, setTokens] = useState<string[]>([]);
  const [ops, setOps] = useState(40);
  const [days, setDays] = useState(90);
  const [withNft, setWithNft] = useState(false);
  const [autoDevice, setAutoDevice] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const roll = useRef(0);

  // Manual tab: an explicit account, with transactions typed in by hand.
  const [target, setTarget] = useState("");
  const [manualCoin, setManualCoin] = useState("bitcoin");
  const [txs, setTxs] = useState<ManualTx[]>([
    { key: 1, amount: "1", direction: "IN", daysAgo: 30, fee: "0" },
  ]);
  const nextKey = useRef(2);
  // Knobs for topping a hand-built account up with random rows.
  const [randCount, setRandCount] = useState(10);
  const [randMax, setRandMax] = useState("0.5");
  const [randSpan, setRandSpan] = useState(90);
  const [truncated, setTruncated] = useState(0);

  useAutoDevice(autoDevice);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = useMemo(() => rows.reduce((n, r) => n + r.count, 0), [rows]);

  const bump = useCallback((id: string, delta: number) => {
    setRows(prev => {
      const found = prev.find(r => r.id === id);
      const count = Math.max(0, (found?.count ?? 0) + delta);
      if (count === 0) return prev.filter(r => r.id !== id);
      if (!found) return [...prev, { id, count }];
      return prev.map(r => (r.id === id ? { ...r, count } : r));
    });
  }, []);

  const applyPreset = useCallback((p: Preset) => {
    setRows(p.rows);
    setTokens(p.tokens);
    setOps(p.ops);
    setDays(p.days);
  }, []);

  const build = useCallback(
    async (mode: "replace" | "append") => {
      setBusy(true);
      try {
        // Token lookup goes through the CAL api, so it needs network and throws
        // when it can't reach it. Swallow per token: a missing token should cost
        // you that token, not the whole portfolio.
        const store = getCryptoAssetsStore();
        const resolved = await Promise.all(
          tokens.map(id => store.findTokenById(id).catch(() => undefined)),
        );
        const tokensData = resolved.filter((t): t is TokenCurrency => !!t);
        const missing = tokens.length - tokensData.length;

        const built: Account[] = [];
        const skipped: string[] = [];
        for (const row of rows) {
          let currency;
          try {
            currency = getCryptoCurrencyById(row.id);
          } catch {
            skipped.push(row.id);
            continue;
          }
          for (let i = 0; i < row.count; i++) {
            const account = genAccount(`${roll.current}_${row.id}_${i}`, {
              currency,
              operationsSize: ops,
              withNft,
              tokenIds: tokensData.map(t => t.id),
              tokensData,
              subAccountsCount: tokensData.length,
            });
            account.index = i;
            spreadHistory(account, days);
            account.subAccounts = account.subAccounts?.map(sub => spreadHistory(sub, days));
            built.push(account);
          }
        }

        const next = mode === "append" ? [...accounts, ...built] : built;
        dispatch(replaceAccounts(next));

        const parts = [`${built.length} accounts`];
        if (tokensData.length) parts.push(`${tokensData.length} token accts each`);
        parts.push(`${ops} ops over ${days}d`);
        if (missing) parts.push(`${missing} token(s) unresolved - CAL api needs network`);
        if (skipped.length) parts.push(`skipped ${skipped.join(",")}`);
        setStatus(parts.join(" - "));
      } catch (e) {
        setStatus(`failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [rows, tokens, ops, days, withNft, accounts, dispatch],
  );

  const apply = useCallback(() => build("replace"), [build]);
  const append = useCallback(() => build("append"), [build]);
  const reroll = useCallback(() => {
    roll.current += 1;
    build("replace");
  }, [build]);
  const clear = useCallback(() => {
    dispatch(replaceAccounts([]));
    setStatus("portfolio emptied");
  }, [dispatch]);

  /** Currency of whatever the manual tab is pointed at. */
  const manualCurrencyId = useMemo(() => {
    const existing = accounts.find(a => a.id === target);
    return existing ? existing.currency.id : manualCoin;
  }, [accounts, target, manualCoin]);

  /** Live readout of what the typed rows add up to, before applying. */
  const manualBalance = useMemo(() => {
    try {
      const currency = getCryptoCurrencyById(manualCurrencyId);
      const magnitude = currency.units[0].magnitude;
      const scale = new BigNumber(10).pow(magnitude);
      const sum = txs.reduce((acc, t) => {
        const v = new BigNumber(t.amount || "0").times(scale);
        const f = new BigNumber(t.fee || "0").times(scale);
        return t.direction === "IN" ? acc.plus(v) : acc.minus(v.plus(f));
      }, new BigNumber(0));
      return `${formatUnits(BigNumber.max(sum, 0), magnitude)} ${currency.ticker}`;
    } catch {
      return "-";
    }
  }, [txs, manualCurrencyId]);

  const editTx = useCallback((key: number, patch: Partial<ManualTx>) => {
    setTxs(prev => prev.map(t => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  const addTx = useCallback(() => {
    setTxs(prev => [
      ...prev,
      { key: nextKey.current++, amount: "0.5", direction: "IN", daysAgo: 7, fee: "0" },
    ]);
  }, []);

  const removeTx = useCallback((key: number) => {
    setTxs(prev => prev.filter(t => t.key !== key));
  }, []);

  /**
   * Tops the current rows up with random ones, so an account can be part
   * hand-written and part filled in. Existing rows are left untouched.
   */
  const addRandomTxs = useCallback(() => {
    const max = Number(randMax) || 1;
    setTxs(prev => [
      ...prev,
      ...Array.from({ length: Math.max(1, randCount) }, () => ({
        key: nextKey.current++,
        amount: (Math.random() * max).toFixed(6).replace(/0+$/, "0"),
        direction: (Math.random() < 0.35 ? "OUT" : "IN") as "IN" | "OUT",
        daysAgo: Math.floor(Math.random() * Math.max(1, randSpan)),
        fee: "0",
      })),
    ]);
  }, [randCount, randMax, randSpan]);

  const clearTxs = useCallback(() => {
    setTxs([]);
    setTruncated(0);
  }, []);

  /** Removes the account currently selected in the manual tab. */
  const deleteAccount = useCallback(() => {
    const existing = accounts.find(a => a.id === target);
    if (!existing) return;
    dispatch(replaceAccounts(accounts.filter(a => a.id !== target)));
    setTarget("");
    setTruncated(0);
    setStatus(`removed ${existing.currency.ticker} #${existing.index}`);
  }, [accounts, target, dispatch]);

  const applyManual = useCallback(() => {
    try {
      const existing = accounts.find(a => a.id === target);
      if (existing) {
        // Keep the same account id so anything linking to it stays valid.
        const edited = applyManualTxs({ ...existing }, txs);
        dispatch(replaceAccounts(accounts.map(a => (a.id === target ? edited : a))));
        setStatus(`${existing.currency.ticker} account set to ${txs.length} tx - ${manualBalance}`);
      } else {
        const currency = getCryptoCurrencyById(manualCoin);
        const account = genAccount(`manual_${roll.current++}_${manualCoin}`, {
          currency,
          operationsSize: 0,
        });
        account.index = accounts.filter(a => a.currency.id === manualCoin).length;
        applyManualTxs(account, txs);
        dispatch(replaceAccounts([...accounts, account]));
        setTarget(account.id);
        setStatus(`added ${currency.ticker} account - ${manualBalance}`);
      }
    } catch (e) {
      setStatus(`failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [accounts, target, txs, manualCoin, manualBalance, dispatch]);

  /** Loads an account's real operations into the editor so they can be tweaked. */
  const loadTarget = useCallback(
    (id: string) => {
      setTarget(id);
      const existing = accounts.find(a => a.id === id);
      if (!existing) {
        setTruncated(0);
        return;
      }
      const magnitude = existing.currency.units[0].magnitude;
      const scale = new BigNumber(10).pow(magnitude);
      const now = Date.now();
      // Editing is row-based, so very long histories are capped; rewriting would
      // drop whatever isn't loaded, and the UI says so rather than losing it quietly.
      const LIMIT = 100;
      setTruncated(Math.max(0, existing.operations.length - LIMIT));
      setTxs(
        existing.operations.slice(0, LIMIT).map<ManualTx>(op => ({
          key: nextKey.current++,
          amount: op.value.div(scale).toFixed(Math.min(magnitude, 8)),
          direction: op.type === "OUT" ? "OUT" : "IN",
          daysAgo: Math.max(0, Math.round((now - op.date.getTime()) / DAY)),
          fee: op.fee.div(scale).toFixed(Math.min(magnitude, 8)),
        })),
      );
    },
    [accounts],
  );

  const connectDevice = useCallback(
    (d: (typeof MOCK_DEVICES)[number]) => {
      dispatch(addDevice({ deviceId: `mock|${d.modelId}`, modelId: d.modelId, wired: true }));
      setStatus(`connected ${d.label}`);
    },
    [dispatch],
  );

  const disconnectDevice = useCallback(
    (d: { deviceId: string; modelId: DeviceModelId; wired: boolean }) => {
      dispatch(removeDevice(d));
      setStatus("device disconnected");
    },
    [dispatch],
  );

  const disconnectAll = useCallback(() => {
    dispatch(resetDevices());
    setStatus("all devices disconnected");
  }, [dispatch]);

  const fire = useCallback((events: Record<string, unknown>[]) => {
    window.mock?.events.mockDeviceEvent(...events);
  }, []);

  if (!open) return null;

  return (
    <Panel>
      <Header>
        <span>DEV PANEL</span>
        <span style={{ color: "#5a5a62", fontWeight: "normal" }}>
          {accounts.length} in store - esc
        </span>
      </Header>

      <Tabs>
        {(["portfolio", "history", "manual", "devices"] as const).map(t => (
          <Tab key={t} $on={tab === t} onClick={() => setTab(t)}>
            {t}
          </Tab>
        ))}
      </Tabs>

      <Body>
        {tab === "portfolio" && (
          <>
            <Section>presets</Section>
            <Grid>
              {PRESETS.map(p => (
                <Chip key={p.name} onClick={() => applyPreset(p)} title={p.hint}>
                  {p.name}
                  <div style={{ color: "#5a5a62", fontSize: 10 }}>{p.hint}</div>
                </Chip>
              ))}
            </Grid>

            <Section>coins - click +/- for account count</Section>
            <Grid>
              {COINS.map(c => {
                const count = rows.find(r => r.id === c.id)?.count ?? 0;
                return (
                  <Stepper key={c.id} $on={count > 0}>
                    <Step onClick={() => bump(c.id, -1)}>-</Step>
                    <span style={{ color: count > 0 ? "#fff" : "#6a6a72" }}>
                      {c.label} {count > 0 ? `x${count}` : ""}
                    </span>
                    <Step onClick={() => bump(c.id, 1)}>+</Step>
                  </Stepper>
                );
              })}
            </Grid>

            <Section>tokens - attached to ETH / SOL / TRX / ALGO</Section>
            <Grid>
              {TOKENS.map(t => (
                <Chip
                  key={t.id}
                  $on={tokens.includes(t.id)}
                  onClick={() =>
                    setTokens(s => (s.includes(t.id) ? s.filter(x => x !== t.id) : [...s, t.id]))
                  }
                >
                  {t.label}
                </Chip>
              ))}
            </Grid>
            <Note>
              Selected tokens become sub-accounts of every account that supports them. Other coins
              ignore them.
            </Note>

            <Section>nfts</Section>
            <Stepper $on={withNft} style={{ justifyContent: "flex-start", gap: 8 }}>
              <input
                type="checkbox"
                checked={withNft}
                onChange={e => setWithNft(e.target.checked)}
              />
              <span>generate NFTs</span>
            </Stepper>
            <Note>
              Adds fixture NFTs and NFT operations. Ethereum accounts also get a Stax-format one.
            </Note>
          </>
        )}

        {tab === "history" && (
          <>
            <Section>transactions per account</Section>
            <Label>
              <span>operations</span>
              <span style={{ color: "#fff" }}>{ops}</span>
            </Label>
            <Slider
              type="range"
              min={0}
              max={500}
              step={5}
              value={ops}
              onChange={e => setOps(Number(e.target.value))}
            />

            <Section>history span</Section>
            <Label>
              <span>covers</span>
              <span style={{ color: "#fff" }}>
                {days >= 365 ? `${(days / 365).toFixed(1)} years` : `${days} days`}
              </span>
            </Label>
            <Slider
              type="range"
              min={1}
              max={1825}
              step={1}
              value={days}
              onChange={e => setDays(Number(e.target.value))}
            />
            <Grid style={{ marginTop: 8 }}>
              {[7, 30, 90, 365, 730, 1825].map(d => (
                <Chip key={d} $on={days === d} onClick={() => setDays(d)}>
                  {d >= 365 ? `${d / 365}y` : `${d}d`}
                </Chip>
              ))}
            </Grid>
            <Note>
              The generator spaces operations only hours apart, so history is stretched onto this
              span and the balance graph is rebuilt from it. Pick a span at least as long as the
              graph range you want to inspect - a 1-year chart needs 365d+.
            </Note>
          </>
        )}

        {tab === "manual" && (
          <>
            <Section>account</Section>
            <Select value={target} onChange={e => loadTarget(e.target.value)}>
              <option value="">+ new account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.currency.ticker} #{a.index} - {formatUnits(a.balance, a.currency.units[0].magnitude)}
                </option>
              ))}
            </Select>
            {!target && (
              <Select
                value={manualCoin}
                onChange={e => setManualCoin(e.target.value)}
                style={{ marginTop: 6 }}
              >
                {COINS.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
            <Note>
              Picking an existing account loads its operations here so you can edit them. Applying
              rewrites that account and keeps its id.
            </Note>
            {target ? (
              <Button onClick={deleteAccount} style={{ marginTop: 6 }}>
                delete this account
              </Button>
            ) : null}
            {truncated > 0 ? (
              <Note style={{ color: "#c9a227" }}>
                {truncated} older operations are not loaded and will be dropped if you rewrite.
              </Note>
            ) : null}

            <Section>transactions - amount / in-out / days ago</Section>
            {txs.map(t => (
              <TxRow key={t.key}>
                <Field
                  value={t.amount}
                  onChange={e => editTx(t.key, { amount: e.target.value })}
                  placeholder="0.0"
                />
                <Chip
                  $on={t.direction === "IN"}
                  onClick={() =>
                    editTx(t.key, { direction: t.direction === "IN" ? "OUT" : "IN" })
                  }
                  title="click to flip direction"
                  style={{ textAlign: "center" }}
                >
                  {t.direction}
                </Chip>
                <Field
                  type="number"
                  min={0}
                  value={t.daysAgo}
                  onChange={e => editTx(t.key, { daysAgo: Math.max(0, Number(e.target.value)) })}
                />
                <Step onClick={() => removeTx(t.key)} title="remove">
                  x
                </Step>
              </TxRow>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Button onClick={addTx}>+ transaction</Button>
              <Button onClick={clearTxs}>clear rows</Button>
            </div>

            <Section>fill the rest randomly</Section>
            <TxRow style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Field
                type="number"
                min={1}
                value={randCount}
                onChange={e => setRandCount(Math.max(1, Number(e.target.value)))}
                title="how many random transactions"
              />
              <Field
                value={randMax}
                onChange={e => setRandMax(e.target.value)}
                title="largest random amount"
              />
              <Field
                type="number"
                min={1}
                value={randSpan}
                onChange={e => setRandSpan(Math.max(1, Number(e.target.value)))}
                title="spread over this many days"
              />
            </TxRow>
            <Note style={{ marginTop: 0 }}>count / max amount / days back</Note>
            <Button onClick={addRandomTxs} style={{ marginTop: 6 }}>
              + {randCount} random
            </Button>
            <Note>
              Adds random rows on top of what you typed - your own rows are left alone, and every
              added row stays editable above.
            </Note>

            <Section>result</Section>
            <Label>
              <span>balance after these</span>
              <span style={{ color: "#fff" }}>{manualBalance}</span>
            </Label>
            <Button $primary onClick={applyManual} style={{ marginTop: 6 }}>
              {target ? "rewrite account" : "create account"}
            </Button>
            <Note>
              Amounts are in whole units and applied exactly - no randomness. IN adds, OUT
              subtracts. Fees default to 0 so the balance is plain arithmetic. The bottom row
              buttons belong to the portfolio generator and will overwrite this.
            </Note>
          </>
        )}

        {tab === "devices" && (
          <>
            <Section>connected device ({connectedDevices.length})</Section>
            {connectedDevices.length > 0 ? (
              connectedDevices.map(d => (
                <Stepper key={d.deviceId || d.modelId} $on style={{ marginBottom: 6 }}>
                  <span style={{ color: "#fff" }}>{d.modelId}</span>
                  <Step onClick={() => disconnectDevice(d)} title="disconnect">
                    x
                  </Step>
                </Stepper>
              ))
            ) : (
              <Note style={{ marginTop: 0 }}>
                None connected - mock falls back to a Nano S so device flows still run.
              </Note>
            )}

            <Section>connect one</Section>
            <Grid>
              {MOCK_DEVICES.map(d => (
                <Chip
                  key={d.modelId}
                  $on={connectedDevices.some(c => c.modelId === d.modelId)}
                  onClick={() => connectDevice(d)}
                >
                  {d.label}
                </Chip>
              ))}
            </Grid>
            <Button onClick={disconnectAll} style={{ marginTop: 6 }}>
              disconnect all
            </Button>
            <Note>
              Desktop connects over USB, so this is connect/disconnect rather than pairing. The
              connected model wins over the mock Nano S fallback.
            </Note>

            <Section>auto-answer</Section>
            <Stepper $on={autoDevice} style={{ justifyContent: "flex-start", gap: 8 }}>
              <input
                type="checkbox"
                checked={autoDevice}
                onChange={e => setAutoDevice(e.target.checked)}
              />
              <span>answer device flows automatically</span>
            </Stepper>
            <Note>
              On: any flow waiting on a device resolves by itself. Off: nothing answers, and flows
              wait until you fire an event below - that is the hang you saw.
            </Note>

            <Section>fire an event</Section>
            <Grid>
              {DEVICE_EVENTS.map(e => (
                <Chip key={e.name} onClick={() => fire(e.events)} title={e.hint}>
                  {e.name}
                  <div style={{ color: "#5a5a62", fontSize: 10 }}>{e.hint}</div>
                </Chip>
              ))}
            </Grid>
            <Note>Turn auto-answer off first, otherwise it answers before you do.</Note>
          </>
        )}
      </Body>

      <Status>{busy ? "building..." : status}</Status>

      {tab === "portfolio" || tab === "history" ? (
      <Actions>
        <Button $primary onClick={apply} disabled={busy}>
          apply ({total})
        </Button>
        <Button onClick={append} disabled={busy}>
          add
        </Button>
        <Button onClick={reroll} disabled={busy}>
          reroll
        </Button>
        <Button onClick={clear}>clear</Button>
      </Actions>
      ) : null}
    </Panel>
  );
};

export default function DevPortfolioPanelGate() {
  if (!getEnv("MOCK")) return null;
  return <DevPortfolioPanel />;
}
