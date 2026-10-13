
"""PayXray Thread Scheduler.

A deterministic educational model that schedules T1 and T2 transaction
operations. It demonstrates thread interleaving, mutex contention, and
the effect of scheduling policy on shared account state.

This models CPU dispatching for teaching; it does not control the
operating system's actual CPU scheduler.
"""

from collections import deque
from typing import Any

from simulation.event_log import EventRecorder


VALID_POLICIES = ("fcfs", "round_robin", "priority")
VALID_OPERATIONS = ("withdraw", "deposit")
THREAD_IDS = ("T1", "T2")
TRANSACTION_STEPS = ("READ", "CALCULATE", "WRITE")
MAX_BALANCE = 1_000_000_000
MAX_AMOUNT = 1_000_000_000


def _is_integer(value: Any, minimum: int, maximum: int) -> bool:
    """Accept integers but reject booleans."""
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and minimum <= value <= maximum
    )


def _serial_reference(
    initial_balance: int,
    amounts_by_thread: dict[str, int],
    operation: str,
    order: list[str],
) -> tuple[int, int, int]:
    """Calculate the expected balance using serial transaction execution."""
    balance = initial_balance
    accepted = 0
    rejected = 0

    for thread in order:
        amount = amounts_by_thread[thread]

        if operation == "deposit":
            balance += amount
            accepted += 1
        elif amount <= balance:
            balance -= amount
            accepted += 1
        else:
            rejected += 1

    return balance, accepted, rejected


