"""Transparent statistical baselines for FinSight AI.

These helpers intentionally use interpretable heuristics rather than claiming to
run a trained machine-learning model.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from typing import Iterable

MIN_ANOMALY_HISTORY = 5
ANOMALY_WINDOW_DAYS = 180
MODIFIED_Z_THRESHOLD = 3.5
CENT = Decimal("0.01")


def _quantile(values: list[float], fraction: float) -> float:
    """Linearly interpolated quantile; values must be non-empty and sorted."""
    if len(values) == 1:
        return values[0]
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    part = position - lower
    return values[lower] + (values[upper] - values[lower]) * part


def detect_high_spend_anomaly(amount: Decimal | int | float, historical_amounts: Iterable[Decimal | int | float]) -> tuple[bool, dict]:
    """Flag unusually high expenses against prior same-category expenses.

    At least five historical observations are required. The normal path uses a
    one-sided Modified Z-score. If MAD is zero, it falls back to an IQR fence;
    if IQR is also zero, it flags only values greater than 3x the median.
    """
    history = [float(value) for value in historical_amounts if value is not None and float(value) > 0]
    current = float(amount)
    if len(history) < MIN_ANOMALY_HISTORY:
        return False, {
            "method": "insufficient_history",
            "history_count": len(history),
            "median": float(median(history)) if history else None,
            "score": None,
            "threshold": None,
        }

    middle = float(median(history))
    deviations = [abs(value - middle) for value in history]
    mad = float(median(deviations))

    if mad > 0:
        score = 0.6745 * (current - middle) / mad
        return score > MODIFIED_Z_THRESHOLD, {
            "method": "modified_z_score",
            "history_count": len(history),
            "median": middle,
            "mad": mad,
            "score": score,
            "threshold": MODIFIED_Z_THRESHOLD,
        }

    ordered = sorted(history)
    q1 = _quantile(ordered, 0.25)
    q3 = _quantile(ordered, 0.75)
    iqr = q3 - q1
    if iqr > 0:
        threshold = q3 + 1.5 * iqr
        return current > threshold, {
            "method": "iqr_fallback",
            "history_count": len(history),
            "median": middle,
            "score": None,
            "threshold": threshold,
        }

    threshold = middle * 3
    return current > threshold, {
        "method": "median_multiple_fallback",
        "history_count": len(history),
        "median": middle,
        "score": None,
        "threshold": threshold,
    }


def refresh_user_anomaly_flags(db, user_id: int) -> tuple[bool, dict[int, dict]]:
    """Re-evaluate and persist anomaly flags for all of one user's transactions.

    Only earlier expenses in the same category from the previous 180 days are
    used as history. Income transactions are never flagged. Caller commits.
    """
    from sqlalchemy import select
    from app.models import Account, Transaction

    db.flush()
    rows = db.scalars(
        select(Transaction)
        .join(Account, Transaction.account_id == Account.account_id)
        .where(Account.user_id == user_id)
        .order_by(Transaction.txn_date.asc(), Transaction.transaction_id.asc())
    ).unique().all()

    history_by_category: dict[int, list[tuple[date, Decimal]]] = {}
    details: dict[int, dict] = {}
    changed = False

    for row in rows:
        if row.txn_type != "expense":
            if row.is_anomaly:
                row.is_anomaly = False
                changed = True
            continue

        history = history_by_category.setdefault(row.category_id, [])
        cutoff = row.txn_date - timedelta(days=ANOMALY_WINDOW_DAYS)
        while history and history[0][0] < cutoff:
            history.pop(0)

        amounts = [amount for _, amount in history]
        flagged, meta = detect_high_spend_anomaly(row.amount, amounts)
        details[row.transaction_id] = meta
        if bool(row.is_anomaly) != flagged:
            row.is_anomaly = flagged
            changed = True
        history.append((row.txn_date, Decimal(str(row.amount))))

    return changed, details


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def _shift_month(value: date, offset: int) -> date:
    month_index = value.year * 12 + value.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _forecast_features(category_id: int, previous_amounts: list[float], target_month: date,
                        category_ids: list[int]) -> list[float]:
    """Build a fixed feature vector from the prior three completed months.

    Category is one-hot encoded manually so IDs are not treated as an ordinal
    numeric feature. Amounts are log-transformed to reduce scale/skew.
    """
    import math

    lags = [max(0.0, float(v)) for v in previous_amounts[-3:]]
    if len(lags) != 3:
        raise ValueError("Forecast features require exactly three prior months")
    log_lags = [math.log1p(value) for value in lags]
    month_angle = 2 * math.pi * (target_month.month - 1) / 12
    one_hot = [1.0 if category_id == known_id else 0.0 for known_id in category_ids]
    mean_log = sum(log_lags) / 3
    variance = sum((value - mean_log) ** 2 for value in log_lags) / 3
    return one_hot + [
        log_lags[-1],                    # most recent month
        log_lags[-2],                    # two months back
        log_lags[-3],                    # three months back
        mean_log,
        variance ** 0.5,
        log_lags[-1] - log_lags[-3],     # recent trend
        math.sin(month_angle),
        math.cos(month_angle),
    ]


def _fit_forecast_model(training_rows: list[tuple[int, list[float], date, float]],
                        category_ids: list[int]):
    """Fit a pooled, per-user Random Forest and estimate chronological holdout MAE.

    Each training label is a previously observed category-month total. The
    newest target months are held out for validation when enough history exists;
    then the model is refit on all labelled examples for inference.
    """
    if len(training_rows) < MIN_ML_TRAINING_SAMPLES:
        return None, None
    try:
        import math
        from sklearn.ensemble import RandomForestRegressor
    except ImportError:
        # A moving-average fallback keeps the API usable if requirements have
        # not yet been installed in the user's virtual environment.
        return None, None

    def build_model():
        return RandomForestRegressor(
            n_estimators=160,
            max_depth=6,
            min_samples_leaf=2,
            max_features=0.9,
            random_state=42,
            n_jobs=1,
        )

    def feature_matrix(rows):
        return [
            _forecast_features(category_id, previous, target_month, category_ids)
            for category_id, previous, target_month, _target in rows
        ]

    def target_vector(rows):
        return [math.log1p(max(0.0, target)) for *_prefix, target in rows]

    validation_mae = None
    unique_target_months = sorted({row[2] for row in training_rows})
    if len(unique_target_months) >= 6:
        holdout_month_count = max(1, math.ceil(len(unique_target_months) * 0.2))
        holdout_months = set(unique_target_months[-holdout_month_count:])
        train_rows = [row for row in training_rows if row[2] not in holdout_months]
        holdout_rows = [row for row in training_rows if row[2] in holdout_months]
        if len(train_rows) >= MIN_ML_TRAINING_SAMPLES and holdout_rows:
            validation_model = build_model()
            validation_model.fit(feature_matrix(train_rows), target_vector(train_rows))
            predictions = [max(0.0, math.expm1(float(value))) for value in validation_model.predict(feature_matrix(holdout_rows))]
            validation_mae = sum(abs(pred - row[3]) for pred, row in zip(predictions, holdout_rows)) / len(holdout_rows)

    model = build_model()
    model.fit(feature_matrix(training_rows), target_vector(training_rows))
    return model, validation_mae


MIN_ML_TRAINING_SAMPLES = 12
FORECAST_LOOKBACK_MONTHS = 36


def build_monthly_forecasts(transactions: Iterable, today: date | None = None) -> list[dict]:
    """Forecast next month's category spend with a trained Random Forest.

    Historical rolling windows are supervised examples: the three prior
    completed monthly totals, category and target calendar month predict the
    following completed month's actual total. The model is trained on this
    authenticated user's own category histories. When there are fewer than 12
    training examples, or a category lacks three complete months, that category
    uses an interpretable moving-average fallback instead.
    """
    import math

    today = today or date.today()
    current_start = _month_start(today.year, today.month)
    previous_start = _shift_month(current_start, -1)
    next_start = _shift_month(current_start, 1)
    days_in_current_month = (next_start - current_start).days
    earliest_month = _shift_month(current_start, -(FORECAST_LOOKBACK_MONTHS - 1))

    monthly: dict[tuple[int, date], Decimal] = {}
    category_names: dict[int, str] = {}
    for txn in transactions:
        if getattr(txn, "txn_type", None) != "expense":
            continue
        txn_date = getattr(txn, "txn_date", None)
        if not txn_date or txn_date > today or txn_date < earliest_month:
            continue
        category_id = int(txn.category_id)
        category = getattr(txn, "category", None)
        category_names[category_id] = getattr(category, "name", None) or f"Category {category_id}"
        month = _month_start(txn_date.year, txn_date.month)
        key = (category_id, month)
        monthly[key] = monthly.get(key, Decimal("0")) + Decimal(str(txn.amount))

    if not category_names:
        return []

    # Build dense completed-month series per category. Months without a
    # transaction are zeros; the current partial month is excluded from ML
    # training to avoid teaching the model that partial totals are full months.
    completed_series: dict[int, tuple[list[date], list[float]]] = {}
    training_rows: list[tuple[int, list[float], date, float]] = []
    for category_id in category_names:
        observed_months = sorted(month for (cat_id, month) in monthly if cat_id == category_id)
        if not observed_months:
            continue
        start_month = max(observed_months[0], earliest_month)
        months: list[date] = []
        values: list[float] = []
        cursor = start_month
        while cursor <= previous_start:
            months.append(cursor)
            values.append(float(monthly.get((category_id, cursor), Decimal("0"))))
            cursor = _shift_month(cursor, 1)
        completed_series[category_id] = (months, values)
        for index in range(3, len(values)):
            training_rows.append((category_id, values[index - 3:index], months[index], values[index]))

    category_ids = sorted(category_names)
    model, validation_mae = _fit_forecast_model(training_rows, category_ids)
    model_trained = model is not None
    training_sample_count = len(training_rows)

    # Actual monthly totals used for the sparse-history fallback. Current
    # month-to-date is projected to a full-month run rate for that fallback.
    results: list[dict] = []
    for category_id, category_name in sorted(category_names.items(), key=lambda item: item[1].casefold()):
        active_months = [
            (month, total)
            for (cat_id, month), total in monthly.items()
            if cat_id == category_id
        ]
        active_months.sort(key=lambda item: item[0])
        fallback_observations: list[tuple[date, Decimal]] = []
        current_total = monthly.get((category_id, current_start))
        for month, total in active_months:
            if month == current_start:
                total = (total * Decimal(days_in_current_month) / Decimal(today.day)).quantize(
                    CENT, rounding=ROUND_HALF_UP
                )
            fallback_observations.append((month, total))
        fallback_observations = fallback_observations[-3:]

        forecast: float | None = None
        method: str
        explanation: str
        history_months: int
        history_periods: list[str]
        category_series = completed_series.get(category_id)
        if model_trained and category_series and len(category_series[1]) >= 3:
            _months, values = category_series
            import math
            inference_values = values[-3:]
            inference_periods = _months[-3:]
            if current_total is not None and len(values) >= 2:
                projected_current = float((current_total * Decimal(days_in_current_month) / Decimal(today.day)).quantize(
                    CENT, rounding=ROUND_HALF_UP
                ))
                inference_values = values[-2:] + [projected_current]
                inference_periods = _months[-2:] + [current_start]
            feature_row = _forecast_features(category_id, inference_values, next_start, category_ids)
            forecast = max(0.0, math.expm1(float(model.predict([feature_row])[0])))
            method = "Trained RandomForestRegressor"
            history_months = len(inference_values)
            history_periods = [month.strftime("%b %Y") for month in inference_periods]
            validation_text = (
                f" A chronological holdout test had a mean absolute error of about ₹{validation_mae:,.2f}."
                if validation_mae is not None
                else " There was not enough history to calculate a reliable chronological holdout error."
            )
            explanation = (
                f"A Random Forest regressor was trained on {training_sample_count} historical rolling "
                f"category-month examples from your records. It uses the prior three monthly totals, "
                f"recent variation/trend and target-month seasonality"
                + ("; the current month's partial spend is projected to a full-month rate." if current_total is not None else ".")
                + " Model output is non-negative and rounded to currency precision." + validation_text
            )
        elif fallback_observations:
            totals = [total for _, total in fallback_observations]
            forecast_decimal = (sum(totals, Decimal("0")) / Decimal(len(totals))).quantize(
                CENT, rounding=ROUND_HALF_UP
            )
            forecast = float(forecast_decimal)
            history_months = len(fallback_observations)
            history_periods = [month.strftime("%b %Y") for month, _ in fallback_observations]
            method = f"{len(fallback_observations)}-month moving average fallback"
            if current_total is not None and current_start in [month for month, _ in fallback_observations]:
                method += " with current-month run-rate"
            if model_trained:
                explanation = (
                    f"The pooled model had {training_sample_count} training examples, but this category "
                    "does not have three completed months for ML inference. Used a transparent moving-average fallback."
                )
            else:
                explanation = (
                    f"Only {training_sample_count} historical rolling training example(s) were available across "
                    f"your categories; at least {MIN_ML_TRAINING_SAMPLES} are required to train the model. "
                    "Used a transparent moving-average fallback instead."
                )
        else:
            continue

        forecast_decimal = Decimal(str(forecast)).quantize(CENT, rounding=ROUND_HALF_UP)
        results.append({
            "prediction_id": f"forecast-{category_id}-{next_start:%Y-%m}",
            "category_id": category_id,
            "category": category_name,
            "predicted_amount": float(forecast_decimal),
            "period": next_start.strftime("%B %Y"),
            "method": method,
            "model_trained": method == "Trained RandomForestRegressor",
            "training_samples": training_sample_count,
            "validation_mae": round(validation_mae, 2) if validation_mae is not None else None,
            "history_months": history_months,
            "history_periods": history_periods,
            "explanation": explanation,
        })
    return results
