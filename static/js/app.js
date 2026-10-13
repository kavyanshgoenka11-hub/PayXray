
const $ = (id) => document.getElementById(id);

const modes = {
    race_condition: {
        title: "Race Condition Lab",
        subtitle: "Observe how concurrent threads can overwrite shared data.",
        tag: "UNSAFE EXECUTION",
        defaults: { deposit: [100, 200], withdraw: [300, 200] },
        conceptTitle: "What is a race condition?",
        conceptDescription:
            "A race condition occurs when concurrent operations access shared state and an outcome depends on their execution order. Here, both threads calculate their updates from the same stale balance.",
        conceptLabel: "CONCURRENCY FUNDAMENTALS"
    },
    safe_synchronization: {
        title: "Safe Synchronization Lab",
        subtitle: "Observe mutual exclusion and safe balance updates.",
        tag: "MUTEX PROTECTED",
        defaults: { deposit: [100, 200], withdraw: [700, 500] },
        conceptTitle: "Why use a mutex?",
        conceptDescription:
            "A mutex allows only one thread at a time to execute the protected critical section. The balance check and update happen under the same lock, so the second transaction sees the updated balance.",
                conceptLabel: "MUTUAL EXCLUSION"
    },

    deadlock_lab: {
        title: "Deadlock Lab",
        subtitle: "Observe circular wait, deadlock detection, and recovery.",
        tag: "DEADLOCK DETECTED",
        defaults: {
            deposit: [100, 200],
            withdraw: [300, 200]
        },
        conceptTitle: "What is a deadlock?",
        conceptDescription:
            "A deadlock occurs when threads wait indefinitely for resources held by one another. Circular wait prevents either thread from proceeding.",
        conceptLabel: "DEADLOCK FUNDAMENTALS"
    }

        ,
        
    thread_scheduler: {
        title: "Thread Scheduler Lab",
        subtitle: "Observe how CPU turns and mutex protection affect transaction threads.",
        tag: "THREAD DISPATCH",
        defaults: {
            deposit: [100, 200],
            withdraw: [300, 200]
        },
        conceptTitle: "How does thread scheduling work?",
        conceptDescription:
            "A scheduler selects which runnable thread executes next. Observe how T1 and T2 interleave their transaction operations, and how mutex protection changes their execution.",
        conceptLabel: "THREAD SCHEDULING FUNDAMENTALS"
    }, 

    cpu_scheduling: {
        title: "CPU Scheduling Lab",
        subtitle: "Compare CPU scheduling algorithms and process performance.",
        tag: "CPU SCHEDULING",
        defaults: {
            deposit: [100, 200],
            withdraw: [300, 200]
        },
        conceptTitle: "How does CPU scheduling work?",
        conceptDescription:
            "CPU scheduling determines which ready process receives CPU time. Different algorithms produce different waiting, turnaround, and response times.",
        conceptLabel: "CPU SCHEDULING FUNDAMENTALS"
    }
};

const scenarioText = {
    race_condition: {
        deposit: "Both threads read the shared balance before either writes. Watch for a lost update.",
        withdraw: "Both threads read the same balance before either debits it. Watch for a lost withdrawal."
    },
        safe_synchronization: {
        deposit: "The read and deposit share one critical section. A competing deposit must wait for the mutex.",
        withdraw: "The balance check and withdrawal share one critical section. A competing withdrawal must wait for the mutex."
    },

    deadlock_lab: {
        deposit: "Observe how T1 and T2 hold different resources and wait for each other's resource.",
        withdraw: "Observe circular wait: T1 requests Resource B while T2 requests Resource A."
    }

        ,
        
    thread_scheduler: {
        deposit: "Observe how T1 and T2 interleave deposit operations under the selected scheduling policy.",
        withdraw: "Observe how T1 and T2 interleave withdrawals, and compare unsafe execution with mutex protection."
    },

    cpu_scheduling: {
        deposit: "Choose a scheduling algorithm and compare how processes receive CPU time.",
        withdraw: "Configure process arrival and CPU burst times, then observe the scheduling order and performance metrics."
    }
};

const stageOrder = ["request", "queue", "thread", "lock", "account", "result"];
const stagePosition = {
    request: 2,
    queue: 20,
    thread: 40,
    lock: 60,
    account: 80,
    result: 96
};

// Centre of each of the six stage blocks along the main rail (matches CSS .flow-stop)
const flowStopPosition = {
    request: 8.333,
    queue: 25,
    thread: 41.667,
    lock: 58.333,
    account: 75,
    result: 91.667
};

const eventLabels = {
    simulation_started: "Simulation started",
    request_created: "Transaction request created",
    balance_read: "Shared balance read",
    balance_calculated: "New balance calculated",
    balance_updated: "Shared balance updated",
    lock_requested: "Mutex requested",
    lock_waiting: "Thread waiting for mutex",
    lock_acquired: "Mutex acquired",
    lock_releasing: "Mutex being released",
    lock_released: "Mutex released",
    critical_section_entered: "Entered critical section",
    critical_section_exited: "Exited critical section",
    balance_checked: "Balance checked",
    transaction_accepted: "Transaction accepted",
    transaction_rejected: "Transaction rejected",
    worker_error: "Thread execution error",
    lock_wait_timeout: "Resource request timed out",
    deadlock_detected: "Deadlock detected",
    deadlock_recovery_started: "Recovery action started",
    thread_aborted: "Thread aborted for recovery",
    thread_completed: "Thread completed after recovery",  
    process_arrived: "Process arrived",
    process_started: "Process started on CPU",
    process_resumed: "Process resumed on CPU",
    quantum_expired: "Time quantum expired",
    process_requeued: "Process returned to ready queue",
    process_completed: "Process completed",
    cpu_idle: "CPU idle",
    thread_state_changed: "Thread state changed",
    transaction_thread_completed: "Transaction thread completed",
    simulation_completed: "Simulation completed"
};

let selectedMode = "race_condition";
let selectedOperation = "withdraw";   // default in both modes
let activeOperation = "withdraw";     // operation used by the replay on screen
let activeResult = null;
let events = [];
let currentIndex = -1;
let playbackTimer = null;
let playing = false;
let loading = false;
let visibleNodes = new Set();
let waitingThread = null;
let threadSchedulerReadyQueue = [];

function money(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return "₹" + new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0
    }).format(value);
}

function setBackendStatus(state, text) {
    const element = $("backend-status");
    element.classList.remove("online", "offline");

    if (state === "online") element.classList.add("online");
    if (state === "offline") element.classList.add("offline");

    element.querySelector("span:last-child").textContent = text;
}

async function checkBackend() {
    try {
        const response = await fetch("/api/health");
        if (!response.ok) throw new Error("Health check failed");

        const data = await response.json();
        setBackendStatus("online", data.status === "healthy"
            ? "Backend connected"
            : "Backend responding");
    } catch {
        setBackendStatus("offline", "Backend unavailable");
    }
}

function setThreadState(thread, text, kind = "") {
    const state = $("state-" + thread.toLowerCase());
    if (!state) return;

    state.textContent = text;
    state.className = "state-chip" + (kind ? " " + kind : "");
}

function setConcept(title, description, label) {
    $("concept-title").textContent = title;
    $("concept-description").textContent = description;
    $("concept-label").textContent = label;
}


function setIntegrityState(status, tone, description, rule) {
    const panel = $("integrity-state");

    panel.classList.remove("is-good", "is-warning", "is-bad");

    if (tone) {
        panel.classList.add(tone);
    }

    $("integrity-status").textContent = status;
    $("integrity-description").textContent = description;
    $("integrity-rule").textContent = rule;
}


