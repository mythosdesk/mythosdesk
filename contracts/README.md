# MythosLauncher (Robinhood Chain)

A self-hosted, one-transaction token launcher on Robinhood Chain's Uniswap v3.

**The app does not use it today.** The launch studio launches through pons v2 (see `packages/shared/src/launch.ts`). This contract is the fallback for when pons only lets whitelisted wallets launch (`canLaunch` returns false), or if the project ever wants its own launch terms. It is not deployed, and nothing in the app reads its address yet.

| Step | What happens |
| --- | --- |
| 1 | Deploys `MythosToken`: fixed 1,000,000,000 supply, 18 decimals, no mint / tax / owner (CREATE2, namespaced per creator) |
| 2 | Creates the Uniswap v3 **1%** pool against WETH and initialises it at the opening price (`START_TICK`, default 202000, about 1.69 ETH FDV, the same opening value as a pons ETH launch) |
| 3 | Puts the **entire supply** in a single-sided position the launcher holds forever (there is no function that moves it) |
| 4 | Optional first buy for the creator in the same transaction (`msg.value - launchFee`) |
| Fees | `collectFees(token)` is permissionless: WETH fees go `creatorFeeBps` to the creator's fee recipient, the rest to `treasury`; token-side fees are burned |

## Addresses it uses on Robinhood Chain mainnet (chain 4663)

From Uniswap's official Robinhood Chain deployment list, checked on-chain on 2026-11-18: the position manager and router both report this factory, `WETH9()` returns WETH, and the factory's tick spacing for the 1% tier is 200.

| Contract | Address |
| --- | --- |
| Uniswap v3 Factory | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` |
| NonfungiblePositionManager | `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` |
| SwapRouter02 | `0xCaf681a66D020601342297493863E78C959E5cb2` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

## Test

```bash
cd contracts
forge test --fork-url https://rpc.mainnet.chain.robinhood.com -vv   # both token orderings, first buy, sells, fees
```

6/6 pass against a live fork of Robinhood Chain mainnet on 2026-11-18. If your network intercepts the public endpoint, fork `https://robinhood-rpc.publicnode.com` instead. A launch uses about 6.1M gas and the deployment about 2.6M, roughly 0.00012 ETH and 0.00005 ETH at the 0.02 gwei seen that day, plus the L1 data fee.

## Deploy

Foundry lives in `~/.foundry/bin` on this machine. Use a fresh deployer key funded with a little ETH on Robinhood Chain.

```bash
cd contracts
cp .env.example .env                                    # DEPLOYER_PRIVATE_KEY, RPC_ROBINHOOD, TREASURY (Foundry loads it)
forge script script/Deploy.s.sol --rpc-url robinhood    # dry run: prints the address and cost
forge script script/Deploy.s.sol --rpc-url robinhood --broadcast
```

Defaults: launch fee 0.0005 ETH, creator share 60% of WETH LP fees, `START_TICK` 202000. `startTick` is immutable; the fee, creator share and treasury can be changed with `setConfig` and only affect future collections. Move ownership to a Safe afterwards with `transferOwnership`.

Verify the source on Blockscout (`robinhoodchain.blockscout.com`, Verify contract), which takes the Foundry settings above. Wiring the app to this launcher (a second option on the launch page) is not built yet.

## Notes before launch

- **Get an audit.** The contract is small and uses only Uniswap's periphery, but it will custody locked liquidity for every launch.
- **Pool pre-creation:** if someone creates the WETH pool for a predicted token address first, that launch reverts with no funds lost. Robinhood Chain's sequencer orders transactions first come, first served, which makes this harder but not impossible.
- Locked positions can never be withdrawn.
