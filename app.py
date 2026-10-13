from typing import Any

from flask import Flask, jsonify, render_template, request

from simulation.deadlock_lab import run_deadlock_experiment
from simulation.race_lab import run_race_experiment
from simulation.safe_lab import run_safe_experiment
from simulation.scheduling_lab import run_scheduling_experiment

from simulation.thread_scheduler_lab import run_thread_scheduler_experiment

app = Flask(__name__)

# Keep incoming request bodies small and predictable.
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

MAX_RUPEES = 1_000_000_000
VALID_MODES = (
    "race_condition",
    "safe_synchronization",
    "deadlock_lab",
    "cpu_scheduling",
    "thread_scheduler",
)
VALID_OPERATIONS = ("deposit", "withdraw")
VALID_THREADS = ("T1", "T2")
VALID_SCHEDULING_ALGORITHMS = ("fcfs", "sjf", "round_robin")


def is_valid_integer(value: Any, minimum: int, maximum: int) -> bool:
    """Validate an integer while explicitly rejecting booleans."""
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and minimum <= value <= maximum
    )


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/health")
def health():
    """Check whether the backend is running."""
    return jsonify({"application": "PayXray", "status": "healthy"})


@app.post("/api/simulate")
def simulate():
    """Validate inputs and run the selected OS simulation."""
    if not request.is_json:
        return jsonify({
            "error": "Content-Type must be application/json.",
        }), 415

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a valid JSON object.",
        }), 400

    mode = data.get("mode")
    if mode not in VALID_MODES:
        return jsonify({
            "error": (
                "Unsupported mode. Use 'race_condition', "
                "'safe_synchronization', 'deadlock_lab', "
                "'cpu_scheduling', or 'thread_scheduler'."
            ),
        }), 400



    # Thread Scheduler: schedule T1 and T2 through transaction operations.
    if mode == "thread_scheduler":
        algorithm = data.get("algorithm", "round_robin")

        valid_thread_policies = ("fcfs", "round_robin", "priority")

        if algorithm not in valid_thread_policies:
            return jsonify({
                "error": (
                    "Thread scheduling algorithm must be 'fcfs', "
                    "'round_robin', or 'priority'."
                ),
            }), 400

        operation = data.get("operation", "withdraw")
        default_amounts = (
            [300, 200] if operation == "withdraw" else [100, 200]
        )

        try:
            result = run_thread_scheduler_experiment(
                initial_balance=data.get("initial_balance", 1000),
                amounts=data.get("amounts", default_amounts),
                operation=operation,
                algorithm=algorithm,
                quantum=data.get("quantum", 1),
                priority_thread=data.get("priority_thread", "T1"),
                mutex_enabled=data.get("mutex_enabled", False),
            )

            return jsonify(result), 200

        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        except Exception:
            app.logger.exception(
                "PayXray thread scheduler simulation failed"
            )
            return jsonify({
                "error": (
                    "The thread scheduling simulation could not be "
                    "completed. Check the Flask terminal for details."
                ),
            }), 500

    # CPU scheduling is independent of transaction balances and resource locks.
    if mode == "cpu_scheduling":
        algorithm = data.get("algorithm", "fcfs")
        if algorithm not in VALID_SCHEDULING_ALGORITHMS:
            return jsonify({
                "error": (
                    "algorithm must be 'fcfs', 'sjf', or 'round_robin'."
                ),
            }), 400

        processes = data.get("processes")
        quantum = data.get("quantum", 2)

        try:
            result = run_scheduling_experiment(
                algorithm=algorithm,
                processes=processes,
                quantum=quantum,
            )
            return jsonify(result), 200
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            app.logger.exception("PayXray CPU scheduling simulation failed")
            return jsonify({
                "error": (
                    "The CPU scheduling simulation could not be completed. "
                    "Check the Flask terminal for details."
                ),
            }), 500

    # Deadlock simulation is independent of account balance and transaction
    # amounts. It emits an ordered event trace like the other labs.
    if mode == "deadlock_lab":
        try:
            result = run_deadlock_experiment()
            return jsonify(result), 200
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            app.logger.exception("PayXray deadlock simulation failed")
            return jsonify({
                "error": (
                    "The deadlock simulation could not be completed. "
                    "Check the Flask terminal for details."
                ),
            }), 500

    # Withdraw is the default operation in both transaction labs.
    operation = data.get("operation", "withdraw")
    if operation not in VALID_OPERATIONS:
        return jsonify({
            "error": "operation must be 'deposit' or 'withdraw'.",
        }), 400

    # Python chooses a random first thread if the frontend omits this field.
    first_thread = data.get("first_thread")
    if first_thread is not None and first_thread not in VALID_THREADS:
        return jsonify({
            "error": "first_thread must be 'T1', 'T2', or omitted.",
        }), 400

    initial_balance = data.get("initial_balance", 1000)
    if not is_valid_integer(initial_balance, 0, MAX_RUPEES):
        return jsonify({
            "error": (
                "initial_balance must be a non-negative integer "
                f"between 0 and {MAX_RUPEES}."
            ),
        }), 400

    # Defaults match the frontend configuration for each operation and lab.
    if operation == "deposit":
        default_amounts = [100, 200]
    elif mode == "race_condition":
        default_amounts = [300, 200]
    else:
        default_amounts = [700, 500]

    amounts = data.get("amounts", default_amounts)
    if not isinstance(amounts, list) or len(amounts) != 2:
        return jsonify({
            "error": "amounts must be a list containing exactly two values.",
        }), 400

    if not all(
        is_valid_integer(amount, 1, MAX_RUPEES)
        for amount in amounts
    ):
        return jsonify({
            "error": (
                "Each amount must be a positive integer "
                f"not exceeding {MAX_RUPEES}."
            ),
        }), 400

    if (
        mode == "race_condition"
        and operation == "withdraw"
        and sum(amounts) > initial_balance
    ):
        return jsonify({
            "error": (
                "For the Race Condition Lab, combined withdrawals must not "
                "exceed the initial balance. Reduce the amounts or increase "
                "the initial balance."
            ),
        }), 400

    try:
        if mode == "race_condition":
            result = run_race_experiment(
                initial_balance=initial_balance,
                amounts=tuple(amounts),
                operation=operation,
                first_thread=first_thread,
            )
        else:
            result = run_safe_experiment(
                initial_balance=initial_balance,
                amounts=tuple(amounts),
                operation=operation,
                first_thread=first_thread,
            )

        return jsonify(result), 200

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except Exception:
        app.logger.exception("PayXray simulation failed")
        return jsonify({
            "error": (
                "The simulation could not be completed. "
                "Check the Flask terminal for details."
            ),
        }), 500


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "Request body is too large."}), 413


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        threaded=True,
    )