function updateIntegrityMonitor(event) {
    // Deadlock has no account balance invariant.
    if (selectedMode === "deadlock_lab") {
        const detected = event.deadlock_detected === true;
        const recovered = event.deadlock_recovered === true;
        const victim = event.victim_thread || "unknown";
        const survivor = event.survivor_thread || "unknown";
        const cycle = Array.isArray(event.cycle)
            ? event.cycle.join(" → ")
            : "T1 → T2 → T1";

        if (detected && recovered) {
            setIntegrityState(
                "Deadlock detected and recovered",
                "is-good",
                `Circular wait ${cycle} was detected. ${victim} was selected as the recovery victim, released its resource, and ${survivor} was allowed to continue.`,
                "Every detected resource cycle must be broken; the victim's locks must be released and a surviving thread must complete."
            );
        } else if (detected) {
            setIntegrityState(
                "Deadlock detected — recovery incomplete",
                "is-warning",
                `Circular wait ${cycle} was detected, but successful recovery was not confirmed.`,
                "A detected deadlock must be recovered from before the surviving thread can complete."
            );
        } else {
            setIntegrityState(
                "Deadlock not confirmed",
                "is-bad",
                "The backend did not confirm the expected circular wait and recovery.",
                "The simulation must detect a circular wait, release the selected victim's resources, and allow the survivor to complete."
            );
        }

        return;
    }

    const expected = event.expected_balance;

    
    // Thread Scheduler validates the transaction result against
    // the serial reference produced by the backend.
    if (selectedMode === "thread_scheduler") {
        const observed = event.observed_balance;

        const validBalances =
            typeof expected === "number" &&
            Number.isFinite(expected) &&
            typeof observed === "number" &&
            Number.isFinite(observed);

        const invariantHolds =
            event.balance_invariant_holds === true &&
            validBalances &&
            expected === observed;

        const lostUpdate = event.lost_update_detected === true;
        const mutexEnabled = event.mutex_enabled === true;

        const balanceDetails =
            `Expected balance: ${money(expected)}. ` +
            `Observed balance: ${money(observed)}. ` +
            `${event.successful_count ?? 0} transaction(s) accepted and ` +
            `${event.rejected_count ?? 0} rejected.`;

        const rule = mutexEnabled
            ? "The mutex must protect the complete READ, CALCULATE, and WRITE sequence."
            : "Compare the observed balance with the serial transaction reference to detect a lost update.";

        if (lostUpdate) {
            setIntegrityState(
                "Lost update detected",
                "is-warning",
                `${balanceDetails} Both threads produced an update from shared state that was not protected by the mutex.`,
                rule
            );
        } else if (invariantHolds && mutexEnabled) {
            setIntegrityState(
                "Mutex protection validated",
                "is-good",
                `${balanceDetails} The observed balance matches the serial reference with mutex protection enabled.`,
                rule
            );
        } else if (invariantHolds) {
            setIntegrityState(
                "No lost update observed",
                "is-good",
                `${balanceDetails} The observed balance matches the serial reference in this execution.`,
                rule
            );
        } else {
            setIntegrityState(
                "Balance invariant failed",
                "is-bad",
                `${balanceDetails} The observed result does not match the backend's serial reference.`,
                rule
            );
        }

        return;
    }

    
    // CPU Scheduling uses process-timing rules, not account balances.
    if (selectedMode === "cpu_scheduling") {
        const processes = Array.isArray(activeResult?.processes)
            ? activeResult.processes
            : [];

        const completedCount = Number(event.completed_count);

        const averageWaiting = Number(event.average_waiting_time);
        const averageTurnaround = Number(event.average_turnaround_time);
        const averageResponse = Number(event.average_response_time);

        const metricsValid = [
            averageWaiting,
            averageTurnaround,
            averageResponse
        ].every(value => Number.isFinite(value) && value >= 0);

        const processDetailsValid = processes.length > 0 &&
            processes.every(process => {
                const arrival = Number(
                    process.arrival_time ?? process.arrival
                );
                const burst = Number(
                    process.burst_time ?? process.burst
                );
                const completion = Number(
                    process.completion_time ?? process.completion
                );
                const waiting = Number(
                    process.waiting_time ?? process.waiting
                );
                const turnaround = Number(
                    process.turnaround_time ?? process.turnaround
                );

                const values = [
                    arrival,
                    burst,
                    completion,
                    waiting,
                    turnaround
                ];

                if (!values.every(Number.isFinite)) {
                    return false;
                }

                const tolerance = 0.000001;

                return (
                    arrival >= 0 &&
                    burst > 0 &&
                    completion >= arrival &&
                    waiting >= 0 &&
                    turnaround >= 0 &&
                    Math.abs(turnaround - (completion - arrival)) < tolerance &&
                    Math.abs(waiting - (turnaround - burst)) < tolerance
                );
            });

        const allProcessesCompleted =
            processes.length > 0 &&
            Number.isFinite(completedCount) &&
            completedCount === processes.length;

        if (
            allProcessesCompleted &&
            metricsValid &&
            processDetailsValid
        ) {
            setIntegrityState(
                "Scheduling results validated",
                "is-good",
                `${completedCount} process(es) completed. Average waiting time: ${averageWaiting.toFixed(2)}, turnaround time: ${averageTurnaround.toFixed(2)}, and response time: ${averageResponse.toFixed(2)} time units.`,
                "Turnaround time = Completion time − Arrival time. Waiting time = Turnaround time − CPU burst time. Every process must complete, and all reported averages must be finite and non-negative."
            );
        } else {
            setIntegrityState(
                "Scheduling validation failed",
                "is-bad",
                `Completed processes reported: ${Number.isFinite(completedCount) ? completedCount : "unknown"} of ${processes.length}. Check the process results and average scheduling metrics.`,
                "Every submitted process must complete. Turnaround time must equal completion time minus arrival time, and waiting time must equal turnaround time minus CPU burst time."
            );
        }

        return;
    }


    const observed = event.observed_balance;

    if (selectedMode === "race_condition") {
        const lostUpdate =
            Boolean(event.lost_update_detected) ||
            (
                typeof expected === "number" &&
                typeof observed === "number" &&
                expected !== observed
            );

        const formula = activeOperation === "withdraw"
            ? "Initial balance - T1 amount - T2 amount"
            : "Initial balance + T1 amount + T2 amount";

        if (lostUpdate) {
            setIntegrityState(
                "Lost update detected",
                "is-warning",
                `Expected final balance: ${money(expected)}. Observed balance: ${money(observed)}. The last write overwrote an update calculated from a stale balance.`,
                formula
            );
        } else {
            setIntegrityState(
                "No lost update observed",
                "is-good",
                `Expected balance: ${money(expected)}. Observed balance: ${money(observed)}. The results match in this run.`,
                formula
            );
        }

        return;
    }

    const invariantHolds =
        event.balance_invariant_holds === true &&
        typeof expected === "number" &&
        typeof observed === "number" &&
        expected === observed;

    const rule = activeOperation === "withdraw"
        ? "Initial balance − total accepted withdrawals"
        : "Initial balance + total accepted deposits";

    if (invariantHolds) {
        setIntegrityState(
            "Balance invariant preserved",
            "is-good",
            `Expected balance: ${money(expected)}. Observed balance: ${money(observed)}. ${event.successful_count} transaction(s) accepted and ${event.rejected_count} rejected.`,
            rule
        );
    } else {
        setIntegrityState(
            "Invariant violation detected",
            "is-bad",
            `Expected balance: ${money(expected)}. Observed balance: ${money(observed)}. The final balance does not satisfy the reported invariant.`,
            rule
        );
    }
}




function applyOperationUI(resetInputs) {
    const label = selectedOperation === "deposit" ? "deposit" : "withdrawal";
    $("amount-1-label").textContent = `T1 ${label} (₹)`;
    $("amount-2-label").textContent = `T2 ${label} (₹)`;
    $("scenario-description").textContent =
        scenarioText[selectedMode][selectedOperation];

    document.querySelectorAll("[data-operation]").forEach((button) => {
        const on = button.dataset.operation === selectedOperation;
        button.classList.toggle("active", on);
        button.setAttribute("aria-pressed", String(on));
    });

    if (resetInputs) {
        const [a1, a2] = modes[selectedMode].defaults[selectedOperation];
        $("amount-1").value = a1;
        $("amount-2").value = a2;
    }
}


function setElementVisibility(element, visible) {
    if (!element) return;

    element.hidden = !visible;
    element.style.display = visible ? "" : "none";
}


