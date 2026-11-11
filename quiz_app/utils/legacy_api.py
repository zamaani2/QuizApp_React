from django.http import JsonResponse


def legacy_write_gone(route):
    return JsonResponse(
        {
            "code": "LEGACY_ENDPOINT_GONE",
            "message": f"This write endpoint has been retired. Use {route}.",
        },
        status=410,
    )
