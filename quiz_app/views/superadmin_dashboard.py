"""Superadmin dashboard route redirecting to its React screen."""
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages


@login_required
def superadmin_dashboard_view(request):
    if request.user.role != "superadmin":
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:login")
    return redirect("/app/superadmin/dashboard")
