import java.sql.*;

// One-time, fixed synthetic policy registration. Existing objects are never replaced.
class ZetarisPolicySetup {
    public static void main(String[] args) throws Exception {
        Class.forName("com.zetaris.lightning.jdbc.LightningDriver");
        try (Connection c = DriverManager.getConnection("jdbc:zetaris:lightning@localhost:10000",
                System.getenv("ZETARIS_ADMIN_EMAIL"), System.getenv("ZETARIS_ADMIN_PASSWORD"));
             Statement s = c.createStatement()) {
            String[] ddl = {
                "CREATE SCHEMASTORE CONTAINER atlasgori_policy",
                "CREATE SCHEMASTORE VIEW buyer_criteria WITH CONTAINER atlasgori_policy AS (SELECT " +
                "'PP_BUSAN_DEMO' AS policy_id, CAST(20 AS DOUBLE) AS quantity_mt, " +
                "CAST(21 AS INT) AS shipment_days_max, CAST(30 AS DOUBLE) AS deposit_percent_max, " +
                "CAST(12 AS DOUBLE) AS mfr, CAST(2 AS DOUBLE) AS mfr_tolerance)"
            };
            for (int i = 0; i < ddl.length; i++) {
                try { s.execute(ddl[i]); System.out.println("DDL_STEP_" + i + "=OK"); }
                catch (SQLException e) {
                    // No raw upstream errors or credentials. Existing names remain untouched.
                    System.out.println("DDL_STEP_" + i + "=FAILED SQLSTATE=" + e.getSQLState());
                }
            }
            try (ResultSet r = s.executeQuery("SELECT quantity_mt, shipment_days_max, deposit_percent_max, mfr, mfr_tolerance " +
                    "FROM atlasgori_policy.buyer_criteria WHERE policy_id = 'PP_BUSAN_DEMO' LIMIT 2")) {
                int count = 0;
                while (r.next()) {
                    count++;
                    double[] expected = {20, 21, 30, 12, 2};
                    for (int i = 0; i < expected.length; i++)
                        if (r.getDouble(i + 1) != expected[i] || r.wasNull()) throw new Exception("Policy differs");
                }
                if (count != 1) throw new Exception("Policy row count differs");
                System.out.println("POLICY_VERIFIED=true");
            }
        }
    }
}
