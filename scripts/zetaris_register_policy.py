"""Verify the policy registered by ZetarisPolicySetup.java through official JDBC."""
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/meterless_demo'))
from zetaris_local import LocalClient
from zetaris import ZetarisError

STATEMENTS = (
    'CREATE SCHEMASTORE CONTAINER atlasgori_policy',
    "CREATE SCHEMASTORE VIEW buyer_criteria WITH CONTAINER atlasgori_policy AS (SELECT "
    "'PP_BUSAN_DEMO' AS policy_id, CAST(20 AS DOUBLE) AS quantity_mt, "
    'CAST(21 AS INT) AS shipment_days_max, CAST(30 AS DOUBLE) AS deposit_percent_max, '
    'CAST(12 AS DOUBLE) AS mfr, CAST(2 AS DOUBLE) AS mfr_tolerance)',
)
EXPECTED = dict(zip(('quantity_mt', 'shipment_days_max', 'deposit_percent_max', 'mfr', 'mfr_tolerance'),
                    (20, 21, 30, 12, 2)))


def main():
    current = LocalClient().policy()
    if current['criteria'] != EXPECTED:
        raise ZetarisError('Existing criteria differ; no overwrite performed')
    receipt = {'checked_at': datetime.now(timezone.utc).isoformat(),
               'authorization': 'User requested buyer criteria registration and demo connection',
               'kind': 'persistent-schemastore-view', 'synthetic': True,
               'registration_channel': 'official-jdbc', 'registration_sql': STATEMENTS,
               'fresh_session_policy': current, 'verified': True}
    (ROOT / 'output/meterless-demo').mkdir(parents=True, exist_ok=True)
    (ROOT / 'output/meterless-demo/zetaris-policy-registration.json').write_text(
        json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    try: main()
    except ZetarisError as exc:
        print(json.dumps({'verified': False, 'error': str(exc)}, ensure_ascii=True))
        raise SystemExit(1)
