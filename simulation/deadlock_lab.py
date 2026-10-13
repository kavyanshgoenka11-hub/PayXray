
"""PayXray Deadlock Lab.

Creates a controlled circular wait using two real Python threads and locks.
The deadlock is detected and recovered so the application does not hang.
"""

from threading import Barrier, BrokenBarrierError, Event, Lock, Thread
from typing import Any

from simulation.event_log import EventRecorder


THREAD_IDS = ("T1", "T2")
RECOVERY_VICTIM = "T2"


def run_deadlock_experiment() -> dict[str, Any]:
    """Demonstrate circular wait, deadlock detection, and recovery."""

    resources = {
        "A": Lock(),
        "B": Lock(),
    }

    first_resource = {
        "T1": "A",
        "T2": "B",
    }

    second_resource = {
        "T1": "B",
        "T2": "A",
    }

    resource_owner = {
        "A": "T1",
        "B": "T2",
    }

    recorder = EventRecorder()

    # Both threads must hold their first resource before requesting
    # the resource held by the other thread.
    both_hold_first = Barrier(2, timeout=4)

    # Two workers and the main thread meet here after both failed
    # to acquire their second resource.
    both_blocked = Barrier(3, timeout=4)

    recovery_decision = Event()

    errors: list[str] = []
    errors_lock = Lock()

    recorder.emit(
        "simulation_started",
        mode="deadlock_lab",
        scenario="circular_wait",
        recovery_victim=RECOVERY_VICTIM,
        resources=["Resource A", "Resource B"],
        description=(
            "T1 holds Resource A and requests B; "
            "T2 holds Resource B and requests A."
        ),
    )

    for tid in THREAD_IDS:
        recorder.emit(
            "request_created",
            thread=tid,
            request_id=f"LOCK-{tid}",
            operation="acquire_resource",
            resource=f"Resource {first_resource[tid]}",
        )

    def worker(tid: str) -> None:
        owned_resources: list[tuple[str, Any]] = []

        first_name = first_resource[tid]
        second_name = second_resource[tid]

        first_lock = resources[first_name]
        second_lock = resources[second_name]

        try:
            # Acquire the first resource.
            acquired = first_lock.acquire(timeout=3)

            if not acquired:
                raise TimeoutError(
                    f"{tid} could not acquire Resource {first_name}"
                )

            owned_resources.append((first_name, first_lock))

            recorder.emit(
                "lock_acquired",
                thread=tid,
                resource=f"Resource {first_name}",
                wait_duration_ms=0,
                phase="initial",
            )

            # Ensure both resources are held by different threads.
            both_hold_first.wait(timeout=4)

            # Request the resource currently held by the other thread.
            other_thread = resource_owner[second_name]

            recorder.emit(
                "lock_requested",
                thread=tid,
                resource=f"Resource {second_name}",
                waiting_for=other_thread,
            )

            recorder.emit(
                "lock_waiting",
                thread=tid,
                resource=f"Resource {second_name}",
                waiting_for=other_thread,
            )

            # The opposing thread still holds this lock. A bounded wait
            # demonstrates the blocked request without hanging forever.
            acquired = second_lock.acquire(timeout=0.75)

            if acquired:
                owned_resources.append((second_name, second_lock))
                recorder.emit(
                    "lock_acquired",
                    thread=tid,
                    resource=f"Resource {second_name}",
                    wait_duration_ms=0,
                    phase="unexpected",
                )
                raise RuntimeError(
                    "The controlled circular-wait scenario was not established."
                )

            recorder.emit(
                "lock_wait_timeout",
                thread=tid,
                resource=f"Resource {second_name}",
                waiting_for=other_thread,
            )

            # The main thread detects the deadlock only after both
            # resource requests have timed out while their first locks
            # remain held.
            both_blocked.wait(timeout=4)

            if not recovery_decision.wait(timeout=4):
                raise TimeoutError("No deadlock recovery decision was received.")

            if tid == RECOVERY_VICTIM:
                recorder.emit(
                    "deadlock_recovery_started",
                    thread=tid,
                    action="abort",
                    victim_thread=tid,
                    released_resource=f"Resource {first_name}",
                )

                recorder.emit(
                    "thread_aborted",
                    thread=tid,
                    reason="Selected as the deadlock recovery victim.",
                )

                # The finally block releases the resource held by this
                # thread, allowing the surviving thread to continue.
                return

            recorder.emit(
                "deadlock_recovery_started",
                thread=tid,
                action="continue",
                victim_thread=RECOVERY_VICTIM,
                requested_resource=f"Resource {second_name}",
            )

            # Retry the previously blocked request after the victim
            # releases its resource.
            acquired = second_lock.acquire(timeout=3)

            if not acquired:
                raise TimeoutError(
                    f"{tid} could not acquire Resource {second_name} "
                    "after recovery."
                )

            owned_resources.append((second_name, second_lock))

            recorder.emit(
                "lock_acquired",
                thread=tid,
                resource=f"Resource {second_name}",
                wait_duration_ms=0,
                phase="recovery",
            )

            recorder.emit(
                "critical_section_entered",
                thread=tid,
                resource=f"Resource {second_name}",
            )

            recorder.emit(
                "critical_section_exited",
                thread=tid,
                resource=f"Resource {second_name}",
            )

            recorder.emit(
                "thread_completed",
                thread=tid,
                message="Completed after deadlock recovery.",
            )

        except Exception as exc:
            # Unblock coordination waits if an unexpected error occurs.
            both_hold_first.abort()
            both_blocked.abort()

            with errors_lock:
                errors.append(
                    f"{tid}: {type(exc).__name__}: {exc}"
                )

            recorder.emit(
                "worker_error",
                thread=tid,
                error_type=type(exc).__name__,
                message=str(exc),
            )

        finally:
            # Release resources in reverse acquisition order.
            for resource_name, resource_lock in reversed(owned_resources):
                recorder.emit(
                    "lock_releasing",
                    thread=tid,
                    resource=f"Resource {resource_name}",
                )

                resource_lock.release()

                recorder.emit(
                    "lock_released",
                    thread=tid,
                    resource=f"Resource {resource_name}",
                )

    threads = {
        tid: Thread(
            target=worker,
            args=(tid,),
            name=tid,
        )
        for tid in THREAD_IDS
    }

    for tid in THREAD_IDS:
        threads[tid].start()

    try:
        # Wait for both threads to time out while trying to obtain
        # each other's resource.
        both_blocked.wait(timeout=5)

    except BrokenBarrierError as exc:
        recovery_decision.set()

        for thread in threads.values():
            thread.join(timeout=4)

        raise RuntimeError(
            "Could not establish the circular-wait scenario."
        ) from exc

    cycle = ["T1", "T2", "T1"]
    survivor = "T1"

    recorder.emit(
        "deadlock_detected",
        cycle=cycle,
        victim_thread=RECOVERY_VICTIM,
        survivor_thread=survivor,
        reason=(
            "Circular wait: T1 waits for a resource held by T2, "
            "and T2 waits for a resource held by T1."
        ),
    )

    # Recovery is controlled by the main thread, keeping the lab bounded.
    recovery_decision.set()

    for thread in threads.values():
        thread.join(timeout=5)

    unfinished = [
        tid for tid, thread in threads.items()
        if thread.is_alive()
    ]

    if unfinished:
        raise RuntimeError(
            f"Deadlock recovery did not finish within the time limit: {unfinished}"
        )

    if errors:
        raise RuntimeError(
            "Deadlock experiment failed: " + "; ".join(errors)
        )

    recorder.emit(
        "simulation_completed",
        deadlock_detected=True,
        deadlock_recovered=True,
        cycle=cycle,
        victim_thread=RECOVERY_VICTIM,
        survivor_thread=survivor,
    )

    return {
        "mode": "deadlock_lab",
        "scenario": "circular_wait",
        "deadlock_detected": True,
        "deadlock_recovered": True,
        "cycle": cycle,
        "victim_thread": RECOVERY_VICTIM,
        "survivor_thread": survivor,
        "events": recorder.get_events(),
    }