function updateThreadSchedulerControls() {
    const algorithm = $("thread-algorithm-select")?.value;

    setElementVisibility(
        $("thread-quantum-config"),
        algorithm === "round_robin"
    );

    setElementVisibility(
        $("thread-priority-config"),
        algorithm === "priority"
    );
}


function updateLabView(mode) {
    const isThreadScheduler = mode === "thread_scheduler";
    const isScheduling = mode === "cpu_scheduling";

    // Switch between the existing transaction workspace and the Gantt view.
    setElementVisibility(
    $("scheduling-workspace"),
    isScheduling
);

setElementVisibility(
    $("thread-scheduler-workspace"),
    isThreadScheduler
);

setElementVisibility(
    $("transaction-workspace"),
    !isScheduling && !isThreadScheduler
);

    // Show scheduling controls only in CPU Scheduling Lab.
    setElementVisibility(
        $("scheduling-config"),
        isScheduling
    );

    setElementVisibility(
    $("thread-scheduler-config"),
    isThreadScheduler
);

    
    // Disable scheduling fields outside CPU Scheduling Lab.
    const schedulingConfig = $("scheduling-config");

    if (schedulingConfig) {
        schedulingConfig
            .querySelectorAll("input, select, textarea")
            .forEach((input) => {
                input.disabled = !isScheduling;
            });
    }


    // Hide financial transaction inputs while configuring a schedule.
    const transactionInputIds = [
        "initial-balance",
        "amount-1",
        "amount-2"
    ];

    transactionInputIds.forEach((id) => {
        const input = $(id);
        if (!input) return;

        setElementVisibility(input, !isScheduling);
        input.disabled = isScheduling;
    });

    // Hide the labels associated with those inputs.
    [
        'label[for="initial-balance"]',
        'label[for="amount-1"]',
        'label[for="amount-2"]'
    ].forEach((selector) => {
        setElementVisibility(
            document.querySelector(selector),
            !isScheduling
        );
    });

    // Hide the transaction operation toggle and its heading.
    const operationButton = document.querySelector("[data-operation]");
    const operationGroup = operationButton
        ? operationButton.closest('[role="group"]') ||
          operationButton.parentElement
        : null;

    setElementVisibility(operationGroup, !isScheduling);

    if (operationGroup?.previousElementSibling?.classList.contains("eyebrow")) {
        setElementVisibility(
            operationGroup.previousElementSibling,
            !isScheduling
        );
    }

    // Hide the transaction-specific scenario note.
    setElementVisibility(
        document.querySelector(".scenario-note"),
        !isScheduling
    );

    // Update the workspace explanation and submit button.
    $("workspace-description").textContent = isScheduling
    ? "Observe how the selected CPU scheduling algorithm allocates CPU time to arriving processes."
    : isThreadScheduler
        ? "Observe how T1 and T2 receive CPU turns, perform transaction operations, and interact with mutex protection."
        : mode === "deadlock_lab"
            ? "Watch the backend event trace to follow resource acquisition, circular wait, deadlock detection, and recovery."
            : "Watch the transaction packet move through the system stages. The highlighted block follows the Python backend's recorded execution events.";

    $("submit-btn").textContent = isScheduling
    ? "Run scheduling"
    : isThreadScheduler
        ? "Run thread scheduler"
        : "Run experiment";

    // The time quantum applies only to Round Robin.
    const algorithmSelect = $("algorithm-select");
    if (algorithmSelect) {
        setElementVisibility(
            $("quantum-config"),
            isScheduling && algorithmSelect.value === "round_robin"
        );
    }
    updateThreadSchedulerControls();
}



