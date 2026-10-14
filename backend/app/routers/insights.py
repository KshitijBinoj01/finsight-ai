from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Account, Budget, Category, Prediction, Recommendation, SavingsGoal, Transaction, User
from app.analytics import MIN_ML_TRAINING_SAMPLES, build_monthly_forecasts, refresh_user_anomaly_flags

router = APIRouter(prefix="/api", tags=["dashboard and insights"])


@router.get("/categories")
def categories(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Category).order_by(Category.name)).all()
    return [{"category_id": c.category_id, "name": c.name, "parent_category_id": c.parent_category_id} for c in rows]


@router.get("/accounts")
def accounts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Account).where(Account.user_id == user.user_id).order_by(Account.account_id)).all()
    return [{"account_id": a.account_id, "account_type": a.account_type, "bank_name": a.bank_name, "balance": a.balance, "currency": a.currency} for a in rows]


@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    income = db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).join(Account).where(Account.user_id == user.user_id, Transaction.txn_type == "income"))
    expenses = db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).join(Account).where(Account.user_id == user.user_id, Transaction.txn_type == "expense"))
    account_balance = db.scalar(select(func.coalesce(func.sum(Account.balance), 0)).where(Account.user_id == user.user_id))
    tx_count = db.scalar(select(func.count(Transaction.transaction_id)).join(Account).where(Account.user_id == user.user_id))
    return {"user": {"user_id": user.user_id, "name": user.name}, "account_balance": account_balance, "total_income": income, "total_expenses": expenses, "income_less_expenses": Decimal(str(income)) - Decimal(str(expenses)), "transaction_count": tx_count, "currency": "INR"}


@router.get("/insights")
def get_insights(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Re-evaluate existing records as well as newly added transactions. This means
    # older ledger entries can gain/lose their anomaly flag as history changes.
    anomaly_changed, anomaly_details = refresh_user_anomaly_flags(db, user.user_id)
    if anomaly_changed:
        db.commit()

    recommendations = db.scalars(
        select(Recommendation)
        .where(Recommendation.user_id == user.user_id)
        .order_by(Recommendation.generated_on.desc())
    ).all()

    # Predictions are recalculated from the user's actual expense history so the
    # tab works even when the Prediction table has no manually seeded rows.
    expense_rows = db.scalars(
        select(Transaction)
        .join(Account, Transaction.account_id == Account.account_id)
        .where(Account.user_id == user.user_id, Transaction.txn_type == "expense")
        .options(joinedload(Transaction.category))
        .order_by(Transaction.txn_date.asc(), Transaction.transaction_id.asc())
    ).unique().all()
    forecasts = build_monthly_forecasts(expense_rows)

    flagged = db.scalars(
        select(Transaction)
        .join(Account, Transaction.account_id == Account.account_id)
        .where(Account.user_id == user.user_id, Transaction.is_anomaly.is_(True))
        .options(joinedload(Transaction.category))
        .order_by(Transaction.txn_date.desc(), Transaction.transaction_id.desc())
        .limit(20)
    ).unique().all()

    budget_alerts = []
    budgets = db.scalars(select(Budget).where(Budget.user_id == user.user_id)).all()
    for budget in budgets:
        spent = db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).join(Account).where(
            Account.user_id == user.user_id, Transaction.category_id == budget.category_id,
            Transaction.txn_type == "expense", Transaction.txn_date >= budget.start_date,
            Transaction.txn_date <= budget.end_date
        ))
        if Decimal(str(spent)) > budget.amount:
            budget_alerts.append({
                "type": "budget_overrun",
                "category": budget.category.name,
                "budgeted": budget.amount,
                "spent": spent,
                "message": f"{budget.category.name} is over its budget by {Decimal(str(spent)) - budget.amount}.",
            })

    anomaly_payload = []
    for txn in flagged:
        detail = anomaly_details.get(txn.transaction_id, {})
        method = detail.get("method", "statistical baseline")
        observations = detail.get("history_count", 0)
        median_value = detail.get("median")
        if median_value is not None:
            message = (
                f"This expense is unusually high compared with {observations} earlier "
                f"expense(s) in this category (historical median about ₹{median_value:,.2f}; "
                f"detector: {method.replace('_', ' ')}). Review it to confirm whether it was expected."
            )
        else:
            message = "This expense was flagged by the statistical anomaly detector. Review it to confirm whether it was expected."
        anomaly_payload.append({
            "transaction_id": txn.transaction_id,
            "description": txn.description,
            "amount": txn.amount,
            "txn_date": txn.txn_date,
            "category": txn.category.name if txn.category else "Uncategorised",
            "method": method,
            "history_count": observations,
            "score": detail.get("score"),
            "message": message,
        })

    trained_forecasts = sum(1 for forecast in forecasts if forecast.get("model_trained"))
    training_sample_count = max((forecast.get("training_samples", 0) for forecast in forecasts), default=0)
    if trained_forecasts:
        forecast_note = (
            f"A per-user RandomForestRegressor was trained on {training_sample_count} historical "
            f"rolling category-month examples and produced ML forecasts for {trained_forecasts} category/categories. "
            "Categories with insufficient complete history use the moving-average fallback."
        )
    else:
        forecast_note = (
            f"The Random Forest was not trained because only {training_sample_count} rolling "
            f"training examples were available; at least {MIN_ML_TRAINING_SAMPLES} are required. "
            "Forecasts use a transparent moving-average fallback until more history is available."
        )

    return {
        "anomalies": anomaly_payload,
        "budget_alerts": budget_alerts,
        "predictions": forecasts,
        "recommendations": [{
            "recommendation_id": r.recommendation_id,
            "type": r.type,
            "description": r.description,
            "generated_on": r.generated_on,
        } for r in recommendations],
        "note": (
            "Anomalies use a one-sided Modified Z-score threshold of 3.5, with robust fallbacks "
            "when MAD is zero; at least five earlier same-category expenses within 180 days are required. "
            + forecast_note + " Predictions are estimates and need evaluation against future actual spending."
        ),
    }
