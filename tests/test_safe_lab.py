
import unittest

from simulation.safe_lab import run_safe_experiment


class SafeLabTests(unittest.TestCase):

    def test_only_one_competing_withdrawal_succeeds(self):
        result = run_safe_experiment()

        self.assertEqual(result["successful_count"], 1)
        self.assertEqual(result["rejected_count"], 1)
        self.assertIn(result["final_balance"], (300, 500))
        self.assertTrue(result["balance_invariant_holds"])

    def test_final_balance_matches_successful_withdrawal(self):
        result = run_safe_experiment()

        accepted = [
            outcome for outcome in result["outcomes"]
            if outcome["status"] == "accepted"
        ]

        rejected = [
            outcome for outcome in result["outcomes"]
            if outcome["status"] == "rejected"
        ]

        self.assertEqual(len(accepted), 1)
        self.assertEqual(len(rejected), 1)

        expected = (
            result["initial_balance"] - accepted[0]["amount"]
        )

        self.assertEqual(result["final_balance"], expected)
        self.assertEqual(
            rejected[0]["reason"],
            "insufficient_funds"
        )

    def test_lock_is_acquired_and_released(self):
        result = run_safe_experiment()
        events = result["events"]

        acquired = [
            event for event in events
            if event["type"] == "lock_acquired"
        ]

        released = [
            event for event in events
            if event["type"] == "lock_released"
        ]

        self.assertEqual(len(acquired), 2)
        self.assertEqual(len(released), 2)

        for thread_id in ("T1", "T2"):
            thread_events = [
                event for event in events
                if event.get("thread") == thread_id
            ]

            acquired_seq = next(
                e["seq"] for e in thread_events
                if e["type"] == "lock_acquired"
            )

            released_seq = next(
                e["seq"] for e in thread_events
                if e["type"] == "lock_released"
            )

            self.assertLess(acquired_seq, released_seq)

    def test_invalid_withdrawal_is_rejected(self):
        with self.assertRaises(ValueError):
            run_safe_experiment(
            amounts=(700, 0),
            operation="withdraw",
        )


if __name__ == "__main__":
    unittest.main()
