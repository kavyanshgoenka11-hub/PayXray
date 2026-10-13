from random import choice
from threading import Event, Lock, Thread
from time import perf_counter_ns
from typing import Any

from simulation.event_log import EventRecorder
from simulation.transactions import Account, TransactionRequest

VALID_OPERATIONS = ("deposit", "withdraw")
THREAD_IDS = ("T1", "T2")


def run_safe_experiment(
    initial_balance: int = 1000,
    amounts: tuple[int, int] = (700, 500),
    operation: str = "withdraw",
    first_thread: str | None = None,
) -> dict[str, Any]:
    """Demonstrate mutex contention with two actual Python threads.

    The 'leader' thread acquires the mutex first; the follower must wait.
    The leader is random per run unless first_thread is given.
    """

    if not isinstance(amounts, (tuple, list)) or len(amounts) != 2:
        raise ValueError("Exactly two transaction amounts are required")

    if operation not in VALID_OPERATIONS:
        raise ValueError("operation must be 'deposit' or 'withdraw'")

    if first_thread is None:
        first_thread = choice(THREAD_IDS)
    if first_thread not in THREAD_IDS:
        raise ValueError("first_thread must be 'T1' or 'T2'")

    leader = first_thread
    follower = "T2" if leader == "T1" else "T1"

    account = Account("ACC-001", initial_balance)
    recorder = EventRecorder()
    account_lock = Lock()
    transition_lock = Lock()

    # Coordinate the demonstration without relying on random scheduling.
    leader_requested = Event()
    first_lock_acquired = Event()
    second_contended = Event()

    request_map = {
        "T1": TransactionRequest("TX-001", "T1", operation, amounts[0]),
        "T2": TransactionRequest("TX-002", "T2", operation, amounts[1]),
    }
    requests = (request_map["T1"], request_map["T2"])  # fixed result order

    results: dict[str, dict[str, Any]] = {}
    results_lock = Lock()
    errors: list[str] = []
    errors_lock = Lock()

    recorder.emit(
        "simulation_started",
        mode="safe_synchronization",
        operation=operation,
        first_thread=leader,
        initial_balance=initial_balance,
    )

    for tid in (leader, follower):
        req = request_map[tid]
        recorder.emit(
            "request_created",
            thread=req.thread_id,
            request_id=req.request_id,
            operation=req.operation,
            amount=req.amount,
        )

    def worker(req: TransactionRequest) -> None:
        lock_held = False
        is_leader = req.thread_id == leader

        try:
            if not is_leader:
                # Leader's lock request is logged first.
                if not leader_requested.wait(timeout=3):
                    raise TimeoutError(f"{leader} never requested account_lock")

            recorder.emit(
                "lock_requested",
                thread=req.thread_id,
                resource="account_lock",
            )

            if is_leader:
                leader_requested.set()

                started_ns = perf_counter_ns()
                lock_held = account_lock.acquire(timeout=3)

                if not lock_held:
                    raise TimeoutError(f"{leader} could not acquire account_lock")

                with transition_lock:
                    recorder.emit(
                        "lock_acquired",
                        thread=req.thread_id,
                        resource="account_lock",
                        wait_duration_ms=round(
                            (perf_counter_ns() - started_ns) / 1_000_000, 3
                        ),
                    )

                first_lock_acquired.set()

                # Hold the mutex until the follower has encountered it.
                if not second_contended.wait(timeout=3):
                    raise TimeoutError(
                        f"{follower} did not attempt the occupied lock"
                    )

            else:
                if not first_lock_acquired.wait(timeout=3):
                    raise TimeoutError(f"{leader} did not acquire account_lock")

                wait_started_ns = perf_counter_ns()

                # A failed non-blocking acquire proves the lock is occupied.
                acquired_immediately = account_lock.acquire(blocking=False)

                if acquired_immediately:
                    lock_held = True
                    second_contended.set()

                    with transition_lock:
                        recorder.emit(
                            "lock_acquired",
                            thread=req.thread_id,
                            resource="account_lock",
                            wait_duration_ms=0,
                        )
                else:
                    recorder.emit(
                        "lock_waiting",
                        thread=req.thread_id,
                        resource="account_lock",
                        waiting_for=leader,
                    )

                    second_contended.set()

                    lock_held = account_lock.acquire(timeout=3)

                    wait_duration_ms = round(
                        (perf_counter_ns() - wait_started_ns) / 1_000_000, 3
                    )

                    if not lock_held:
                        raise TimeoutError(
                            f"{follower} timed out waiting for account_lock"
                        )

                    with transition_lock:
                        recorder.emit(
                            "lock_acquired",
                            thread=req.thread_id,
                            resource="account_lock",
                            wait_duration_ms=wait_duration_ms,
                        )

            recorder.emit("critical_section_entered", thread=req.thread_id)

            # Check and update happen under the same mutex.
            balance_before = account.balance

            recorder.emit(
                "balance_checked",
                thread=req.thread_id,
                operation=req.operation,
                balance=balance_before,
                amount=req.amount,
                withdrawal=req.amount if req.operation == "withdraw" else None,
            )

            insufficient = (
                req.operation == "withdraw" and balance_before < req.amount
            )

            if not insufficient:
                if req.operation == "withdraw":
                    balance_after = balance_before - req.amount
                else:
                    balance_after = balance_before + req.amount

                account.balance = balance_after

                outcome = {
                    "request_id": req.request_id,
                    "thread": req.thread_id,
                    "operation": req.operation,
                    "amount": req.amount,
                    "status": "accepted",
                    "balance_after": balance_after,
                }

                recorder.emit(
                    "balance_updated",
                    thread=req.thread_id,
                    previous_balance=balance_before,
                    amount=req.amount,
                    updated_balance=balance_after,
                )

                recorder.emit(
                    "transaction_accepted",
                    thread=req.thread_id,
                    request_id=req.request_id,
                    amount=req.amount,
                )
            else:
                outcome = {
                    "request_id": req.request_id,
                    "thread": req.thread_id,
                    "operation": req.operation,
                    "amount": req.amount,
                    "status": "rejected",
                    "balance_after": balance_before,
                    "reason": "insufficient_funds",
                }

                recorder.emit(
                    "transaction_rejected",
                    thread=req.thread_id,
                    request_id=req.request_id,
                    amount=req.amount,
                    available_balance=balance_before,
                    reason="insufficient_funds",
                )

            with results_lock:
                results[req.request_id] = outcome

            recorder.emit("critical_section_exited", thread=req.thread_id)

        except Exception as exc:
            # Unblock the other thread if coordination fails.
            leader_requested.set()
            first_lock_acquired.set()
            second_contended.set()

            with errors_lock:
                errors.append(f"{req.thread_id}: {type(exc).__name__}: {exc}")

            recorder.emit(
                "worker_error",
                thread=req.thread_id,
                error_type=type(exc).__name__,
                message=str(exc),
            )

        finally:
            if lock_held:
                with transition_lock:
                    recorder.emit(
                        "lock_releasing",
                        thread=req.thread_id,
                        resource="account_lock",
                    )

                    account_lock.release()
                    lock_held = False

                    recorder.emit(
                        "lock_released",
                        thread=req.thread_id,
                        resource="account_lock",
                    )

    threads = {
        tid: Thread(target=worker, args=(request_map[tid],), name=tid)
        for tid in THREAD_IDS
    }

    # Start the leader first; coordination events enforce the rest.
    threads[leader].start()
    threads[follower].start()

    for thread in threads.values():
        thread.join(timeout=4)

    unfinished = [name for name, t in threads.items() if t.is_alive()]
    if unfinished:
        raise RuntimeError(f"Simulation timed out: {unfinished}")

    if errors:
        raise RuntimeError("Safe experiment failed: " + "; ".join(errors))

    ordered_results = [results[req.request_id] for req in requests]

    successful = [i for i in ordered_results if i["status"] == "accepted"]
    rejected = [i for i in ordered_results if i["status"] == "rejected"]

    sign = 1 if operation == "deposit" else -1
    expected_balance = initial_balance + sign * sum(
        item["amount"] for item in successful
    )

    observed_balance = account.balance
    invariant_holds = observed_balance == expected_balance

    if not invariant_holds:
        raise AssertionError(
            f"Balance invariant failed: expected {expected_balance}, "
            f"observed {observed_balance}"
        )

    recorder.emit(
        "simulation_completed",
        expected_balance=expected_balance,
        observed_balance=observed_balance,
        successful_count=len(successful),
        rejected_count=len(rejected),
        balance_invariant_holds=invariant_holds,
    )

    return {
        "mode": "safe_synchronization",
        "operation": operation,
        "first_thread": leader,
        "initial_balance": initial_balance,
        "final_balance": observed_balance,
        "expected_balance": expected_balance,
        "successful_count": len(successful),
        "rejected_count": len(rejected),
        "balance_invariant_holds": invariant_holds,
        "outcomes": ordered_results,
        "events": recorder.get_events(),
    }