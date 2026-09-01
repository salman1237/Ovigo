"""In-process WebSocket connection registry, keyed by chat thread.

Single-instance only: connections live in this process's memory, so a
broadcast only reaches sockets connected to the same worker that handled the
originating POST. Fine for FastAPI Cloud's current single-instance
deployment; horizontal scaling would need a pub/sub layer (Redis) fanning
broadcasts out to every worker — exactly the scaling note already called out
in the technical document's risk register. REST remains the source of truth
for message history regardless (see chat/service.py), so a missed broadcast
never loses a message, only the instant "ping" of it — the recipient still
sees it on next fetch/reconnect.
"""
import uuid

from fastapi import WebSocket


class ChatConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, list[WebSocket]] = {}

    async def connect(self, thread_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(thread_id, []).append(websocket)

    def disconnect(self, thread_id: uuid.UUID, websocket: WebSocket) -> None:
        conns = self._connections.get(thread_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                self._connections.pop(thread_id, None)

    async def broadcast(self, thread_id: uuid.UUID, payload: dict) -> None:
        for ws in list(self._connections.get(thread_id, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(thread_id, ws)


manager = ChatConnectionManager()
