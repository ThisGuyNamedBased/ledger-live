/**
 * Dev-only portfolio playground for mobile, opened with a four-finger swipe down.
 *
 * Mounts only when MOCK is on, and wraps the app so the gesture is available
 * from any screen. It is the mobile counterpart of the desktop DevPortfolioPanel:
 *  - build a portfolio from presets or per-coin counts;
 *  - attach ERC20 token accounts (USDC & co);
 *  - stretch operation history over a chosen span so the graph has data;
 *  - hand-write transactions, or top them up with random ones;
 *  - edit or delete any account;
 *  - answer the mock device event bus so flows do not hang without a device.
 *
 * The generation helpers are duplicated from the desktop panel rather than
 * shared: the two apps cannot import each other, and a dev-only tool is not
 * worth a new published package.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import BigNumber from "bignumber.js";
import { getEnv } from "@shared/env";
import { Account, AccountLike, Operation, TokenCurrency } from "@ledgerhq/types-live";
import { genAccount } from "@ledgerhq/live-common/mock/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { getCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import { generateHistoryFromOperations } from "@ledgerhq/ledger-wallet-framework/account/balanceHistoryCache";
import { deviceInfo155, mockListAppsResult } from "@ledgerhq/live-common/apps/mock";
import { useDispatch, useSelector } from "~/context/hooks";
import { replaceAccounts } from "~/actions/accounts";
import { accountsSelector } from "~/reducers/accounts";
import { mockDeviceEventSubject } from "~/e2e/bridge/types";

/** Currencies that have a mock bridge. Anything else throws CurrencyNotSupported. */
const COINS = [
  { id: "bitcoin", label: "BTC" },
  { id: "ethereum", label: "ETH" },
  { id: "arbitrum", label: "ARB" },
  { id: "solana", label: "SOL" },
  { id: "cardano", label: "ADA" },
  { id: "polkadot", label: "DOT" },
  { id: "cosmos", label: "ATOM" },
  { id: "tezos", label: "XTZ" },
  { id: "stellar", label: "XLM" },
  { id: "algorand", label: "ALGO" },
  { id: "ripple", label: "XRP" },
  { id: "tron", label: "TRX" },
];

const TOKENS = [
  { id: "ethereum/erc20/usd__coin", label: "USDC" },
  { id: "ethereum/erc20/usd_tether__erc20_", label: "USDT" },
  { id: "ethereum/erc20/dai_stablecoin_v2_0", label: "DAI" },
  { id: "ethereum/erc20/link_chainlink", label: "LINK" },
  { id: "ethereum/erc20/uniswap", label: "UNI" },
  { id: "ethereum/erc20/wrapped_bitcoin", label: "WBTC" },
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
    hint: "3 coins, 2 years",
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
    hint: "2 ops, edge cases",
    rows: [{ id: "bitcoin", count: 1 }],
    tokens: [],
    ops: 2,
    days: 14,
  },
  { name: "empty", hint: "no accounts", rows: [], tokens: [], ops: 0, days: 30 },
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * Generated operations sit only hours apart, so a long-range graph would be
 * flat. Rescale dates onto the requested span, keeping order and relative
 * spacing, then rebuild the balance history the graph reads.
 */
