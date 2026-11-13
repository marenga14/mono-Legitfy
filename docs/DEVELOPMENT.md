# Developing Legitfy

How to run, deploy and maintain Legitfy. For what it is and why it exists, see the [README](../README.md).

## Layout

| Folder | What it is |
|---|---|
| `contracts/` | Foundry. `LegitifyRegistry` (credentials), `AuditAnchor` (daily audit roots), `LegitifyPaymaster` (gas sponsorship, not connected yet) |
| `contracts-starknet/` | Scarb (Cairo). `LegitifyRegistry` for Starknet: same rules, statuses and IDs as the Solidity registry |
| `api/` | Node + Hono. Applications, request desk, agent triage, escalation, audit log, encrypted files |
| `web/` | Vue 3 + Vite + Tailwind. Public site, verifier, application flow and console, in light and dark themes |

## Run it

```sh
# contracts (needs Foundry)
cd contracts && make deps && forge test

# Starknet registry (needs Scarb: brew install scarb)
cd contracts-starknet && scarb build && scarb cairo-test
node scripts/starknet-abi.mjs   # after changing the contract: copies its ABI and class hash to api/ and web/

# api: copy .env.example to .env and fill in the secrets it lists
cd api && npm install && npm test && npm run dev

# web: copy .env.example to .env
cd web && npm install && npm run dev
```

Without `DATABASE_URL`, the API uses PGlite in `api/.data`, so local development needs no database server. Set `TEST_DATABASE_URL` to run the API tests against real Postgres. That wipes the database it points at.

### Local end-to-end stack

`scripts/local-up.sh` starts anvil on port 8546, deploys and seeds the contracts, writes sample PDFs to `.local/samples/`, and fills `api/.env` and `web/.env`. Re-running it keeps your data; `--reset` starts from nothing. It uses anvil's public test keys, so never point it at a real network.

| Anvil account | Role |
|---|---|
| 0 | Platform admin |
| 1 | Admin, Kilimani University |
| 2 | Operator, Kilimani, through a smart account (can't publish) |
| 3 | Operator, Kilimani, direct wallet |
| 4 | Admin, Pwani College |

To use your own wallets, create a root `.env.local` with `LOCAL_PLATFORM_WALLET=0x...` and `LOCAL_ADMIN_WALLET=0x...` (Kilimani admin), then re-run the script. Each is funded with 100 local ETH and replaces the seeded account in that role.

## Joining and network details

Institutions apply at `/apply` with their registration document, the applicant's government ID type and number, and a wallet they prove they hold. Reviewers confirm the ID with the issuing authority. The number is stored encrypted, each view is audited, and rejecting an application erases its personal details and files. After approval, admins edit contact details directly and request changes to registered details with evidence, which the platform reviews. The on-chain name is permanent. They then download a pre-filled letter of mandate, have their head sign and seal it, and upload it from their tracking link. The platform admin reviews applications in the console, and approving registers the institution on-chain from the admin's wallet. Registered names can't be changed or deleted.

After deployment, the platform admin sets the network name, chain ID, RPC URL, explorer and registry address under Settings. Saving checks that the RPC answers on that chain and that the admin owns the registry. Public pages show BOT Chain mainnet details while the app runs on a development chain.

### Starknet

Starknet isn't EVM, so it has its own registry in `contracts-starknet/`. Credential IDs and file hashes are the same 256-bit values as on BOT Chain, so one certificate code verifies on either network. Starknet is listed as an extra network: sign-in and the main network stay on BOT Chain.

1. Deploy with Starknet Foundry's `sncast` (declare `LegitifyRegistry`, then deploy with the platform's Starknet account as `initial_owner`). Deploy the class built from this repo: the API refuses any other class hash.
2. In the console, go to Settings, Supported networks, Add network, choose Starknet, and enter the RPC URL, the explorer (for example `https://voyager.online`) and the registry address. Saving checks the chain ID and the class hash, and writes the registry's owner to the audit log.
3. Register institutions on the Starknet registry from the owner account with `sncast invoke ... register_institution`. Institution admins add operators with `add_operator`. These steps aren't in the console yet.
4. Staff publish a document from Document details with Argent X or Braavos. The registry only accepts accounts that belong to an active institution, so the console asks the registry first and explains when an account isn't registered.

Public checks and document status search every listed network, Starknet included. If one network doesn't answer, a check reports an error instead of "not found".

## Where files live

Legitfy doesn't use IPFS. The chain holds a fingerprint of each file, and the file itself is encrypted with AES-256-GCM and stored on a volume attached to the API.

| Data | Where it lives |
|---|---|
| Fingerprints, dates, institution names | Public, on-chain |
| Certificates, request files, application documents | Encrypted, API storage |
| Institution and network logos | Unencrypted, API storage, served publicly |
| Requests, staff details, audit log | Postgres |

