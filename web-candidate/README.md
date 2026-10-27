# ATLAS — local MVP

Next.js 16 + TypeScript + Supabase/Postgres. The local app runs at http://127.0.0.1:4317. No production site or DNS has been changed.

## Run

```powershell
cd C:\AI\Ruflo-HQ\src\atlas
npm ci
npm run dev
```

Without Supabase configuration, the app explicitly shows synthetic demo mail. Demo composition never calls the send API. Real user data is not written to localStorage. Demo changes are session-only.

## Configure real accounts

Start with `npm run setup:init` (creates an ignored local config and a new encryption key only if the file does not exist), then fill configuration privately and run `npm run setup:check`. This is an offline format check, not a connection test. See [the Korean first-mail setup guide](docs/first-real-mail.md).


1. Use a dedicated Supabase project. Run `supabase/migrations/001_atlas.sql`, `002_evidence_integrity.sql`, `003_document_library.sql`, then `004_mail_assistance.sql`, in order. For an existing installation, apply only missing migrations. Schema migrations are applied once; the document backfill statement itself is safe to repeat. Existing Supabase users are backfilled into profiles.
2. Set the values documented in `.env.example` using an ignored `.env.local` or your deployment secret manager. Do not paste keys into chat. The service-role key and encryption key must never be public-prefixed variables. Generate a unique 32-byte base64 encryption key; retain it securely because losing it makes stored tokens unrecoverable. Key rotation requires an explicit migration, not simply overwriting the key.
3. Provision the first ATLAS user through Supabase Auth, then sign in with email/password. This build intentionally does not expose public sign-up. Configure Supabase's production rate limits and abuse protection.
4. Enable Gmail API in a user-owned Google Cloud project and register a Web OAuth client. For local testing, register `http://127.0.0.1:4317/api/oauth/google/callback`. The browser address and `ATLAS_APP_URL` must match exactly. For the requested domain, use `https://atlasgori.com/api/oauth/google/callback` only after a deployment and DNS are authorized and configured.
5. Configure the Google consent screen and test users. Requested scopes are `gmail.readonly` and `gmail.send`; no mailbox deletion/modification scope is requested. External production apps using restricted Gmail scopes may require Google verification and a security assessment depending on data handling. A testing consent screen is not production approval.
6. In ATLAS, connect Gmail through the Google button. NAVER/Daum/Yahoo use fixed IMAP/SMTP presets and an app password or other provider-supported credential. Enable IMAP/SMTP in the provider's account settings first. Connection tests authenticate but do not send any message.
7. Perform a real send only after reviewing the exact sender, recipients, cc/bcc, subject, body and attachments in the final confirmation. Never use a test recipient without its owner's agreement. Unknown delivery results must be reconciled in the original mailbox; this app never automatically retries a send.

The default contact/sender preference is `mmm_ceo@naver.com`, but sending is only possible after that address is connected and authenticated. `ceo@grimmaru.com` and existing Google integrations were not accessed or modified.

## Implemented behavior

- Multiple account records, Gmail OAuth authorization-code + PKCE, user-bound single-use state and encrypted offline tokens.
- NAVER/Daum/Yahoo IMAP receive + SMTP send; fixed hosts, TLS validation and no arbitrary server input.
- Inbox sync batches of 25, history cursor, bounded message downloads (15 MB), stored attachments (10 MB each), and a per-account sync lease. Gmail fetches the INBOX label; IMAP fetches INBOX. Unread state is read from the provider. Opening a message in ATLAS does not change the original unread flag.
- Manual sync and foreground refresh every two minutes while signed in. No unattended scheduler, Gmail Pub/Sub history worker, whole-folder sync or remote deletion reconciliation is included yet. Use past-mail import to retrieve older mail; up to 250 messages are currently shown in the main list.
- Gmail MIME sending and SMTP sending with exact, encrypted, 10-minute single-use send intent. The chosen account controls the From address. Preparing a message does not send it. Server-side atomic claim prevents replay/concurrent dispatch of the same intent. A submitted result means provider acceptance, not final delivery. SMTP partial/uncertain results are not retried. SMTP Sent-folder append is not implemented.
- Project creation, manual classification, admin overview, explicit member addition/removal for existing ATLAS users and RLS-protected sharing. Project owners control changes; members are read-only. Admin view is not a bypass of Private/Restricted permissions.
- AI classification and Project Brief via Anthropic adapter, disabled unless configured and explicitly enabled for that mailbox. Automatic classification only targets Private projects; sharing is a separate user action. Evidence version checks reject stale summaries after evidence removal. Summaries include reference IDs and generation time.
- Text/plain, CSV and JSON attachment extraction: maximum 1 MB and 12,000 text characters per attachment. PDF, DOCX, spreadsheets and image OCR are not processed until a resource-isolated worker is implemented. The UI preserves their downloadable originals and reports unsupported extraction.
- Source-backed Brave web search, natural-language query input, up to five result pages, per-domain deduplication and project candidate saving. Results are unverified web candidates, not guaranteed manufacturers or 100 verified suppliers. No emails/forms are sent to suppliers.
- Frankfurter USD/KRW and other reference currencies, with observation date and five-minute application caching. These are **daily reference rates, not live trading quotes**. A licensed intraday feed remains to be integrated.
- Outlook provider contract and unavailable UI, intentionally disabled pending Microsoft Graph implementation and testing.

