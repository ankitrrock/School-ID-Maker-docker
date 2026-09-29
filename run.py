#!/usr/bin/env python3
"""
Run School-ID-Maker with Docker: database -> application, in order.

Usage:
    python run.py            # build (if needed) and start db, then app
    python run.py up         # same as above
    python run.py down       # stop and remove the containers
    python run.py down -v    # also delete database, upload and JWT-secret volumes
    python run.py logs       # tail logs from all services
    python run.py status     # show container status

Requires: Docker Desktop (or Docker Engine) with Compose v2, running.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
API_URL = "http://localhost:3000/api/healthz"
WEB_URL = "http://localhost:3000"


def find_compose_command() -> list[str]:
    """Return the argv prefix for Docker Compose v2, or exit with a clear error."""
    if shutil.which("docker"):
        probe = subprocess.run(
            ["docker", "compose", "version"],
            cwd=REPO_ROOT,
            capture_output=True,
        )
        if probe.returncode == 0:
            return ["docker", "compose"]

    if shutil.which("docker-compose"):
        return ["docker-compose"]

    sys.exit(
        "Docker Compose was not found. Install Docker Desktop "
        "(https://www.docker.com/products/docker-desktop/) and make sure "
        "it is running, then try again."
    )


def run(compose: list[str], *args: str) -> None:
    print(f"\n$ {' '.join(compose + list(args))}")
    result = subprocess.run(compose + list(args), cwd=REPO_ROOT)
    if result.returncode != 0:
        sys.exit(f"Command failed with exit code {result.returncode}.")


def step(title: str) -> None:
    print(f"\n=== {title} ===")


def up() -> None:
    compose = find_compose_command()

    step("1/2 Starting database (postgres)")
    run(compose, "up", "-d", "--wait", "db")

    step("2/2 Building and starting application (app)")
    run(compose, "up", "-d", "--build", "--wait", "app")

    print("\nAll services are up.")
    print(f"  Frontend: {WEB_URL}")
    print(f"  API:      {API_URL}")
    print("\nTail logs with:   python run.py logs")
    print("Stop everything:  python run.py down")


def down(remove_volumes: bool) -> None:
    compose = find_compose_command()
    args = ["down"]
    if remove_volumes:
        args.append("-v")
    run(compose, *args)


def logs() -> None:
    compose = find_compose_command()
    run(compose, "logs", "-f")


def status() -> None:
    compose = find_compose_command()
    run(compose, "ps")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("up", help="Start db, then app (default)")

    down_parser = sub.add_parser("down", help="Stop and remove containers")
    down_parser.add_argument(
        "-v", "--volumes", action="store_true", help="Also delete the database volume"
    )

    sub.add_parser("logs", help="Tail logs from all services")
    sub.add_parser("status", help="Show container status")

    args = parser.parse_args()
    command = args.command or "up"

    try:
        if command == "up":
            up()
        elif command == "down":
            down(remove_volumes=args.volumes)
        elif command == "logs":
            logs()
        elif command == "status":
            status()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(130)


if __name__ == "__main__":
    main()