function updateMode(mode, resetInputs = true) {
    if (!modes[mode]) return;

    stopPlayback();
    selectedMode = mode;
    activeResult = null;
    events = [];
    currentIndex = -1;

    const config = modes[mode];

    selectedOperation = "withdraw";   // default whenever the lab changes
    if (resetInputs) $("initial-balance").value = 1000;
    applyOperationUI(resetInputs);

    $("page-title").textContent = config.title;
    $("page-subtitle").textContent = config.subtitle;
    $("mode-tag").textContent = config.tag;
    updateLabView(mode);


    document.querySelectorAll("[data-mode]").forEach((button) => {
        const selected = button.dataset.mode === mode;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

    setConcept(config.conceptTitle, config.conceptDescription, config.conceptLabel);
    $("error-message").hidden = true;

    resetVisualState(Number($("initial-balance").value) || 0);
    updateControls();
}

function resetVisualState(initialBalance) {
    currentIndex = -1;
    visibleNodes = new Set();
    waitingThread = null;

    $("current-balance").textContent = money(initialBalance);
    $("account-balance").textContent = money(initialBalance);
    $("expected-balance").textContent = "—";
    $("step-counter").textContent = `0 / ${events.length}`;
    $("outcome-status").textContent = "READY";
    $("outcome-note").textContent = "No result recorded";
    setIntegrityState(
    events.length ? "Validation pending" : "Awaiting experiment",
    "",
    events.length
        ? "The monitor will validate the final balance when the execution trace completes."
        : "Run an experiment to check whether the observed balance matches the expected transaction outcome.",
    "The final balance must reflect the initial balance and all accepted operations."
);
    $("playback-title").textContent = "Ready to run";
    $("current-event").textContent =
        "Start an experiment to inspect its backend-generated events.";
    $("progress-fill").style.width = "0%";
    $("event-count").textContent = `${events.length} EVENTS`;
    $("event-list").replaceChildren();

    if (events.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";

        const icon = document.createElement("span");
        icon.className = "empty-icon";
        icon.textContent = "⌁";

        const heading = document.createElement("strong");
        heading.textContent = "No execution trace yet";

        const message = document.createElement("p");
        message.textContent = "Run an experiment to populate the timeline.";

        empty.append(icon, heading, message);
        $("event-list").appendChild(empty);
    }

    ["t1", "t2"].forEach((thread) => {
        setThreadState(thread, "Idle");
        $("packet-" + thread).classList.remove("is-visible");
        $("packet-" + thread).style.left = "2%";
        $("readout-" + thread).textContent = thread.toUpperCase() + " read: —";
    });

        const flowPacket = $("flow-packet");
    flowPacket.classList.remove("is-visible", "is-waiting", "is-error");
    flowPacket.style.left = "8.333%";
    $("flow-packet-label").textContent = "TX";
    $("flow-hint").textContent = "Run an experiment to start packet travel.";

    document.querySelectorAll(".flow-node").forEach((node) => {
        node.classList.remove("is-active", "is-complete");
    });

    $("lock-indicator").classList.remove("occupied");
    $("lock-state").textContent = "Available";
    $("lock-owner").textContent = "No current owner";
    $("waiting-queue").textContent = "No waiting thread";
    $("waiting-queue").classList.remove("waiting");

    updateControls();
}

function updateControls() {
    $("run-btn").disabled = loading;
    $("submit-btn").disabled = loading;
    $("pause-btn").disabled = !playing || loading;
    $("resume-btn").disabled =
        playing || loading || events.length === 0 || currentIndex >= events.length - 1;
    $("restart-btn").disabled = loading || events.length === 0;
    $("step-btn").disabled = loading || events.length === 0 ||
        currentIndex >= events.length - 1;
}

function stopPlayback() {
    playing = false;
    if (playbackTimer !== null) {
        clearTimeout(playbackTimer);
        playbackTimer = null;
    }
    updateControls();
}

function stageForEvent(event) {
    const type = event.type;

    if (type === "simulation_started") return "request";
    if (type === "request_created") return "queue";

    if ([
        "balance_read",
        "balance_calculated"
    ].includes(type)) return "thread";

    if ([
        "lock_requested",
        "lock_waiting",
        "lock_acquired",
        "lock_releasing",
        "lock_released"
    ].includes(type)) return "lock";

    if ([
        "balance_checked",
        "balance_updated",
        "critical_section_entered",
        "critical_section_exited"
    ].includes(type)) return "account";

    if ([
        "transaction_accepted",
        "transaction_rejected",
        "worker_error",
        "simulation_completed"
    ].includes(type)) return "result";

    return "thread";
}

function updateFlow(stage) {
    const stageIndex = stageOrder.indexOf(stage);
    visibleNodes.add(stage);

    document.querySelectorAll(".flow-node").forEach((node) => {
        const nodeIndex = stageOrder.indexOf(node.dataset.stage);
        node.classList.toggle("is-active", node.dataset.stage === stage);
        node.classList.toggle(
            "is-complete",
            nodeIndex < stageIndex || visibleNodes.has(node.dataset.stage) &&
                node.dataset.stage !== stage
        );
    });
}

function threadLabel(event) {
    const labels = {
        request_created: "Request queued",
        balance_read: "Read shared balance",
        balance_calculated: "Calculated update",
        lock_requested: "Requesting mutex",
        lock_waiting: "Waiting for mutex",
        lock_acquired: "Inside protected section",
        balance_checked: "Checked available balance",
        balance_updated: "Updated shared balance",
        transaction_accepted: "Transaction accepted",
        transaction_rejected: "Rejected: insufficient funds",
        critical_section_entered: "Entered critical section",
        critical_section_exited: "Exited critical section",
        lock_releasing: "Releasing mutex",
        lock_released: "Mutex released",
        worker_error: "Execution error"
    };

    return labels[event.type] || eventLabels[event.type] || event.type;
}

function updateThreadPacket(event, stage) {
    if (!event.thread || !["T1", "T2"].includes(event.thread)) return;

    const thread = event.thread.toLowerCase();
    const packet = $("packet-" + thread);
    packet.classList.add("is-visible");

    if (event.type === "request_created") {
        const amount = event.amount;
        $("packet-label-" + thread).textContent =
            `${event.request_id || event.thread}${amount ? " · ₹" + amount : ""}`;
    }

    const progress = stagePosition[stage] ?? 40;
    packet.style.left = `${progress}%`;

    let kind = "active";

    if (event.type === "lock_waiting") kind = "waiting";
    if (event.type === "transaction_accepted") kind = "success";
    if (event.type === "transaction_rejected" || event.type === "worker_error") {
        kind = "danger";
    }

    setThreadState(thread, threadLabel(event), kind);
}

function updateFlowPacket(event, stage) {
    const packet = $("flow-packet");
    const who = event.thread || "SYSTEM";

    packet.classList.add("is-visible");
    packet.classList.toggle("is-waiting", event.type === "lock_waiting");
    packet.classList.toggle(
        "is-error",
        event.type === "transaction_rejected" || event.type === "worker_error"
    );
    packet.style.left = `${flowStopPosition[stage] ?? 8.333}%`;

    $("flow-packet-label").textContent = who;
    $("flow-hint").textContent =
        `${who} · ${eventLabels[event.type] || event.type}`;
}

function updateLock(event) {
    const type = event.type;

    if (type === "lock_acquired") {
        $("lock-indicator").classList.add("occupied");
        $("lock-state").textContent = "Occupied";
        $("lock-owner").textContent = `Held by ${event.thread}`;
        if (waitingThread === event.thread) waitingThread = null;
    }

    if (type === "lock_waiting") {
        waitingThread = event.thread;
        $("waiting-queue").textContent =
            `${event.thread} waiting for account_lock`;
        $("waiting-queue").classList.add("waiting");
    }

    if (type === "lock_releasing") {
        $("lock-state").textContent = "Releasing…";
    }

    if (type === "lock_released") {
        $("lock-indicator").classList.remove("occupied");
        $("lock-state").textContent = "Available";
        $("lock-owner").textContent = "No current owner";

        if (waitingThread) {
            $("waiting-queue").textContent =
                `${waitingThread} waiting for account_lock`;
            $("waiting-queue").classList.add("waiting");
        } else {
            $("waiting-queue").textContent = "No waiting thread";
            $("waiting-queue").classList.remove("waiting");
        }
    }
}


function eventSummary(event) {
    const processId =
        event.process_id ?? event.pid ?? event.process ?? "Process";

    const eventTime =
        event.sim_time ?? event.time ?? event.start_time;

    const timeText = (value) =>
        value !== undefined && value !== null && value !== ""
            ? Number(value).toString()
            : "unknown";

    const metricText = (value) => {
        const number = Number(value);
        return Number.isFinite(number) ? number.toFixed(2) : "—";
    };

    switch (event.type) {
        
        case "simulation_started":
            if (selectedMode === "thread_scheduler") {
    return `Thread Scheduler started using ${
        String(event.algorithm || "round_robin").toUpperCase()
    }. Mutex protection: ${
        event.mutex_enabled ? "enabled" : "disabled"
    }. Initial balance: ${money(event.initial_balance)}.`;
}
            if (selectedMode === "cpu_scheduling") {
                const algorithm =
                    event.algorithm || $("algorithm-select")?.value || "selected algorithm";
                const count =
                    event.process_count ??
                    event.total_processes ??
                    activeResult?.processes?.length ??
                    "configured";

                return `CPU scheduling started using ${String(algorithm).toUpperCase()} with ${count} process(es).`;
            }

            return `Simulation starts with ${money(event.initial_balance)}. First thread selected: ${event.first_thread || "not reported"}.`;

        case "process_arrived":
            return `${processId} arrived at time ${timeText(event.arrival_time ?? eventTime)}. CPU burst: ${timeText(event.burst_time ?? event.burst)} time units.`;

        case "process_started":
            return `${processId} received the CPU at time ${timeText(eventTime)}.`;

        case "process_resumed":
            return `${processId} resumed CPU execution at time ${timeText(eventTime)}. Remaining burst: ${timeText(event.remaining_time)} time units.`;

        case "quantum_expired":
            return `${processId}'s time quantum expired at time ${timeText(eventTime)}. Remaining burst: ${timeText(event.remaining_time)} time units.`;

        case "process_requeued":
            return `${processId} was returned to the ready queue${event.remaining_time !== undefined ? ` with ${event.remaining_time} time units remaining` : ""}.`;

        case "process_completed":
            return `${processId} completed${event.completion_time !== undefined ? ` at time ${event.completion_time}` : ""}. Waiting: ${timeText(event.waiting_time)} · Turnaround: ${timeText(event.turnaround_time)} · Response: ${timeText(event.response_time)}.`;

        case "cpu_idle":
            return `CPU idle from time ${timeText(event.start_time ?? eventTime)} to ${timeText(event.end_time)}. No process was executing.`;

        case "request_created":
            return `${event.operation || "Transaction"} · ${money(event.amount)} · ${event.request_id}`;

        case "balance_read":
            return `${event.thread} read ${money(event.balance)}.`;

        case "balance_calculated": {
            const operation = String(
                event.operation || activeOperation || "withdraw"
            ).toLowerCase();

            const isWithdrawal =
                operation === "withdraw" || operation === "withdrawal";

            const operator = isWithdrawal ? "-" : "+";

            return `${money(event.previous_balance)} ${operator} ${money(event.amount)} = ${money(event.calculated_balance)}.`;
        }

        case "balance_checked":
            return activeOperation === "withdraw"
                ? `Available: ${money(event.balance)} · Requested: ${money(event.withdrawal)}.`
                : `Current balance: ${money(event.balance)} · Depositing: ${money(event.amount)}.`;

        case "balance_updated":
            return `Stored balance: ${money(event.written_balance ?? event.updated_balance)}.`;

        case "lock_waiting":
            return `${event.thread} is waiting for a mutex held by ${event.waiting_for}.`;

        case "lock_acquired":
            return `${event.thread} acquired the mutex. Measured wait: ${event.wait_duration_ms ?? 0} ms.`;

        case "transaction_accepted":
            return `${money(event.amount)} accepted.`;

        case "transaction_rejected":
            return `${money(event.amount)} rejected: insufficient funds.`;

        case "simulation_completed":
            if (selectedMode === "thread_scheduler") {
    return `Thread scheduling completed. Expected balance: ${
        money(event.expected_balance)
    } · Observed balance: ${
        money(event.observed_balance)
    } · Lost update: ${
        event.lost_update_detected ? "detected" : "not detected"
    }.`;
}
            if (selectedMode === "cpu_scheduling") {
                const completed =
                    event.completed_count ??
                    activeResult?.processes?.length ??
                    "unknown";

                const waiting =
                    event.average_waiting_time ?? event.avg_waiting_time;

                const turnaround =
                    event.average_turnaround_time ?? event.avg_turnaround_time;

                const response =
                    event.average_response_time ?? event.avg_response_time;

                return `CPU scheduling completed. Processes completed: ${completed}. Average waiting: ${metricText(waiting)} · Average turnaround: ${metricText(turnaround)} · Average response: ${metricText(response)} time units.`;
            }

            if (selectedMode === "deadlock_lab") {
                const cycle = Array.isArray(event.cycle)
                    ? event.cycle.join(" → ")
                    : "Not reported";

                const recovery = event.deadlock_recovered
                    ? "Successful"
                    : "Not confirmed";

                return `Deadlock detected: ${event.deadlock_detected ? "Yes" : "No"} · Recovery: ${recovery} · Cycle: ${cycle} · Victim: ${event.victim_thread || "Not reported"} · Survivor: ${event.survivor_thread || "Not reported"}.`;
            }

            return `Expected: ${money(event.expected_balance)} · Observed: ${money(event.observed_balance)}.`;

        case "worker_error":
            return event.message || "A thread reported an error.";

        default:
            return event.resource
                ? `Resource: ${event.resource}.`
                : "Recorded by the simulation engine.";
    }
}


function renderEvent(event, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "event-row";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `Replay from event ${event.seq}`);

    const seq = document.createElement("span");
    seq.className = "event-seq";
    seq.textContent = "#" + event.seq;

    const description = document.createElement("span");

    const heading = document.createElement("span");
    heading.className = "event-title";
    heading.textContent = eventLabels[event.type] || event.type;

    const detail = document.createElement("span");
    detail.className = "event-detail";
    detail.textContent = eventSummary(event);

    description.append(heading, detail);

    const meta = document.createElement("span");
    meta.className = "event-meta";
    meta.textContent = event.thread || "SYSTEM";

    const time = document.createElement("em");
    time.textContent = `${event.time_ms} ms`;
    meta.appendChild(time);

    button.append(seq, description, meta);

    button.addEventListener("click", () => {
        jumpToEvent(index);
    });

    const eventList = $("event-list");
    eventList.appendChild(button);
    eventList.scrollTop = eventList.scrollHeight;
}


function highlightSchedulingSegment(event) {
    const chart = $("gantt-chart");
    if (!chart) return;

    const segments = chart.querySelectorAll(".gantt-segment");

    segments.forEach((segment) => {
        segment.style.outline = "";
        segment.style.outlineOffset = "";
        segment.style.filter = "";
    });

    if (selectedMode !== "cpu_scheduling") return;

    if (!["process_started", "process_resumed"].includes(event.type)) {
        return;
    }

    const processId = String(
        event.process_id ?? event.pid ?? event.process ?? ""
    );

    const time = Number(
        event.sim_time ?? event.time ?? event.start_time
    );

    if (!processId || !Number.isFinite(time)) return;

    const activeSegment = Array.from(segments).find((segment) => {
        const start = Number(segment.dataset.startTime);
        const end = Number(segment.dataset.endTime);

        return (
            segment.dataset.processId === processId &&
            time >= start &&
            time < end
        );
    });

    if (activeSegment) {
        activeSegment.style.outline = "3px solid #236b50";
        activeSegment.style.outlineOffset = "-3px";
        activeSegment.style.filter = "brightness(1.12)";
    }
}


function updateThreadSchedulerView(event) {
    if (selectedMode !== "thread_scheduler") return;

    const thread = event.thread ?? event.process_id;

    if (
        event.type === "thread_state_changed" &&
        ["T1", "T2"].includes(thread)
    ) {
        const state = String(event.state || "READY").toUpperCase();
        const key = thread.toLowerCase();

        const stateElement = $(`thread-state-${key}`);
        const detailElement = $(`thread-detail-${key}`);

        if (stateElement) {
            stateElement.textContent = state;
            stateElement.dataset.state = state.toLowerCase();
        }

        if (detailElement && event.reason) {
            detailElement.textContent = event.reason;
        }

        // A READY thread joins the queue; all other states remove it.
        if (state === "READY") {
            if (!threadSchedulerReadyQueue.includes(thread)) {
                threadSchedulerReadyQueue.push(thread);
            }
        } else {
            threadSchedulerReadyQueue =
                threadSchedulerReadyQueue.filter(id => id !== thread);
        }

        $("thread-ready-queue").textContent =
            threadSchedulerReadyQueue.length
                ? threadSchedulerReadyQueue.join(" → ")
                : "No threads waiting for CPU";

        return;
    }

    if (!["T1", "T2"].includes(thread)) return;

    const detail = $(`thread-detail-${thread.toLowerCase()}`);
    if (!detail) return;

    switch (event.type) {
        case "balance_read":
            detail.textContent =
                `READ · Read shared balance ${money(event.balance)}`;
            break;

        case "balance_checked":
            detail.textContent =
                `CHECK · Available ${money(event.balance)}, requested ${money(event.amount)}`;
            break;

        case "balance_calculated": {
            const operator = event.operation === "deposit" ? "+" : "−";
            detail.textContent =
                `CALCULATE · ${money(event.previous_balance)} ${operator} ${money(event.amount)} = ${money(event.calculated_balance)}`;
            break;
        }

        case "balance_updated":
            detail.textContent =
                `WRITE · Stored balance ${money(event.written_balance ?? event.updated_balance)}`;
            break;

        case "lock_requested":
            detail.textContent = "Requesting account mutex";
            break;

        case "lock_acquired":
            detail.textContent = "Mutex acquired · Critical section protected";
            break;

        case "lock_waiting":
            detail.textContent =
                `BLOCKED · Waiting for ${event.waiting_for || "the mutex"}`;
            break;

        case "lock_released":
            detail.textContent = "Mutex released";
            break;

        case "quantum_expired":
            detail.textContent =
                `Time quantum expired · ${event.remaining_time} operation(s) remain`;
            break;

        case "transaction_accepted":
            detail.textContent =
                `${event.operation === "deposit" ? "Deposit" : "Withdrawal"} of ${money(event.amount)} accepted`;
            break;

        case "transaction_rejected":
            detail.textContent =
                `Transaction rejected · Available balance ${money(event.available_balance)}`;
            break;

        case "transaction_thread_completed":
            detail.textContent = event.accepted
                ? "Transaction completed successfully"
                : "Transaction completed with rejection";
            break;
    }
}


function applyEvent(event, index) {
    currentIndex = index;

highlightSchedulingSegment(event);
updateThreadSchedulerView(event);

    const stage = stageForEvent(event);
    updateFlow(stage);
    updateThreadPacket(event, stage);
    updateFlowPacket(event, stage);
    updateLock(event);

    if (event.type === "balance_read") {
        $("readout-" + event.thread.toLowerCase()).textContent =
            `${event.thread} read: ${money(event.balance)}`;
    }

    if (event.type === "balance_updated") {
        const updated = event.written_balance ?? event.updated_balance;
        if (typeof updated === "number") {
            $("current-balance").textContent = money(updated);
            $("account-balance").textContent = money(updated);
        }
    }

    if (event.type === "transaction_accepted") {
        setConcept(
            "Transaction accepted",
            `${event.thread} successfully ${activeOperation === "withdraw" ? "withdrew" : "deposited"} ${money(event.amount)} ${activeOperation === "withdraw" ? "from" : "into"} the shared account.`,
            "VALIDATED OPERATION"
        );
    }

    if (event.type === "transaction_rejected") {
        setConcept(
            "Insufficient funds",
            `${event.thread} requested ${money(event.amount)}, but only ${money(event.available_balance)} remained. The account was not debited.`,
            "SAFE REJECTION"
        );
    }

    if (event.type === "lock_waiting") {
        setConcept(
            "Thread waiting",
            `${event.thread} tried to acquire the mutex while ${event.waiting_for} held it. The thread cannot enter the protected section until it acquires the lock.`,
            "MUTUAL EXCLUSION"
        );
    }

    if (event.type === "balance_read" && selectedMode === "race_condition") {
        setConcept(
            "Shared data was read",
            `${event.thread} read ${money(event.balance)}. Inspect both reads: when two threads calculate from the same old value, a later write can overwrite an update.`,
            "RACE CONDITION LAB"
        );
    }

    

    if (event.type === "simulation_completed") {
        if (selectedMode === "thread_scheduler") {
            $("expected-balance").textContent =
                money(event.expected_balance);

            if (typeof event.observed_balance === "number") {
                $("current-balance").textContent =
                    money(event.observed_balance);
                $("account-balance").textContent =
                    money(event.observed_balance);
            }

            $("thread-expected-balance").textContent =
                money(event.expected_balance);
            $("thread-observed-balance").textContent =
                money(event.observed_balance);

            updateIntegrityMonitor(event);

            const lostUpdate = event.lost_update_detected === true;
            const mutexEnabled = event.mutex_enabled === true;

            $("outcome-status").textContent = lostUpdate
                ? "LOST UPDATE"
                : mutexEnabled
                    ? "MUTEX VALIDATED"
                    : "NO LOST UPDATE";

            $("outcome-note").textContent = lostUpdate
                ? "Observed balance differs from expected"
                : mutexEnabled
                    ? `${event.successful_count ?? 0} accepted · ${event.rejected_count ?? 0} rejected`
                    : "No lost update in this execution";

            setConcept(
                lostUpdate
                    ? "Lost update reproduced"
                    : mutexEnabled
                        ? "Mutex protection validated"
                        : "No lost update observed",
                `Expected balance: ${money(event.expected_balance)}. Observed balance: ${money(event.observed_balance)}. ${
                    lostUpdate
                        ? "A thread overwrote an update calculated from stale shared data."
                        : mutexEnabled
                            ? "The transactions completed with the mutex protecting the shared account."
                            : "The observed balance matches the serial transaction reference for this execution."
                }`,
                "THREAD SCHEDULER RESULT"
            );

        } else if (selectedMode === "cpu_scheduling") {
            updateIntegrityMonitor(event);

            const processCount = activeResult?.processes?.length ?? 0;
            const algorithm =
                $("algorithm-select")?.value || "CPU scheduling";

            $("outcome-status").textContent = "SCHEDULE COMPLETE";
            $("outcome-note").textContent =
                `${processCount} process(es) scheduled`;

            setConcept(
                "CPU scheduling completed",
                `The ${algorithm.toUpperCase()} schedule finished. Review the Gantt chart and timing metrics to compare process performance.`,
                "CPU SCHEDULING RESULT"
            );

        } else {
            // Existing banking and deadlock result handling.
            $("expected-balance").textContent =
                money(event.expected_balance);

            if (typeof event.observed_balance === "number") {
                $("current-balance").textContent =
                    money(event.observed_balance);
                $("account-balance").textContent =
                    money(event.observed_balance);
            }

            updateIntegrityMonitor(event);

            if (selectedMode === "race_condition") {
                const detected = Boolean(event.lost_update_detected);

                $("outcome-status").textContent =
                    detected ? "LOST UPDATE" : "NO LOST UPDATE";

                $("outcome-note").textContent = detected
                    ? "Observed result differs from expected"
                    : "Check the experiment trace";

                setConcept(
                    detected
                        ? "Lost update reproduced"
                        : "No lost update observed",
                    `Expected balance: ${money(event.expected_balance)}. Observed balance: ${money(event.observed_balance)}. ${
                        detected
                            ? "The final write overwrote an update calculated from the same stale starting balance."
                            : "This run did not demonstrate a lost update."
                    }`,
                    "RACE CONDITION RESULT"
                );

            } else if (selectedMode === "deadlock_lab") {
                const detected = event.deadlock_detected === true;
                const recovered = event.deadlock_recovered === true;

                $("outcome-status").textContent = recovered
                    ? "DEADLOCK RECOVERED"
                    : detected
                        ? "DEADLOCK DETECTED"
                        : "VALIDATION FAILED";

                $("outcome-note").textContent = recovered
                    ? `${event.victim_thread} aborted · ${event.survivor_thread} resumed`
                    : "Check the deadlock recovery trace";

                setConcept(
                    recovered
                        ? "Deadlock recovered"
                        : "Deadlock validation failed",
                    recovered
                        ? `Circular wait was detected. ${event.victim_thread} was selected as the recovery victim, and ${event.survivor_thread} continued execution.`
                        : "Inspect the backend trace to determine whether deadlock detection and recovery completed.",
                    "DEADLOCK DETECTION & RECOVERY"
                );

            } else {
                const valid = Boolean(event.balance_invariant_holds);

                $("outcome-status").textContent =
                    valid ? "CONSISTENT" : "INVARIANT FAILED";

                $("outcome-note").textContent =
                    `${event.successful_count} accepted · ${event.rejected_count} rejected`;

                setConcept(
                    valid
                        ? "Balance invariant preserved"
                        : "Balance invariant failed",
                    `Expected: ${money(event.expected_balance)}. Observed: ${money(event.observed_balance)}. ${
                        valid
                            ? "The final balance matches the validated transactions."
                            : "The final balance does not match the validated transactions."
                    }`,
                    "SAFE SYNCHRONIZATION RESULT"
                );
            }
        }
    }


    $("step-counter").textContent = `${index + 1} / ${events.length}`;
    $("progress-fill").style.width =
        `${((index + 1) / Math.max(events.length, 1)) * 100}%`;

    $("current-event").textContent =
        `${event.seq}. ${eventLabels[event.type] || event.type} — ${eventSummary(event)}`;

    $("playback-title").textContent = eventLabels[event.type] || event.type;
    $("event-count").textContent = `${index + 1} / ${events.length} EVENTS`;

    renderEvent(event, index);

    document.querySelectorAll(".event-row").forEach((row) => {
        row.classList.toggle("active", Number(row.dataset.index) === index);
    });

    updateControls();
}

function finishPlayback() {
    playing = false;
    playbackTimer = null;
    $("playback-title").textContent = "Execution replay complete";
    updateControls();
}

function playNext() {
    if (!playing) return;

    const nextIndex = currentIndex + 1;

    if (nextIndex >= events.length) {
        finishPlayback();
        return;
    }

    applyEvent(events[nextIndex], nextIndex);

    if (currentIndex >= events.length - 1) {
        finishPlayback();
        return;
    }

    const speed = Number($("speed-range").value) || 1;
    playbackTimer = setTimeout(playNext, 650 / speed);
}

function jumpToEvent(index) {
    stopPlayback();
    resetVisualState(activeResult?.initial_balance ?? 1000);

    for (let i = 0; i <= index; i++) {
        applyEvent(events[i], i);
    }

    $("playback-title").textContent = "Paused at selected event";
    updateControls();
}

function validateSchedulingConfiguration() {
    const algorithm = $("algorithm-select").value;

    if (!["fcfs", "sjf", "round_robin"].includes(algorithm)) {
        throw new Error("Select a valid CPU scheduling algorithm.");
    }

    const processes = [];

    for (let i = 1; i <= 4; i++) {
        const arrivalInput = $(`arrival-p${i}`);
        const burstInput = $(`burst-p${i}`);

        if (
            !arrivalInput.value.trim() ||
            !burstInput.value.trim()
        ) {
            throw new Error(`Complete the arrival and burst times for P${i}.`);
        }

        const arrival = Number(arrivalInput.value);
        const burst = Number(burstInput.value);

        if (!Number.isSafeInteger(arrival) || arrival < 0 || arrival > 1000) {
            throw new Error(`P${i}: arrival time must be a whole number from 0 to 1000.`);
        }

        if (!Number.isSafeInteger(burst) || burst < 1 || burst > 1000) {
            throw new Error(`P${i}: CPU burst must be a whole number from 1 to 1000.`);
        }

        processes.push({
            pid: `P${i}`,
            arrival_time: arrival,
            burst_time: burst
        });
    }

    let quantum = 2;

    if (algorithm === "round_robin") {
        const rawQuantum = $("quantum-input").value;

        if (!rawQuantum.trim()) {
            throw new Error("Enter a time quantum for Round Robin.");
        }

        quantum = Number(rawQuantum);

        if (!Number.isSafeInteger(quantum) || quantum < 1 || quantum > 1000) {
            throw new Error("Time quantum must be a whole number from 1 to 1000.");
        }
    }

    return {
        mode: "cpu_scheduling",
        algorithm,
        quantum,
        processes
    };
}


function validateThreadSchedulerConfiguration() {
    const algorithm = $("thread-algorithm-select").value;

    if (!["fcfs", "round_robin", "priority"].includes(algorithm)) {
        throw new Error("Select a valid thread scheduling policy.");
    }

    const initialBalance = Number($("initial-balance").value);
    const amount1 = Number($("amount-1").value);
    const amount2 = Number($("amount-2").value);

    if (
        $("initial-balance").value.trim() === "" ||
        !Number.isSafeInteger(initialBalance) ||
        initialBalance < 0 ||
        initialBalance > 1_000_000_000
    ) {
        throw new Error("Initial balance must be a whole number from ₹0 to ₹1,000,000,000.");
    }

    if (
        $("amount-1").value.trim() === "" ||
        !Number.isSafeInteger(amount1) ||
        amount1 < 1 ||
        amount1 > 1_000_000_000
    ) {
        throw new Error("T1's transaction amount must be a whole number from ₹1 to ₹1,000,000,000.");
    }

    if (
        $("amount-2").value.trim() === "" ||
        !Number.isSafeInteger(amount2) ||
        amount2 < 1 ||
        amount2 > 1_000_000_000
    ) {
        throw new Error("T2's transaction amount must be a whole number from ₹1 to ₹1,000,000,000.");
    }

    let quantum = 1;

    if (algorithm === "round_robin") {
        quantum = Number($("thread-quantum-input").value);

        if (![1, 2, 3].includes(quantum)) {
            throw new Error("Select a time quantum between 1 and 3 operations.");
        }
    }

    const priorityThread = $("thread-priority-select").value;

    if (!["T1", "T2"].includes(priorityThread)) {
        throw new Error("Select T1 or T2 as the higher-priority thread.");
    }

    return {
        mode: "thread_scheduler",
        algorithm,
        quantum,
        priority_thread: priorityThread,
        mutex_enabled: $("thread-mutex-enabled").checked,
        operation: selectedOperation,
        initial_balance: initialBalance,
        amounts: [amount1, amount2]
    };
}


function validateConfiguration() {

    if (selectedMode === "thread_scheduler") {
    return validateThreadSchedulerConfiguration();
}

    if (selectedMode === "cpu_scheduling") {
    return validateSchedulingConfiguration();
}
    


    const rawValues = [
        $("initial-balance").value,
        $("amount-1").value,
        $("amount-2").value
    ];

    if (rawValues.some((value) => value.trim() === "")) {
        throw new Error("Complete all three numeric inputs.");
    }

    const values = rawValues.map(Number);

    if (values.some((value) => !Number.isSafeInteger(value))) {
        throw new Error("Use whole-number rupee amounts.");
    }

    const [initialBalance, amount1, amount2] = values;

    if (initialBalance < 0 || initialBalance > 1_000_000_000) {
        throw new Error("Initial balance must be between ₹0 and ₹1,000,000,000.");
    }

    if ([amount1, amount2].some((value) => value < 1 || value > 1_000_000_000)) {
        throw new Error("Each transaction amount must be between ₹1 and ₹1,000,000,000.");
    }

       return {
        mode: selectedMode,
        operation: selectedOperation,
        initial_balance: initialBalance,
        amounts: [amount1, amount2]
    };
}


function renderSchedulingResults(data) {
    const ganttChart = $("gantt-chart");
    const ganttAxis = $("gantt-axis");

    if (!ganttChart || !ganttAxis) {
        throw new Error("The scheduling chart elements are missing from index.html.");
    }

    const segments = Array.isArray(data.gantt_chart)
        ? data.gantt_chart
        : [];

    const processes = Array.isArray(data.processes)
        ? data.processes
        : [];

    // Calculate the total time from the final Gantt chart boundary.
    const totalTime = segments.reduce((maximum, segment) => {
        const end = Number(segment.end_time);
        return Number.isFinite(end) ? Math.max(maximum, end) : maximum;
    }, 0);

    const algorithm = data.algorithm || $("algorithm-select").value;

    const algorithmNames = {
        fcfs: "First Come, First Served (FCFS)",
        sjf: "Shortest Job First (SJF)",
        round_robin: "Round Robin"
    };

    $("schedule-algorithm-name").textContent =
        algorithmNames[algorithm] || algorithm.toUpperCase();

    $("schedule-total-time").textContent =
        `${totalTime} time units`;

    function displayMetric(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number.toFixed(2) : "—";
    }

    $("schedule-waiting-time").textContent = displayMetric(
        data.average_waiting_time ?? data.avg_waiting_time
    );

    $("schedule-turnaround-time").textContent = displayMetric(
        data.average_turnaround_time ?? data.avg_turnaround_time
    );

    $("schedule-response-time").textContent = displayMetric(
        data.average_response_time ?? data.avg_response_time
    );

    // Draw the Gantt chart.
    ganttChart.replaceChildren();

    segments.forEach((segment) => {
        const start = Number(segment.start_time);
        const end = Number(segment.end_time);
        const duration = Number(
            segment.duration ?? (end - start)
        );

        if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            !Number.isFinite(duration) ||
            duration <= 0 ||
            totalTime <= 0
        ) {
            return;
        }

        const processId = String(
            segment.process_id ?? segment.pid ?? "IDLE"
        );

        const block = document.createElement("div");
        block.className = "gantt-segment";

        const safeClass = processId
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "");

        block.classList.add(`process-${safeClass}`);
        block.style.flex = `0 0 ${(duration / totalTime) * 100}%`;
        block.style.minWidth = "0";
        block.style.boxSizing = "border-box";
        block.textContent = processId;
        block.title = `${processId}: ${start} to ${end}`;

        block.dataset.processId = processId;
        block.dataset.startTime = String(start);
        block.dataset.endTime = String(end);

        ganttChart.appendChild(block);
    });

    // Show time marks at each distinct Gantt chart boundary.
    ganttAxis.replaceChildren();
    ganttAxis.style.position = "relative";
    ganttAxis.style.height = "22px";

    const timeMarks = [
        ...new Set(
            segments.flatMap((segment) => [
                Number(segment.start_time),
                Number(segment.end_time)
            ]).filter(Number.isFinite)
        )
    ].sort((a, b) => a - b);

    timeMarks.forEach((time) => {
        const mark = document.createElement("span");
        mark.textContent = String(time);
        mark.style.position = "absolute";
        mark.style.left = `${totalTime > 0 ? (time / totalTime) * 100 : 0}%`;

        if (time === 0) {
            mark.style.transform = "translateX(0)";
        } else if (time === totalTime) {
            mark.style.transform = "translateX(-100%)";
        } else {
            mark.style.transform = "translateX(-50%)";
        }

        ganttAxis.appendChild(mark);
    });

    // Populate the process results table.
    const tableBody = $("schedule-results-body");

    if (tableBody) {
        tableBody.replaceChildren();

        processes.forEach((process, index) => {
            const row = document.createElement("tr");

            const values = [
                process.pid ?? process.process_id ?? process.id ?? `P${index + 1}`,
                process.arrival_time ?? process.arrival ?? "—",
                process.burst_time ?? process.burst ?? "—",
                process.completion_time ?? process.completion ?? "—",
                process.waiting_time ?? process.waiting ?? "—",
                process.turnaround_time ?? process.turnaround ?? "—"
            ];

            values.forEach((value) => {
                const cell = document.createElement("td");
                cell.textContent = String(value);
                row.appendChild(cell);
            });

            tableBody.appendChild(row);
        });
    }
}


