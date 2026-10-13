
"""PayXray CPU Scheduling Lab.

Educational scheduling simulation supporting FCFS, non-preemptive SJF,
and Round Robin. Produces a Gantt chart, process metrics, and replay events.
"""

from collections import deque
from typing import Any

from simulation.event_log import EventRecorder


VALID_ALGORITHMS = ("fcfs", "sjf", "round_robin")

DEFAULT_PROCESSES = [
    {"pid": "P1", "arrival_time": 0, "burst_time": 7},
    {"pid": "P2", "arrival_time": 0, "burst_time": 4},
    {"pid": "P3", "arrival_time": 1, "burst_time": 1},
    {"pid": "P4", "arrival_time": 2, "burst_time": 4},
]

MAX_PROCESSES = 8
MAX_TIME = 1000

EVENT_PRIORITY = {
    "simulation_started": -10,
    "cpu_idle": 0,
    "process_completed": 0,
    "quantum_expired": 0,
    "process_arrived": 1,
    "process_requeued": 2,
    "process_started": 3,
    "process_resumed": 3,
    "simulation_completed": 9,
}


def _is_integer(value: Any, minimum: int, maximum: int) -> bool:
    """Validate integers while rejecting booleans."""
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and minimum <= value <= maximum
    )


def _prepare_processes(
    processes: list[dict[str, Any]] | tuple[dict[str, Any], ...] | None,
) -> list[dict[str, Any]]:
    """Validate and normalize the process configuration."""

    if processes is None:
        processes = DEFAULT_PROCESSES

    if not isinstance(processes, (list, tuple)):
        raise ValueError("processes must be a list of process objects")

    if not 1 <= len(processes) <= MAX_PROCESSES:
        raise ValueError(
            f"Provide between 1 and {MAX_PROCESSES} processes."
        )

    prepared = []
    seen_ids = set()

    for index, process in enumerate(processes):
        if not isinstance(process, dict):
            raise ValueError("Each process must be a JSON-style object.")

        pid = process.get("pid", f"P{index + 1}")
        arrival = process.get("arrival_time")
        burst = process.get("burst_time")

        if not isinstance(pid, str) or not pid.strip():
            raise ValueError("Each process must have a non-empty pid.")

        pid = pid.strip()

        if len(pid) > 12:
            raise ValueError("Process IDs must be 12 characters or fewer.")

        if pid in seen_ids:
            raise ValueError(f"Duplicate process ID: {pid}")

        if not _is_integer(arrival, 0, MAX_TIME):
            raise ValueError(
                f"{pid}: arrival_time must be an integer "
                f"between 0 and {MAX_TIME}."
            )

        if not _is_integer(burst, 1, MAX_TIME):
            raise ValueError(
                f"{pid}: burst_time must be an integer "
                f"between 1 and {MAX_TIME}."
            )

        seen_ids.add(pid)

        prepared.append({
            "pid": pid,
            "arrival_time": arrival,
            "burst_time": burst,
            "input_order": index,
        })

    return prepared


