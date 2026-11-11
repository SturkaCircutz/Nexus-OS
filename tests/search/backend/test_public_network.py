"""Validate URL and connection-time DNS controls without network access."""

import asyncio
import socket
import ssl

import aiohttp
import pytest

from search.errors import RetrievalError
from search.http import PublicHttpFetcher
from search.models import SearchErrorCode
from search.network import PublicResolver, public_ip, public_url


@pytest.mark.parametrize("url", [
    "file:///etc/passwd", "ftp://example.org/a", "http://localhost/", "http://host.local/",
    "http://host.internal/", "http://host.home.arpa/", "http://localhost./",
    "http://127.0.0.1/", "http://10.1.1.1/", "http://169.254.169.254/",
    "http://100.64.0.1/", "http://192.168.1.1/", "http://0.0.0.0/",
    "http://[::1]/", "http://[fc00::1]/", "http://[fe80::1%25en0]/",
    "http://[::ffff:127.0.0.1]/", "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/", "http://224.0.0.1/",
    "https://user:pass@example.org/", "https://example.org:8000/",
    "https://example.org/\r\nHost:localhost", "https://example.org\\@127.0.0.1/",
])
def test_reject_unsafe_urls(url):
    with pytest.raises(RetrievalError) as caught:
        public_url(url)
    assert caught.value.detail.code == SearchErrorCode.UNSAFE_URL


def test_public_url_preserves_destination_and_normalizes_host():
    assert str(public_url("https://EXAMPLE.org/page?a=1#part")) == "https://example.org/page?a=1"
    assert public_ip("2606:4700:4700::1111") == "2606:4700:4700::1111"
    assert public_ip("1.1.1.1") == "1.1.1.1"


def addresses(*ips):
    return [(socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM,
             socket.IPPROTO_TCP, "", (ip, 443)) for ip in ips]


async def test_mixed_dns_answers_fail_closed(monkeypatch):
    async def resolve(*args, **kwargs):
        return addresses("1.1.1.1", "127.0.0.1")
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    with pytest.raises(RetrievalError):
        await PublicResolver().resolve("example.org", 443)


async def test_connector_receives_only_validated_ips_and_rechecks_dns(monkeypatch):
    calls = []
    async def resolve(host, port, **kwargs):
        calls.append((host, port))
        return addresses("1.1.1.1" if len(calls) == 1 else "127.0.0.1")
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    async with PublicHttpFetcher()._session() as session:
        assert not session.trust_env
        assert isinstance(session.cookie_jar, aiohttp.DummyCookieJar)
        connector = session.connector
        assert connector._ssl.verify_mode == ssl.CERT_REQUIRED
        assert connector._ssl.check_hostname
        resolved = await connector._resolve_host("example.org", 443)
        assert resolved[0]["host"] == "1.1.1.1"
        assert resolved[0]["hostname"] == "example.org"
        assert resolved[0]["flags"] & socket.AI_NUMERICHOST
        with pytest.raises(RetrievalError):
            await connector._resolve_host("example.org", 443)
    assert len(calls) == 2


@pytest.mark.parametrize("host", ["2130706433", "0177.0.0.1", "0x7f000001"])
async def test_legacy_ip_spellings_are_rejected_after_resolution(monkeypatch, host):
    async def resolve(*args, **kwargs): return addresses("127.0.0.1")
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    with pytest.raises(RetrievalError):
        await PublicResolver().resolve(host, 80)


async def test_dns_failure_is_sanitized(monkeypatch):
    async def resolve(*args, **kwargs): raise socket.gaierror("private resolver information")
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    with pytest.raises(RetrievalError) as caught:
        await PublicResolver().resolve("example.org", 443)
    assert "private" not in str(caught.value)


async def test_actual_http_connector_uses_validated_numeric_address(monkeypatch):
    import aiohappyeyeballs
    calls = []
    sockets = []
    async def resolve(*args, **kwargs):
        calls.append(args)
        return addresses("1.1.1.1" if len(calls) == 1 else "127.0.0.1")
    async def connect(*args, **kwargs):
        sockets.extend(kwargs["addr_infos"])
        raise OSError("stop before opening a real socket")
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(aiohappyeyeballs, "start_connection", connect)
    with pytest.raises(RetrievalError):
        await PublicHttpFetcher().fetch("https://example.org/")
    assert len(calls) == 1
    assert sockets
    assert all(info[4][0] == "1.1.1.1" for info in sockets)


async def test_private_dns_never_reaches_socket_creation(monkeypatch):
    import aiohappyeyeballs
    async def resolve(*args, **kwargs): return addresses("127.0.0.1")
    async def connect(*args, **kwargs): pytest.fail("unsafe address reached socket creation")
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(aiohappyeyeballs, "start_connection", connect)
    with pytest.raises(RetrievalError) as caught:
        await PublicHttpFetcher().fetch("https://example.org/")
    assert caught.value.detail.code == SearchErrorCode.UNSAFE_URL
