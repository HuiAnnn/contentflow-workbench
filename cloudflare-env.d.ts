declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MODEL_CONFIG_ENCRYPTION_KEY?: string;
  }
}
