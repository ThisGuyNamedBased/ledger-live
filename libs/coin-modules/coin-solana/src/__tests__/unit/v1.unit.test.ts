import { Connection, VersionedTransaction } from "@solana/web3.js";
import { getChainAPI } from "../../network/chain/index";

// Pre-built v1 SOL transfer (version byte 0x81), fake blockhash, PAYER signing to self.
// Generated with @solana/kit 8.2.0 — structurally valid but not broadcastable.
const V1_TX_FIXTURE =
  "gQEAAQAAAADMSQ6SjNLjhzuzQ/yV2jMXnKYPTb9GwsNukSmdVdTmuQEC5IvdNmgZwhyUJ0IuhnzsDudAywLFWcA265wPkApgEc8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAECDAAAAAIAAADoAwAAAAAAAEH610qbrnhmDJP0YUcU3KB6WsCwYc3e01URupdUSSP3NyLxaWfi+6eGOTuxD1svmfseABS6cB7BfKFKeFFaEA8=";

describe("Solana v1 transaction support (SIMD-0385)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Bug 1 — getParsedTransactions batch throws when v1 tx is present", () => {
    it("handles a v1 transaction without throwing", async () => {
      const signature = "5Et9TMD3YMTXAJWnraSe8Tgf5SaV5TbsFNXqZeD83d1";
      const mockTx = {
        transaction: {
          signatures: [signature],
          message: { accountKeys: [], instructions: [], recentBlockhash: "fake" },
        },
        meta: { fee: 5000, err: null, preBalances: [], postBalances: [] },
        slot: 100,
        blockTime: 1000,
      };
      jest
        .spyOn(Connection.prototype, "getParsedTransactions")
        .mockImplementation(async (_sigs, opts) => {
          const maxVersion =
            typeof opts === "object" ? opts.maxSupportedTransactionVersion : undefined;
          if (maxVersion !== 1) {
            throw new Error(
              "Transaction version (1) is not supported by the requesting client. " +
                "Please try the request again with the following parameter included: " +
                '"maxSupportedTransactionVersion": 1',
            );
          }
          return [mockTx];
        });

      const api = getChainAPI({ endpoint: "http://localhost:8899" });
      const result = await api.getParsedTransactions([signature]);

      expect(result).toMatchObject([{ meta: { fee: 5000 } }]);
    });
  });

  describe("Bug 2 — VersionedTransaction.deserialize throws for v1 bytes", () => {
    it("deserializes v1 bytes without throwing", () => {
      const bytes = Buffer.from(V1_TX_FIXTURE, "base64");
      expect(() => VersionedTransaction.deserialize(bytes)).not.toThrow();
    });
  });
});
