
import unittest

from simulation.race_lab import run_race_experiment


class RaceLabTests(unittest.TestCase):

    def test_lost_update_is_reproduced(self):
        result = run_race_experiment()

        self.assertEqual(result["expected_balance"], 500)
        self.assertIn(result["observed_balance"], (700, 800))
        self.assertTrue(result["lost_update_detected"])

    def test_both_threads_read_before_either_writes(self):
        result = run_race_experiment()
        events = result["events"]

        reads = [
            event for event in events
            if event["type"] == "balance_read"
        ]

        updates = [
            event for event in events
            if event["type"] == "balance_updated"
        ]

        self.assertEqual(len(reads), 2)
        self.assertEqual([e["balance"] for e in reads], [1000, 1000])
        self.assertEqual(len(updates), 2)

        first_write_seq = min(event["seq"] for event in updates)

        self.assertTrue(
            all(event["seq"] < first_write_seq for event in reads)
        )

    def test_invalid_deposit_is_rejected(self):
        with self.assertRaises(ValueError):
            run_race_experiment(
            amounts=(100, 0),
            operation="deposit",
        )


if __name__ == "__main__":
    unittest.main()
