"""
SocialFlow <-> X internal-API bridge (single serverless Python function).

Runs twikit (no official API key) for the social publishing fallback:
  - verify:  cookies -> { user_id, username }            (no side effects)
  - login:   username/email/password -> cookies          (twikit login)
  - post:    cookies + text -> { tweet_id, url }         (real tweet)

Security:
  - Only reachable with the shared secret header `x-bridge-secret`
    (env X_BRIDGE_SECRET). No cookies/passwords are ever logged.
  - Session material is returned once to SocialFlow's API and stored there
    encrypted; this function is stateless.

Terms of Service: this uses X's internal web API. Automated access through
non-public interfaces violates X's Terms. Accounts doing this can be locked or
suspended. Deploy operationally only with the account owner's consent.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import math
import os
import random
import re
import sys
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urljoin

import bs4
import httpx

_raw_secret = os.environ.get("X_BRIDGE_SECRET")
if not _raw_secret:
    _jwt = os.environ.get("JWT_SECRET", "")
    _raw_secret = (
        hashlib.sha256(f"socialflow-x-bridge:{_jwt}".encode()).hexdigest() if _jwt else ""
    )
SECRET = _raw_secret

# Keep imports lazy-friendly but still share one module-level client per warm
# instance: twikit caches X's client-transaction parameters per process.
from twikit import Client  # noqa: E402
# ── Vendored x-web transaction signer ────────────────────────────────
"""
X client-transaction-id generator for the current x-web build.

twikit 2.3.3 (latest release) still parses the old responsive-web page and fails
with "Couldn't get KEY_BYTE indices" since X moved to the x-web/Vite frontend.
This module is a vendored, dependency-trimmed adaptation of twscrape's
`twscrape/xclid.py` (MIT License), which is actively maintained and handles the
new build:

  https://github.com/vladkens/twscrape

The algorithm itself originates from XClientTransaction by @SarabjitDhiman (MIT)
and twscrape's implementation. Attribution is kept in the comments below.