function renderThreadSchedulerResults(data) {
    const chart = $("thread-gantt-chart");
    const axis = $("thread-gantt-axis");

    if (!chart || !axis) {
        throw new Error("Thread Scheduler workspace elements are missing.");
    }

    const segments = Array.isArray(data.gantt_chart)
        ? data.gantt_chart
        : [];

    if (segments.length === 0) {
        throw new Error("The Thread Scheduler returned no execution timeline.");
    }

    const algorithms = {
        fcfs: "FCFS",
        round_robin: "Round Robin",
        priority: "Priority Scheduling"
    };

    $("thread-scheduler-algorithm").textContent =
        algorithms[data.algorithm] || data.algorithm;

    $("thread-scheduler-total-time").textContent =
        `${segments.length} operations`;

    $("thread-scheduler-mutex-status").textContent =
        data.mutex_enabled ? "Enabled" : "Disabled";

    $("thread-expected-balance").textContent =
        money(data.expected_balance);

    $("thread-observed-balance").textContent =
        money(data.observed_balance);

    // Initialize thread cards before event playback begins.
    ["T1", "T2"].forEach((thread, index) => {
        const amount = Number(data.amounts?.[index]);
        const operation = data.operation === "deposit"
            ? "Deposit"
            : "Withdrawal";

        $(`thread-state-${thread.toLowerCase()}`).textContent = "READY";

        $(`thread-detail-${thread.toLowerCase()}`).textContent =
            `${operation} ${money(amount)} · 3 transaction steps`;
    });

    threadSchedulerReadyQueue = data.algorithm === "priority"
    ? [
        data.priority_thread,
        data.priority_thread === "T1" ? "T2" : "T1"
    ]
    : ["T1", "T2"];

$("thread-ready-queue").textContent =
    threadSchedulerReadyQueue.join(" → ");

    // Draw the transaction-operation timeline.
    const totalTime = segments.reduce((maximum, segment) => {
        const end = Number(segment.end_time);
        return Number.isFinite(end) ? Math.max(maximum, end) : maximum;
    }, 0);

    if (totalTime <= 0) {
        throw new Error("The Thread Scheduler returned an invalid timeline.");
    }

    chart.replaceChildren();

    segments.forEach((segment) => {
        const start = Number(segment.start_time);
        const end = Number(segment.end_time);
        const duration = Number(segment.duration ?? (end - start));
        const thread = String(segment.thread ?? segment.process_id ?? "");
        const operation = String(segment.operation ?? "");

        if (
            !["T1", "T2"].includes(thread) ||
            !["READ", "CALCULATE", "WRITE"].includes(operation) ||
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            !Number.isFinite(duration) ||
            duration <= 0
        ) {
            return;
        }

        const block = document.createElement("div");
        block.className = "gantt-segment";
        block.classList.add(`thread-${thread.toLowerCase()}`);

        block.style.flex = `0 0 ${(duration / totalTime) * 100}%`;
        block.style.minWidth = "0";
        block.style.boxSizing = "border-box";
        block.style.whiteSpace = "pre-line";
        block.style.fontSize = "0.72rem";

        block.textContent = `${thread}\n${operation}`;
        block.title = `${thread} · ${operation} · ${start}–${end}`;

        block.dataset.thread = thread;
        block.dataset.operation = operation;
        block.dataset.startTime = String(start);
        block.dataset.endTime = String(end);

        chart.appendChild(block);
    });

    // Draw the time scale.
    axis.replaceChildren();
    axis.style.position = "relative";
    axis.style.height = "22px";

    const marks = [
        ...new Set(
            segments.flatMap(segment => [
                Number(segment.start_time),
                Number(segment.end_time)
            ]).filter(Number.isFinite)
        )
    ].sort((a, b) => a - b);

    marks.forEach((time) => {
        const mark = document.createElement("span");
        mark.textContent = String(time);
        mark.style.position = "absolute";
        mark.style.left = `${(time / totalTime) * 100}%`;

        mark.style.transform = time === 0
            ? "translateX(0)"
            : time === totalTime
                ? "translateX(-100%)"
                : "translateX(-50%)";

        axis.appendChild(mark);
    });
}


