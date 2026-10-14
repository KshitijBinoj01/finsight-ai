from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints
from typing_extensions import Annotated

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class RegisterRequest(BaseModel):
    name: Name
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=128)]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_id: int
    name: str
    parent_category_id: int | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    account_id: int
    account_type: str
    bank_name: str | None
    balance: Decimal
    currency: str


class TransactionCreate(BaseModel):
    account_id: int
    category_id: int
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    txn_date: date
    description: str | None = Field(default=None, max_length=255)
    txn_type: Literal["income", "expense"]


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    txn_date: date | None = None
    description: str | None = Field(default=None, max_length=255)
    txn_type: Literal["income", "expense"] | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    transaction_id: int
    account_id: int
    category_id: int
    amount: Decimal
    txn_date: date
    description: str | None
    txn_type: str
    is_anomaly: bool
    category: CategoryOut | None = None


class BudgetCreate(BaseModel):
    category_id: int
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    period: str = Field(default="monthly", min_length=1, max_length=20)
    start_date: date
    end_date: date


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    budget_id: int
    category_id: int
    amount: Decimal
    period: str
    start_date: date
    end_date: date
    category: CategoryOut | None = None


class GoalCreate(BaseModel):
    name: Name
    target_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    current_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    deadline: date | None = None


class GoalUpdate(BaseModel):
    name: Name | None = None
    target_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    current_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    deadline: date | None = None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    goal_id: int
    name: str
    target_amount: Decimal
    current_amount: Decimal
    deadline: date | None


class Message(BaseModel):
    message: str