def run_thread_scheduler_experiment(
    initial_balance: int = 1000,
    amounts: list[int] | tuple[int, int] = (300, 200),
    operation: str = "withdraw",
    algorithm: str = "round_robin",
    quantum: int = 1,
    priority_thread: str = "T1",
    mutex_enabled: bool = False,
) -> dict[str, Any]:
    """Schedule T1 and T2 through READ, CALCULATE, and WRITE operations.

    Policies:
        fcfs        - Run each transaction to completion in input order.
        round_robin - Share CPU turns between transaction-operation steps.
        priority    - Run the selected higher-priority thread first.

    With the mutex enabled, a thread must acquire account_lock before
    entering the transaction's protected section.
    """

    algorithm = str(algorithm).strip().lower()
    operation = str(operation).strip().lower()

    if algorithm not in VALID_POLICIES:
        raise ValueError(
            "algorithm must be 'fcfs', 'round_robin', or 'priority'."
        )

    if operation not in VALID_OPERATIONS:
        raise ValueError("operation must be 'withdraw' or 'deposit'.")

    if not _is_integer(initial_balance, 0, MAX_BALANCE):
        raise ValueError(
            f"initial_balance must be between 0 and {MAX_BALANCE}."
        )

    if not isinstance(amounts, (list, tuple)) or len(amounts) != 2:
        raise ValueError("Provide exactly two transaction amounts.")

    if any(
        not _is_integer(amount, 1, MAX_AMOUNT)
        for amount in amounts
    ):
        raise ValueError(
            f"Each amount must be between 1 and {MAX_AMOUNT}."
        )

    if not _is_integer(quantum, 1, len(TRANSACTION_STEPS)):
        raise ValueError("quantum must be 1, 2, or 3 operation steps.")

    if priority_thread not in THREAD_IDS:
        raise ValueError("priority_thread must be T1 or T2.")

    if not isinstance(mutex_enabled, bool):
        raise ValueError("mutex_enabled must be a boolean.")

    amounts_by_thread = {
        "T1": amounts[0],
        "T2": amounts[1],
    }

    # FCFS and Round Robin use the input order to break ties.
    # Priority scheduling starts with the selected higher-priority thread.
    execution_order = (
        [priority_thread, "T2" if priority_thread == "T1" else "T1"]
        if algorithm == "priority"
        else list(THREAD_IDS)
    )

    reference_balance, _, _ = _serial_reference(
        initial_balance,
        amounts_by_thread,
        operation,
        execution_order,
    )

    recorder = EventRecorder()
    sim_time = 0
    balance = initial_balance
    lock_owner: str | None = None
    completed_count = 0
    successful_count = 0
    rejected_count = 0

    ready_queue = deque(THREAD_IDS)
    gantt_chart: list[dict[str, Any]] = []

    jobs: dict[str, dict[str, Any]] = {
        thread: {
            "amount": amounts_by_thread[thread],
            "step": 0,
            "state": "NEW",
            "started": False,
            "read_balance": None,
            "calculated_balance": None,
            "owns_lock": False,
            "accepted": False,
        }
        for thread in THREAD_IDS
    }

    waiting_for: dict[str, str] = {}

    def emit(event_type: str, **details: Any) -> None:
        """Record an event with its simulated execution time."""
        recorder.emit(event_type, sim_time=sim_time, **details)

    def set_state(
        thread: str,
        new_state: str,
        reason: str = "",
    ) -> None:
        old_state = jobs[thread]["state"]

        if old_state == new_state:
            return

        jobs[thread]["state"] = new_state

        emit(
            "thread_state_changed",
            thread=thread,
            process_id=thread,
            previous_state=old_state,
            state=new_state,
            reason=reason,
        )

    def add_segment(
        thread: str,
        step_name: str,
        start: int,
    ) -> None:
        """Record one simulated CPU operation in the Gantt timeline."""
        gantt_chart.append({
            "thread": thread,
            "process_id": thread,
            "operation": step_name,
            "start_time": start,
            "end_time": start + 1,
            "duration": 1,
        })

    def acquire_lock(thread: str) -> bool:
        """Attempt to acquire account_lock before the critical section."""
        nonlocal lock_owner

        if not mutex_enabled or jobs[thread]["owns_lock"]:
            return True

        emit(
            "lock_requested",
            thread=thread,
            resource="account_lock",
        )

        if lock_owner is None:
            lock_owner = thread
            jobs[thread]["owns_lock"] = True

            emit(
                "lock_acquired",
                thread=thread,
                resource="account_lock",
                waiting_for=None,
            )
            return True

        waiting_for[thread] = lock_owner
        set_state(
            thread,
            "BLOCKED",
            "Waiting for account_lock.",
        )

        emit(
            "lock_waiting",
            thread=thread,
            waiting_for=lock_owner,
            resource="account_lock",
        )
        return False

    def release_lock(thread: str) -> None:
        """Release the mutex and return waiting threads to the ready queue."""
        nonlocal lock_owner

        if not mutex_enabled or lock_owner != thread:
            return

        emit(
            "lock_releasing",
            thread=thread,
            resource="account_lock",
        )

        lock_owner = None
        jobs[thread]["owns_lock"] = False

        emit(
            "lock_released",
            thread=thread,
            resource="account_lock",
        )

        for waiting_thread in THREAD_IDS:
            if waiting_for.get(waiting_thread) != thread:
                continue

            del waiting_for[waiting_thread]

            set_state(
                waiting_thread,
                "READY",
                "account_lock became available.",
            )

            if waiting_thread not in ready_queue:
                ready_queue.append(waiting_thread)

    def finish_thread(thread: str, accepted: bool) -> None:
        nonlocal completed_count

        jobs[thread]["accepted"] = accepted

        if jobs[thread]["owns_lock"]:
            release_lock(thread)

        set_state(
            thread,
            "COMPLETED",
            "Transaction finished.",
        )

        completed_count += 1

        emit(
            "transaction_thread_completed",
            thread=thread,
            process_id=thread,
            accepted=accepted,
            completion_time=sim_time,
            final_balance=balance,
        )

    def execute_step(thread: str) -> None:
        """Execute one READ, CALCULATE, or WRITE step."""
        nonlocal sim_time, balance
        nonlocal successful_count, rejected_count

        job = jobs[thread]
        step_index = job["step"]
        step_name = TRANSACTION_STEPS[step_index]
        amount = job["amount"]
        start = sim_time
        terminal_result: bool | None = None

        add_segment(thread, step_name, start)

        if step_name == "READ":
            job["read_balance"] = balance

            emit(
                "balance_read",
                thread=thread,
                balance=balance,
                amount=amount,
                operation=operation,
            )

        elif step_name == "CALCULATE":
            old_balance = job["read_balance"]

            emit(
                "balance_checked",
                thread=thread,
                balance=old_balance,
                amount=amount,
                withdrawal=amount if operation == "withdraw" else 0,
                operation=operation,
                sufficient_funds=(
                    operation == "deposit" or old_balance >= amount
                ),
            )

            if operation == "withdraw" and old_balance < amount:
                emit(
                    "transaction_rejected",
                    thread=thread,
                    amount=amount,
                    available_balance=old_balance,
                    reason="Insufficient funds.",
                )

                rejected_count += 1
                terminal_result = False
            else:
                calculated = (
                    old_balance - amount
                    if operation == "withdraw"
                    else old_balance + amount
                )

                job["calculated_balance"] = calculated

                emit(
                    "balance_calculated",
                    thread=thread,
                    amount=amount,
                    operation=operation,
                    previous_balance=old_balance,
                    calculated_balance=calculated,
                )

        elif step_name == "WRITE":
            balance = job["calculated_balance"]

            emit(
                "balance_updated",
                thread=thread,
                written_balance=balance,
                updated_balance=balance,
            )

            emit(
                "transaction_accepted",
                thread=thread,
                amount=amount,
                operation=operation,
            )

            successful_count += 1
            terminal_result = True

        sim_time += 1

        if terminal_result is not None:
            finish_thread(thread, terminal_result)
        else:
            job["step"] += 1

    emit(
        "simulation_started",
        mode="thread_scheduler",
        algorithm=algorithm,
        quantum=quantum if algorithm == "round_robin" else None,
        priority_thread=priority_thread if algorithm == "priority" else None,
        mutex_enabled=mutex_enabled,
        initial_balance=initial_balance,
        operation=operation,
        first_thread=execution_order[0],
        process_count=len(THREAD_IDS),
    )

    for thread in THREAD_IDS:
        emit(
            "process_arrived",
            thread=thread,
            process_id=thread,
            arrival_time=0,
            burst_time=len(TRANSACTION_STEPS),
            amount=amounts_by_thread[thread],
            operation=operation,
        )

        set_state(thread, "READY", "Transaction is ready to execute.")

    # FCFS and non-preemptive priority run each transaction to completion.
    if algorithm in ("fcfs", "priority"):
        for thread in execution_order:
            if jobs[thread]["state"] == "COMPLETED":
                continue

            set_state(thread, "RUNNING", "Selected by the scheduler.")

            if not jobs[thread]["started"]:
                jobs[thread]["started"] = True
                emit(
                    "process_started",
                    thread=thread,
                    process_id=thread,
                    start_time=sim_time,
                    burst_time=len(TRANSACTION_STEPS),
                )

            while jobs[thread]["state"] != "COMPLETED":
                if not acquire_lock(thread):
                    raise RuntimeError(
                        "Unexpected mutex blocking in a non-preemptive policy."
                    )

                execute_step(thread)

    else:
        # Round Robin yields after the configured number of transaction
        # operations. A mutex owner may be re-queued while retaining the lock.
        while completed_count < len(THREAD_IDS):
            if not ready_queue:
                raise RuntimeError(
                    "No runnable thread remains before all transactions finish."
                )

            thread = ready_queue.popleft()

            if jobs[thread]["state"] != "READY":
                continue

            set_state(thread, "RUNNING", "Selected by Round Robin.")

            if not jobs[thread]["started"]:
                jobs[thread]["started"] = True
                emit(
                    "process_started",
                    thread=thread,
                    process_id=thread,
                    start_time=sim_time,
                    burst_time=len(TRANSACTION_STEPS),
                )

            operations_this_turn = 0

            while (
                operations_this_turn < quantum
                and jobs[thread]["state"] == "RUNNING"
                and jobs[thread]["step"] < len(TRANSACTION_STEPS)
            ):
                if not acquire_lock(thread):
                    break

                execute_step(thread)
                operations_this_turn += 1

            if jobs[thread]["state"] == "RUNNING":
                remaining = (
                    len(TRANSACTION_STEPS) - jobs[thread]["step"]
                )

                emit(
                    "quantum_expired",
                    thread=thread,
                    process_id=thread,
                    remaining_time=remaining,
                    quantum=quantum,
                )

                set_state(
                    thread,
                    "READY",
                    "Round Robin time quantum expired.",
                )

                ready_queue.append(thread)

    lost_update_detected = (
        not mutex_enabled and balance != reference_balance
    )
    invariant_holds = balance == reference_balance

    emit(
        "simulation_completed",
        mode="thread_scheduler",
        algorithm=algorithm,
        quantum=quantum if algorithm == "round_robin" else None,
        mutex_enabled=mutex_enabled,
        initial_balance=initial_balance,
        expected_balance=reference_balance,
        observed_balance=balance,
        lost_update_detected=lost_update_detected,
        balance_invariant_holds=invariant_holds,
        successful_count=successful_count,
        rejected_count=rejected_count,
        completed_count=completed_count,
    )

    return {
        "mode": "thread_scheduler",
        "algorithm": algorithm,
        "quantum": quantum if algorithm == "round_robin" else None,
        "priority_thread": priority_thread if algorithm == "priority" else None,
        "mutex_enabled": mutex_enabled,
        "operation": operation,
        "initial_balance": initial_balance,
        "amounts": list(amounts),
        "expected_balance": reference_balance,
        "observed_balance": balance,
        "lost_update_detected": lost_update_detected,
        "balance_invariant_holds": invariant_holds,
        "successful_count": successful_count,
        "rejected_count": rejected_count,
        "completed_count": completed_count,
        "threads": {
            thread: {
                "state": jobs[thread]["state"],
                "amount": jobs[thread]["amount"],
                "accepted": jobs[thread]["accepted"],
            }
            for thread in THREAD_IDS
        },
        "gantt_chart": gantt_chart,
        "events": recorder.get_events(),
    }