async function runSimulation() {
    if (loading) return;

    // Bring the Live Workspace and Backend Trace into view.
    const workspace = document.querySelector(".dashboard-grid");

    if (workspace) {
        workspace.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    let configuration;

    try {
        configuration = validateConfiguration();
    } catch (error) {
    $("error-message").textContent = error.message;
    $("error-message").hidden = false;
    return;
}

    stopPlayback();
    loading = true;
    $("error-message").hidden = true;
    $("outcome-status").textContent = "RUNNING";
    $("outcome-note").textContent = "Requesting backend simulation";
    $("playback-title").textContent = "Generating execution trace…";
    updateControls();

    try {
        const response = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configuration)
        });

        const data = await response.json();
        

        if (!response.ok) {
            throw new Error(data.error || "Simulation request failed.");
        }

        
if (!Array.isArray(data.events) || data.events.length === 0) {
    throw new Error("Backend returned no execution events.");
}

activeResult = data;
activeOperation = configuration.operation ?? null;
events = data.events;

if (selectedMode === "cpu_scheduling") {
    renderSchedulingResults(data);
} else if (selectedMode === "thread_scheduler") {
    renderThreadSchedulerResults(data);
}

resetVisualState(data.initial_balance ?? 0);




        $("event-count").textContent = `${events.length} EVENTS`;
        $("playback-title").textContent = "Replaying backend trace";
        playing = true;

    } catch (error) {
        $("error-message").textContent =
            error.message || "Could not run the simulation. Check the backend.";
        $("error-message").hidden = false;
        $("outcome-status").textContent = "ERROR";
        
        

if (selectedMode === "thread_scheduler") {
    setIntegrityState(
        "Thread Scheduler validation unavailable",
        "is-bad",
        "The backend did not return a complete thread scheduling result, so the transaction execution could not be validated.",
        "Validation requires a completed thread schedule and a valid expected-versus-observed balance comparison."
    );
} else if (selectedMode === "cpu_scheduling") {
    setIntegrityState(
        "Scheduling validation unavailable",
        "is-bad",
        "The backend did not return a complete CPU scheduling result, so process metrics could not be validated.",
        "Validation requires completed processes and valid scheduling metrics."
    );
} else {
    setIntegrityState(
        "Validation unavailable",
        "is-bad",
        "The backend did not return a completed simulation, so the final balance could not be validated.",
        "Validation requires a successful Simulation completed event."
    );
}


        $("outcome-note").textContent = "No new result available";
        $("playback-title").textContent = "Simulation request failed";
    } finally {
        loading = false;
        updateControls();
    }

    if (playing) playNext();
}

