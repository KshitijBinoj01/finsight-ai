from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User, Account, Category, Transaction, Budget, SavingsGoal
from app.schemas import RegisterRequest, LoginRequest, TokenResponse
from app.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["authentication"])


def token_response(user: User) -> dict:
    return {
        "access_token": create_access_token(user.user_id, user.email),
        "token_type": "bearer",
        "user": {"user_id": user.user_id, "name": user.name, "email": user.email},
    }


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=payload.name, email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return token_response(user)


@router.post("/demo", response_model=TokenResponse)
def demo_login(db: Session = Depends(get_db)):
    """Local-only demo session. Disable ALLOW_DEMO_LOGIN outside development."""
    if not settings.allow_demo_login:
        raise HTTPException(status_code=404, detail="Not found.")
    email = "demo@finsight.local"
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(name="Demo User", email=email, password_hash=hash_password("DemoOnly-NotForProduction-2026"))
        db.add(user)
        db.flush()
        categories = []
        for name in ["Food & dining", "Housing", "Transport", "Shopping", "Bills & utilities", "Healthcare", "Income", "Other"]:
            category = db.scalar(select(Category).where(Category.name == name))
            if not category:
                category = Category(name=name)
                db.add(category)
                db.flush()
            categories.append(category)
        account = Account(user_id=user.user_id, account_type="bank", bank_name="Demo account", balance=48250, currency="INR")
        db.add(account)
        db.flush()
        db.add_all([
            Transaction(account_id=account.account_id, category_id=next(c.category_id for c in categories if c.name=="Income"), amount=25000, txn_date=__import__("datetime").date(2026,10,12), description="Monthly allowance", txn_type="income"),
            Transaction(account_id=account.account_id, category_id=next(c.category_id for c in categories if c.name=="Food & dining"), amount=1240, txn_date=__import__("datetime").date(2026,10,12), description="Grocery shopping", txn_type="expense"),
            Transaction(account_id=account.account_id, category_id=next(c.category_id for c in categories if c.name=="Housing"), amount=6500, txn_date=__import__("datetime").date(2026,10,10), description="Hostel rent", txn_type="expense"),
        ])
        db.commit()
        db.refresh(user)
    return token_response(user)
