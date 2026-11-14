import hashlib
import ipaddress

from django.conf import settings
from django.core.cache import cache


AUTH_RATE_LIMITS = {
    "login": {
        "ip": (30, 15 * 60),
    },
    "password_reset": {
        "ip": (20, 60 * 60),
    },
    "password_change": {
        "ip": (5, 15 * 60),
    },
}


def _cache_key(action, dimension, value):
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return f"auth-rate-limit:{action}:{dimension}:{digest}"


def get_client_ip(request):
    ip_address = request.META.get("REMOTE_ADDR", "").strip()
    trusted_header = getattr(settings, "TRUSTED_PROXY_HEADER", "")
    if trusted_header:
        forwarded_address = request.META.get(trusted_header, "").split(",", 1)[0].strip()
        try:
            ipaddress.ip_address(forwarded_address)
        except ValueError:
            pass
        else:
            return forwarded_address
    return ip_address or "unknown"


def is_auth_rate_limited(request, action, identifier):
    limits = AUTH_RATE_LIMITS[action]
    return cache.get(_cache_key(action, "ip", get_client_ip(request)), 0) >= limits["ip"][0]


def record_auth_attempt(request, action, identifier):
    limits = AUTH_RATE_LIMITS[action]
    key = _cache_key(action, "ip", get_client_ip(request))
    timeout = limits["ip"][1]
    if not cache.add(key, 1, timeout=timeout):
        try:
            cache.incr(key)
        except ValueError:
            cache.add(key, 1, timeout=timeout)
