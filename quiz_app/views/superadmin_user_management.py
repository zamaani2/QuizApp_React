"""
Superadmin User Management views.

Allows superadmin to manage school administrators across all schools.
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction

from ..account_security import (
    generate_account_setup_password,
    schedule_password_setup_email,
)
from ..models import (
    User,
    SchoolInformation,
)


@login_required
@require_http_methods(["GET"])
def superadmin_admin_list_view(request):
    """
    List all school administrators across all schools (superadmin only).
    """
    if request.user.role != "superadmin":
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:superadmin_login")
    return redirect("/app/superadmin/admins")


@login_required
@require_http_methods(["GET", "POST"])
def superadmin_admin_create_view(request):
    """
    Create a new school administrator (superadmin only).
    """
    if request.user.role != "superadmin":
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:superadmin_login")
    
    if request.method == "GET":
        return redirect("/app/superadmin/admins/new")
    
    # POST - Create admin
    try:
        with transaction.atomic():
            # Get form data
            username = request.POST.get('username', '').strip()
            email = request.POST.get('email', '').strip()
            full_name = request.POST.get('full_name', '').strip()
            school_id = request.POST.get('school', '').strip()
            
            # Validation
            if not all([username, email, full_name, school_id]):
                return JsonResponse({
                    'success': False,
                    'error': 'Username, email, full name, and school are required.'
                }, status=400)
            
            # Check if username already exists
            if User.objects.filter(username=username).exists():
                return JsonResponse({
                    'success': False,
                    'error': 'Username already exists. Please choose a different username.'
                }, status=400)
            
            # Check if email already exists
            if User.objects.filter(email=email).exists():
                return JsonResponse({
                    'success': False,
                    'error': 'Email already exists. Please use a different email.'
                }, status=400)
            
            # Get school
            try:
                school = SchoolInformation.objects.get(pk=school_id, is_active=True)
            except SchoolInformation.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid school selected.'
                }, status=400)
            
            # Create admin user
            admin = User.objects.create_user(
                username=username,
                email=email,
                password=generate_account_setup_password(),
                full_name=full_name,
                role="admin",
                school=school,
                is_active=True,
            )
            schedule_password_setup_email(admin)
            
            return JsonResponse({
                'success': True,
                'message': (
                    f'Administrator {admin.full_name} created successfully for '
                    f'{school.name}. A password setup link will be sent to the '
                    'provided email.'
                ),
                'admin_id': admin.id
            })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error creating administrator: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET", "POST"])
def superadmin_admin_edit_view(request, admin_id):
    """
    Edit a school administrator (superadmin only).
    """
    if request.user.role != "superadmin":
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:superadmin_login")
    
    if request.method == "GET":
        return redirect(f"/app/superadmin/admins/{admin_id}/edit")

    admin = get_object_or_404(User, pk=admin_id, role="admin")
    
    # POST - Update admin
    try:
        with transaction.atomic():
            # Get form data
            admin.email = request.POST.get('email', '').strip()
            admin.full_name = request.POST.get('full_name', '').strip()
            school_id = request.POST.get('school', '').strip()
            admin.is_active = request.POST.get('is_active', '') == 'on'
            
            # Validation
            if not all([admin.email, admin.full_name, school_id]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            
            # Check if email already exists (excluding current user)
            if User.objects.filter(email=admin.email).exclude(pk=admin.id).exists():
                return JsonResponse({
                    'success': False,
                    'error': 'Email already exists. Please use a different email.'
                }, status=400)
            
            # Get school
            try:
                school = SchoolInformation.objects.get(pk=school_id, is_active=True)
            except SchoolInformation.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid school selected.'
                }, status=400)
            
            admin.school = school
            
            # Update password if provided
            password = request.POST.get('password', '').strip()
            if password:
                admin.set_password(password)
            
            admin.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Administrator {admin.full_name} updated successfully.',
                'admin_id': admin.id,
            })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error updating administrator: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def superadmin_admin_delete_view(request, admin_id):
    """
    Delete a school administrator (superadmin only).
    """
    if request.user.role != "superadmin":
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    admin = get_object_or_404(User, pk=admin_id, role="admin")
    
    # Prevent deleting yourself
    if admin.id == request.user.id:
        return JsonResponse({
            'success': False,
            'error': 'You cannot delete your own account.'
        }, status=400)
    
    try:
        admin_name = admin.full_name
        school_name = admin.school.name if admin.school else "Unknown"
        admin.delete()
        
        return JsonResponse({
            'success': True,
            'message': f'Administrator {admin_name} from {school_name} deleted successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error deleting administrator: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET"])
def superadmin_admin_detail_view(request, admin_id):
    """
    View details of a school administrator (superadmin only).
    """
    if request.user.role != "superadmin":
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:superadmin_login")
    return redirect(f"/app/superadmin/admins/{admin_id}")


