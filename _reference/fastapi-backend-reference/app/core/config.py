"""Application configuration loaded from environment variables.

Uses pydantic-settings for type-safe, validated configuration.
Secrets are NEVER hardcoded — always read from environment.
"""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings.

    Loaded from environment variables and/or .env file.
    All fields have sensible defaults for local development.
    Production values MUST be set via environment variables.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ===== App =====
    APP_NAME: str = "Dayjoy AI Platform"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["dev", "staging", "production"] = "dev"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # ===== Database =====
    DATABASE_URL: str = "postgresql+asyncpg://dayjoy:dayjoy@localhost:5432/dayjoyai"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_ECHO: bool = False

    # ===== Redis =====
    REDIS_URL: str = "redis://localhost:6379/0"

    # ===== Security =====
    # NOTE: This is a dev default. In production, set via environment variable.
    SECRET_KEY: str = "dev-secret-key-change-in-production-min-32-chars"  # noqa: S105
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ===== CORS =====
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
    ]

    # ===== Logging =====
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: Literal["console", "json"] = "console"

    # ===== External APIs (placeholder for future phases) =====
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DEEPGRAM_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""

    # ===== LLM Provider Configuration =====
    DEFAULT_AI_PROVIDER: str = "openai"  # openai, anthropic, groq, gemini
    LLM_FALLBACK_PROVIDER: str = ""  # e.g., "anthropic" — empty = no fallback
    LLM_TEMPERATURE: float = 0.7
    LLM_MAX_TOKENS: int = 2000
    LLM_TIMEOUT: float = 30.0
    LLM_MAX_RETRIES: int = 3

    # Provider API keys
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # Provider default models (optional — falls back to built-in defaults)
    OPENAI_DEFAULT_MODEL: str = ""
    ANTHROPIC_DEFAULT_MODEL: str = ""
    GROQ_DEFAULT_MODEL: str = ""
    GEMINI_DEFAULT_MODEL: str = ""

    # ===== RAG / Knowledge Management =====
    # Vector database provider: qdrant, pgvector, memory (testing only)
    VECTOR_DB_PROVIDER: str = "memory"

    # Qdrant configuration
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION_PREFIX: str = "dayjoyai"  # collection name = prefix_org_slug
    QDRANT_VECTOR_SIZE: int = 1536  # depends on embedding model
    QDRANT_DISTANCE: str = "Cosine"  # Cosine, Euclid, Dot

    # Embedding provider: openai, bge_local, fake (testing)
    EMBEDDING_PROVIDER: str = "fake"
    EMBEDDING_MODEL: str = "text-embedding-3-small"  # OpenAI default
    EMBEDDING_DIMENSION: int = 1536
    EMBEDDING_BATCH_SIZE: int = 100
    EMBEDDING_TIMEOUT: float = 30.0
    EMBEDDING_MAX_RETRIES: int = 3

    # BGE local model path (for on-prem embedding)
    BGE_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"
    BGE_DEVICE: str = "cpu"  # cpu, cuda, mps
    BGE_NORMALIZE: bool = True

    # Chunking strategy
    MAX_CHUNK_SIZE: int = 1000  # max characters per chunk
    MIN_CHUNK_SIZE: int = 100  # min characters per chunk
    CHUNK_OVERLAP: int = 200  # character overlap between adjacent chunks
    CHUNKING_STRATEGY: str = "semantic"  # semantic, fixed, sentence

    # Retrieval pipeline
    MAX_CONTEXT_DOCUMENTS: int = 5  # max documents to retrieve
    MAX_CONTEXT_CHUNKS: int = 10  # max chunks to include in context
    MAX_CONTEXT_TOKENS: int = 4000  # max tokens for assembled context
    RETRIEVAL_TOP_K: int = 20  # initial top-K from vector search (before re-ranking)
    RERANK_TOP_K: int = 5  # final top-K after re-ranking
    MIN_SIMILARITY_THRESHOLD: float = 0.55  # below this, refuse to answer
    HYBRID_SEMANTIC_WEIGHT: float = 0.7  # weight for semantic score in hybrid
    HYBRID_KEYWORD_WEIGHT: float = 0.3  # weight for keyword score in hybrid

    # Hallucination prevention
    ENABLE_CONFIDENCE_SCORING: bool = True
    CONFIDENCE_THRESHOLD: float = 0.55
    ENABLE_DUPLICATE_CHUNK_REMOVAL: bool = True
    DUPLICATE_SIMILARITY_THRESHOLD: float = 0.95

    # Document upload limits
    MAX_UPLOAD_FILE_SIZE_MB: int = 50
    ALLOWED_UPLOAD_MIME_TYPES: str = (
        "application/pdf,"
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
        "text/plain,text/markdown,text/csv,"
        "application/json,"
        "text/html,"
        "application/msword"
    )
    ALLOWED_UPLOAD_EXTENSIONS: str = ".pdf,.docx,.txt,.md,.csv,.json,.html,.doc"

    # Background processing
    INGESTION_JOB_TIMEOUT: int = 1800  # 30 minutes per job
    INGESTION_MAX_RETRIES: int = 3
    INGESTION_CONCURRENCY_PER_TENANT: int = 2
    ENABLE_BACKGROUND_INGESTION: bool = True

    # Website crawling
    WEB_CRAWL_MAX_PAGES: int = 50
    WEB_CRAWL_MAX_DEPTH: int = 2
    WEB_CRAWL_TIMEOUT: int = 30
    WEB_CRAWL_USER_AGENT: str = "DayjoyAI-RAG-Bot/1.0"

    # OCR (future integration — placeholder, no-op for now)
    ENABLE_OCR: bool = False
    OCR_PROVIDER: str = ""  # tesseract, aws_textract, google_vision

    # ===== Voice AI (Stage 2 Step 3) =====
    # Active voice provider: vapi, retell, bland, livekit, pipecat
    # Only "vapi" is fully implemented; others raise NotImplementedError when invoked.
    VOICE_PROVIDER: str = "vapi"

    # --- Vapi configuration ---
    # Dashboard: https://dashboard.vapi.ai
    # API keys:  https://dashboard.vapi.ai/api-keys
    VAPI_API_KEY: str = ""
    VAPI_PUBLIC_KEY: str = ""  # used for webhook signature verification
    VAPI_WEBHOOK_SECRET: str = ""  # optional shared secret for webhook auth
    VAPI_BASE_URL: str = "https://api.vapi.ai"
    VAPI_ASSISTANT_ID: str = ""  # default assistant (org-specific overrides)
    VAPI_PHONE_NUMBER_ID: str = ""  # Vapi number to dial out from
    VAPI_TIMEOUT: float = 30.0
    VAPI_MAX_RETRIES: int = 3

    # --- Default voice / language / behavior ---
    DEFAULT_VOICE: str = "aria"  # ElevenLabs voice (Vapi default)
    DEFAULT_VOICE_PROVIDER: str = "11labs"  # 11labs, playtech, deepgram, openai
    DEFAULT_LANGUAGE: str = "en"
    DEFAULT_VOICE_TEMPERATURE: float = 0.7
    DEFAULT_VOICE_MAX_TOKENS: int = 500
    DEFAULT_VOICE_STT_PROVIDER: str = "deepgram"  # deepgram, assemblyai, gladia
    DEFAULT_VOICE_TTS_PROVIDER: str = "11labs"

    # --- Call behavior ---
    MAX_CALL_DURATION: int = 1800  # 30 minutes
    ENABLE_BARGE_IN: bool = True
    ENABLE_VAD: bool = True  # Voice Activity Detection
    SILENCE_TIMEOUT_SECONDS: int = 30  # hang up after N seconds of silence
    END_OF_CALL_TIMEOUT_SECONDS: int = 15  # hang up after N seconds of post-speech silence
    MAX_TURNS_PER_CALL: int = 100
    ENABLE_RECORDING: bool = True
    ENABLE_TRANSCRIPTION: bool = True
    ENABLE_SENTIMENT_ANALYSIS: bool = True

    # --- Streaming ---
    VOICE_STREAM_CHUNK_SIZE: int = 100  # chars per TTS chunk
    VOICE_STREAM_BUFFER_MS: int = 200  # client-side buffer
    VOICE_WS_PING_INTERVAL: int = 20  # WebSocket keepalive
    VOICE_WS_MAX_MESSAGE_SIZE: int = 1024 * 1024  # 1 MB

    # --- WebSocket auth ---
    VOICE_WS_TOKEN_TTL_SECONDS: int = 300  # 5 min one-time WS token

    # --- Fallback / escalation ---
    VOICE_FALLBACK_MESSAGE: str = (
        "I'm having trouble understanding. Let me transfer you to a human agent."
    )
    VOICE_ESCALATION_PHONE: str = ""  # org-specific override; empty = no escalation
    VOICE_MAX_RETRIES_PER_TURN: int = 2

    # ===== Telephony (Stage 2 Step 4) =====
    # Active telephony provider: twilio, exotel, plivo, knowlarity
    # Only "twilio" is fully implemented; others raise NotImplementedError when invoked.
    TELEPHONY_PROVIDER: str = "twilio"

    # --- Twilio configuration ---
    # Console: https://console.twilio.com
    # Account SID + Auth Token: Project → Settings
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""  # Default caller ID for outbound
    TWILIO_PHONE_NUMBER_SID: str = ""  # Optional: PNxxx SID
    # Twilio API base (rarely changed)
    TWILIO_BASE_URL: str = "https://api.twilio.com"
    TWILIO_TIMEOUT: float = 30.0
    TWILIO_MAX_RETRIES: int = 3
    # Webhook validation — Twilio signs requests with Auth Token + HMAC-SHA1.
    # Set this to your public-facing URL (used to build absolute webhook URLs).
    # If empty, we rely on X-Twilio-Signature header validation only.
    TWILIO_WEBHOOK_SECRET: str = ""  # optional additional shared secret
    # Application SID for Twilio Voice app (optional — for TwiML Apps)
    TWILIO_APPLICATION_SID: str = ""

    # --- Default telephony behavior ---
    DEFAULT_COUNTRY_CODE: str = "+1"  # default E.164 country prefix
    ENABLE_CALL_RECORDING: bool = True
    RECORDING_STATUS_CALLBACK: bool = True
    # Recording format: mp3, wav
    RECORDING_FORMAT: str = "mp3"
    # Recording channels: mono, dual (separate caller/callee channels)
    RECORDING_CHANNELS: str = "dual"
    # Max call duration (seconds) — telephony-level enforcement
    MAX_CALL_DURATION: int = 1800  # 30 minutes
    # Trim silence at start/end of recordings: trim-silence, do-not-trim
    RECORDING_TRIM: str = "trim-silence"

    # --- Call routing ---
    # Default routing strategy when no rules match: ai, voicemail, reject, forward
    DEFAULT_ROUTING_STRATEGY: str = "ai"
    ENABLE_VOICEMAIL: bool = False  # future-ready (stub)
    VOICEMAIL_MAX_DURATION: int = 120  # seconds

    # --- Retry behavior ---
    CALL_RETRY_MAX_ATTEMPTS: int = 3
    CALL_RETRY_INITIAL_BACKOFF: float = 1.0  # seconds
    CALL_RETRY_MAX_BACKOFF: float = 30.0

    # --- Streaming ---
    # Twilio Media Stream: bidirectional WebSocket for raw audio (mulaw, 8kHz)
    ENABLE_MEDIA_STREAM: bool = True
    MEDIA_STREAM_SAMPLE_RATE: int = 8000  # 8kHz for Twilio
    MEDIA_STREAM_ENCODING: str = "audio/mulaw"

    # ===== WhatsApp AI (Stage 2 Step 5) =====
    WHATSAPP_PROVIDER: str = "meta_cloud"
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_BUSINESS_ACCOUNT_ID: str = ""
    WHATSAPP_VERIFY_TOKEN: str = ""
    WHATSAPP_API_BASE_URL: str = "https://graph.facebook.com/v18.0"
    WHATSAPP_API_VERSION: str = "v18.0"
    WHATSAPP_TIMEOUT: float = 30.0
    WHATSAPP_MAX_RETRIES: int = 3
    ENABLE_MEDIA_UPLOAD: bool = True
    ENABLE_MEDIA_DOWNLOAD: bool = True
    WHATSAPP_MEDIA_MAX_SIZE_MB: int = 16
    WHATSAPP_MEDIA_ALLOWED_TYPES: str = (
        "image/jpeg,image/png,image/webp,"
        "video/mp4,video/3gpp,"
        "audio/aac,audio/mp4,audio/amr,audio/ogg,"
        "application/pdf,text/plain"
    )
    WHATSAPP_MEDIA_STORAGE_PATH: str = "/tmp/whatsapp_media"
    ENABLE_TEMPLATE_MESSAGES: bool = True
    WHATSAPP_ENABLE_TYPING_INDICATOR: bool = True
    WHATSAPP_MAX_CONVERSATION_AGE_HOURS: int = 24
    WHATSAPP_SESSION_TIMEOUT_MINUTES: int = 1440  # 24 hours
    WHATSAPP_MAX_MESSAGE_LENGTH: int = 4096
    WHATSAPP_AI_FALLBACK_MESSAGE: str = (
        "I'm sorry, I couldn't process your message. "
        "A human agent will assist you shortly."
    )
    WHATSAPP_GREETING_MESSAGE: str = (
        "Hello! 👋 Thanks for reaching out. How can I help you today?"
    )
    WHATSAPP_HUMAN_HANDOFF_MESSAGE: str = (
        "I'm transferring you to a human agent who will assist you further. "
        "Please hold on for a moment. 🙏"
    )
    WHATSAPP_RATE_LIMIT_PER_MINUTE: int = 80
    WHATSAPP_RATE_LIMIT_BURST: int = 10

    # ===== Notification Platform (Stage 2 Step 6) =====
    # Master toggles
    ENABLE_EMAIL: bool = True
    ENABLE_SMS: bool = True
    ENABLE_PUSH_NOTIFICATIONS: bool = False  # FCM requires setup

    # --- Email providers ---
    EMAIL_PROVIDER: str = "resend"  # resend, sendgrid, ses, log (dev)
    # Resend (https://resend.com)
    RESEND_API_KEY: str = ""
    # SendGrid (https://sendgrid.com)
    SENDGRID_API_KEY: str = ""
    # Amazon SES (future)
    SES_ACCESS_KEY: str = ""
    SES_SECRET_KEY: str = ""
    SES_REGION: str = "us-east-1"

    # --- Email defaults ---
    DEFAULT_FROM_EMAIL: str = "noreply@example.com"
    DEFAULT_FROM_NAME: str = "Dayjoy AI"
    DEFAULT_REPLY_TO: str = ""
    EMAIL_TIMEOUT: float = 30.0
    EMAIL_MAX_RETRIES: int = 3
    EMAIL_BATCH_SIZE: int = 100
    # Rate limiting (per org per minute)
    EMAIL_RATE_LIMIT_PER_MINUTE: int = 100

    # --- SMS providers ---
    SMS_PROVIDER: str = "twilio"  # twilio, exotel, plivo, log (dev)
    # Twilio SMS (reuses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN from telephony)
    TWILIO_SMS_FROM: str = ""  # Twilio messaging service SID or phone number
    # Exotel SMS
    EXOTEL_API_KEY: str = ""
    EXOTEL_SID: str = ""
    EXOTEL_SMS_SENDER_ID: str = ""
    # Plivo (future)
    PLIVO_AUTH_ID: str = ""
    PLIVO_AUTH_TOKEN: str = ""
    PLIVO_SMS_FROM: str = ""

    # --- SMS defaults ---
    DEFAULT_SMS_SENDER_ID: str = "DAYJOY"
    SMS_TIMEOUT: float = 30.0
    SMS_MAX_RETRIES: int = 3
    SMS_RATE_LIMIT_PER_MINUTE: int = 50

    # --- Push (FCM) ---
    FCM_SERVER_KEY: str = ""  # Legacy server key (deprecated)
    FCM_PROJECT_ID: str = ""  # For HTTP v1 API
    FCM_SERVICE_ACCOUNT_JSON: str = ""  # Path to service account JSON file
    PUSH_TIMEOUT: float = 10.0
    PUSH_MAX_RETRIES: int = 2

    # --- Notification behavior ---
    NOTIFICATION_QUEUE_ENABLED: bool = True  # Use background queue
    NOTIFICATION_QUEUE_MAX_SIZE: int = 10000
    NOTIFICATION_RETRY_MAX_ATTEMPTS: int = 3
    NOTIFICATION_RETRY_INITIAL_BACKOFF: float = 2.0
    NOTIFICATION_RETRY_MAX_BACKOFF: float = 60.0
    NOTIFICATION_BATCH_SIZE: int = 100
    # Max recipients per bulk send
    NOTIFICATION_BULK_MAX_RECIPIENTS: int = 1000

    # --- Template engine ---
    TEMPLATE_CACHE_TTL_SECONDS: int = 300  # 5 min
    TEMPLATE_SANITIZE_HTML: bool = True

    # ===== Observability (Stage 2 Step 7) =====
    # Master toggles
    ENABLE_METRICS: bool = True
    ENABLE_TRACING: bool = False  # OTLP collector required for production
    ENABLE_SENTRY: bool = False
    ENABLE_STRUCTURED_LOGGING: bool = True

    # --- Prometheus ---
    PROMETHEUS_ENABLED: bool = True
    METRICS_PATH: str = "/metrics"

    # --- OpenTelemetry ---
    OTEL_SERVICE_NAME: str = "dayjoyai-backend"
    OTEL_EXPORTER_ENDPOINT: str = ""  # OTLP gRPC/HTTP endpoint (e.g. http://otel-collector:4317)
    OTEL_EXPORTER_PROTOCOL: str = "grpc"  # grpc, http
    OTEL_RESOURCE_ATTRIBUTES: str = ""  # e.g. "deployment.environment=production"

    # --- Sentry ---
    SENTRY_DSN: str = ""
    SENTRY_ENVIRONMENT: str = ""  # falls back to ENVIRONMENT
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1  # 10% of traces sent to Sentry
    SENTRY_PROFILES_SAMPLE_RATE: float = 0.1
    SENTRY_SEND_DEFAULT_PII: bool = False

    # --- Grafana ---
    GRAFANA_URL: str = ""  # for linking to dashboards from alerts
    GRAFANA_API_KEY: str = ""

    # --- Alerting ---
    ALERT_EVALUATION_INTERVAL_SECONDS: int = 30
    ALERT_NOTIFICATION_EMAIL: str = ""  # default alert recipient
    ALERT_WEBHOOK_URL: str = ""  # Slack/Teams/custom webhook
    ALERT_RATE_LIMIT_PER_HOUR: int = 100  # max alerts per hour per org

    # --- Log sanitization ---
    LOG_SANITIZE_KEYS: str = "password,token,api_key,secret,auth,authorization,access_token,refresh_token"
    LOG_MAX_FIELD_LENGTH: int = 500  # truncate long string fields

    # --- Health check ---
    HEALTH_CHECK_TIMEOUT_SECONDS: int = 5
    HEALTH_CHECK_CACHE_TTL_SECONDS: int = 10  # cache health results briefly

    # ===== Validators =====

    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Ensure environment is a valid value."""
        allowed = {"dev", "staging", "production"}
        if v not in allowed:
            raise ValueError(f"ENVIRONMENT must be one of {allowed}, got {v!r}")
        return v

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Validate SECRET_KEY length."""
        # Default value is allowed in dev; production check is in validate_production()
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return v

    @field_validator("VECTOR_DB_PROVIDER")
    @classmethod
    def validate_vector_db_provider(cls, v: str) -> str:
        """Ensure vector DB provider is valid."""
        allowed = {"qdrant", "pgvector", "memory"}
        if v not in allowed:
            raise ValueError(f"VECTOR_DB_PROVIDER must be one of {allowed}, got {v!r}")
        return v

    @field_validator("EMBEDDING_PROVIDER")
    @classmethod
    def validate_embedding_provider(cls, v: str) -> str:
        """Ensure embedding provider is valid."""
        allowed = {"openai", "bge_local", "fake"}
        if v not in allowed:
            raise ValueError(f"EMBEDDING_PROVIDER must be one of {allowed}, got {v!r}")
        return v

    @field_validator("CHUNKING_STRATEGY")
    @classmethod
    def validate_chunking_strategy(cls, v: str) -> str:
        """Ensure chunking strategy is valid."""
        allowed = {"semantic", "fixed", "sentence"}
        if v not in allowed:
            raise ValueError(f"CHUNKING_STRATEGY must be one of {allowed}, got {v!r}")
        return v

    @field_validator("VOICE_PROVIDER")
    @classmethod
    def validate_voice_provider(cls, v: str) -> str:
        """Ensure voice provider is valid (or 'none' to disable)."""
        allowed = {"none", "vapi", "retell", "bland", "livekit", "pipecat"}
        if v not in allowed:
            raise ValueError(f"VOICE_PROVIDER must be one of {allowed}, got {v!r}")
        return v

    @field_validator("TELEPHONY_PROVIDER")
    @classmethod
    def validate_telephony_provider(cls, v: str) -> str:
        """Ensure telephony provider is valid (or 'none' to disable)."""
        allowed = {"none", "twilio", "exotel", "plivo", "knowlarity"}
        if v not in allowed:
            raise ValueError(f"TELEPHONY_PROVIDER must be one of {allowed}, got {v!r}")
        return v

    @field_validator("RECORDING_FORMAT")
    @classmethod
    def validate_recording_format(cls, v: str) -> str:
        allowed = {"mp3", "wav"}
        if v not in allowed:
            raise ValueError(f"RECORDING_FORMAT must be one of {allowed}, got {v!r}")
        return v

    @field_validator("RECORDING_CHANNELS")
    @classmethod
    def validate_recording_channels(cls, v: str) -> str:
        allowed = {"mono", "dual"}
        if v not in allowed:
            raise ValueError(f"RECORDING_CHANNELS must be one of {allowed}, got {v!r}")
        return v

    @field_validator("DEFAULT_ROUTING_STRATEGY")
    @classmethod
    def validate_routing_strategy(cls, v: str) -> str:
        allowed = {"ai", "voicemail", "reject", "forward"}
        if v not in allowed:
            raise ValueError(f"DEFAULT_ROUTING_STRATEGY must be one of {allowed}, got {v!r}")
        return v

    @field_validator("WHATSAPP_PROVIDER")
    @classmethod
    def validate_whatsapp_provider(cls, v: str) -> str:
        """Ensure WhatsApp provider is valid (or 'none' to disable)."""
        allowed = {"none", "meta_cloud", "twilio_whatsapp", "360dialog", "messagebird"}
        if v not in allowed:
            raise ValueError(f"WHATSAPP_PROVIDER must be one of {allowed}, got {v!r}")
        return v

    @field_validator("EMAIL_PROVIDER")
    @classmethod
    def validate_email_provider(cls, v: str) -> str:
        allowed = {"resend", "sendgrid", "ses", "log"}
        if v not in allowed:
            raise ValueError(f"EMAIL_PROVIDER must be one of {allowed}, got {v!r}")
        return v

    @field_validator("SMS_PROVIDER")
    @classmethod
    def validate_sms_provider(cls, v: str) -> str:
        allowed = {"twilio", "exotel", "plivo", "log"}
        if v not in allowed:
            raise ValueError(f"SMS_PROVIDER must be one of {allowed}, got {v!r}")
        return v

    @property
    def allowed_upload_mime_types_list(self) -> list[str]:
        """Allowed upload MIME types as a list."""
        return [m.strip() for m in self.ALLOWED_UPLOAD_MIME_TYPES.split(",") if m.strip()]

    @property
    def allowed_upload_extensions_list(self) -> list[str]:
        """Allowed upload extensions as a list (lowercase, with leading dot)."""
        return [e.strip().lower() for e in self.ALLOWED_UPLOAD_EXTENSIONS.split(",") if e.strip()]

    def validate_production(self) -> None:
        """Call this at startup in production to enforce strict config."""
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY == "dev-secret-key-change-in-production-min-32-chars":  # noqa: S105
                raise ValueError(
                    "SECRET_KEY must be set to a real value in production. "
                    "Generate one with: python -c 'import secrets; "
                    "print(secrets.token_urlsafe(32))'"
                )
            if self.DEBUG:
                raise ValueError("DEBUG must be false in production")
            if "localhost" in self.DATABASE_URL:
                raise ValueError("DATABASE_URL must not reference localhost in production")
            if self.VECTOR_DB_PROVIDER == "memory":
                raise ValueError(
                    "VECTOR_DB_PROVIDER must be 'qdrant' or 'pgvector' in production "
                    "(not 'memory')"
                )
            if self.EMBEDDING_PROVIDER == "fake":
                raise ValueError(
                    "EMBEDDING_PROVIDER must be 'openai' or 'bge_local' in production "
                    "(not 'fake')"
                )
            # Voice/Telephony/WhatsApp are optional — only validate if a provider is
            # explicitly configured (some deployments don't use these features).
            # Set VOICE_PROVIDER=none to disable voice features entirely.
            if self.VOICE_PROVIDER not in {"none", "vapi", "retell", "bland", "livekit", "pipecat"}:
                raise ValueError(f"VOICE_PROVIDER must be a valid provider or 'none', got {self.VOICE_PROVIDER!r}")
            if self.VOICE_PROVIDER == "vapi" and not self.VAPI_API_KEY:
                raise ValueError(
                    "VAPI_API_KEY must be set in production when VOICE_PROVIDER=vapi "
                    "(or set VOICE_PROVIDER=none to disable voice features)"
                )
            if self.TELEPHONY_PROVIDER not in {"none", "twilio", "plivo", "exotel", "knowlarity"}:
                raise ValueError(f"TELEPHONY_PROVIDER must be a valid provider or 'none', got {self.TELEPHONY_PROVIDER!r}")
            if self.TELEPHONY_PROVIDER == "twilio" and (
                not self.TWILIO_ACCOUNT_SID or not self.TWILIO_AUTH_TOKEN
            ):
                raise ValueError(
                    "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in "
                    "production when TELEPHONY_PROVIDER=twilio "
                    "(or set TELEPHONY_PROVIDER=none to disable telephony features)"
                )
            if self.WHATSAPP_PROVIDER not in {"none", "meta_cloud"}:
                raise ValueError(f"WHATSAPP_PROVIDER must be 'meta_cloud' or 'none', got {self.WHATSAPP_PROVIDER!r}")
            if self.WHATSAPP_PROVIDER == "meta_cloud" and (
                not self.WHATSAPP_ACCESS_TOKEN or not self.WHATSAPP_PHONE_NUMBER_ID
            ):
                raise ValueError(
                    "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be "
                    "set in production when WHATSAPP_PROVIDER=meta_cloud "
                    "(or set WHATSAPP_PROVIDER=none to disable WhatsApp features)"
                )
            if self.ENABLE_SENTRY and not self.SENTRY_DSN:
                raise ValueError(
                    "SENTRY_DSN must be set when ENABLE_SENTRY=true in production"
                )

    @property
    def is_dev(self) -> bool:
        """True if running in development environment."""
        return self.ENVIRONMENT == "dev"

    @property
    def is_production(self) -> bool:
        """True if running in production environment."""
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance.

    Cached so we only parse environment variables once.
    Use this in FastAPI dependencies: `Depends(get_settings)`.
    """
    return Settings()


# Module-level instance for direct import
# Usage: `from app.core.config import settings`
settings = get_settings()
