<?php
class Encryption {
    private const CIPHER = 'AES-256-CBC';
    private string $key;

    public function __construct(string $key) {
        // Ensure exactly 32 bytes
        $this->key = substr(hash('sha256', $key, true), 0, 32);
    }

    public function encrypt(string $plaintext): string {
        $iv         = random_bytes(openssl_cipher_iv_length(self::CIPHER));
        $ciphertext = openssl_encrypt($plaintext, self::CIPHER, $this->key, OPENSSL_RAW_DATA, $iv);
        if ($ciphertext === false) throw new RuntimeException('Encryption failed');
        return base64_encode($iv . $ciphertext);
    }

    public function decrypt(string $encoded): string {
        $raw  = base64_decode($encoded, true);
        if ($raw === false) throw new RuntimeException('Invalid encrypted data');
        $ivLen      = openssl_cipher_iv_length(self::CIPHER);
        $iv         = substr($raw, 0, $ivLen);
        $ciphertext = substr($raw, $ivLen);
        $plain      = openssl_decrypt($ciphertext, self::CIPHER, $this->key, OPENSSL_RAW_DATA, $iv);
        if ($plain === false) throw new RuntimeException('Decryption failed');
        return $plain;
    }

    public function hash(string $value): string {
        return hash_hmac('sha256', $value, $this->key);
    }

    /** Anonymise — returns a stable display alias */
    public function anonymize(string $name): string {
        $hash = substr($this->hash(strtolower(trim($name))), 0, 8);
        return 'Customer-' . strtoupper($hash);
    }
}
