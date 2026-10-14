import base64
import io
import unittest
import zipfile
from preserve_workflow_logs import evidence

class WorkflowLogsTest(unittest.TestCase):
    def setUp(self):
        self.info = {"id": 42, "run_attempt": 1, "name": "Odds refresh", "head_branch": "main",
                     "head_repository": {"full_name": "owner/repo"}, "head_sha": "a" * 40,
                     "status": "completed", "conclusion": "failure"}

    def test_failed_run_logs_are_recoverable_without_inventing_value_outcome(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("job/step.txt", "HTTP 403\n")
        result = evidence(self.info, data.getvalue(), "owner/repo", 42, 1)
        self.assertEqual(result["runConclusion"], "failure")
        self.assertEqual(result["valueExecutionOutcome"], "not_inferred")
        self.assertEqual(result["logStatus"], "LOG_ARCHIVE_SAVED")
        self.assertEqual(base64.b64decode(result["logBytesBase64"]), data.getvalue())

    def test_missing_and_corrupt_logs_remain_distinct(self):
        self.assertEqual(evidence(self.info, None, "owner/repo", 42, 1)["logStatus"], "LOG_ARCHIVE_UNAVAILABLE")
        invalid = evidence(self.info, b"corrupt zip", "owner/repo", 42, 1)
        self.assertEqual(invalid["logStatus"], "LOG_ARCHIVE_INVALID")
        self.assertEqual(base64.b64decode(invalid["logBytesBase64"]), b"corrupt zip")

    def test_other_repository_branch_attempt_or_active_run_are_rejected(self):
        for field, value in [("head_repository", {"full_name": "attacker/repo"}), ("head_branch", "feature"),
                             ("run_attempt", 2), ("status", "in_progress"), ("name", "unknown workflow")]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                evidence({**self.info, field: value}, None, "owner/repo", 42, 1)

if __name__ == "__main__":
    unittest.main()
