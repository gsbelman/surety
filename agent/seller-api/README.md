# Seller API

A minimal paid HTTP API, backed by a Surety bond. It shows how an API seller plugs into Surety: three small steps, and no change to the service itself.

The service reports on an Arc address: USDC balance, contract or wallet, and transaction count, read from the chain at one block. The price is 0.02 USDC per call. The wallet is the demo seller, with a 1 USDC bond and a 10% penalty.

## The flow

1. **Quote.** A call with no payment gets HTTP 402 and the terms: escrow, seller, amount, delivery window, and job reference.
2. **Pay.** The buyer calls `pay()` on SuretyEscrow, then repeats the call with the `x-surety-payment` header.
3. **Serve.** The server checks the payment onchain and does the work. It calls `deliver()` with `keccak256(response)`, and then returns the response.

The buyer compares the hash with the onchain proof, then calls `release()`. If the buyer stays silent, the server calls `settle()` after the objection window and collects the payment.

## What the server does by itself

- **The work fails.** The server calls `decline()`. The buyer gets a full refund, and the bond keeps its penalty.
- **A payment has no matching call.** The server calls `decline()` 20 seconds before the deadline. Without this step, anyone could pay the seller, wait, and collect the penalty (audit finding SE-03).
- **The buyer stays silent.** The server calls `settle()` after the objection window.
- **The response gets lost.** The buyer asks again with the same payment id and gets the same body.

## Run it

You need the mainnet deployment, the `.env` file in the repository root, and a funded seller wallet with a bond.

```sh
# Terminal 1: the server holds the seller key only.
SURETY_NETWORK=mainnet npm run seller-api

# Terminal 2: the buyer makes three real calls.
SURETY_NETWORK=mainnet npm run seller-api:calls
```

Set `PORT` to change the server port (default 8790). Set `SELLER_API_URL` to point the calls at another address. The server listens on `127.0.0.1` only.

Try the quote with curl:

```sh
curl -i "http://127.0.0.1:8790/v1/address-report?address=0x3600000000000000000000000000000000000000"
```

## What the calls script does

The script reads the balances first. It stops before it spends if the worst case passes 0.30 USDC, or if a wallet would drop below its reserve (agent 0.25 USDC, seller 0.20 USDC). It checks these limits again before each payment.

| Call | What happens | End state |
| :- | :- | :- |
| 1 | The buyer checks the hash, reads the reported balance from the chain, and releases | Seller paid |
| 2 | The buyer takes the result and stays silent. The server settles after 30 seconds | Seller paid |
| 3 | The buyer pays and never calls the API. The server declines before the deadline | Buyer refunded, no penalty |

The script reads each server transaction from onchain events, so its record does not depend on the server. It adds each run to `agent/runs/seller-api-<network>.json`. If a run stops, set `FROM_CALL=2` or `FROM_CALL=3` to continue.

## Mainnet run

The three calls ran on Arc mainnet on October 31, 2026, with payments 7, 8, and 9. The transaction links are in the root [README](../../README.md#plug-in). The log is in [`agent/runs/seller-api-mainnet-output.txt`](../runs/seller-api-mainnet-output.txt).

## Limits

- **The bond is safe from unsolicited payments only while the server runs.** If the server is off, a payment with no call costs the seller the penalty at the deadline. The contract has no seller opt-in (SE-03). Withdraw the bond with `withdrawBond` when the server stays off.
- **Results stay in memory.** After a restart, the server cannot serve a delivered result again.
- **The server does not authenticate the caller.** Anyone with the payment id and the exact URL can read the result. This is acceptable here, because the result is public chain data. A seller of private data must also ask for a signature from the buyer.
- **This is an HTTP 402 flow in the style of x402.** It uses a Surety header, not the x402 wire format or a facilitator.
- **The watcher reads each payment id from the start.** A busy seller must read `Paid` events instead.
