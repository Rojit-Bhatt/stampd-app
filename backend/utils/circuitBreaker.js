// Generic circuit breaker for outbound calls to a single external dependency.
//
// CLOSED: calls go through normally, counting failures.
// OPEN: calls fast-fail immediately (no network attempt) once failureThreshold
//   consecutive failures land, until resetTimeoutMs elapses.
// HALF_OPEN: after the cooldown, exactly one trial call is let through; success
//   closes the circuit, failure re-opens it for another resetTimeoutMs.
//
// Every call is also wrapped in its own timeoutMs race and counted against
// maxConcurrent in-flight calls, independent of breaker state — a dependency
// that's merely slow (not yet tripped the breaker) still can't pile up
// unbounded concurrent connections or hang callers indefinitely.

class DependencyUnavailableError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function createCircuitBreaker({ name, timeoutMs = 5000, failureThreshold = 5, resetTimeoutMs = 30000, maxConcurrent = 20 }) {
  let state = "CLOSED";
  let failureCount = 0;
  let nextAttemptAt = 0;
  let halfOpenTrialInFlight = false;
  let inFlight = 0;

  const recordSuccess = () => {
    failureCount = 0;
    state = "CLOSED";
  };

  const recordFailure = () => {
    failureCount += 1;
    if (state === "HALF_OPEN" || failureCount >= failureThreshold) {
      state = "OPEN";
      nextAttemptAt = Date.now() + resetTimeoutMs;
    }
  };

  const exec = async (fn) => {
    if (state === "OPEN") {
      if (Date.now() < nextAttemptAt) {
        throw new DependencyUnavailableError(`${name} is unavailable (circuit open).`, "CIRCUIT_OPEN");
      }
      state = "HALF_OPEN";
      halfOpenTrialInFlight = false;
    }

    if (state === "HALF_OPEN") {
      if (halfOpenTrialInFlight) {
        throw new DependencyUnavailableError(`${name} is unavailable (circuit half-open, trial in progress).`, "CIRCUIT_OPEN");
      }
      halfOpenTrialInFlight = true;
    }

    if (inFlight >= maxConcurrent) {
      throw new DependencyUnavailableError(`${name} is at its concurrency limit.`, "CONCURRENCY_LIMIT");
    }

    inFlight += 1;
    let timer;
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new DependencyUnavailableError(`${name} timed out after ${timeoutMs}ms.`, "TIMEOUT")),
            timeoutMs
          );
        })
      ]);
      recordSuccess();
      return result;
    } catch (err) {
      recordFailure();
      throw err;
    } finally {
      clearTimeout(timer);
      inFlight -= 1;
      if (state === "HALF_OPEN") halfOpenTrialInFlight = false;
    }
  };

  return {
    exec,
    get state() {
      return state;
    }
  };
}

module.exports = { createCircuitBreaker, DependencyUnavailableError };
