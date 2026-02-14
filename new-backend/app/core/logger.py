import logging
import sys
import re
from pathlib import Path

from ..config import settings

# Patterns that may contain sensitive data
_SENSITIVE_PATTERN = re.compile(
    r'(password|passwd|secret|token|api_key|apikey|authorization|cookie|session_id|credit_card)'
    r'\s*[=:]\s*\S+',
    re.IGNORECASE
)


class SensitiveDataFilter(logging.Filter):
    """Filter that redacts sensitive data from log messages."""
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _SENSITIVE_PATTERN.sub(
                lambda m: m.group().split('=')[0].split(':')[0] + '=***REDACTED***'
                if '=' in m.group() else m.group().split(':')[0] + ': ***REDACTED***',
                record.msg
            )
        return True


def setup_logging():
    """Configure application logging"""

    # Create logs directory if it doesn't exist
    log_file_path = Path(settings.log_file)
    log_file_path.parent.mkdir(parents=True, exist_ok=True)

    # Create formatters
    detailed_formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    simple_formatter = logging.Formatter(
        "%(levelname)-8s | %(message)s"
    )

    # File handler - detailed logs
    file_handler = logging.FileHandler(settings.log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(detailed_formatter)

    # Console handler - simple logs
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, settings.log_level.upper()))
    console_handler.setFormatter(simple_formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Add sensitive data filter to all handlers
    sensitive_filter = SensitiveDataFilter()
    file_handler.addFilter(sensitive_filter)
    console_handler.addFilter(sensitive_filter)

    # Silence noisy loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("playwright").setLevel(logging.WARNING)

    logging.info(f"Logging configured: level={settings.log_level}, file={settings.log_file}")


# Filter for hiding "HTTP Request:" logs from httpx
class NoHttpRequestFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not record.getMessage().startswith("HTTP Request:")


# Apply filter to httpx logger
logging.getLogger("httpx").addFilter(NoHttpRequestFilter())
