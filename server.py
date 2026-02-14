from __future__ import annotations

import json
import mimetypes
import os
import random
import time
import uuid
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

GRID_WIDTH = 50
GRID_HEIGHT = 40
PUBLIC_DIR = Path(__file__).parent / "public"
PLAYER_TTL_SECONDS = 60


@dataclass
class Player:
    id: str
    x: int
    y: int
    color: str
    updated_at: float


class GameState:
    def __init__(self) -> None:
        self.players: dict[str, Player] = {}
        self.blocks: dict[str, dict[str, object]] = {}

    def cleanup_players(self) -> None:
        cutoff = time.time() - PLAYER_TTL_SECONDS
        stale_ids = [pid for pid, p in self.players.items() if p.updated_at < cutoff]
        for pid in stale_ids:
            del self.players[pid]

    def serialize(self) -> dict[str, object]:
        return {
            "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT},
            "players": [
                {
                    "id": player.id,
                    "x": player.x,
                    "y": player.y,
                    "color": player.color,
                    "updatedAt": int(player.updated_at * 1000),
                }
                for player in self.players.values()
            ],
            "blocks": list(self.blocks.values()),
        }


STATE = GameState()


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def random_spawn() -> tuple[int, int]:
    return random.randrange(GRID_WIDTH), random.randrange(GRID_HEIGHT)


def create_player() -> Player:
    x, y = random_spawn()
    hue = uuid.uuid4().int % 360
    return Player(
        id=str(uuid.uuid4()),
        x=x,
        y=y,
        color=f"hsl({hue} 85% 60%)",
        updated_at=time.time(),
    )


def apply_action(player: Player, action: str) -> bool:
    if action == "up":
        player.y = clamp(player.y - 1, 0, GRID_HEIGHT - 1)
    elif action == "down":
        player.y = clamp(player.y + 1, 0, GRID_HEIGHT - 1)
    elif action == "left":
        player.x = clamp(player.x - 1, 0, GRID_WIDTH - 1)
    elif action == "right":
        player.x = clamp(player.x + 1, 0, GRID_WIDTH - 1)
    elif action == "place":
        key = f"{player.x},{player.y}"
        STATE.blocks[key] = {"key": key, "x": player.x, "y": player.y, "color": player.color}
    elif action == "remove":
        key = f"{player.x},{player.y}"
        STATE.blocks.pop(key, None)
    else:
        return False

    player.updated_at = time.time()
    return True


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        return json.loads(raw.decode("utf-8"))

    def _serve_static(self, raw_path: str) -> None:
        request_path = "/index.html" if raw_path == "/" else raw_path
        request_path = request_path.split("?", 1)[0]
        target = (PUBLIC_DIR / request_path.lstrip("/")).resolve()

        if PUBLIC_DIR.resolve() not in target.parents and target != PUBLIC_DIR.resolve():
            self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")
            return

        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        content = target.read_bytes()
        content_type, _ = mimetypes.guess_type(str(target))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:  # noqa: N802
        STATE.cleanup_players()
        path = urlparse(self.path).path

        if path == "/api/state":
            self._send_json(STATE.serialize())
            return

        self._serve_static(path)

    def do_POST(self) -> None:  # noqa: N802
        STATE.cleanup_players()
        path = urlparse(self.path).path

        if path == "/api/join":
            player = create_player()
            STATE.players[player.id] = player
            self._send_json({"playerId": player.id, "state": STATE.serialize()})
            return

        if path == "/api/action":
            try:
                payload = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json({"error": "Invalid JSON"}, HTTPStatus.BAD_REQUEST)
                return

            player_id = str(payload.get("playerId", ""))
            action = str(payload.get("action", ""))
            player = STATE.players.get(player_id)
            if not player:
                self._send_json({"error": "Player not found"}, HTTPStatus.NOT_FOUND)
                return

            if not apply_action(player, action):
                self._send_json({"error": "Unsupported action"}, HTTPStatus.BAD_REQUEST)
                return

            self._send_json({"ok": True})
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")


def create_http_server(host: str, port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), Handler)


def run_server(host: str, port: int) -> None:
    server = create_http_server(host, port)
    print(f"Game server running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "3000"))
    run_server(host, port)
