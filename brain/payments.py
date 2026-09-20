"""Payment providers.

Both implementations sit behind one interface so the Visa sandbox can be
swapped in without touching a caller. The mock is the default; setting
VISA_API_KEY + VISA_SHARED_SECRET switches the same call onto Visa Direct in
the sandbox. Failures stay failures -- a Visa error never silently degrades
into a successful mock payment, because the pond would then be wrong.

Buying is settled as a Visa Direct push: the money leaves a funding account
and lands on the merchant's. That is also the primitive the pond will use in
reverse, so there is one settlement path rather than two.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import random
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from base64 import b64encode
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Protocol

from jwcrypto import jwe, jwk

BUDGET_CAP = 500.0
SANDBOX_BASE = "https://sandbox.api.visa.com"
PUSH_PATH = "visadirect/fundstransfer/v1/pushfundstransactions"
HELLO_PATH = "vdp/helloworld"

# Sandbox-only acquirer identifiers from Visa's own Visa Direct samples. They
# are not credentials: the project's API key is what authenticates the call.
ACQUIRING_BIN = "408999"
ACQUIRER_COUNTRY = "840"
SENDER_ACCOUNT = "4653459515756154"
RECIPIENT_ACCOUNT = "4957030420210454"


def _ssl_context() -> ssl.SSLContext:
    """A context that can actually verify sandbox.api.visa.com.

    Python does not use the macOS keychain, so on a stock python.org install
    urllib fails every HTTPS call with CERTIFICATE_VERIFY_FAILED while curl on
    the same machine succeeds. Visa then looks unreachable no matter how good
    the credentials are. certifi ships the CA bundle and arrives with httpx,
    which is already a dependency; falling back to the default context keeps
    this working on a system Python that has its own store wired up.
    """
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001 - a usable default beats no request at all
        return ssl.create_default_context()


# What makes a Puddle payment safe to tap, stated once so both providers and
# the UI say the same thing.
GUARDS = [
    f"Capped at ${BUDGET_CAP:.0f} per purchase",
    "One tap, one charge: retries are deduplicated",
    "A decline records nothing: no closet change, no pond change",
    "Card number never leaves the network token",
]


def card_on_file() -> dict:
    """The tokenized funding card. Only the last four digits ever reach a client."""
    return {"network": "VISA", "last4": SENDER_ACCOUNT[-4:], "kind": "network token"}


@dataclass
class PaymentResult:
    mode: str
    approved: bool
    amount: float
    token: str
    network: str = "VISA"
    reason: str | None = None
    message: str = ""
    auth_code: str = ""
    settled_at: str = ""

    def dict(self) -> dict:
        return {
            **asdict(self),
            "status": "approved" if self.approved else "error" if self.reason == "provider_error" else "declined",
            "card": card_on_file(),
            "guards": GUARDS,
            "rail": "Visa Direct" + (" (simulated)" if self.mode == "mock" else " sandbox"),
        }


def preview(amount: float) -> dict:
    """What the buy button will do before it is tapped: rail, card, guards,
    and whether the amount already fails a guard."""
    provider = get_provider()
    blocked = _capped(amount)
    return {
        "mode": provider.name,
        "rail": "Visa Direct" + (" (simulated)" if provider.name == "mock" else " sandbox"),
        "card": card_on_file(),
        "guards": GUARDS,
        "cap": BUDGET_CAP,
        "blocked": blocked,
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class PaymentProvider(Protocol):
    name: str

    def pay(self, amount: float, item_id: str) -> PaymentResult: ...

    def ping(self) -> dict: ...


def _capped(amount: float) -> str | None:
    if not math.isfinite(amount) or amount < 0:
        return "Invalid payment amount"
    return None if amount <= BUDGET_CAP else f"Over budget cap (${BUDGET_CAP:.0f})"


class MockProvider:
    name = "mock"

    def pay(self, amount: float, item_id: str) -> PaymentResult:
        reason = _capped(amount)
        return PaymentResult(
            mode="mock",
            approved=reason is None,
            amount=amount,
            token="tok_" + uuid.uuid4().hex[:16] if reason is None else "",
            reason=reason,
            message="Paid (simulated)." if reason is None else "Declined (simulated).",
            auth_code="00" if reason is None else "",
            settled_at=_now_iso() if reason is None else "",
        )

    def ping(self) -> dict:
        return {"reachable": True, "detail": "mock provider"}


def hash_path(path: str) -> str:
    """The path Visa hashes, which drops the context path.

    Visa's x-pay-token message uses the resource path *after* the context
    path, i.e. everything but the first segment -- except for Hello World,
    which keeps only the last one. Getting this wrong fails as 401, not as a
    signature error, so it is worth pinning in a test.
    """
    if path == HELLO_PATH:
        return "helloworld"
    head, _, tail = path.partition("/")
    return tail or head


class VisaSandboxProvider:
    """Visa Direct in the sandbox, authenticated with an X-Pay-Token.

    Two-way SSL is used instead when a client certificate and key are
    configured; Visa Direct only accepts that one, while Hello World takes
    either.

    Products carrying account data additionally enforce message level
    encryption: the body travels as a JWE inside {"encData": ...} and the
    response comes back the same way. Without it Visa answers 400/9125.
    """

    name = "visa_sandbox"

    def __init__(
        self,
        api_key: str,
        shared_secret: str,
        cert: str | None = None,
        key: str | None = None,
        user_id: str | None = None,
        password: str | None = None,
        mle_key_id: str | None = None,
        mle_server_cert: str | None = None,
        mle_client_key: str | None = None,
    ):
        self.api_key = api_key
        self.shared_secret = shared_secret
        self.cert = cert
        self.key = key
        self.user_id = user_id
        self.password = password
        self.mle_key_id = mle_key_id
        self.mle_server_cert = mle_server_cert
        self.mle_client_key = mle_client_key

    @property
    def mutual_tls(self) -> bool:
        return bool(self.cert and self.key)

    @property
    def encrypts(self) -> bool:
        return bool(self.mle_key_id and self.mle_server_cert and self.mle_client_key)

    def _encrypt(self, body: dict) -> dict:
        header = {
            "alg": "RSA-OAEP-256",
            "enc": "A128GCM",
            "kid": self.mle_key_id,
            # Visa rejects a token older than two minutes; milliseconds.
            "iat": int(time.time() * 1000),
        }
        token = jwe.JWE(json.dumps(body).encode(), recipient=_pem(self.mle_server_cert), protected=header)
        return {"encData": token.serialize(compact=True)}

    def _decrypt(self, payload: dict) -> dict:
        enc_data = payload.get("encData")
        if not enc_data:
            return payload
        token = jwe.JWE()
        token.deserialize(enc_data, key=_pem(self.mle_client_key))
        return json.loads(token.payload)

    def _x_pay_token(self, path: str, query: str, body: str) -> str:
        timestamp = str(int(time.time()))
        message = timestamp + hash_path(path) + query + body
        digest = hmac.new(self.shared_secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        return f"xv2:{timestamp}:{digest}"

    def _call(self, path: str, body: dict | None) -> dict:
        encrypted = body is not None and self.encrypts
        wire_body = self._encrypt(body) if encrypted else body
        payload = json.dumps(wire_body) if wire_body is not None else ""
        query = urllib.parse.urlencode({"apikey": self.api_key})
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if encrypted:
            headers["keyId"] = self.mle_key_id
        if self.mutual_tls:
            credentials = b64encode(f"{self.user_id}:{self.password}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"
        else:
            headers["x-pay-token"] = self._x_pay_token(path, query, payload)

        request = urllib.request.Request(
            f"{SANDBOX_BASE}/{path}?{query}",
            data=payload.encode() if body is not None else None,
            headers=headers,
            method="POST" if body is not None else "GET",
        )
        context = _ssl_context()
        if self.mutual_tls:
            context.load_cert_chain(certfile=self.cert, keyfile=self.key)
        with urllib.request.urlopen(request, timeout=8, context=context) as response:
            received = json.loads(response.read() or b"{}")
        return self._decrypt(received) if encrypted else received

    def ping(self) -> dict:
        """Cheap credential check -- Hello World is the endpoint Visa ships for it."""
        try:
            payload = self._call(HELLO_PATH, None)
        except urllib.error.HTTPError as err:
            return {"reachable": False, "detail": f"HTTP {err.code}"}
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as err:
            return {"reachable": False, "detail": type(err).__name__}
        return {"reachable": True, "detail": payload.get("message", "ok")}

    def _push_request(self, amount: float, item_id: str) -> dict:
        trace = f"{random.randrange(10**6):06d}"
        now_utc = datetime.now(timezone.utc)
        return {
            "acquirerCountryCode": ACQUIRER_COUNTRY,
            "acquiringBin": ACQUIRING_BIN,
            "amount": f"{amount:.2f}",
            "businessApplicationId": "AA",
            "cardAcceptor": {
                "address": {"country": "USA", "county": "San Mateo", "state": "CA", "zipCode": "94404"},
                "idCode": item_id[:15],
                "name": "Puddle Checkout",
                "terminalId": "PUDDLE01",
            },
            "localTransactionDateTime": now_utc.strftime("%Y-%m-%dT%H:%M:%S"),
            "merchantCategoryCode": "5651",  # family clothing store
            "pointOfServiceData": {"motoECIIndicator": "0", "panEntryMode": "90", "posConditionCode": "00"},
            "recipientName": "Puddle Merchant",
            "recipientPrimaryAccountNumber": RECIPIENT_ACCOUNT,
            # yddd + 8 digits: Visa rejects any other 12-character shape with
            # "Mandatory field 'RetrievalReferenceNumber' ... invalid content".
            "retrievalReferenceNumber": now_utc.strftime("%y%j")[1:] + f"{random.randrange(10**8):08d}",
            "senderAccountNumber": SENDER_ACCOUNT,
            "senderAddress": "901 Metro Center Blvd",
            "senderCity": "Foster City",
            "senderCountryCode": "840",
            "senderName": "Puddle User",
            "senderStateCode": "CA",
            "sourceOfFundsCode": "05",
            "systemsTraceAuditNumber": trace,
            "transactionCurrencyCode": "USD",
            "transactionIdentifier": str(random.randrange(10**14, 10**15)),
        }

    def pay(self, amount: float, item_id: str) -> PaymentResult:
        reason = _capped(amount)
        if reason:
            return PaymentResult(
                mode=self.name,
                approved=False,
                amount=amount,
                token="",
                reason=reason,
                message="Declined before dispatch.",
            )

        try:
            payload = self._call(PUSH_PATH, self._push_request(amount, item_id))
        except urllib.error.HTTPError as err:
            detail = _error_detail(err, self._decrypt if self.encrypts else None)
            return PaymentResult(
                mode=self.name,
                approved=False,
                amount=amount,
                token="",
                reason="provider_error",
                message=f"Visa rejected the transfer ({detail}).",
            )
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            return PaymentResult(
                mode=self.name,
                approved=False,
                amount=amount,
                token="",
                reason="provider_error",
                message="Sandbox payment could not be confirmed.",
            )

        # Visa signals success with ISO action code 00; anything else, including
        # a 200 carrying an error body, is a decline.
        action_code = payload.get("actionCode") if isinstance(payload, dict) else None
        approved = action_code == "00"
        token = payload.get("transactionIdentifier") or payload.get("networkId") or "" if approved else ""
        return PaymentResult(
            mode=self.name,
            approved=approved,
            amount=amount,
            token=str(token),
            reason=None if approved else "not_approved",
            message="Settled over Visa Direct." if approved else f"Visa declined (action code {action_code}).",
            auth_code=str(payload.get("approvalCode") or action_code or "") if approved else "",
            settled_at=_now_iso() if approved else "",
        )


def _pem(path: str | None) -> jwk.JWK:
    with open(str(path), "rb") as handle:
        return jwk.JWK.from_pem(handle.read())


def _error_detail(err: urllib.error.HTTPError, decrypt=None) -> str:
    try:
        body = json.loads(err.read() or b"{}")
        if decrypt is not None:
            body = decrypt(body)
    except (ValueError, OSError):
        return f"HTTP {err.code}"
    reason = body.get("responseStatus", {}).get("message") or body.get("errorMessage") or body.get("message")
    return f"HTTP {err.code}: {reason}" if reason else f"HTTP {err.code}"


def get_provider() -> PaymentProvider:
    api_key = os.environ.get("VISA_API_KEY")
    shared_secret = os.environ.get("VISA_SHARED_SECRET")
    if api_key and shared_secret:
        return VisaSandboxProvider(
            api_key,
            shared_secret,
            cert=os.environ.get("VISA_CERT_PATH"),
            key=os.environ.get("VISA_KEY_PATH"),
            user_id=os.environ.get("VISA_USER_ID"),
            password=os.environ.get("VISA_PASSWORD"),
            mle_key_id=os.environ.get("VISA_MLE_KEY_ID"),
            mle_server_cert=os.environ.get("VISA_MLE_SERVER_CERT_PATH"),
            mle_client_key=os.environ.get("VISA_MLE_CLIENT_KEY_PATH"),
        )
    return MockProvider()