We keep documents off IPFS because they hold personal data. Anything published there can be copied and can't be reliably deleted, so encrypting it first would only protect it until a key leaks, and an institution couldn't honour a request to erase it. The registry's optional `storageCid` field stays empty. The contract isn't upgradeable, so the field remains, and it costs nothing when unused.

## Hosting

The API has to be hosted. Public checks only need the static site and an RPC, but sign-in, publishing, applications, requests, share links and audit anchoring all run on it.

| Part | Needs |
|---|---|
| `web/` | Vercel, built with the `VITE_` values for the target network |
| `api/` | One always-on container with a persistent volume, plus Postgres. Serverless and edge platforms won't work, because it uses the filesystem and background timers |
| RPC | The network's public RPC is enough to start |

### Deploying

**API (Docker and nginx).** `compose.yaml` runs the API and Postgres. Clone this repo to `/opt/legitfy`, beside your other apps. The API joins the shared nginx network as `legitfy` and publishes no ports. Postgres stays on a private network.

```sh
cd /opt/legitfy
cp .env.example .env   # then fill in the secrets and REGISTRY_ADDRESS
docker compose up -d --build
```

The shared `web` network must already exist, which it does once `/opt/proxy` is running. This stack publishes no ports, so it can't clash with other apps on the server.

Add the server blocks from `deploy/nginx/legitfy.conf` to the `http` block of `/opt/proxy/nginx.conf`, and put the certificate at `/opt/proxy/certs/api.legitfy.dev/` as `fullchain.pem` and `privkey.pem`. Then, from `/opt/proxy`:

```sh
docker compose exec nginx grep -c api.legitfy.dev /etc/nginx/nginx.conf   # must not be 0
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

Edit `nginx.conf` with `nano`, not `vim` or `sed -i`. Those replace the file, and Docker's single-file mount keeps pointing at the old one, so nginx can't see the change. If the first command fails or prints 0, run `docker compose restart nginx`, which briefly interrupts every app behind the proxy.

**Web (Vercel).** Set the project root to `web/` and add these variables. Vercel fills in the build, and `web/vercel.json` handles page routes.

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api.legitfy.dev` |
| `VITE_CHAIN_ID` | `677`, or `968` for testnet |
| `VITE_RPC_URL` | `https://rpc.botchain.ai` |
| `VITE_REGISTRY_ADDRESS` | The deployed registry |
| `VITE_SUPPORT_EMAIL` | `support@legitfy.dev` |
| `VITE_CONTACT_EMAIL` | Optional |

`WEB_ORIGIN` in `.env` must match the site's address exactly, or the browser will block its calls to the API. Vercel preview URLs won't work against it.

Before real documents go in:

- Back up the database with `pg_dump` and copy the `legitfy-files` volume. Keep `FILE_MASTER_KEY` somewhere separate. Without the key, stored files can't be recovered, and losing the volume loses them. Public records on-chain aren't affected.
- Run one API container. Uploaded files, rate limits and background jobs all assume a single instance, so scaling past that needs object storage first.

## Verify API

Employers and banks can check a certificate without a wallet, an account or blockchain tools. Both routes are public, read-only and limited to 60 calls a minute per client.

| Route | Input |
|---|---|
| `GET /public/verify/:id` | A short certificate ID, or the full on-chain ID |
| `GET /public/verify/file/:hash` | A file's SHA-256 hash, starting with `0x` |

Each searches every listed network and answers with `status`, the issuer, dates and any replacement. If a network doesn't reply and nothing was found, the API answers `503`, never `not_found`.

## Email

The API sends email through [Resend](https://resend.com) when `RESEND_API_KEY` is set. Without it, no email goes out and everything else keeps working. Verify the `legitfy.dev` domain in Resend first, or sends will fail.

| Event | Goes to |
|---|---|
| Application received, with tracking link | Applicant |
| Application approved (welcome) | Applicant and official email |
| Application rejected, with reason | Applicant and official email, read just before the data is erased |
| Request received, with tracking link | Requester |
| New request | Institution's official email |
| Request answered, without the answer | Requester |
| Change request approved or rejected | Institution's official email |

Email failures are logged and never block the action that caused them. Templates are in `api/src/emails.ts`, in English, Kiswahili and Simplified Chinese.

## Languages

The web app ships in English, Kiswahili and Simplified Chinese. English is the source in `web/src/locales/en.ts`, and `sw.ts` and `zh.ts` must match it key for key. API messages stay in English and are translated in `web/src/locales/server.ts`. `npm test` in `web/` fails if a key, a placeholder or an API message is missing.

## Rules that keep this trustworthy

- The registry decides authenticity. The agent never answers; only staff can.
- The agent reads a document only if the institution opted in and the requester consented.
- Public checks hash the file in the browser. The file is never uploaded.
- A network or institution appears publicly only when it's real: a registry must answer, and listing is opt-in.
- No personal data on-chain.
- Never commit a secret. Anything prefixed `VITE_` ships to the browser.
