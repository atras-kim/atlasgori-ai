# AtlasGori AI

Evidence-backed supplier quotation review. Open Agent Hackathon 2026 solo submission preparation.

## What works

1. Read the synthetic buyer policy from local Zetaris.
2. Upload 1–3 text PDFs or run the included synthetic samples.
3. Extract fields using a real local Meterless model call.
4. Check source labels, arithmetic and procurement conditions.
5. Compare quotes, explain warnings and draft English supplier questions.
6. Export CSV and JSON with the policy/query provenance and model-call receipts.

The extraction model does not make purchase decisions. Rules validate supported source labels and compare the results. Follow-up drafts use verified fields and rules; they do not make another model call.

## Supported environment and dependencies

This prototype currently supports **Windows**. Python 3.12+, Node.js with built-in fetch, Meterless Runtime 1.2.2 with local Llama 3.2 3B Instruct, and an entitled local Zetaris installation are required. Docker Desktop and WSL2 are prerequisites for Zetaris on the tested PC. Hardware needs depend on the local model and vendor runtime. Other operating systems have not been tested.

Meterless and Zetaris must be installed from their official sources under the user's own terms/account. Their binaries, model weights, registry credentials, distribution ZIPs and JDBC drivers are deliberately excluded from this repository.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Start Meterless and wait until its local model is ready. This app uses Windows local named-pipe runtime status and loopback port 8088. Ensure no cloud key/provider is configured for this local-only demo. Configure the `atlasgori-pdf-demo` app profile for local processing, local-only privacy, race width 1 and Llama 3B. Do not remove another user's cloud settings automatically; use a suitable local runtime configuration. The runner rejects a cloud path or missing local lane. No Meterless bearer token belongs in source control.

The server uses Meterless's bundled Node when present, then Node on PATH. To select another installation:

```powershell
$env:ATLASGORI_NODE = 'C:\path\to\node.exe'
```

## Zetaris local setup

1. Download your authorized official Zetaris local bundle. Extract it to `.runtime/zetaris/zetaris-platform/` relative to this README. The bundle's `.env` stays local and ignored. Read the vendor README and personally accept any required terms.
2. Configure its UI on `127.0.0.1:3000`, then start the official stack. Run Docker commands from the bundle folder. Published ports should remain bound to loopback. Wait for PostgreSQL, driver, API and UI to become healthy. Do not use `down -v` unless you intend to erase persistent data.
3. Create `config/zetaris.env.local` containing only `ZETARIS_MODE=local-bundle`. The demo reads the existing bundle account privately and keeps session tokens in memory. The account is an administrator in this local prototype. Runtime code exposes only two fixed SELECT queries; production requires a scoped read-only identity.
4. Register the synthetic policy using the bundled official JDBC driver. From this repository root with the stack running:

```powershell
docker cp scripts/ZetarisPolicySetup.java zetaris-driver-1:/tmp/ZetarisPolicySetup.java
docker cp .runtime/zetaris/zetaris-platform/jdbc/ndp-jdbc-driver-2.4.3.1-7eff043-driver.jar zetaris-driver-1:/tmp/atlasgori-jdbc.jar
docker exec zetaris-driver-1 java --class-path /tmp/atlasgori-jdbc.jar /tmp/ZetarisPolicySetup.java
python scripts/zetaris_register_policy.py
```

Adjust the container name/JAR filename only to match the official bundle version you installed. Tested version: Zetaris 2.4.3.1 hackathon distribution. Java reads existing account environment variables inside the container, never a password on the command line. The fixed setup creates a Schema Store container and view without replacing existing objects. If values differ, verification fails; do not silently overwrite them. UI proxy endpoints accept SELECT, not DDL.

`atlasgori_policy.buyer_criteria` contains one synthetic policy: `PP_BUSAN_DEMO`, quantity 20 MT, maximum shipment 21 days, maximum deposit 30%, MFR 12 with tolerance 2. It is a persistent view over declared demo constants, not an external live procurement database. Fresh-session retrieval was tested; restart persistence was not separately tested during this run.

The optional API-key REST adapter is separate and has mocked protocol tests. It is not the authenticated path used for this demo.

## Run

```powershell
python src/meterless_demo/server.py
```

Open http://127.0.0.1:8768/. Click **Zetaris 구매 기준 불러오기** (load Zetaris buyer criteria), then **샘플 PDF 3개로 실행** (run 3 sample PDFs). For your own supported text PDFs use the file chooser and **선택한 PDF 분석**. The interface is Korean; the generated supplier inquiries are English.

When Zetaris mode is selected, the server fetches policy values again at analysis start and rejects a failed lookup. It never trusts the browser to label manual values as Zetaris data. Editing any criterion switches to manual mode and hides previous results. The exported JSON includes criteria, source, policy ID, SQL, request ID and fetch time. The criteria digest uses Python JSON with float-normalized values; it is not a portable signed integrity proof.

Expected synthetic results: A USD 20,880 with unconfirmed logistics assumptions and shipment 28 days; B USD 21,100 quoted CIF and shipment 14 days; C total unconfirmed due to MOQ/conditions. B is the priority negotiation candidate, subject to human confirmation. Download CSV or JSON and review each supplier's English draft. Nothing sends automatically.

## Tests

```powershell
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -p "test_*.py"
node tests/test_meterless_followups.cjs
```

`tests/meterless_live.py` is optional and requires the running app, vendor runtimes and a local model; it makes real inference calls. Unit tests use synthetic fixtures and mocked HTTP. A historical integration run included in `evidence/` used three real Meterless HTTP 200 local-only calls, each reporting cost USD 0. No quality or speed claim beyond that run is implied.

## Limits and safety

Text PDFs only, at most 3 MB and 10 pages each, extracted text up to 6,500 characters. No scanned OCR, FX conversion or arbitrary document guarantees. Source labels outside the supported pattern remain unverified. Comparison covers goods, ocean freight and insurance only; taxes, customs, destination charges and domestic transport are excluded. Shipment is not arrival. Demo logistics assumptions are not confirmed supplier charges.

Files are parsed in memory by this server; Meterless's own retention settings are separate. Run records are memory-only and disappear on restart. Saved evidence is historical and is not loaded as a successful live result. The app validates Host, origin and a page token, binds loopback, and does not expose credentials or arbitrary SQL. Never expose this development server publicly.

## Build attribution and prior work

Jongmyoung Kim supplies trade/procurement workflow expertise and validation. Codex assisted source implementation, tests and submission materials. The custom upload workflow, validation rules, Zetaris policy integration and inquiry drafts were developed in the hackathon preparation conversation during the build window. Declare any additional pre-existing product code before submission if applicable. Python, pypdf, Node.js, Meterless, Zetaris and Llama are existing third-party components governed by their own licences. No Cursor use, NVIDIA-specific integration, Nemotron use, real supplier validation or live customer deployment is claimed.

## Licence and publication status

No open-source licence has been selected. Public visibility does not itself grant an open-source licence. This folder is ready for owner review before publishing to the proposed `atlasgori-ai` repository. No repository URL or final submission exists yet.
