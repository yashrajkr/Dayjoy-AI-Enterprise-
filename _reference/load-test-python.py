"""Load testing scripts for the Dayjoy AI Platform.

These scripts use asyncio + httpx to simulate concurrent users and measure:
- API response time
- Throughput (requests per second)
- Error rate
- Concurrent user capacity

Run:
    python scripts/load_test_api.py --base-url http://localhost:8000 --users 50 --duration 60

Requirements:
    pip install httpx
"""

import asyncio
import argparse
import time
import statistics
from collections import defaultdict
from typing import Any

import httpx


class LoadTestResult:
    def __init__(self) -> None:
        self.latencies: list[float] = []
        self.status_codes: dict[int, int] = defaultdict(int)
        self.errors: list[str] = []
        self.total_requests = 0
        self.start_time: float = 0
        self.end_time: float = 0

    @property
    def duration_seconds(self) -> float:
        return self.end_time - self.start_time

    @property
    def requests_per_second(self) -> float:
        return self.total_requests / max(0.001, self.duration_seconds)

    @property
    def avg_latency_ms(self) -> float:
        return statistics.mean(self.latencies) * 1000 if self.latencies else 0

    @property
    def p95_latency_ms(self) -> float:
        if not self.latencies:
            return 0
        sorted_l = sorted(self.latencies)
        idx = int(len(sorted_l) * 0.95)
        return sorted_l[idx] * 1000

    @property
    def p99_latency_ms(self) -> float:
        if not self.latencies:
            return 0
        sorted_l = sorted(self.latencies)
        idx = int(len(sorted_l) * 0.99)
        return sorted_l[idx] * 1000

    @property
    def error_rate(self) -> float:
        errors = sum(v for k, v in self.status_codes.items() if k >= 400)
        return errors / max(1, self.total_requests)

    def summary(self) -> str:
        return (
            f"\n===== Load Test Results =====\n"
            f"Duration: {self.duration_seconds:.1f}s\n"
            f"Total requests: {self.total_requests}\n"
            f"Requests/sec: {self.requests_per_second:.1f}\n"
            f"Avg latency: {self.avg_latency_ms:.0f}ms\n"
            f"P95 latency: {self.p95_latency_ms:.0f}ms\n"
            f"P99 latency: {self.p99_latency_ms:.0f}ms\n"
            f"Error rate: {self.error_rate:.2%}\n"
            f"Status codes: {dict(self.status_codes)}\n"
            f"==============================\n"
        )


async def test_health_check(client: httpx.AsyncClient, results: LoadTestResult) -> None:
    """Test: GET /health (should be <10ms)."""
    start = time.perf_counter()
    try:
        response = await client.get("/health")
        results.latencies.append(time.perf_counter() - start)
        results.status_codes[response.status_code] += 1
    except Exception as e:
        results.errors.append(str(e))
        results.latencies.append(time.perf_counter() - start)
    results.total_requests += 1


async def test_api_endpoint(client: httpx.AsyncClient, results: LoadTestResult, path: str) -> None:
    """Test: GET any API endpoint."""
    start = time.perf_counter()
    try:
        response = await client.get(f"/api/v1{path}")
        results.latencies.append(time.perf_counter() - start)
        results.status_codes[response.status_code] += 1
    except Exception as e:
        results.errors.append(str(e))
        results.latencies.append(time.perf_counter() - start)
    results.total_requests += 1


async def run_load_test(
    base_url: str,
    num_users: int,
    duration_seconds: int,
    test_type: str = "health",
) -> LoadTestResult:
    """Run a load test with N concurrent users for D seconds."""
    results = LoadTestResult()
    results.start_time = time.perf_counter()

    async def user_worker(client: httpx.AsyncClient):
        while time.perf_counter() - results.start_time < duration_seconds:
            if test_type == "health":
                await test_health_check(client, results)
            elif test_type == "knowledge":
                await test_api_endpoint(client, results, "/knowledge/documents")
            elif test_type == "voice":
                await test_api_endpoint(client, results, "/voice/assistants")
            elif test_type == "whatsapp":
                await test_api_endpoint(client, results, "/whatsapp/accounts")
            elif test_type == "notifications":
                await test_api_endpoint(client, results, "/notifications/history")

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        tasks = [user_worker(client) for _ in range(num_users)]
        await asyncio.gather(*tasks)

    results.end_time = time.perf_counter()
    return results


# ===== Acceptable thresholds =====
THRESHOLDS = {
    "health": {"avg_ms": 10, "p95_ms": 50, "error_rate": 0.0},
    "knowledge": {"avg_ms": 100, "p95_ms": 500, "error_rate": 0.01},
    "voice": {"avg_ms": 100, "p95_ms": 500, "error_rate": 0.01},
    "whatsapp": {"avg_ms": 100, "p95_ms": 500, "error_rate": 0.01},
    "notifications": {"avg_ms": 100, "p95_ms": 500, "error_rate": 0.01},
}


def check_thresholds(results: LoadTestResult, test_type: str) -> bool:
    """Check if results meet acceptable thresholds."""
    thresholds = THRESHOLDS.get(test_type, {})
    passed = True
    if results.avg_latency_ms > thresholds.get("avg_ms", 9999):
        print(f"  ❌ Avg latency {results.avg_latency_ms:.0f}ms exceeds {thresholds['avg_ms']}ms")
        passed = False
    else:
        print(f"  ✅ Avg latency {results.avg_latency_ms:.0f}ms within {thresholds['avg_ms']}ms")
    if results.p95_latency_ms > thresholds.get("p95_ms", 9999):
        print(f"  ❌ P95 latency {results.p95_latency_ms:.0f}ms exceeds {thresholds['p95_ms']}ms")
        passed = False
    else:
        print(f"  ✅ P95 latency {results.p95_latency_ms:.0f}ms within {thresholds['p95_ms']}ms")
    if results.error_rate > thresholds.get("error_rate", 1.0):
        print(f"  ❌ Error rate {results.error_rate:.2%} exceeds {thresholds['error_rate']:.2%}")
        passed = False
    else:
        print(f"  ✅ Error rate {results.error_rate:.2%} within {thresholds['error_rate']:.2%}")
    return passed


async def main():
    parser = argparse.ArgumentParser(description="Dayjoy AI Platform Load Tester")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Base URL")
    parser.add_argument("--users", type=int, default=10, help="Number of concurrent users")
    parser.add_argument("--duration", type=int, default=30, help="Duration in seconds")
    parser.add_argument("--test-type", default="health",
                       choices=["health", "knowledge", "voice", "whatsapp", "notifications"],
                       help="Type of test to run")
    args = parser.parse_args()

    print(f"Starting load test: {args.test_type}")
    print(f"  Users: {args.users}")
    print(f"  Duration: {args.duration}s")
    print(f"  URL: {args.base_url}")

    results = await run_load_test(args.base_url, args.users, args.duration, args.test_type)
    print(results.summary())
    print("Threshold check:")
    check_thresholds(results, args.test_type)


if __name__ == "__main__":
    asyncio.run(main())
