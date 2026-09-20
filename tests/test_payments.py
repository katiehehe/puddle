"""Visa Direct wiring. The network is stubbed; the request Visa sees is not."""

import hashlib
import hmac
import io
import json
import ssl
import urllib.error

from jwcrypto import jwe, jwk

from brain import payments


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def _capture(monkeypatch, body: dict, status: int = 200):
    seen = {}

    def urlopen(request, timeout=None, context=None):
        seen["url"] = request.full_url
        seen["method"] = request.method
        seen["headers"] = {k.lower(): v for k, v in request.headers.items()}
        seen["body"] = json.loads(request.data) if request.data else None
        if status >= 400:
            raise urllib.error.HTTPError(request.full_url, status, "err", {}, io.BytesIO(json.dumps(body).encode()))
        return _Response(json.dumps(body).encode())

    monkeypatch.setattr(payments.urllib.request, "urlopen", urlopen)
    return seen


def test_hash_path_drops_the_context_path():
    assert payments.hash_path(payments.PUSH_PATH) == "fundstransfer/v1/pushfundstransactions"
    assert payments.hash_path(payments.HELLO_PATH) == "helloworld"


def test_x_pay_token_signs_the_path_query_and_body(monkeypatch):
    provider = payments.VisaSandboxProvider("key123", "secret456")
    seen = _capture(monkeypatch, {"actionCode": "00", "transactionIdentifier": "9"})
    provider.pay(128.0, "sku_991")

    token = seen["headers"]["x-pay-token"]
    prefix, timestamp, digest = token.split(":")
    message = timestamp + "fundstransfer/v1/pushfundstransactions" + "apikey=key123" + json.dumps(seen["body"])
    assert prefix == "xv2"
    assert digest == hmac.new(b"secret456", message.encode(), hashlib.sha256).hexdigest()
    assert seen["url"].endswith("/visadirect/fundstransfer/v1/pushfundstransactions?apikey=key123")


def test_push_request_carries_the_amount_and_item(monkeypatch):
    provider = payments.VisaSandboxProvider("k", "s")
    seen = _capture(monkeypatch, {"actionCode": "00"})
    provider.pay(45.5, "sku_991")

    body = seen["body"]
    assert body["amount"] == "45.50"
    assert body["cardAcceptor"]["idCode"] == "sku_991"
    assert len(body["systemsTraceAuditNumber"]) == 6
    assert len(body["retrievalReferenceNumber"]) == 12


def test_only_action_code_00_is_approved(monkeypatch):
    provider = payments.VisaSandboxProvider("k", "s")

    _capture(monkeypatch, {"actionCode": "00", "transactionIdentifier": "38122864943"})
    approved = provider.pay(100.0, "sku_991")
    assert approved.approved is True and approved.token == "38122864943"

    _capture(monkeypatch, {"actionCode": "85"})
    declined = provider.pay(100.0, "sku_991")
    assert declined.approved is False
    assert declined.reason == "not_approved" and declined.token == ""


def test_http_error_surfaces_visa_message(monkeypatch):
    provider = payments.VisaSandboxProvider("k", "s")
    _capture(monkeypatch, {"responseStatus": {"message": "Invalid API key"}}, status=401)
    result = provider.pay(100.0, "sku_991").dict()
    assert result["status"] == "error"
    assert "Invalid API key" in result["message"]


def test_mutual_tls_uses_basic_auth_instead_of_a_token(monkeypatch, tmp_path):
    cert, key = tmp_path / "cert.pem", tmp_path / "key.pem"
    cert.write_text("x")
    key.write_text("x")
    provider = payments.VisaSandboxProvider("k", "s", cert=str(cert), key=str(key), user_id="u", password="p")

    loaded = {}
    monkeypatch.setattr(
        payments.ssl.SSLContext,
        "load_cert_chain",
        lambda self, certfile, keyfile: loaded.update(certfile=certfile, keyfile=keyfile),
    )
    seen = _capture(monkeypatch, {"actionCode": "00"})
    provider.pay(10.0, "sku_991")

    assert "x-pay-token" not in seen["headers"]
    assert seen["headers"]["authorization"].startswith("Basic ")
    assert loaded == {"certfile": str(cert), "keyfile": str(key)}