function spreadHistory<A extends AccountLike>(account: A, days: number): A {
  const ops: Operation[] = account.operations;
  if (ops.length > 1) {
    const now = Date.now();
    const newest = ops[0].date.getTime();
    const span = newest - ops[ops.length - 1].date.getTime();
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

/** A transaction typed in by hand, in whole display units. */
type ManualTx = {
  key: number;
  amount: string;
  direction: "IN" | "OUT";
  daysAgo: number;
  fee: string;
};

const hex = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => "0123456789abcdef"[(seed * 31 + i * 7) % 16]).join("");

/** Rewrites an account's operations from hand-entered rows. Newest first. */
function applyManualTxs(account: Account, txs: ManualTx[]): Account {
  const magnitude = account.currency.units[0].magnitude;
  const toSmallest = (v: string) =>
    new BigNumber(v || "0").times(new BigNumber(10).pow(magnitude)).integerValue();
  const now = Date.now();

  const ordered = [...txs].sort((a, b) => a.daysAgo - b.daysAgo);
  const operations: Operation[] = ordered.map((t, i) => ({
    id: `mock_manual_${i}_${account.id}`,
    hash: hex(64, i + 3),
    type: t.direction,
    value: toSmallest(t.amount),
    fee: toSmallest(t.fee),
    senders: [t.direction === "IN" ? `0x${hex(40, i + 1)}` : account.freshAddress],
    recipients: [t.direction === "IN" ? account.freshAddress : `0x${hex(40, i + 1)}`],
    blockHash: hex(64, i + 5),
    blockHeight: account.blockHeight - Math.floor((t.daysAgo * DAY) / 900000),
    accountId: account.id,
    date: new Date(now - t.daysAgo * DAY),
    extra: {},
  }));

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

function formatUnits(value: BigNumber, magnitude: number): string {
  return value.div(new BigNumber(10).pow(magnitude)).toFixed(Math.min(magnitude, 8));
}

/** Canned success sequence covering both the app and manager device actions. */
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

const DEVICE_EVENTS: { name: string; events: Record<string, unknown>[] }[] = [
  { name: "success", events: successSequence() },
  { name: "opened", events: [{ type: "opened" }] },
  { name: "locked", events: [{ type: "lockedDevice" }] },
  { name: "unresponsive", events: [{ type: "unresponsiveDevice" }] },
  {
    name: "error",
    events: [{ type: "error", error: { name: "Error", message: "mocked failure" } }],
  },
  { name: "complete", events: [{ type: "complete" }] },
];

/**
 * The mobile mock bus is a plain Subject with no replay, so events only land if
 * something is already listening. Poll for a subscriber and answer once per flow.
 */
function useAutoDevice(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let answered = false;
    const timer = setInterval(() => {
      const subject = mockDeviceEventSubject as unknown as { observers: unknown[] };
      if (!subject.observers || subject.observers.length === 0) {
        answered = false; // flow ended; arm for the next one
        return;
      }
      if (answered) return;
      answered = true;
      successSequence().forEach(e => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockDeviceEventSubject.next(e as any);
      });
    }, 300);
    return () => clearInterval(timer);
  }, [enabled]);
}

const C = {
  bg: "#17171a",
  panel: "#1e1e22",
  line: "#333",
  accent: "#3a3aff",
  text: "#e8e8ea",
  dim: "#8a8a92",
  faint: "#5a5a62",
  good: "#6ac06a",
  warn: "#c9a227",
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    borderTopWidth: 1,
    borderColor: C.accent,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2e",
  },
  title: { color: "#9b9bff", fontWeight: "bold", fontSize: 14 },
  dim: { color: C.faint, fontSize: 12 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#2a2a2e" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2 },
  tabText: { fontSize: 12 },
  body: { padding: 14 },
  section: {
    color: C.dim,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 6,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  cell: { width: "50%", paddingHorizontal: 3, paddingBottom: 6 },
  chip: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  chipOn: { borderColor: C.accent, backgroundColor: "#26268f" },
  chipText: { color: C.dim, fontSize: 12 },
  chipTextOn: { color: "#fff", fontSize: 12 },
  hint: { color: C.faint, fontSize: 10, marginTop: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  step: { color: C.dim, fontSize: 18, paddingHorizontal: 8 },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    borderRadius: 6,
    color: C.text,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 12,
  },
  txRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  label: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  note: { color: C.faint, fontSize: 10, lineHeight: 15, marginTop: 6 },
  button: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonPrimary: { backgroundColor: C.accent, borderColor: C.accent },
  buttonText: { color: C.dim, fontSize: 12 },
  buttonTextPrimary: { color: "#fff", fontSize: 12 },
  actions: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a2a2e",
  },
  status: { paddingHorizontal: 14, paddingBottom: 8, color: C.good, fontSize: 11 },
});

type Tab = "portfolio" | "history" | "manual" | "device";

const Chip = ({
  on,
  label,
  hint,
  onPress,
}: {
  on?: boolean;
  label: string;
  hint?: string;
  onPress: () => void;
}) => (
  <Pressable style={[s.chip, on ? s.chipOn : null]} onPress={onPress}>
    <Text style={on ? s.chipTextOn : s.chipText}>{label}</Text>
    {hint ? <Text style={s.hint}>{hint}</Text> : null}
  </Pressable>
);

const Btn = ({
  label,
  primary,
  onPress,
  style,
}: {
  label: string;
  primary?: boolean;
  onPress: () => void;
  style?: object;
}) => (
  <Pressable style={[s.button, primary ? s.buttonPrimary : null, style]} onPress={onPress}>
    <Text style={primary ? s.buttonTextPrimary : s.buttonText}>{label}</Text>
  </Pressable>
);

