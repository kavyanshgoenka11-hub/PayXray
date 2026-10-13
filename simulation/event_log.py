
from copy import deepcopy
from threading import Lock
from time import perf_counter_ns
from typing import Any


class EventRecorder:
    """Thread-safe recorder for PayXray simulation events."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._events: list[dict[str, Any]] = []
        self._start_time_ns = perf_counter_ns()

    def emit(
        self,
        event_type: str,
        *,
        thread: str | None = None,
        **details: Any,
    ) -> dict[str, Any]:
        """Record one event and return a copy of it."""

        if not isinstance(event_type, str) or not event_type.strip():
            raise ValueError("event_type must be a non-empty string")

        reserved_keys = {"seq", "time_ms", "type", "thread"}
        if reserved_keys.intersection(details):
            raise ValueError("Event details cannot override reserved fields")

        with self._lock:
            elapsed_ms = (
                perf_counter_ns() - self._start_time_ns
            ) / 1_000_000

            event = {
                **deepcopy(details),
                "seq": len(self._events) + 1,
                "time_ms": round(elapsed_ms, 3),
                "type": event_type,
                "thread": thread,
            }

            self._events.append(event)
            return deepcopy(event)

    def get_events(self) -> list[dict[str, Any]]:
        """Return a copy of the recorded events."""

        with self._lock:
            return deepcopy(self._events)

    def clear(self) -> None:
        """Reset the event list and its elapsed-time clock."""

        with self._lock:
            self._events.clear()
            self._start_time_ns = perf_counter_ns()

    def __len__(self) -> int:
        with self._lock:
            return len(self._events)
