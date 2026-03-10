import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


class CredentialStore:
    SALT_LENGTH = 16
    NONCE_LENGTH = 12

    def __init__(self, master_key_passphrase: str, store_path: str = '/app/data/credentials.enc'):
        self._passphrase = master_key_passphrase.encode('utf-8')
        self.store_path = Path(store_path)

    def _derive_key(self, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=600_000
        )
        return kdf.derive(self._passphrase)

    def load(self) -> dict:
        if not self.store_path.exists():
            return {}
        raw = self.store_path.read_bytes()
        if len(raw) < self.SALT_LENGTH + self.NONCE_LENGTH + 1:
            return {}
        salt = raw[:self.SALT_LENGTH]
        nonce = raw[self.SALT_LENGTH:self.SALT_LENGTH + self.NONCE_LENGTH]
        ciphertext = raw[self.SALT_LENGTH + self.NONCE_LENGTH:]
        key = self._derive_key(salt)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return json.loads(plaintext.decode('utf-8'))

    def save(self, credentials: dict) -> None:
        salt = os.urandom(self.SALT_LENGTH)
        nonce = os.urandom(self.NONCE_LENGTH)
        key = self._derive_key(salt)
        aesgcm = AESGCM(key)
        plaintext = json.dumps(credentials).encode('utf-8')
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        self.store_path.write_bytes(salt + nonce + ciphertext)

    def get(self, section: str, key: str = None):
        creds = self.load()
        if key:
            return creds.get(section, {}).get(key)
        return creds.get(section, {})

    def update(self, section: str, values: dict) -> None:
        creds = self.load()
        if section not in creds:
            creds[section] = {}
        creds[section].update(values)
        self.save(creds)

    def list_sections(self) -> list:
        creds = self.load()
        return list(creds.keys())
