
from dataclasses import dataclass, field
from typing import Literal


Operation = Literal["deposit", "withdraw"]


@dataclass(frozen=True, slots=True)
class TransactionRequest:
    """Represents one validated transaction request."""

    request_id: str
    thread_id: str
    operation: Operation
    amount: int

    def __post_init__(self) -> None:
        if not isinstance(self.request_id, str) or not self.request_id.strip():
            raise ValueError("request_id must be a non-empty string")

        if not isinstance(self.thread_id, str) or not self.thread_id.strip():
            raise ValueError("thread_id must be a non-empty string")

        if self.operation not in ("deposit", "withdraw"):
            raise ValueError("operation must be 'deposit' or 'withdraw'")

        if (
            isinstance(self.amount, bool)
            or not isinstance(self.amount, int)
            or self.amount <= 0
        ):
            raise ValueError("amount must be a positive integer in rupees")


@dataclass(slots=True)
class Account:
    """Stores account state for an isolated simulation.

    Synchronization is deliberately handled by each simulation lab,
    allowing us to compare unsafe and safely protected operations.
    """

    account_id: str
    initial_balance: int
    balance: int = field(init=False)

    def __post_init__(self) -> None:
        if not isinstance(self.account_id, str) or not self.account_id.strip():
            raise ValueError("account_id must be a non-empty string")

        if (
            isinstance(self.initial_balance, bool)
            or not isinstance(self.initial_balance, int)
            or self.initial_balance < 0
        ):
            raise ValueError(
                "initial_balance must be a non-negative integer in rupees"
            )

        self.balance = self.initial_balance

    def reset(self) -> None:
        """Restore the initial balance before a new experiment."""
        self.balance = self.initial_balance
