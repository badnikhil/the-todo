import os
import json
import asyncio
from fastapi import WebSocket
import redis.asyncio as redis_async

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, email: str):
        await websocket.accept()
        self.active_connections[websocket] = email

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.keys()):
            try:
                await connection.send_json(message)
            except:
                pass

    async def send_personal_message(self, message: dict, email: str):
        for connection, conn_email in self.active_connections.items():
            if conn_email == email:
                try:
                    await connection.send_json(message)
                except:
                    pass

manager = ConnectionManager()
redis_pub_client = redis_async.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)

async def broadcast_stats(total_todos: int = None, total_projects: int = None):
    msg = {"type": "stats_update"}
    if total_todos is not None:
        msg["total_todos"] = total_todos
    if total_projects is not None:
        msg["total_projects"] = total_projects
    await redis_pub_client.publish("broadcasts", json.dumps(msg))

async def broadcast_activity(activity: dict):
    msg = {"type": "new_activity", "activity": activity}
    await redis_pub_client.publish("broadcasts", json.dumps(msg))

async def redis_listener():
    r = redis_async.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("notifications", "broadcasts")
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                if message["channel"] == "notifications":
                    await manager.send_personal_message(data, data["email"])
                elif message["channel"] == "broadcasts":
                    await manager.broadcast(data)
            except Exception as e:
                print(f"Error processing message: {e}")
