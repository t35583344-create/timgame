from __future__ import annotations

import argparse
import shutil
import socket
import subprocess
import sys
import threading
import time
from typing import Optional

from server import run_server


def get_local_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def start_cloudflared_tunnel(port: int) -> Optional[subprocess.Popen[str]]:
    binary = shutil.which("cloudflared")
    if not binary:
        return None

    command = [binary, "tunnel", "--url", f"http://127.0.0.1:{port}"]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    def stream_logs() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            if "trycloudflare.com" in line:
                print(f"[public-url] {line.strip()}")

    threading.Thread(target=stream_logs, daemon=True).start()
    time.sleep(2)
    return process


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Launcher for Cube Grid Online server (local + optional public tunnel)."
    )
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind server (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=3000, help="Port to bind server (default: 3000)")
    parser.add_argument(
        "--public",
        action="store_true",
        help="Start Cloudflare quick tunnel if cloudflared is installed",
    )

    args = parser.parse_args()
    local_ip = get_local_ip()

    print("=== Cube Grid Online Launcher ===")
    print(f"Local network URL: http://{local_ip}:{args.port}")
    print(f"Same machine URL:  http://127.0.0.1:{args.port}")

    tunnel_process: Optional[subprocess.Popen[str]] = None
    if args.public:
        tunnel_process = start_cloudflared_tunnel(args.port)
        if tunnel_process is None:
            print("[warning] cloudflared not found. Install it to get a public URL automatically.")
            print("[hint] You can still play from other countries by opening port on your router/VPS/firewall.")

    try:
        run_server(args.host, args.port)
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        if tunnel_process:
            tunnel_process.terminate()


if __name__ == "__main__":
    sys.exit(main())
