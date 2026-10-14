from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Account, Budget, Category, Transaction, User
from app.schemas import BudgetCreate, BudgetOut

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("")
def list_budgets(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    budgets = db.scalars(select(Budget).where(Budget.user_id == user.user_id).order_by(Budget.start_date.desc())).all()
    results = []
    for b in budgets:
        spent = db.scalar(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .join(Account, Transaction.account_id == Account.account_id)
            .where(
                Account.user_id == user.user_id,
                Transaction.category_id == b.category_id,
                Transaction.txn_type == "expense",
                Transaction.txn_date >= b.start_date,
                Transaction.txn_date <= b.end_date,
            )
        )
        results.append({
            "budget_id": b.budget_id, "category_id": b.category_id,
            "category": {"category_id": b.category.category_id, "name": b.category.name, "parent_category_id": b.category.parent_category_id},
            "amount": b.amount, "period": b.period, "start_date": b.start_date, "end_date": b.end_date,
            "actual_spent": spent, "remaining": b.amount - Decimal(str(spent)),
        })
    return results


@router.post("", response_model=BudgetOut, status_code=201)
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.get(Category, payload.category_id):
        raise HTTPException(status_code=422, detail="Category does not exist.")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="end_date must be on or after start_date.")
    budget = Budget(user_id=user.user_id, **payload.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget
