"""Public destination policy and the HTTP connector's validating DNS resolver."""

from __future__ import annotations

import asyncio
import ipaddress
import socket

from aiohttp.abc import AbstractResolver
from yarl import URL

from search.errors import RetrievalError
from search.models import MAX_URL_LENGTH, SearchErrorCode


def unsafe() -> RetrievalError:
    return RetrievalError(SearchErrorCode.UNSAFE_URL, "Only public HTTP/HTTPS destinations on ports 80 and 443 are allowed.")


def public_ip(value: str) -> str:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        raise unsafe() from None
    if not address.is_global or address.is_multicast or address.is_reserved:
        raise unsafe()
    if isinstance(address, ipaddress.IPv6Address):
        # Reject scoped, translated and transition addresses rather than allowing
        # an embedded IPv4 destination to escape the public-address policy.
        if (address.scope_id or address.ipv4_mapped or address.sixtofour or address.teredo
                or address in ipaddress.ip_network("64:ff9b::/96")
                or address in ipaddress.ip_network("64:ff9b:1::/48")):
            raise unsafe()
    return str(address)


def public_url(value: str) -> URL:
    if len(value) > MAX_URL_LENGTH or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise unsafe()
    try:
        url = URL(value)
        host = url.raw_host
        if (url.scheme not in {"http", "https"} or not host or url.port not in {80, 443}
                or url.user is not None or url.password is not None or "\\" in value):
            raise unsafe()
        host = host.rstrip(".").lower()
        try:
            ipaddress.ip_address(host)
        except ValueError:
            if ("." not in host or "%" in host
                    or host.endswith((".localhost", ".local", ".internal", ".home.arpa"))):
                raise unsafe()
        else:
            public_ip(host)
        return url.with_fragment(None)
    except (ValueError, UnicodeError):
        raise unsafe() from None


class PublicResolver(AbstractResolver):
    """Validate the exact addresses consumed by aiohttp, with no second lookup.

Literal-IP URLs bypass aiohttp's resolver and must pass public_url() first.
Mixed public/private DNS answers are rejected as a whole.
"""

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_INET):
        if port not in {80, 443}:
            raise unsafe()
        try:
            addresses = await asyncio.wait_for(
                asyncio.get_running_loop().getaddrinfo(
                    host, port, family=family, type=socket.SOCK_STREAM,
                    proto=socket.IPPROTO_TCP,
                ), timeout=5,
            )
        except (OSError, TimeoutError):
            raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Destination could not be resolved.", retryable=True) from None
        if not addresses:
            raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Destination could not be resolved.", retryable=True)
        results = []
        for address_family, _, proto, _, sockaddr in addresses:
            ip = public_ip(sockaddr[0])
            results.append({"hostname": host, "host": ip, "port": port,
                            "family": address_family, "proto": proto,
                            "flags": socket.AI_NUMERICHOST | socket.AI_NUMERICSERV})
        return results

    async def close(self) -> None:
        pass
