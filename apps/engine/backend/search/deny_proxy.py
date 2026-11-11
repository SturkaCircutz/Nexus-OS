"""Local fail-closed proxy: never resolves or connects to an upstream host."""

import asyncio


class DenyProxy:
    def __init__(self):
        self._server = None
        self._clients = set()
        self._tasks = set()

    async def start(self) -> str:
        self._server = await asyncio.start_server(self._deny, "127.0.0.1", 0, limit=8192)
        port = self._server.sockets[0].getsockname()[1]
        return f"http://127.0.0.1:{port}"

    async def _deny(self, reader, writer):
        task = asyncio.current_task()
        self._tasks.add(task)
        self._clients.add(writer)
        try:
            async with asyncio.timeout(1):
                writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                await writer.drain()
        except (OSError, TimeoutError):
            pass
        finally:
            writer.close()
            self._clients.discard(writer)
            self._tasks.discard(task)

    async def aclose(self):
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        for writer in tuple(self._clients):
            writer.close()
        tasks = tuple(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
