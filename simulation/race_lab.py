from random import choice
from threading import Barrier, BrokenBarrierError, Event, Lock, Thread
from typing import Any

from simulation.event_log import EventRecorder
from simulation.transactions import Account, TransactionRequest

VALID_OPERATIONS = ("deposit", "withdraw")
THREAD_IDS = ("T1", "T2")
PHASES = ("read", "calc", "write")


def run_race_experiment(
    initial_balance: int = 1000,
    amounts: tuple[int, int] = (300, 200),
    operation: str = "withdraw",
    first_thread: str | None = None,
) -> dict[str, Any]:
    """Reproduce a lost update using two actual Python threads.

    Both threads read the initial balance before either writes. The
    'leader' thread runs each phase first, so the order is random per run.
    """

    if not isinstance(amounts, (tuple, list)) or len(amounts) != 2:
        raise ValueError("Exactly two transaction amounts are required")

    if operation not in VALID_OPERATIONS:
        raise ValueError("operation must be 'deposit' or 'withdraw'")

    if first_thread is None:
        first_thread = choice(THREAD_IDS)
    if first_thread not in THREAD_IDS:
        raise ValueError("first_thread must be 'T1' or 'T2'")

    if operation == "withdraw" and sum(amounts) > initial_balance:
        raise ValueError(
            "For the race lab, combined withdrawals must not exceed the "
            "initial balance."
        )

    leader = first_thread
    sign = 1 if operation == "deposit" else -1

    account = Account("ACC-001", initial_balance)

    requests = {
        "T1": TransactionRequest("TX-001", "T1", operation, amounts[0]),
        "T2": TransactionRequest("TX-002", "T2", operation, amounts[1]),
    }

    expected_balance = initial_balance + sign * sum(amounts)
    recorder = EventRecorder()

    read_barrier = Barrier(2, timeout=3)
    write_event_lock = Lock()

    # One Event per thread per phase: the follower waits for the leader.
    gates = {tid: {phase: Event() for phase in PHASES} for tid in THREAD_IDS}

    errors: list[str] = []
    errors_lock = Lock()

    recorder.emit(
        "simulation_started",
        mode="race_condition",
        operation=operation,
        first_thread=leader,
        initial_balance=initial_balance,
        expected_balance=expected_balance,
    )

    # Requests are created in leader-first order.
    ordered = [leader, "T2" if leader == "T1" else "T1"]
    for tid in ordered:
        request = requests[tid]
        recorder.emit(
            "request_created",
            thread=request.thread_id,
            request_id=request.request_id,
            operation=request.operation,
            amount=request.amount,
        )

    def wait_for_leader(me: str, phase: str) -> None:
        if me != leader:
            if not gates[leader][phase].wait(timeout=3):
                raise TimeoutError(f"{leader} did not finish the {phase} phase")

    def worker(request: TransactionRequest) -> None:
        me = request.thread_id

        try:
            # Intentionally unsafe: no mutex protects read -> calculate -> write.
            wait_for_leader(me, "read")
            observed_balance = account.balance

            recorder.emit(
                "balance_read",
                thread=me,
                balance=observed_balance,
            )
            gates[me]["read"].set()

            # Neither thread continues until BOTH have read the balance.
            read_barrier.wait()

            wait_for_leader(me, "calc")
            calculated_balance = observed_balance + sign * request.amount

            recorder.emit(
                "balance_calculated",
                thread=me,
                operation=operation,
                previous_balance=observed_balance,
                amount=request.amount,
                calculated_balance=calculated_balance,
            )
            gates[me]["calc"].set()

            # Both values come from the stale balance, so the last write wins.
            wait_for_leader(me, "write")
            with write_event_lock:
                account.balance = calculated_balance

                recorder.emit(
                    "balance_updated",
                    thread=me,
                    previous_balance=observed_balance,
                    amount=request.amount,
                    written_balance=calculated_balance,
                )
            gates[me]["write"].set()

        except Exception as exc:
            try:
                read_barrier.abort()
            except BrokenBarrierError:
                pass

            # Unblock the other thread so nothing hangs until timeout.
            for phase_events in gates.values():
                for gate in phase_events.values():
                    gate.set()

            with errors_lock:
                errors.append(f"{me}: {type(exc).__name__}: {exc}")

            try:
                recorder.emit(
                    "worker_error",
                    thread=me,
                    error_type=type(exc).__name__,
                    message=str(exc),
                )
            except Exception:
                pass

    threads = [
        Thread(target=worker, args=(requests[tid],), name=tid)
        for tid in ordered
    ]

    for thread in threads:
        thread.start()

    for thread in threads:
        thread.join(timeout=4)

    unfinished = [t.name for t in threads if t.is_alive()]
    if unfinished:
        raise RuntimeError(
            f"Simulation did not finish within its time limit: {unfinished}"
        )

    if errors:
        raise RuntimeError("Race experiment failed: " + "; ".join(errors))

    observed_balance = account.balance
    lost_update_detected = observed_balance != expected_balance

    recorder.emit(
        "simulation_completed",
        expected_balance=expected_balance,
        observed_balance=observed_balance,
        lost_update_detected=lost_update_detected,
    )

    return {
        "mode": "race_condition",
        "operation": operation,
        "first_thread": leader,
        "initial_balance": initial_balance,
        "amounts": list(amounts),
        "expected_balance": expected_balance,
        "observed_balance": observed_balance,
        "lost_update_detected": lost_update_detected,
        "events": recorder.get_events(),
    }