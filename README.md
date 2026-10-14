# PayXray — An Interactive Operating System Simulator

PayXray is an educational web application that demonstrates important Operating System concepts through interactive transaction simulations, event logs, thread-state changes, and scheduling timelines. It uses a bank-account scenario to make concurrency, synchronization, deadlocks, and scheduling easier to observe.

> **Purpose:** PayXray is a teaching simulator. It models OS concepts within the application; it does not control or display the real Windows operating-system scheduler and it is not a real banking application.

## Project Links

- **GitHub repository:** https://github.com/kavyanshgoenka11-hub/PayXray
- **Live implementation:** _Add the successful Vercel deployment URL here._

## Objectives

- Demonstrate how concurrent transactions can produce a race condition and a lost update.
- Show how mutex-based synchronization protects a shared balance and checks withdrawal validity.
- Illustrate deadlock, resource waiting, detection, and a simulated recovery action.
- Visualize transaction threads, their states, ready queue, operation-level interleaving, and scheduling policies.
- Compare common CPU scheduling algorithms using Gantt charts and timing metrics.
- Make Operating System concepts easier to explore through an interactive visual interface.

## Features and Labs

### 1. Race Condition

Runs competing transactions against a shared balance without synchronization. The event sequence shows that both threads can read the same earlier balance before either update is written, which can cause a lost update.

### 2. Safe Synchronization

Demonstrates a mutex-protected critical section. The balance is checked while the lock is held, so competing withdrawals are processed safely and an insufficient-funds request can be rejected.

### 3. Deadlock

Provides a controlled deadlock scenario that illustrates threads waiting on resources, a circular wait, detection, and a simulated recovery/victim choice. The lab is designed to keep the web request responsive while demonstrating the concept.

### 4. Thread Scheduler

Models each transaction as **READ → CALCULATE → WRITE** steps. It can illustrate the effect of different policies and optional mutex protection on thread interleaving and the shared balance.

Supported policies:

- **FCFS:** transaction threads are scheduled in arrival order.
- **Round Robin:** operation steps are interleaved using a configurable quantum.
- **Priority:** the selected priority thread is given precedence in the simulated policy.

The displayed ready queue, thread states, and timeline help connect scheduling decisions to transaction outcomes.

### 5. CPU Scheduling

Compares conventional CPU scheduling algorithms with a process Gantt chart and per-process timing information.

- First Come, First Served (FCFS)
- Shortest Job First (SJF, non-preemptive)
- Round Robin

The output includes completion time, turnaround time, waiting time, response time, and averages where applicable.

## Technology Stack

- **Backend:** Python, Flask
- **Frontend:** HTML, CSS, JavaScript
- **Concurrency demonstrations:** Python threading and locks where used by the lab implementation
- **Testing:** pytest / Python `unittest` test cases
- **Deployment configuration:** Vercel Python function entry point (`api/index.py`) and `vercel.json`

## Project Structure

```text
PayXray/
├── api/
│   └── index.py
├── simulation/
│   ├── deadlock_lab.py
│   ├── event_log.py
│   ├── race_lab.py
│   ├── safe_lab.py
│   ├── scheduling_lab.py
│   ├── thread_scheduler_lab.py
│   └── transactions.py
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── templates/
│   └── index.html
├── tests/
│   ├── __init__.py
│   ├── test_race_lab.py
│   └── test_safe_lab.py
├── app.py
├── requirements.txt
├── vercel.json
└── .gitignore
```

## Run Locally

### Prerequisites

- Python 3.10 or newer is recommended.
- Git (optional, for cloning the repository).

### 1. Clone the repository

```bash
git clone https://github.com/kavyanshgoenka11-hub/PayXray.git
cd PayXray
```

### 2. Create and activate a virtual environment

**Windows PowerShell:**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, consult your local execution-policy settings or activate the environment using the method approved on your machine.

### 3. Install dependencies

```powershell
python -m pip install -r requirements.txt
```

### 4. Start the Flask application

```powershell
python app.py
```

Open the local address printed by Flask in your browser. If `app.py` is configured to use a different host or port, follow the address shown in the terminal.

## Run Tests

Install pytest in the active virtual environment if it is not already installed:

```powershell
python -m pip install pytest
```

Run the tests from the project root:

```powershell
python -m pytest -q
```

**Recorded test result during project preparation:** `7 passed`. Run the tests again after making code changes to verify your current version.

## How the Simulation Works

1. The user selects a lab and configures the scenario.
2. The Flask backend dispatches the request to the corresponding simulation module.
3. The simulation generates its result and event records.
4. The frontend displays the results using status indicators, event descriptions, thread states, and/or scheduling timelines.
5. For transaction labs, the balance and transaction outcomes make it possible to compare unsynchronized execution with lock-protected execution.

## Research Context

The project was developed alongside a review of the paper **“Efficient Detection of Concurrency Bugs Based on Equivalent Thread Interleaving Priorities.”** PayXray is an educational simulator for illustrating concurrency and interleaving behavior. It should **not** be described as a full implementation of that paper's research method: the current labs do not implement the paper's complete formal interleaving-equivalence analysis or its concurrency-bug testing prioritization technique.

## Limitations and Future Improvements

- The transaction and process scenarios are demonstrations, not connections to a real banking system or operating-system kernel.
- The automated test suite currently covers the race-condition and safe-synchronization labs; extend it with tests for deadlock recovery, thread scheduling, and CPU scheduling.
- Add more configurable workloads, repeatable scenario controls, and exportable event traces.
- Add an automated deployment health check and document the final public deployment URL after Vercel deployment succeeds.
- If the research contribution is expanded, implement and evaluate the research paper's specific analysis method separately rather than implying that a visual simulation reproduces it.

## License

No license has been specified yet. Until a license is added, do not assume that others have permission to reuse, modify, or redistribute the project code.

---

**Maintainer:** kavyanshgoenka11-hub  
**Repository:** https://github.com/kavyanshgoenka11-hub/PayXray