const DevPanelSheet = ({ onClose }: { onClose: () => void }) => {
  const dispatch = useDispatch();
  const accounts = useSelector(accountsSelector);
  const [tab, setTab] = useState<Tab>("portfolio");
  const [rows, setRows] = useState<Row[]>(PRESETS[0].rows);
  const [tokens, setTokens] = useState<string[]>([]);
  const [ops, setOps] = useState(40);
  const [days, setDays] = useState(90);
  const [autoDevice, setAutoDevice] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const roll = useRef(0);

  const [target, setTarget] = useState("");
  const [manualCoin, setManualCoin] = useState("bitcoin");
  const [txs, setTxs] = useState<ManualTx[]>([
    { key: 1, amount: "1", direction: "IN", daysAgo: 30, fee: "0" },
  ]);
  const nextKey = useRef(2);
  const [randCount, setRandCount] = useState(10);
  const [randMax, setRandMax] = useState("0.5");
  const [randSpan, setRandSpan] = useState(90);
  const [truncated, setTruncated] = useState(0);

  useAutoDevice(autoDevice);

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

  const build = useCallback(
    async (mode: "replace" | "append") => {
      setBusy(true);
      try {
        // Token lookup hits the CAL api and throws offline; lose the token, not the build.
        const store = getCryptoAssetsStore();
        const resolved = await Promise.all(
          tokens.map(id => store.findTokenById(id).catch(() => undefined)),
        );
        const tokensData = resolved.filter((t): t is TokenCurrency => !!t);

        const built: Account[] = [];
        for (const row of rows) {
          let currency;
          try {
            currency = getCryptoCurrencyById(row.id);
          } catch {
            continue;
          }
          for (let i = 0; i < row.count; i++) {
            const account = genAccount(`${roll.current}_${row.id}_${i}`, {
              currency,
              operationsSize: ops,
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
        dispatch(replaceAccounts(mode === "append" ? [...accounts, ...built] : built));
        const missing = tokens.length - tokensData.length;
        setStatus(
          `${built.length} accounts - ${ops} ops over ${days}d` +
            (missing ? ` - ${missing} token(s) unresolved` : ""),
        );
      } catch (e) {
        setStatus(`failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [rows, tokens, ops, days, accounts, dispatch],
  );

  const manualCurrencyId = useMemo(() => {
    const existing = accounts.find(a => a.id === target);
    return existing ? existing.currency.id : manualCoin;
  }, [accounts, target, manualCoin]);

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

  const addRandomTxs = useCallback(() => {
    const max = Number(randMax) || 1;
    setTxs(prev => [
      ...prev,
      ...Array.from({ length: Math.max(1, randCount) }, () => ({
        key: nextKey.current++,
        amount: (Math.random() * max).toFixed(6),
        direction: (Math.random() < 0.35 ? "OUT" : "IN") as "IN" | "OUT",
        daysAgo: Math.floor(Math.random() * Math.max(1, randSpan)),
        fee: "0",
      })),
    ]);
  }, [randCount, randMax, randSpan]);

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
      const LIMIT = 50;
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

  const applyManual = useCallback(() => {
    try {
      const existing = accounts.find(a => a.id === target);
      if (existing) {
        const edited = applyManualTxs({ ...existing }, txs);
        dispatch(replaceAccounts(accounts.map(a => (a.id === target ? edited : a))));
        setStatus(`${existing.currency.ticker} rewritten - ${manualBalance}`);
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
        setStatus(`added ${currency.ticker} - ${manualBalance}`);
      }
    } catch (e) {
      setStatus(`failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [accounts, target, txs, manualCoin, manualBalance, dispatch]);

  const deleteAccount = useCallback(() => {
    const existing = accounts.find(a => a.id === target);
    if (!existing) return;
    dispatch(replaceAccounts(accounts.filter(a => a.id !== target)));
    setTarget("");
    setTruncated(0);
    setStatus(`removed ${existing.currency.ticker} #${existing.index}`);
  }, [accounts, target, dispatch]);

  const fire = useCallback((events: Record<string, unknown>[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events.forEach(e => mockDeviceEventSubject.next(e as any));
  }, []);

  return (
    <View style={s.sheet}>
      <View style={s.header}>
        <Text style={s.title}>DEV PANEL</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={s.dim}>{accounts.length} accounts - close</Text>
        </Pressable>
      </View>

      <View style={s.tabs}>
        {(["portfolio", "history", "manual", "device"] as Tab[]).map(t => (
          <Pressable
            key={t}
            style={[s.tab, { borderBottomColor: tab === t ? C.accent : "transparent" }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, { color: tab === t ? "#9b9bff" : C.dim }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={s.body}>
        {tab === "portfolio" ? (
          <>
            <Text style={s.section}>presets</Text>
            <View style={s.grid}>
              {PRESETS.map(p => (
                <View key={p.name} style={s.cell}>
                  <Chip
                    label={p.name}
                    hint={p.hint}
                    onPress={() => {
                      setRows(p.rows);
                      setTokens(p.tokens);
                      setOps(p.ops);
                      setDays(p.days);
                    }}
                  />
                </View>
              ))}
            </View>

            <Text style={s.section}>coins</Text>
            <View style={s.grid}>
              {COINS.map(c => {
                const count = rows.find(r => r.id === c.id)?.count ?? 0;
                return (
                  <View key={c.id} style={s.cell}>
                    <View style={[s.stepper, count > 0 ? s.chipOn : null]}>
                      <Pressable onPress={() => bump(c.id, -1)} hitSlop={8}>
                        <Text style={s.step}>-</Text>
                      </Pressable>
                      <Text style={{ color: count > 0 ? "#fff" : C.dim, fontSize: 12 }}>
                        {c.label}
                        {count > 0 ? ` x${count}` : ""}
                      </Text>
                      <Pressable onPress={() => bump(c.id, 1)} hitSlop={8}>
                        <Text style={s.step}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={s.section}>tokens</Text>
            <View style={s.grid}>
              {TOKENS.map(t => (
                <View key={t.id} style={s.cell}>
                  <Chip
                    label={t.label}
                    on={tokens.includes(t.id)}
                    onPress={() =>
                      setTokens(prev =>
                        prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id],
                      )
                    }
                  />
                </View>
              ))}
            </View>
            <Text style={s.note}>
              Tokens attach to ETH / SOL / TRX / ALGO accounts. Other coins ignore them.
            </Text>
          </>
        ) : null}

        {tab === "history" ? (
          <>
            <Text style={s.section}>operations per account</Text>
            <View style={s.grid}>
              {[0, 10, 40, 100, 300, 500].map(n => (
                <View key={n} style={s.cell}>
                  <Chip label={String(n)} on={ops === n} onPress={() => setOps(n)} />
                </View>
              ))}
            </View>

            <Text style={s.section}>history span</Text>
            <View style={s.grid}>
              {[7, 30, 90, 365, 730, 1825].map(d => (
                <View key={d} style={s.cell}>
                  <Chip
                    label={d >= 365 ? `${d / 365}y` : `${d}d`}
                    on={days === d}
                    onPress={() => setDays(d)}
                  />
                </View>
              ))}
            </View>
            <Text style={s.note}>
              Operations are generated hours apart, so they are stretched onto this span and the
              balance graph rebuilt. A 1-year chart needs 365d or more.
            </Text>
          </>
        ) : null}

        {tab === "manual" ? (
          <>
            <Text style={s.section}>account</Text>
            <View style={s.grid}>
              <View style={s.cell}>
                <Chip label="+ new account" on={!target} onPress={() => loadTarget("")} />
              </View>
              {accounts.map(a => (
                <View key={a.id} style={s.cell}>
                  <Chip
                    label={`${a.currency.ticker} #${a.index}`}
                    hint={formatUnits(a.balance, a.currency.units[0].magnitude)}
                    on={target === a.id}
                    onPress={() => loadTarget(a.id)}
                  />
                </View>
              ))}
            </View>

            {!target ? (
              <>
                <Text style={s.section}>currency</Text>
                <View style={s.grid}>
                  {COINS.map(c => (
                    <View key={c.id} style={s.cell}>
                      <Chip
                        label={c.label}
                        on={manualCoin === c.id}
                        onPress={() => setManualCoin(c.id)}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Btn label="delete this account" onPress={deleteAccount} style={{ marginTop: 8 }} />
            )}

            {truncated > 0 ? (
              <Text style={[s.note, { color: C.warn }]}>
                {truncated} older operations are not loaded and will be dropped if you rewrite.
              </Text>
            ) : null}

            <Text style={s.section}>transactions - amount / dir / days ago</Text>
            {txs.map(t => (
              <View key={t.key} style={s.txRow}>
                <TextInput
                  style={[s.input, { flex: 1, marginRight: 6 }]}
                  value={t.amount}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor={C.faint}
                  onChangeText={v => editTx(t.key, { amount: v })}
                />
                <Pressable
                  style={[s.chip, t.direction === "IN" ? s.chipOn : null, { marginRight: 6 }]}
                  onPress={() =>
                    editTx(t.key, { direction: t.direction === "IN" ? "OUT" : "IN" })
                  }
                >
                  <Text style={t.direction === "IN" ? s.chipTextOn : s.chipText}>
                    {t.direction}
                  </Text>
                </Pressable>
                <TextInput
                  style={[s.input, { width: 56, marginRight: 6 }]}
                  value={String(t.daysAgo)}
                  keyboardType="number-pad"
                  onChangeText={v => editTx(t.key, { daysAgo: Math.max(0, Number(v) || 0) })}
                />
                <Pressable onPress={() => setTxs(p => p.filter(x => x.key !== t.key))} hitSlop={8}>
                  <Text style={s.step}>x</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: "row" }}>
              <Btn
                label="+ transaction"
                onPress={() =>
                  setTxs(prev => [
                    ...prev,
                    {
                      key: nextKey.current++,
                      amount: "0.5",
                      direction: "IN",
                      daysAgo: 7,
                      fee: "0",
                    },
                  ])
                }
                style={{ marginRight: 6 }}
              />
              <Btn
                label="clear rows"
                onPress={() => {
                  setTxs([]);
                  setTruncated(0);
                }}
              />
            </View>

            <Text style={s.section}>fill the rest randomly</Text>
            <View style={s.txRow}>
              <TextInput
                style={[s.input, { flex: 1, marginRight: 6 }]}
                value={String(randCount)}
                keyboardType="number-pad"
                onChangeText={v => setRandCount(Math.max(1, Number(v) || 1))}
              />
              <TextInput
                style={[s.input, { flex: 1, marginRight: 6 }]}
                value={randMax}
                keyboardType="decimal-pad"
                onChangeText={setRandMax}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={String(randSpan)}
                keyboardType="number-pad"
                onChangeText={v => setRandSpan(Math.max(1, Number(v) || 1))}
              />
            </View>
            <Text style={[s.note, { marginTop: 0 }]}>count / max amount / days back</Text>
            <Btn
              label={`+ ${randCount} random`}
              onPress={addRandomTxs}
              style={{ marginTop: 8 }}
            />

            <Text style={s.section}>result</Text>
            <View style={s.label}>
              <Text style={s.chipText}>balance after these</Text>
              <Text style={{ color: "#fff", fontSize: 12 }}>{manualBalance}</Text>
            </View>
            <Btn
              label={target ? "rewrite account" : "create account"}
              primary
              onPress={applyManual}
              style={{ marginTop: 8 }}
            />
            <Text style={s.note}>
              Amounts are applied exactly. The buttons at the bottom belong to the portfolio
              generator and will overwrite this.
            </Text>
          </>
        ) : null}

        {tab === "device" ? (
          <>
            <Text style={s.section}>auto-answer</Text>
            <Chip
              label={autoDevice ? "on - flows resolve by themselves" : "off - fire events by hand"}
              on={autoDevice}
              onPress={() => setAutoDevice(v => !v)}
            />
            <Text style={s.note}>
              Mock mode reports a device as connected, but nothing answers the flows until an
              event is sent. Off means they wait here.
            </Text>

            <Text style={s.section}>fire an event</Text>
            <View style={s.grid}>
              {DEVICE_EVENTS.map(e => (
                <View key={e.name} style={s.cell}>
                  <Chip label={e.name} onPress={() => fire(e.events)} />
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <Text style={s.status}>{busy ? "building..." : status}</Text>

      <View style={s.actions}>
        <Btn
          label={`apply (${total})`}
          primary
          onPress={() => build("replace")}
          style={{ marginRight: 6 }}
        />
        <Btn label="add" onPress={() => build("append")} style={{ marginRight: 6 }} />
        <Btn
          label="reroll"
          onPress={() => {
            roll.current += 1;
            build("replace");
          }}
          style={{ marginRight: 6 }}
        />
        <Btn
          label="clear"
          onPress={() => {
            dispatch(replaceAccounts([]));
            setStatus("portfolio emptied");
          }}
        />
      </View>
    </View>
  );
};

/**
 * Wraps the app so a four-finger downward swipe anywhere opens the panel.
 * The gesture requires exactly four pointers, so ordinary taps, scrolls and
 * pinches never trigger it.
 */
export default function DevPanelHost({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(4)
        .maxPointers(4)
        .minDistance(40)
        .runOnJS(true)
        .onEnd(e => {
          // Downward, and mostly vertical.
          if (e.translationY > 60 && Math.abs(e.translationY) > Math.abs(e.translationX)) {
            setOpen(true);
          }
        }),
    [],
  );

  if (!getEnv("MOCK")) return <>{children}</>;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }}>
        {children}
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <Pressable onPress={() => {}}>
              <DevPanelSheet onClose={() => setOpen(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </GestureDetector>
  );
}
