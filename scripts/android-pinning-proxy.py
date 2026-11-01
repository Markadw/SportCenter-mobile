"""Ephemeral host-side mitmproxy addon. Emits allowlisted metadata, never raw HTTP/TLS logs."""
import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from mitmproxy import ctx
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa

class ClientCertificateObserver:
    """Registered after TlsConfig, so ssl_conn already owns the chosen local certificate."""
    name = "sport-pinning-certificate-observer"

    def __init__(self, pilot):
        self.pilot = pilot

    def tls_start_client(self, data):
        self.pilot.capture_client_certificate(data)

class PinningPilot:
    def __init__(self, config=None):
        if config is None:
            with open(os.environ["PINNING_CONFIG"], encoding="utf-8") as handle:
                config = json.load(handle)
        self.config = config
        self.connections = {}
        self.client_certificates = {}
        self.sequence = 0

    def emit(self, event, connection=None, **fields):
        row = {"runId": self.config["runId"], "event": event, "sequence": self.sequence}
        self.sequence += 1
        if connection:
            row.update(connection)
        row.update(fields)
        with open(self.config["events"], "a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")

    def configure(self, updated):
        if ctx.options.ssl_insecure or ctx.options.add_upstream_certs_to_client_chain:
            self.emit("invalid_configuration")
            raise RuntimeError("The pilot requires verified upstream TLS and no upstream chain injection")

    def running(self):
        # ScriptLoader precedes TlsConfig in12.3.1. A top-level observer added now runs after both.
        manager = ctx.master.addons
        if manager.get("tlsconfig") is None or manager.get(ClientCertificateObserver.name) is not None:
            self.emit("invalid_configuration")
            raise RuntimeError("The certificate observer could not be ordered after TlsConfig")
        manager.add(ClientCertificateObserver(self))

    def tls_clienthello(self, data):
        try:
            with open(self.config["phaseFile"], encoding="utf-8") as handle:
                phase = handle.read().strip()
            host = data.client_hello.sni or ""
            port = data.context.server.address[1] if data.context.server.address else 0
            conn = {"phase": phase, "host": host, "connId": data.context.client.id}
            self.connections[data.context.client.id] = conn
            if phase not in ("control", "attack"):
                data.ignore_connection = True
                self.emit("addon_error", conn)
                return
            intercept = port == 443 and (
                (phase == "control" and host == self.config["imageHost"])
                or (phase == "attack" and host == self.config["apiHost"])
            )
            data.ignore_connection = not intercept
            if intercept:
                data.establish_server_tls_first = True
                self.emit("intercept", conn)
            elif host == self.config["apiHost"]:
                self.emit("passthrough", conn)
        except Exception:
            data.ignore_connection = True
            self.emit("addon_error")

    def connection(self, data):
        return self.connections.get(data.context.client.id)

    @staticmethod
    def invalid_certificate():
        return {"valid": False, "pinMatches": True}

    def certificate(self, data, host):
        try:
            # TlsData.ssl_conn is available for both successful and failed handshakes.
            # Client.mitmcert is not populated by TlsConfig12.3.1: use the local SSL certificate.
            if data.conn is not data.context.client or data.ssl_conn is None:
                return self.invalid_certificate()
            cert = data.ssl_conn.get_certificate(as_cryptography=True)
            if cert is None:
                return self.invalid_certificate()
            with open(self.config["caFile"], "rb") as handle:
                ca = x509.load_pem_x509_certificate(handle.read())
            now = datetime.now(timezone.utc)
            names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.DNSName)
            matches = any(name == host or (name.startswith("*.") and host.count(".") == name.count(".") and host.endswith(name[1:])) for name in names)
            public = ca.public_key()
            if isinstance(public, rsa.RSAPublicKey):
                public.verify(cert.signature, cert.tbs_certificate_bytes, padding.PKCS1v15(), cert.signature_hash_algorithm)
            elif isinstance(public, ec.EllipticCurvePublicKey):
                public.verify(cert.signature, cert.tbs_certificate_bytes, ec.ECDSA(cert.signature_hash_algorithm))
            else:
                return self.invalid_certificate()
            try:
                leaf_is_ca = cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
            except x509.ExtensionNotFound:
                # RFC5280: absence means not a CA. Mitmproxy12.3.1 dummy_cert omits this leaf extension.
                leaf_is_ca = False
            server_usage = x509.oid.ExtendedKeyUsageOID.SERVER_AUTH in cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
            digests = [
                base64.b64encode(hashlib.sha256(c.public_key().public_bytes(
                    serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)).digest()).decode("ascii")
                for c in (cert, ca)
            ]
            valid = (
                cert.issuer == ca.subject and matches and server_usage and not leaf_is_ca
                and cert.not_valid_before_utc <= now <= cert.not_valid_after_utc
                and ca.not_valid_before_utc <= now <= ca.not_valid_after_utc
                and ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
            )
            return {"valid": valid, "pinMatches": any(pin in self.config["pins"] for pin in digests),
                    "caSha256": ca.fingerprint(hashes.SHA256()).hex(), "leafSha256": cert.fingerprint(hashes.SHA256()).hex()}
        except Exception:
            return self.invalid_certificate()

    def capture_client_certificate(self, data):
        conn = self.connection(data)
        if conn:
            cert = self.certificate(data, conn["host"])
            self.client_certificates[conn["connId"]] = {"ssl_conn": data.ssl_conn, "cert": cert}
            self.emit("client_cert_ready", conn, cert=cert)

    def bound_certificate(self, data, conn):
        captured = self.client_certificates.get(conn["connId"])
        cert = self.certificate(data, conn["host"])
        if (captured is None or data.ssl_conn is not captured["ssl_conn"]
                or cert.get("leafSha256") != captured["cert"].get("leafSha256")):
            return self.invalid_certificate()
        return cert

    def tls_established_client(self, data):
        conn = self.connection(data)
        if conn:
            self.emit("client_tls_ok", conn, cert=self.bound_certificate(data, conn))

    def tls_failed_client(self, data):
        conn = self.connection(data)
        if conn:
            reason = (data.conn.error or "").lower()
            category = "certificate_rejected" if any(text in reason for text in (
                "alert unknown ca", "alert bad certificate", "alert certificate unknown", "alert certificate expired",
                "alert certificate revoked", "alert certificate required", "alert unsupported certificate",
            )) else "other_or_ambiguous"
            self.emit("client_tls_failed", conn, cert=self.bound_certificate(data, conn), failureCategory=category)

    def tls_established_server(self, data):
        conn = self.connection(data)
        if conn:
            self.emit("server_tls_ok", conn)

    def tls_failed_server(self, data):
        conn = self.connection(data)
        if conn:
            self.emit("server_tls_failed", conn)

    def request(self, flow):
        conn = self.connections.get(flow.client_conn.id)
        if not conn:
            return
        if conn["host"] == self.config["apiHost"]:
            self.emit("api_http_received", conn)
            flow.kill()
        elif flow.request.method not in ("GET", "HEAD"):
            self.emit("forbidden_request", conn)
            flow.kill()

    def response(self, flow):
        conn = self.connections.get(flow.client_conn.id)
        if conn and conn["host"] == self.config["imageHost"]:
            content_type = flow.response.headers.get("content-type", "").split(";")[0].lower()
            if content_type.startswith("image/") and flow.response.raw_content:
                self.emit("image_response", conn, status=flow.response.status_code)

    def client_disconnected(self, client):
        self.connections.pop(client.id, None)
        self.client_certificates.pop(client.id, None)

addons = [PinningPilot()]
