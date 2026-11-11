import hashlib

from django.core.cache import cache


AUTH_RATE_LIMITS = {
    "login": {
        "ip": (30, 15 * 60),
        "identifier": (8, 15 * 60),
    },
    "password_reset": {
        "ip": (20, 60 * 60),
        "identifier": (5, 60 * 60),
    },
}


def _cache_key(action, dimension, value):
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return f"auth-rate-limit:{action}:{dimension}:{digest}"


def _rate_limit_keys(request, action, identifier):
    ip_address = request.META.get("REMOTE_ADDR") or "unknown"
    normalized_identifier = (identifier or "").strip().casefold()
    return (
        ("ip", ip_address),
        ("identifier", normalized_identifier),
    )


def is_auth_rate_limited(request, action, identifier):
    limits = AUTH_RATE_LIMITS[action]
    return any(
        cache.get(_cache_key(action, dimension, value), 0) >= limits[dimension][0]
        for dimension, value in _rate_limit_keys(request, action, identifier)
    )


def record_auth_attempt(request, action, identifier):
    limits = AUTH_RATE_LIMITS[action]
    for dimension, value in _rate_limit_keys(request, action, identifier):
        key = _cache_key(action, dimension, value)
        timeout = limits[dimension][1]
        if not cache.add(key, 1, timeout=timeout):
            try:
                cache.incr(key)
            except ValueError:
                cache.add(key, 1, timeout=timeout)
