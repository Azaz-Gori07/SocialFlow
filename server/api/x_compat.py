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
import asyncio
import hashlib
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

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
from xclid import XClIdGen  # noqa: E402


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