Only used by the unofficial X session bridge; official OAuth publishing never
touches this code.
"""
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)


class XClIdError(Exception):
    pass


def _script_url(k: str, v: str) -> str:
    return f"https://abs.twimg.com/responsive-web/client-web/{k}.{v}.js"


# Current X web build (Vite): script bundles are linked directly in the page
# HTML under https://abs.twimg.com/x-web/.../*.js (modulepreload links + entry).
ASSET_URL_RE = re.compile(r"https://[\w.-]+/x-web/[\w./-]+\.js")
RESPONSIVE_WEB_URL_RE = re.compile(r"https://[\w.-]+/responsive-web/client-web/[\w./-]+\.js")
LEGACY_MAIN_RE = re.compile(r"/client-web/main\.([^.\"']+)\.js")
CHALLENGE_SCRIPT_RE = re.compile(r"/cdn-cgi/challenge-platform/(?:scripts|h)/")


def get_scripts_list(text: str) -> list[str]:
    """
    Extract all known script URL formats from the X page HTML.

    Current x-web/Vite and responsive-web scripts can be linked directly. The
    legacy webpack build embeds two maps and requires URL reconstruction:
      - Hash map  {chunk_id: "hexchars"}             values are exactly 7 or 16 lowercase hex digits
      - Name map  {chunk_id: "human_readable_name"}  values contain non-hex characters
    URL format: https://abs.twimg.com/responsive-web/client-web/{name}.{hash}a.js
    """
    urls = ASSET_URL_RE.findall(text) + RESPONSIVE_WEB_URL_RE.findall(text)
    if main_match := LEGACY_MAIN_RE.search(text):
        urls.append(_script_url("main", main_match.group(1)))

    if not urls and CHALLENGE_SCRIPT_RE.search(text):
        raise XClIdError("Cloudflare challenge page served instead of X web app")

    hash_map = {
        m.group(1): m.group(2)
        for m in re.finditer(r'(\d+):"([0-9a-f]{7}|[0-9a-f]{16})"', text)
    }
    name_map: dict[str, str] = {}
    for m in re.finditer(r'(\d+):"([^"]+)"', text):
        val = m.group(2)
        if not re.fullmatch(r"[0-9a-f]{7}|[0-9a-f]{16}", val):
            name_map[m.group(1)] = val

    urls.extend(
        _script_url(name_map.get(chunk_id, chunk_id), hash_val + "a")
        for chunk_id, hash_val in hash_map.items()
    )
    if not urls:
        raise XClIdError("X web scripts not found")
    return list(dict.fromkeys(urls))


# MARK: XClientTransaction parsing

INDICES_REGEX = re.compile(r"(\(\w{1}\[(\d{1,2})\],\s*16\))+", flags=(re.VERBOSE | re.MULTILINE))

# Legacy build linked `ondemand.s.*.js`; current x-web build dynamically imports
# `sign.o-*.js` from a bundle chunk. \b guards against substring hits like
# `design.o-*.js`.
INDICES_FILE_RE = re.compile(r"(?:\.{0,2}/)?[\w./-]*?\b(?:ondemand\.s|sign\.o)[\w.-]*\.js")


class Cubic:
    def __init__(self, curves: list[float]):
        self.curves = curves

    def get_value(self, time: float) -> float:
        start_gradient = end_gradient = start = mid = 0.0
        end = 1.0
        if time <= 0.0:
            if self.curves[0] > 0.0:
                start_gradient = self.curves[1] / self.curves[0]
            elif self.curves[1] == 0.0 and self.curves[2] > 0.0:
                start_gradient = self.curves[3] / self.curves[2]
            return start_gradient * time
        if time >= 1.0:
            if self.curves[2] < 1.0:
                end_gradient = (self.curves[3] - 1.0) / (self.curves[2] - 1.0)
            elif self.curves[2] == 1.0 and self.curves[0] < 1.0:
                end_gradient = (self.curves[1] - 1.0) / (self.curves[0] - 1.0)
            return 1.0 + end_gradient * (time - 1.0)
        while start < end:
            mid = (start + end) / 2
            x_est = self.calculate(self.curves[0], self.curves[2], mid)
            if abs(time - x_est) < 0.00001:
                return self.calculate(self.curves[1], self.curves[3], mid)
            if x_est < time:
                start = mid
            else:
                end = mid
        return self.calculate(self.curves[1], self.curves[3], mid)

    @staticmethod
    def calculate(a: float, b: float, m: float) -> float:
        return 3.0 * a * (1 - m) * (1 - m) * m + 3.0 * b * (1 - m) * m * m + m * m * m


def interpolate(from_list: list[float], to_list: list[float], f: float):
    assert len(from_list) == len(to_list), f"Mismatched interpolation args {from_list}: {to_list}"
    return [a * (1 - f) + b * f for a, b in zip(from_list, to_list)]


def get_rotation_matrix(rotation: float):
    rad = math.radians(rotation)
    return [math.cos(rad), -math.sin(rad), math.sin(rad), math.cos(rad)]


def solve(value: float, min_val: float, max_val: float, rounding: bool):
    result = value * (max_val - min_val) / 255 + min_val
    return math.floor(result) if rounding else round(result, 2)


def float_to_hex(x):
    result = []
    quotient = int(x)
    fraction = x - quotient
    while quotient > 0:
        quotient = int(x / 16)
        remainder = int(x - (float(quotient) * 16))
        if remainder > 9:
            result.insert(0, chr(remainder + 55))
        else:
            result.insert(0, str(remainder))
        x = float(quotient)
    if fraction == 0:
        return "".join(result)
    result.append(".")
    while fraction > 0:
        fraction *= 16
        integer = int(fraction)
        fraction -= float(integer)
        if integer > 9:
            result.append(chr(integer + 55))
        else:
            result.append(str(integer))
    return "".join(result)


def calc_anim_key(frames: list[float], target_time: float) -> str:
    from_color = [*frames[:3], 1]
    to_color = [*frames[3:6], 1]
    from_rotation = [0.0]
    to_rotation = [solve(frames[6], 60.0, 360.0, True)]

    frames = frames[7:]
    curves = [solve(x, -1.0 if i % 2 else 0.0, 1.0, False) for i, x in enumerate(frames)]
    val = Cubic(curves).get_value(target_time)

    color = interpolate(from_color, to_color, val)
    color = [max(0, min(255, value)) for value in color]
    rotation = interpolate(from_rotation, to_rotation, val)

    matrix = get_rotation_matrix(rotation[0])
    str_arr = [format(round(value), "x") for value in color[:-1]]
    for value in matrix:
        rounded = round(value, 2)
        if rounded < 0:
            rounded = -rounded
        hex_value = float_to_hex(rounded)
        str_arr.append(
            f"0{hex_value}".lower()
            if hex_value.startswith(".")
            else hex_value
            if hex_value
            else "0"
        )
    str_arr.extend(["0", "0"])
    return re.sub(r"[.-]", "", "".join(str_arr))


def parse_vk_bytes(soup: bs4.BeautifulSoup) -> list[int]:
    el = soup.find("meta", {"name": "twitter-site-verification", "content": True})
    content = str(el.get("content")) if el and isinstance(el, bs4.Tag) else None
    if not content:
        raise XClIdError("X verification key not found")
    try:
        return list(base64.b64decode(bytes(content, "utf-8"), validate=True))
    except ValueError as e:
        raise XClIdError("Invalid X verification key") from e


def _headers() -> dict:
    return {
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
    }


async def _fetch_text(clt: httpx.AsyncClient, url: str) -> str:
    rep = await clt.get(url)
    rep.raise_for_status()
    return rep.text


# Module imports inside the x-web bundles (e.g. "./assets/startup-dynamic-*.js").
ASSET_REF_RE = re.compile(r"""["'](\.{0,2}/?(?:assets/)?[\w.-]+\.js)["']""")


async def _find_indices_url(scripts: list[str], clt: httpx.AsyncClient) -> str:
    """The indices file is dynamically imported by a bundle chunk.

    The page HTML only links the entry chunk; the signer lives one level deeper
    (entry -> assets/startup-dynamic-*.js -> ./sign.o-*.js). Crawl the module
    graph breadth-first, scanning each level concurrently and stopping at the
    first reference. This works for both the authenticated and the logged-out
    x-web build.
    """
    sem = asyncio.Semaphore(16)

    async def fetch(url: str):
        async with sem:
            try:
                return url, await _fetch_text(clt, url)
            except Exception:
                return url, None

    seen: set[str] = set()
    queue = list(dict.fromkeys(scripts))

    for _depth in range(3):
        batch = [u for u in queue if u not in seen]
        if not batch:
            break
        seen.update(batch)

        tasks = [asyncio.create_task(fetch(u)) for u in batch]
        next_queue: list[str] = []
        try:
            for fut in asyncio.as_completed(tasks):
                url, body = await fut
                if not body:
                    continue
                m = INDICES_FILE_RE.search(body)
                if m:
                    return urljoin(url, m.group(0))
                for ref in ASSET_REF_RE.findall(body):
                    next_queue.append(urljoin(url, ref))
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

        queue = next_queue

    raise XClIdError("X signing script not found in web bundles")


async def parse_anim_idx(text: str, clt: httpx.AsyncClient) -> list[int]:
    scripts = get_scripts_list(text)
    x_web_scripts = [url for url in scripts if "/x-web/" in url]
    if x_web_scripts:
        scripts = x_web_scripts

    direct = [x for x in scripts if INDICES_FILE_RE.search(x)]
    url = direct[0] if direct else await _find_indices_url(scripts, clt)
    body = await _fetch_text(clt, url)

    items = [int(x.group(2)) for x in INDICES_REGEX.finditer(body)]
    if not items:
        raise XClIdError("X signing indices not found")
    return items


def parse_anim_arr(soup: bs4.BeautifulSoup, vk_bytes: list[int]) -> list[list[float]]:
    els = list(soup.select("svg[id^='loading-x-anim'] g:first-child path:nth-child(2)"))
    els = [str(x.get("d") or "").strip() for x in els]
    if not els:
        raise XClIdError("X animation data not found")

    idx = vk_bytes[5] % len(els)
    dat = els[idx][9:].split("C")
    try:
        return [list(map(float, re.sub(r"[^\d]+", " ", x).split())) for x in dat]
    except (IndexError, ValueError) as e:
        raise XClIdError("Invalid X animation data") from e


async def _load_keys(soup: bs4.BeautifulSoup, clt: httpx.AsyncClient):
    anim_idx = await parse_anim_idx(str(soup), clt)
    vk_bytes = parse_vk_bytes(soup)
    anim_arr = parse_anim_arr(soup, vk_bytes)

    frame_time = 1
    for x in anim_idx[1:]:
        frame_time *= vk_bytes[x] % 16
    frame_time = math.floor(frame_time / 10 + 0.5) * 10  # JS Math.round to nearest 10

    frame_idx = vk_bytes[anim_idx[0]] % 16
    frame_row = anim_arr[frame_idx]
    frame_dur = float(frame_time) / 4096

    return vk_bytes, calc_anim_key(frame_row, frame_dur)


class XClIdGen:
    """Precomputed signing state. Recreate when X serves a new build."""

    @staticmethod
    async def create(cookies: dict[str, str] | None = None) -> "XClIdGen":
        # X serves a different build to authenticated vs anonymous sessions;
        # the signing data lives on an authenticated profile page.
        async with httpx.AsyncClient(
            headers=_headers(), cookies=cookies or {}, follow_redirects=True, timeout=25
        ) as clt:
            text = await _fetch_text(clt, "https://x.com/tesla")
            soup = bs4.BeautifulSoup(text, "html.parser")
            vk_bytes, anim_key = await _load_keys(soup, clt)
        return XClIdGen(vk_bytes, anim_key)

    def __init__(self, vk_bytes: list[int], anim_key: str):
        self.vk_bytes = vk_bytes
        self.anim_key = anim_key

    def calc(self, method: str, path: str) -> str:
        ts = math.floor((time.time() * 1000 - 1682924400 * 1000) / 1000)
        ts_bytes = [(ts >> (i * 8)) & 0xFF for i in range(4)]

        dkw, drn = "obfiowerehiring", 3  # default keyword and random number
        pld = f"{method.upper()}!{path}!{ts}{dkw}{self.anim_key}"
        pld = list(hashlib.sha256(pld.encode()).digest())
        pld = [*self.vk_bytes, *ts_bytes, *pld[:16], drn]

        num = random.randint(0, 255)
        out = bytearray([num, *[x ^ num for x in pld]])
        return base64.b64encode(out).decode("utf-8").strip("=")


# ── twikit client ────────────────────────────────────────────────────
from twikit import Client  # noqa: E402


class _TransactionAdapter:
    """
    twikit 2.3.3 generates the transaction id from the retired responsive-web
    page and raises "Couldn't get KEY_BYTE indices". This adapter feeds it the
    signing state computed from X's current x-web bundles instead.
    """

    # Truthy on purpose: twikit skips its own (broken) init when this is set.
    home_page_response = True

    def __init__(self, gen: XClIdGen):
        self._gen = gen

    def generate_transaction_id(self, method: str, path: str, **_kwargs) -> str:
        return self._gen.calc(method, path)


async def _session_client(auth_token: str, ct0: str) -> Client:
    """Build a twikit client authenticated by browser cookies + current signer."""
    cookies = {"auth_token": auth_token, "ct0": ct0}
    client = Client("en-US")
    client.set_cookies(cookies, clear_cookies=True)
    gen = await XClIdGen.create(cookies=cookies)
    client.client_transaction = _TransactionAdapter(gen)  # type: ignore[assignment]
    return client


def _reply(handler, status: int, payload: dict) -> None:  # noqa: ANN001
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _client() -> Client:
    client = Client("en-US")
    return client


async def _settings(client: Client) -> dict:
    response, _ = await client.v11.settings()
    return response or {}


async def _identity(client: Client) -> tuple[str, str]:
    """Returns (user_id, screen_name) for an authenticated client.

    /1.1/account/settings.json reliably exposes screen_name but not always the
    numeric id, so fall back to one profile lookup only when needed.
    """
    settings = await _settings(client)
    screen_name = settings.get("screen_name")
    if not screen_name:
        raise RuntimeError("X did not return an authenticated account")
    user_id = str(settings.get("id_str") or settings.get("id") or "")
    if not user_id:
        try:
            user_id = await client.user_id()
        except Exception:
            user_id = ""
    return user_id, screen_name


async def _do_verify(body: dict) -> dict:
    client = await _session_client(body["auth_token"], body["ct0"])
    user_id, screen_name = await _identity(client)
    return {"ok": True, "user_id": user_id, "username": screen_name}


async def _do_login(body: dict) -> dict:
    client = _client()
    # Password login starts without a session. Sign it with the anonymous build
    # when X still exposes the signing bundle there; otherwise fail early with a
    # clear pointer to the cookie flow (never hit X with an unsigned login).
    try:
        gen = await XClIdGen.create()
        client.client_transaction = _TransactionAdapter(gen)  # type: ignore[assignment]
    except Exception as exc:
        raise RuntimeError(
            f"X's sign-in flow is not signable from a logged-out page right now ({exc}). "
            "Use the 'Paste cookies' option instead."
        ) from exc
    await client.login(
        auth_info_1=body["username"],
        auth_info_2=body.get("email") or None,
        password=body["password"],
        totp_secret=body.get("totp_secret") or None,
    )
    cookies = client.get_cookies()
    auth_token = cookies.get("auth_token")
    ct0 = cookies.get("ct0")
    if not auth_token or not ct0:
        raise RuntimeError("login succeeded but the session cookies are incomplete")
    user_id, screen_name = await _identity(client)
    return {
        "ok": True,
        "auth_token": auth_token,
        "ct0": ct0,
        "user_id": user_id,
        "username": screen_name,
    }


async def _do_post(body: dict) -> dict:
    text = (body.get("text") or "").strip()
    if not text:
        raise RuntimeError("text is required")
    if len(text) > 280:
        raise RuntimeError("text exceeds 280 characters")
    client = await _session_client(body["auth_token"], body["ct0"])
    tweet = await client.create_tweet(text=text)
    tweet_id = str(getattr(tweet, "id", "") or "")
    if not tweet_id:
        raise RuntimeError("X returned no tweet id")
    settings = await _settings(client) if body.get("with_username") else {}
    username = settings.get("screen_name")
    url = (
        f"https://x.com/{username}/status/{tweet_id}"
        if username
        else f"https://x.com/i/status/{tweet_id}"
    )
    return {"ok": True, "tweet_id": tweet_id, "url": url}


ACTIONS = {
    "verify": _do_verify,
    "login": _do_login,
    "post": _do_post,
}

MAX_SECONDS = 45


class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel entrypoint contract
    def do_POST(self) -> None:  # noqa: N802
        if not SECRET or self.headers.get("x-bridge-secret") != SECRET:
            return _reply(self, 401, {"ok": False, "error": "unauthorized"})

        try:
            length = int(self.headers.get("content-length") or 0)
            if length <= 0 or length > 20_000:
                return _reply(self, 400, {"ok": False, "error": "invalid body"})
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return _reply(self, 400, {"ok": False, "error": "invalid json"})

        action = body.get("action")
        fn = ACTIONS.get(action)
        if not fn:
            return _reply(self, 400, {"ok": False, "error": f"unknown action: {action}"})

        try:
            result = asyncio.run(asyncio.wait_for(fn(body), timeout=MAX_SECONDS))
            return _reply(self, 200, result)
        except asyncio.TimeoutError:
            return _reply(self, 504, {"ok": False, "error": "X request timed out"})
        except Exception as exc:  # surface a compact reason, never credentials
            detail = f"{type(exc).__name__}: {exc}"[:300]
            print(f"[x-bridge] {action} failed: {detail}", file=sys.stderr)
            return _reply(self, 502, {"ok": False, "error": detail})