$("simulation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runSimulation();
});

document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
        updateMode(button.dataset.mode);
    });
});

document.querySelectorAll("[data-operation]").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.operation === selectedOperation) return;
        selectedOperation = button.dataset.operation;
        applyOperationUI(true);
    });
});

$("algorithm-select").addEventListener("change", () => {
    const isRoundRobin =
        $("algorithm-select").value === "round_robin";

    $("quantum-config").hidden = !isRoundRobin;
    $("quantum-config").style.display =
        isRoundRobin ? "" : "none";
});
$("thread-algorithm-select").addEventListener(
    "change",
    updateThreadSchedulerControls
);

$("run-btn").addEventListener("click", runSimulation);

$("pause-btn").addEventListener("click", () => {
    stopPlayback();
    $("playback-title").textContent = "Replay paused";
});

$("resume-btn").addEventListener("click", () => {
    if (currentIndex >= events.length - 1) return;
    playing = true;
    updateControls();
    playNext();
});

$("restart-btn").addEventListener("click", () => {
    stopPlayback();
    resetVisualState(activeResult?.initial_balance ?? 1000);
    playing = true;
    $("playback-title").textContent = "Replaying from the beginning";
    updateControls();
    playNext();
});

$("step-btn").addEventListener("click", () => {
    stopPlayback();

    const nextIndex = currentIndex + 1;

    if (nextIndex < events.length) {
        applyEvent(events[nextIndex], nextIndex);

        if (nextIndex < events.length - 1) {
            $("playback-title").textContent = "Paused after one event";
        } else {
            $("playback-title").textContent = "Execution replay complete";
        }
    }

    updateControls();
});

$("speed-range").addEventListener("input", () => {
    $("speed-label").textContent = `${Number($("speed-range").value).toFixed(2)}× SPEED`;
});

checkBackend();
updateMode("race_condition");
