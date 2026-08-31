---
"@ledgerhq/coin-solana": minor
"@ledgerhq/live-common": minor
"@ledgerhq/ledger-wallet-framework": minor
"ledger-live-desktop": minor
"live-mobile": minor
---

Enable the generic coin framework for Solana: the send and staking screens move onto the generic transaction shape, and the validation, fees, balances and operation types the legacy bridge produced are restored on the generic path.

Also affects Stellar: a pending operation now shows its memo, as the confirmed one already did.
