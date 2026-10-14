from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Account, Category, Transaction, User
from app.analytics import refresh_user_anomaly_flags
from app.schemas import TransactionCreate, TransactionOut, TransactionUpdate

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def owned_transaction(db: Session, transaction_id: int, user_id: int) -> Transaction:
    row = db.scalar(
        select(Transaction).join(Account).where(
            Transaction.transaction_id == transaction_id, Account.user_id == user_id
        ).options(joinedload(Transaction.category))
    )
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return row


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    start_date: date | None = None,
    end_date: date | None = None,
    txn_type: str | None = Query(default=None, pattern="^(income|expense)$"),
    category_id: int | None = None,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Transaction).join(Account).where(Account.user_id == user.user_id).options(joinedload(Transaction.category))
    if start_date:
        stmt = stmt.where(Transaction.txn_date >= start_date)
    if end_date:
        stmt = stmt.where(Transaction.txn_date <= end_date)
    if txn_type:
        stmt = stmt.where(Transaction.txn_type == txn_type)
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if q:
        stmt = stmt.where(Transaction.description.ilike(f"%{q}%"))
    stmt = stmt.order_by(Transaction.txn_date.desc(), Transaction.transaction_id.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt).unique().all())


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = db.scalar(select(Account).where(Account.account_id == payload.account_id, Account.user_id == user.user_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found for this user.")
    category = db.get(Category, payload.category_id)
    if not category:
        raise HTTPException(status_code=422, detail="Category does not exist.")
    row = Transaction(**payload.model_dump())
    db.add(row)
    db.flush()
    refresh_user_anomaly_flags(db, user.user_id)
    db.commit()
    db.refresh(row)
    return owned_transaction(db, row.transaction_id, user.user_id)


@router.put("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = owned_transaction(db, transaction_id, user.user_id)
    changes = payload.model_dump(exclude_unset=True)
    if "account_id" in changes:
        account = db.scalar(select(Account).where(Account.account_id == changes["account_id"], Account.user_id == user.user_id))
        if not account:
            raise HTTPException(status_code=404, detail="Account not found for this user.")
    if "category_id" in changes and not db.get(Category, changes["category_id"]):
        raise HTTPException(status_code=422, detail="Category does not exist.")
    for key, value in changes.items():
        setattr(row, key, value)
    db.flush()
    refresh_user_anomaly_flags(db, user.user_id)
    db.commit()
    return owned_transaction(db, row.transaction_id, user.user_id)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = owned_transaction(db, transaction_id, user.user_id)
    db.delete(row)
    db.flush()
    refresh_user_anomaly_flags(db, user.user_id)
    db.commit()
    return Response(status_code=204)
