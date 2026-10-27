# Atlasgori — an email assistant for busy people

Wildcard [Tinkerer]: Bring Your Own Project — published submission revision, 27 October 2026.

## Who it is for

Atlasgori is intended for busy employees, small teams and anyone who finds writing email a chore. It helps users find context and start from an editable draft. Trade is one sample use case, not a restriction on intended users. No measured time saving, broad user study or universal language-quality result is claimed. This is revised submission positioning; the production site was not redesigned or redeployed.

## Existing product and new work

The existing ATLASgori product base is explicitly declared as pre-existing work. Its Next.js/TypeScript application source is in web-candidate/. It connects Gmail and supported IMAP/SMTP accounts, groups mail and attachments by project, and provides conditional AI classification, summaries, incoming-mail translation into Korean, evidence-linked project briefs, and reviewed reply drafts. Existing effective AI routes use OpenAI with account consent. Reply preparation can translate an edited Korean draft into the latest sender's language. This is not an assertion of universal language support or newly tested production-mail accuracy. Outlook is not claimed supported.

The hackathon addition is the sponsor extension in web-candidate/lib/sponsors, its API/UI, private worker, and focused tests. It runs a SEPARATE fixed synthetic paper-supplier scenario: actual local Zetaris SQL, actual Meterless local Llama inference, and normal persistence in a custom H-MEM contract-based subset. It does not replace the production mail AI provider and has not been deployed. The authenticated test dependency was a synthetic local fixture, not real Supabase login.

The older standalone PDF quotation demo remains in src/meterless_demo/. It is an additional bounded procurement example, not the main subject of the new Wildcard walkthrough. Its synthetic PP results must not be combined with the paper-supplier scenario as one run.

## What the new video shows

The main story is connected mail → project context → language assistance → reviewed reply. Screens are actual local application DEMO mode with synthetic messages and a prefilled brief/draft. No real account was connected, no customer mail was read, no mail was sent, and no fresh OpenAI call was made to produce those screens. The separate sponsor evidence is an actual development test. The video is narrated slides/screens, not a continuous live recording.

## Run the existing app in safe DEMO mode

Requirements: Windows, Node.js 20.9 or newer, and the locked npm dependencies. Inside web-candidate run npm ci, npm run typecheck, npm run test:sponsors, then node node_modules/next/dist/bin/next build --webpack. Without Supabase environment configuration, the workspace displays its synthetic DEMO state. Run npm run dev to serve only on 127.0.0.1:4317 and open /workspace. Do not expose the development server publicly. The demo account uses operator@example.invalid. No live AI execution is implied by prefilled DEMO examples.

Authenticated production functions require privately supplied Supabase, mail credentials, explicit AI consent and the configured provider. See .env.example and source for variable names. Do not copy production secrets into this repository or chat. This review does not ask you to change a running service, security policy, account or cloud resource.

## Sponsor extension prerequisites and reproducibility

An entitled local Zetaris installation, Docker prerequisites required by that vendor, Meterless Runtime 1.2.2, and a ready local Llama 3.2 3B Instruct model are external dependencies. Their binaries, model weights, credentials and distribution files are not included. Supply your own authorized installation; no installation or cloud provisioning is automated here.

From web-candidate: npm run verify:sponsor-worker -- --live --zetaris-env C:/YOUR/zetaris-platform/.env --meterless-token-file C:/YOUR/runtime/proxy-token . The worker uses only fixed synthetic data and bounded local paths. Use a Runtime without cloud providers/keys for this scenario; the test fails closed otherwise. Do not change another user's runtime settings to force it to pass.

scripts/verify-sponsors-web.mjs additionally exercises the actual Next page, POST202/GET polling and private worker with a synthetic local Supabase dependency. It is a development-PC harness with fixed loopback port4318 and an explicit local credential-file path; review those paths before using another PC. It verifies the HTTP workflow, not browser-click behavior or real Supabase authentication. The private worker requires a process-local authorization token and must remain private; see scripts/sponsor-worker.ts and .env.sponsors.example. No token is bundled.

## Evidence and limits

evidence/latest-web-verification.json and evidence/latest-web-verification-report.txt preserve the verified run6851fe73-c93d-4849-9213-4bb5e60e1f74, two actual SQL/inference runs, matching Runtime receipts, cold recall0→warm2 and separate-process recall2. 50 focused tests, type checking and webpack build passed on the developer PC. The app restarted while the worker stayed alive. H-MEM is a custom subset, not full conformance, crash recovery or proven inference improvement. Runtime routing is Runtime-reported; its embedded-key signature check is not vendor-pinned trust or a packet capture.

Operational screenshots, account-management utilities, all build/runtime folders, real .env files and credentials are excluded. The synthetic demo contact address was sanitized. Required app, sponsor, setup and test code is retained. Historical docs inside snapshots may describe earlier states; this README and the safe evidence are the current review guidance.

## Publication and attribution

The owner approved publication on 27 October 2026. The approved source and evidence were published in commit 4213b635fc0465ef0cd5666e813be47176d75469. The existing submission was changed to Wildcard, saved, and reloaded successfully with Submitted 1/1 at 23:03 KST. No production deployment or security-setting change was performed.

Published demo: https://iframe.mediadelivery.net/embed/778121/75b9ef16-b209-4893-b347-b5d2e4644697

Published pitch deck: https://hackathon-server.genai.works/api/v1/cdn/proxy/hackathon/b59f1a6e8b4d43aeafca78ff336339c2.pptx

Jongmyoung Kim supplies product direction. Codex assisted implementation and materials. Pre-existing application code is declared; only the identified new work should be evaluated as the hackathon extension. Vendor runtimes, models and libraries retain their own licences. No repository-wide open-source licence has been selected. No Cursor, NVIDIA-specific or Nemotron integration is claimed.
