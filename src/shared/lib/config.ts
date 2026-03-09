// VULN: Hardcoded Secrets — sensitive credentials in source code

// Database credentials
export const DB_HOST = "db.internal.agenticbank.com";
export const DB_PORT = 5432;
export const DB_USER = "admin";
export const DB_PASSWORD = "SuperSecret123!";
export const DB_NAME = "agentic_bank_prod";

// JWT configuration
export const JWT_SECRET = "my-jwt-secret-key-do-not-share-2024";
export const JWT_EXPIRY = "24h";

// Third-party API keys
export const STRIPE_SECRET_KEY = "sk_test_FAKE_KEY_FOR_SAST_TESTING_ONLY_not_real";
export const STRIPE_WEBHOOK_SECRET = "whsec_FAKE_WEBHOOK_SECRET_FOR_TESTING";
export const SENDGRID_API_KEY = "SG.FAKE_SENDGRID_KEY_FOR_SAST_TESTING.notreal";
export const AWS_ACCESS_KEY_ID = "AKIA_FAKE_KEY_FOR_TESTING";
export const AWS_SECRET_ACCESS_KEY = "FAKE_AWS_SECRET_KEY_FOR_SAST_SCANNER_TESTING";

// Internal service tokens
export const INTERNAL_API_TOKEN = "tok_internal_9f8e7d6c5b4a3210";
export const ADMIN_BYPASS_CODE = "ADMIN-OVERRIDE-2024";

// Encryption key (used for PII)
export const ENCRYPTION_KEY = "aes-256-key-do-not-commit-to-repo";
export const ENCRYPTION_IV = "1234567890abcdef";