def test_ping_reports_unreachable_without_raising(monkeypatch):
    provider = payments.VisaSandboxProvider("k", "s")
    _capture(monkeypatch, {}, status=401)
    assert provider.ping() == {"reachable": False, "detail": "HTTP 401"}

    _capture(monkeypatch, {"message": "helloworld"})
    assert provider.ping()["reachable"] is True


def test_ssl_context_can_verify_a_public_certificate_chain():
    """Python does not use the macOS keychain. On a stock python.org install
    urllib fails every HTTPS call with CERTIFICATE_VERIFY_FAILED while curl on
    the same machine succeeds, so Visa looks unreachable however good the
    credentials are. This pins that we build a context with real CAs loaded."""
    from brain.payments import _ssl_context

    ctx = _ssl_context()
    assert ctx.verify_mode == ssl.CERT_REQUIRED
    assert ctx.get_ca_certs(), "SSL context has no CA certificates -- HTTPS will fail"


def test_mutual_tls_still_verifies_the_server():
    """Loading a client certificate must not turn server verification off."""
    from brain.payments import VisaSandboxProvider, _ssl_context

    provider = VisaSandboxProvider("k", "s", cert="/nope.pem", key="/nope.key")
    assert provider.mutual_tls is True
    # the shared context builder is what the mTLS path starts from
    assert _ssl_context().verify_mode == ssl.CERT_REQUIRED


def _mle_provider(tmp_path):
    """A provider wired for MLE, with one key pair standing in for both legs."""
    key = jwk.JWK.generate(kty="RSA", size=2048)
    private_pem, public_pem = tmp_path / "client_key.pem", tmp_path / "server_cert.pem"
    private_pem.write_bytes(key.export_to_pem(private_key=True, password=None))
    public_pem.write_bytes(key.export_to_pem())
    provider = payments.VisaSandboxProvider(
        "k",
        "s",
        mle_key_id="key-id-1",
        mle_server_cert=str(public_pem),
        mle_client_key=str(private_pem),
    )
    return provider, key


def test_mle_encrypts_the_request_and_decrypts_the_response(monkeypatch, tmp_path):
    provider, key = _mle_provider(tmp_path)

    def urlopen(request, timeout=None, context=None):
        sent = json.loads(request.data)
        assert set(sent) == {"encData"}
        assert request.headers["Keyid"] == "key-id-1"

        inbound = jwe.JWE()
        inbound.deserialize(sent["encData"], key=key)
        assert json.loads(inbound.payload)["amount"] == "64.00"

        reply = jwe.JWE(
            json.dumps({"actionCode": "00", "transactionIdentifier": "7"}).encode(),
            recipient=key,
            protected={"alg": "RSA-OAEP-256", "enc": "A128GCM", "kid": "key-id-1"},
        )
        return _Response(json.dumps({"encData": reply.serialize(compact=True)}).encode())

    monkeypatch.setattr(payments.urllib.request, "urlopen", urlopen)
    result = provider.pay(64.0, "sku_991")
    assert result.approved is True and result.token == "7"


def test_plaintext_body_when_mle_is_not_configured(monkeypatch):
    provider = payments.VisaSandboxProvider("k", "s")
    seen = _capture(monkeypatch, {"actionCode": "00"})
    provider.pay(64.0, "sku_991")
    assert "encData" not in seen["body"] and "keyid" not in seen["headers"]


def test_partial_environment_does_not_select_the_live_provider(monkeypatch):
    monkeypatch.setenv("VISA_API_KEY", "partial")
    provider = payments.get_provider()
    assert provider.name == "visa_incomplete"
    result = provider.pay(64, "sku_991").dict()
    assert result["approved"] is False
    assert result["status"] == "error"
    assert "VISA_CERT_PATH" in result["message"]