def run_scheduling_experiment(
    algorithm: str = "fcfs",
    processes: list[dict[str, Any]] | None = None,
    quantum: int = 2,
) -> dict[str, Any]:
    """Run a CPU scheduling experiment and return its trace and metrics.

    Supported algorithms:
        fcfs        - First Come, First Served
        sjf         - Non-preemptive Shortest Job First
        round_robin - Preemptive Round Robin with a fixed quantum

    All scheduling times are simulated integer time units, not wall-clock time.
    """

    if algorithm not in VALID_ALGORITHMS:
        raise ValueError(
            "algorithm must be 'fcfs', 'sjf', or 'round_robin'."
        )

    if not _is_integer(quantum, 1, MAX_TIME):
        raise ValueError(
            f"quantum must be an integer between 1 and {MAX_TIME}."
        )

    jobs = _prepare_processes(processes)
    job_by_id = {job["pid"]: job for job in jobs}

    recorder = EventRecorder()

    # Store the simulated timeline first. EventRecorder assigns sequence
    # numbers after sorting so the replay follows simulated time.
    trace: list[tuple[int, int, int, str, dict[str, Any]]] = []
    trace_order = 0

    def record(
        sim_time: int,
        event_type: str,
        **details: Any,
    ) -> None:
        nonlocal trace_order

        trace.append((
            sim_time,
            EVENT_PRIORITY.get(event_type, 4),
            trace_order,
            event_type,
            {"sim_time": sim_time, **details},
        ))
        trace_order += 1

    record(
        0,
        "simulation_started",
        mode="cpu_scheduling",
        algorithm=algorithm,
        quantum=quantum if algorithm == "round_robin" else None,
        process_count=len(jobs),
    )

    # Record each arrival at its actual simulated arrival time.
    for job in jobs:
        record(
            job["arrival_time"],
            "process_arrived",
            thread=job["pid"],
            process_id=job["pid"],
            arrival_time=job["arrival_time"],
            burst_time=job["burst_time"],
        )

    gantt_chart: list[dict[str, Any]] = []
    first_start: dict[str, int] = {}
    completion_time: dict[str, int] = {}

    def add_segment(pid: str, start: int, end: int) -> None:
        if end <= start:
            return

        gantt_chart.append({
            "process_id": pid,
            "start_time": start,
            "end_time": end,
            "duration": end - start,
        })

    if algorithm in ("fcfs", "sjf"):
        completed: set[str] = set()
        current_time = 0

        while len(completed) < len(jobs):
            ready = [
                job for job in jobs
                if job["pid"] not in completed
                and job["arrival_time"] <= current_time
            ]

            if not ready:
                next_arrival = min(
                    job["arrival_time"]
                    for job in jobs
                    if job["pid"] not in completed
                )

                add_segment("IDLE", current_time, next_arrival)
                record(
                    current_time,
                    "cpu_idle",
                    start_time=current_time,
                    end_time=next_arrival,
                    duration=next_arrival - current_time,
                )
                current_time = next_arrival
                continue

            if algorithm == "fcfs":
                selected = min(
                    ready,
                    key=lambda job: (
                        job["arrival_time"],
                        job["input_order"],
                    ),
                )
            else:
                selected = min(
                    ready,
                    key=lambda job: (
                        job["burst_time"],
                        job["arrival_time"],
                        job["input_order"],
                    ),
                )

            pid = selected["pid"]
            start = current_time
            end = start + selected["burst_time"]

            first_start[pid] = start

            record(
                start,
                "process_started",
                thread=pid,
                process_id=pid,
                start_time=start,
                burst_time=selected["burst_time"],
                remaining_time=selected["burst_time"],
            )

            add_segment(pid, start, end)
            current_time = end
            completion_time[pid] = end
            completed.add(pid)

            turnaround = end - selected["arrival_time"]
            waiting = turnaround - selected["burst_time"]
            response = start - selected["arrival_time"]

            record(
                end,
                "process_completed",
                thread=pid,
                process_id=pid,
                completion_time=end,
                turnaround_time=turnaround,
                waiting_time=waiting,
                response_time=response,
            )

    else:
        # Round Robin: queue entries are process IDs. Arrivals at a time
        # quantum boundary enter the queue before the running process
        # is requeued.
        ordered_jobs = sorted(
            jobs,
            key=lambda job: (
                job["arrival_time"],
                job["input_order"],
            ),
        )

        ready_queue = deque()
        next_unqueued = 0
        remaining = {
            job["pid"]: job["burst_time"]
            for job in jobs
        }
        current_time = 0
        completed_count = 0

        def enqueue_arrivals(up_to: int) -> None:
            nonlocal next_unqueued

            while (
                next_unqueued < len(ordered_jobs)
                and ordered_jobs[next_unqueued]["arrival_time"] <= up_to
            ):
                ready_queue.append(
                    ordered_jobs[next_unqueued]["pid"]
                )
                next_unqueued += 1

        enqueue_arrivals(current_time)

        while completed_count < len(jobs):
            if not ready_queue:
                next_arrival = ordered_jobs[next_unqueued]["arrival_time"]

                add_segment("IDLE", current_time, next_arrival)
                record(
                    current_time,
                    "cpu_idle",
                    start_time=current_time,
                    end_time=next_arrival,
                    duration=next_arrival - current_time,
                )

                current_time = next_arrival
                enqueue_arrivals(current_time)
                continue

            pid = ready_queue.popleft()
            job = job_by_id[pid]
            remaining_before = remaining[pid]

            start = current_time
            duration = min(quantum, remaining_before)
            end = start + duration

            if pid not in first_start:
                first_start[pid] = start
                event_type = "process_started"
            else:
                event_type = "process_resumed"

            record(
                start,
                event_type,
                thread=pid,
                process_id=pid,
                start_time=start,
                burst_time=job["burst_time"],
                remaining_time=remaining_before,
                quantum=quantum,
            )

            add_segment(pid, start, end)
            current_time = end
            remaining[pid] -= duration

            # This adds any processes arriving during this time slice
            # before an unfinished process is put back into the queue.
            enqueue_arrivals(current_time)

            if remaining[pid] == 0:
                completion_time[pid] = current_time
                completed_count += 1

                turnaround = current_time - job["arrival_time"]
                waiting = turnaround - job["burst_time"]
                response = first_start[pid] - job["arrival_time"]

                record(
                    current_time,
                    "process_completed",
                    thread=pid,
                    process_id=pid,
                    completion_time=current_time,
                    turnaround_time=turnaround,
                    waiting_time=waiting,
                    response_time=response,
                )
            else:
                record(
                    current_time,
                    "quantum_expired",
                    thread=pid,
                    process_id=pid,
                    remaining_time=remaining[pid],
                    quantum=quantum,
                )

                record(
                    current_time,
                    "process_requeued",
                    thread=pid,
                    process_id=pid,
                    remaining_time=remaining[pid],
                )

                ready_queue.append(pid)

    process_results = []

    for job in jobs:
        pid = job["pid"]
        completion = completion_time[pid]
        turnaround = completion - job["arrival_time"]
        waiting = turnaround - job["burst_time"]
        response = first_start[pid] - job["arrival_time"]

        process_results.append({
            "pid": pid,
            "arrival_time": job["arrival_time"],
            "burst_time": job["burst_time"],
            "completion_time": completion,
            "turnaround_time": turnaround,
            "waiting_time": waiting,
            "response_time": response,
        })

    count = len(process_results)

    average_waiting = round(
        sum(item["waiting_time"] for item in process_results) / count, 2
    )
    average_turnaround = round(
        sum(item["turnaround_time"] for item in process_results) / count, 2
    )
    average_response = round(
        sum(item["response_time"] for item in process_results) / count, 2
    )

    record(
        max(completion_time.values()),
        "simulation_completed",
        mode="cpu_scheduling",
        algorithm=algorithm,
        quantum=quantum if algorithm == "round_robin" else None,
        completed_count=count,
        average_waiting_time=average_waiting,
        average_turnaround_time=average_turnaround,
        average_response_time=average_response,
        gantt_chart=gantt_chart,
    )

    # Emit trace events in simulated-time order, with deterministic ordering
    # for events that occur at the same simulation timestamp.
    trace.sort(key=lambda item: (item[0], item[1], item[2]))

    for _, _, _, event_type, details in trace:
        recorder.emit(event_type, **details)

    return {
        "mode": "cpu_scheduling",
        "algorithm": algorithm,
        "quantum": quantum if algorithm == "round_robin" else None,
        "processes": process_results,
        "gantt_chart": gantt_chart,
        "average_waiting_time": average_waiting,
        "average_turnaround_time": average_turnaround,
        "average_response_time": average_response,
        "events": recorder.get_events(),
    }
