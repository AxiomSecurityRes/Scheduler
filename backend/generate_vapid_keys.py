"""VAPID 키 쌍 생성 유틸리티.

사용법:
    python -m backend.generate_vapid_keys

출력된 PUBLIC/PRIVATE 키를 .env 와 frontend/js/config.js 에 넣으세요.
"""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())

    # 개인키 (raw 32바이트 -> base64url) : pywebpush 가 받는 형식
    private_value = private_key.private_numbers().private_value
    private_bytes = private_value.to_bytes(32, "big")
    private_b64 = _b64url(private_bytes)

    # 공개키 (uncompressed point 65바이트 -> base64url) : 브라우저 applicationServerKey 형식
    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = _b64url(public_bytes)

    print("VAPID 키가 생성되었습니다.\n")
    print(f"VAPID_PUBLIC_KEY={public_b64}")
    print(f"VAPID_PRIVATE_KEY={private_b64}")
    print("\nfrontend/js/config.js 의 VAPID_PUBLIC_KEY 에도 위 PUBLIC 키를 넣으세요.")


if __name__ == "__main__":
    main()
