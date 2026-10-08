/**
 * Jest setup for mobile component tests.
 *
 * React 19 exposes `act()` from the `react` package itself. It only treats the
 * current environment as an "act environment" when this global flag is `true`.
 * Without it, every state update flushed inside `act(...)` logs:
 *   "The current testing environment is not configured to support act(...)"
 *
 * See: https://react.dev/reference/react/act#error-the-current-testing-environment-is-not-configured-to-support-act
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
