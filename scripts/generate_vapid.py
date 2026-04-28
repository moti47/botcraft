#!/usr/bin/env python3
"""Generate a VAPID key pair for Web Push using the cryptography library.

Usage:
    python scripts/generate_vapid.py

Requires: pip install cryptography
(cryptography is already a transitive dependency of most FastAPI stacks.)

No py-vapid, no f-string backslashes, no shell-escaping issues.
"""
import base64

from cryptography.hazmat.primitives.asymmetric.ec import (
    SECP256R1,
    generate_private_key,
)
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


def b64url(data: bytes) -> str:
    """Standard Base64-URL encoding, no padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> None:
    private_key = generate_private_key(SECP256R1())
    public_key = private_key.public_key()

    # Public key — uncompressed point: 0x04 || X (32 bytes) || Y (32 bytes) = 65 bytes total
    pub_bytes = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)

    # Private key — raw 32-byte big-endian integer
    priv_int = private_key.private_numbers().private_value
    priv_bytes = priv_int.to_bytes(32, "big")

    pub_b64 = b64url(pub_bytes)
    priv_b64 = b64url(priv_bytes)

    print("# Add these to your .env file (backend):")
    print("VAPID_PUBLIC_KEY=" + pub_b64)
    print("VAPID_PRIVATE_KEY=" + priv_b64)
    print("VAPID_SUBJECT=mailto:motivk4716@gmail.com")
    print()
    print("# Add this to dashboard/.env (or docker-compose environment):")
    print("VITE_VAPID_PUBLIC_KEY=" + pub_b64)


if __name__ == "__main__":
    main()