## Data and permissions

| Visibility | Readers |
| --- | --- |
| Private | Project owner only |
| Project Shared | Owner and explicit project members |
| Company | Owner and registered members of the chosen company |
| Restricted | Owner and explicitly allowed members; no company-wide access |

In this MVP, Project Shared and Restricted both use explicit membership; Restricted labels a narrower intended audience but does not add a separate approval workflow. Company membership is provisioned administratively in `companies` and `company_members`; self-enrollment is not allowed. In multi-company deployments, add an explicit company picker before onboarding users into multiple companies.

Only the service-role server can mutate application tables; every action checks authenticated identity and record ownership. Read APIs and downloads use the user's RLS session. `account_secrets`, `send_intents`, `oauth_states` and `rate_limits` are inaccessible to normal clients. Mail content is stored in Postgres under RLS; provider credentials and prepared outgoing content use AES-256-GCM with contextual AAD. Encryption at rest and backups remain hosting responsibilities.

AI input consists only of selected messages from accounts whose owner opted in. Emails and attachments are treated as untrusted data, never executable instructions. There is no AI tool that can send mail, change permissions or fetch arbitrary URLs.

## Before production on atlasgori.com

- Authorize deployment and domain changes separately. Use Node hosting that supports IMAP/SMTP TCP connections and request durations; a static-only host cannot run this backend.
- Apply migrations and verify RLS using real Supabase sessions from two test companies. Local PGlite tests do not prove a deployed Supabase configuration.
- Complete real Gmail and provider-specific IMAP/SMTP tests, provider verification, quotas and Google consent-screen review.
- Provision secrets through the host, HTTPS, backups, audit monitoring and a retention policy. Add shared ingress rate limiting for login; the supplementary in-process login limiter does not span server instances.
- Schedule expiry cleanup of OAuth states and prepared intents; reconcile old `sending`/`uncertain` entries without automatic retry. Store only the minimum necessary evidence and define deletion/backup-retention behavior.
- Deploy queue workers for continuous sync and isolated document extraction before promising unattended processing or PDF/Office AI support.
- Configure the intraday FX feed and real sourcing key before advertising those functions as live.
- Outbound email, DNS, deployment, purchases and account changes remain subject to the user's exact approval.

## Verification

### Project document folders

Open a project and choose **프로젝트 폴더 · 문서함**. Original attachments are saved in Postgres; logical folders reference those originals, not local filesystem directories or publicly accessible storage objects. New and existing attachments are categorized by explicit filenames into 견적서, 제품 브로셔 / sender-based company, or 분류 확인 필요. Brochures without a unique sender address, ambiguous filenames, and unknown document types go to review. This classification does not parse PDF/Office contents and needs no external AI call.

Corporate sender domains provision company folder labels. Known public email providers use the full sender address instead, so unrelated Gmail/NAVER/Yahoo accounts are not grouped together. This is a sender-based suggestion, not verified company identity; aliases and unrecognized public providers can be corrected by the original mail owner. Manual corrections persist and are not overwritten by backfill or duplicate sync. Empty folders appear when their first document arrives; the UI shows placeholders before that. The same filename in different emails remains a separate original.

Folders inherit message/project RLS. Project reassignment moves the logical folder location without copying files. Unassigned messages are available under **프로젝트 미지정 첨부**. The document API paginates 50 files and aggregates folder counts over accessible originals independently of the Inbox's 250-message limit. Revoking access blocks subsequent list/download requests; copies already downloaded cannot be recalled. Deleting/disconnecting the original mailbox removes these references and originals; this feature is not an independent archival backup.

Automatic filing runs when mail sync saves attachments. Existing project auto-classification still requires AI consent/configuration; manually assigning a message also places its attachments in that project. Continuous background sync and actual Supabase/provider verification remain deployment prerequisites. Retry sync repairs missing attachments for messages revisited by sync, without replacing existing files.

`npm run typecheck`, `npm test`, `npm run build`.

Tests run actual PostgreSQL semantics locally using PGlite with a minimal Supabase-compatible auth schema. They cover cross-company RLS, explicit membership revocation, secret isolation, Private-only automatic assignment, stale Brief rejection, send/OAuth atomic claims, rate limits, credential AAD/tampering, CRLF injection, MIME and BCC handling, file budgets and streaming size limits. No production database or real email account is contacted by the tests.

Reference docs: [Gmail OAuth](https://developers.google.com/workspace/gmail/api/auth/web-server), [Gmail sync](https://developers.google.com/workspace/gmail/api/guides/sync), [Supabase server auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Brave search pagination](https://api-dashboard.search.brave.com/app/documentation/web-search), [Frankfurter reference rates](https://frankfurter.dev/).
