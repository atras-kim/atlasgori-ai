# ATLASGORI sponsor integration candidate

Status: isolated development candidate; NOT deployed. No original/production env files copied.

## Scope

- `/sponsor-demo` is an operator-only execution workflow (authorization is enforced by POST `/api/sponsor-demo`). The static page contains no private data.
- Disabled unless `ATLAS_SPONSOR_DEMO_ENABLED=1` is explicitly supplied to the candidate process.
- Request accepts only `{ "scenario": "paper-packaging" }`. No arbitrary SQL, URLs, credentials, prompts, customer mail or attachments.
- Zetaris fixed SQL returns exactly two synthetic supplier rows without registering tables or modifying its catalog.
- Meterless Runtime authenticated `/v1/models` discovery and `/v1/chat/completions` choose the recycled-paper fixture. No direct OpenAI request or credential reuse is introduced.
- The H-MEM contract-based local subset persists only allowlisted synthetic facts, with source/provenance, ranking, per-owner/project isolation and a hash-linked append-only audit journal. It is a local implementation of the published reference architecture, not a downloaded Meterless library, hosted Meterless storage or full H-MEM conformance certification. Embeddings, mining, sleep and dreaming are not implemented.

## Verification already executed

17 new tests passed: official request contracts, auth errors, wrong models/answers, unexpected data rejection, cold/warm persistence, owner/project isolation, concurrent writes, corrupt journal/lock handling, and disabled/origin route gates. TypeScript check passed. A repeated synthetic CLI run returned priorRecallCount 0 then 2. External Zetaris/Runtime responses in these tests are MOCKS; local H-MEM persistence is real.

Live end-to-end verification is still pending: no authorized Zetaris query runtime/API configuration or Meterless Runtime endpoint/token was available. The logged-in Zetaris Cloud organization had no clusters. A successful mock result must never be described as live integration proof.

## Local checks (candidate only)

After installing the existing locked dependencies in a writable development copy:

    npm run test:sponsors
    npm run typecheck
    npm run verify:sponsors

The default CLI uses explicit mock transports and prints `mock-services-local-memory`. Run IDs, request IDs, SQL hash and recall counts are safe synthetic evidence. Temporary journal files are test-only data.

## Live synthetic verification after user review

Configure the VARIABLES listed in `.env.sponsors.example` privately in a NON-PRODUCTION candidate process. Never paste secrets into chat. No actual secret file is included. CLI reads process environment only; it does not load production `.env.local`.

    npm run verify:sponsors -- --live

The browser workflow uses `/sponsor-demo` under the existing operator session. Runtime requests may consume the models configured by the user in Meterless. No cluster provisioning, service installation, data upload or deployment is automated here.

Zetaris endpoint must end in `/api/v1.0`. Meterless endpoint must end in `/v1`. HTTPS is required except an explicitly enabled loopback-only HTTP development service. Redirects are rejected so bearer credentials are not forwarded. No fallback to mock or a different AI provider exists in the live route.

A live pass requires BOTH `live-query-confirmed` and `live-runtime-confirmed`, expected fixed rows, and a second execution recalling the synthetic memories. Match the Zetaris `X-Request-ID` to its server logs. Meterless receipt `requestId` is a local correlation identifier, not a vendor response ID. Retain server-side runtime traffic receipts to prove upstream routing. The current synthetic SELECT proves SQL execution only, not federation of real business sources.

## Persistence limits

The H-MEM journal is a small synthetic-demo store. Each commit is appended and fsynced; hash chains detect accidental corruption, not a malicious operator able to rewrite the full file. A partial final frame or a stale exclusive lock fails closed and requires explicit recovery. No automatic repair, deletion or retention process runs. A database-backed implementation, retention, embeddings and full conformance review are needed before enabling customer memory workloads.

## Original source / deployment provenance

Baseline PC source: `C:/AI/Ruflo-HQ/src/atlas`.
Historical deployment path: `/home/ubuntu/atlasgori` on the user's Gabia server. Current server-byte identity is NOT verified (SSH access blocked). Candidate does not modify the original folder, server settings, service or deployed files. Apply changed files only after review and deployment-diff verification.

## Primary contracts

- https://raw.githubusercontent.com/zetaris/getting-started/main/scripts/zetaris_sql.py (RestChannel.run)
- https://kbase.zetaris.com/knowledge/accessing-zetaris-using-api
- https://meterless.ai/engines.html (Runtime provider contract v4)
- https://github.com/Meterless/Meterless/tree/main/engines/hmem (architecture and reference contract)

