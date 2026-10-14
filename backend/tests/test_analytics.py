import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.analytics import build_monthly_forecasts, detect_high_spend_anomaly


class AnomalyDetectorTests(unittest.TestCase):
    def test_modified_z_score_flags_high_outlier(self):
        flagged, details = detect_high_spend_anomaly(
            Decimal("1000"), [180, 220, 200, 250, 190, 210, 230]
        )
        self.assertTrue(flagged)
        self.assertEqual(details["method"], "modified_z_score")

    def test_insufficient_history_does_not_flag(self):
        flagged, details = detect_high_spend_anomaly(1000, [100, 120, 110, 115])
        self.assertFalse(flagged)
        self.assertEqual(details["method"], "insufficient_history")

    def test_zero_mad_fallback_flags_large_multiple(self):
        flagged, details = detect_high_spend_anomaly(800, [200, 200, 200, 200, 200])
        self.assertTrue(flagged)
        self.assertEqual(details["method"], "median_multiple_fallback")

    def test_normal_expense_is_not_flagged(self):
        flagged, _ = detect_high_spend_anomaly(225, [180, 220, 200, 250, 190, 210, 230])
        self.assertFalse(flagged)


class ForecastTests(unittest.TestCase):
    def test_three_month_moving_average_and_current_month_run_rate(self):
        transactions = []
        for month, amount in [(8, 2200), (9, 2700), (10, 1300)]:
            transactions.append(SimpleNamespace(
                txn_type="expense",
                txn_date=date(2026, month, 10),
                category_id=1,
                category=SimpleNamespace(name="Food & dining"),
                amount=Decimal(amount),
            ))

        forecasts = build_monthly_forecasts(transactions, today=date(2026, 10, 13))
        self.assertEqual(len(forecasts), 1)
        forecast = forecasts[0]
        self.assertEqual(forecast["period"], "November 2026")
        self.assertEqual(forecast["history_months"], 3)
        expected = float(round(Decimal("8000") / Decimal("3"), 2))
        self.assertEqual(forecast["predicted_amount"], expected)
        self.assertIn("3-month moving average", forecast["method"])


    def test_random_forest_trains_from_sufficient_monthly_history(self):
        transactions = []
        # Three years of real-shaped monthly records across three categories
        # create enough rolling labelled samples for the per-user model.
        for category_id, category_name, base in [(1, "Food", 1800), (2, "Transport", 900), (3, "Shopping", 2400)]:
            for index in range(33):
                month_index = 2024 * 12 + index
                year = month_index // 12
                month = month_index % 12 + 1
                if date(year, month, 1) >= date(2026, 10, 1):
                    break
                amount = base + ((index * (category_id * 17 + 29)) % 700) + (month % 4) * 85
                transactions.append(SimpleNamespace(
                    txn_type="expense",
                    txn_date=date(year, month, 15),
                    category_id=category_id,
                    category=SimpleNamespace(name=category_name),
                    amount=Decimal(amount),
                ))

        forecasts = build_monthly_forecasts(transactions, today=date(2026, 10, 13))
        self.assertEqual(len(forecasts), 3)
        self.assertTrue(all(forecast["model_trained"] for forecast in forecasts))
        self.assertTrue(all("RandomForestRegressor" in forecast["method"] for forecast in forecasts))
        self.assertTrue(all(forecast["training_samples"] >= 12 for forecast in forecasts))
        self.assertTrue(all(forecast["predicted_amount"] >= 0 for forecast in forecasts))
        self.assertTrue(all(forecast["validation_mae"] is not None for forecast in forecasts))
        self.assertTrue(all(forecast["validation_mae"] >= 0 for forecast in forecasts))

    def test_income_and_future_transactions_are_ignored(self):
        transactions = [
            SimpleNamespace(txn_type="income", txn_date=date(2026, 10, 10), category_id=1,
                            category=SimpleNamespace(name="Income"), amount=Decimal("50000")),
            SimpleNamespace(txn_type="expense", txn_date=date(2026, 12, 10), category_id=2,
                            category=SimpleNamespace(name="Shopping"), amount=Decimal("1000")),
        ]
        self.assertEqual(build_monthly_forecasts(transactions, today=date(2026, 10, 13)), [])


if __name__ == "__main__":
    unittest.main()
