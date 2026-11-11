"""
User management views for admin users.

This module provides views for managing users including:
- Listing users
- Creating new users
- Editing existing users
- Deleting users
- Bulk password reset
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction

from ..account_security import (
    can_receive_password_setup_email,
    generate_account_setup_password,
    schedule_password_setup_email,
)

User = get_user_model()

from ..models import SchoolInformation
from ..utils.tenant_utils import get_object_or_404_with_school, get_write_school
from ..utils.legacy_api import legacy_write_gone


@login_required
@require_http_methods(["GET"])
def user_list_view(request):
    """Redirect the legacy user-list URL to the React user-management screen."""
    if request.user.role not in ["admin", "superadmin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")

    app_section = "superadmin" if request.user.role == "superadmin" else "admin"
    return redirect(f"/app/{app_section}/users")


@login_required
@require_http_methods(["POST"])
def user_create_view(request):
    """
    Create a new user.
    
    POST: Creates user and returns JSON response
    """
    return legacy_write_gone("/api/v1/users/")
    if request.user.role not in ["admin", "superadmin"]:
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:user_list")
    
    school = request.user.school
    
    # POST - Create user
    try:
        with transaction.atomic():
            # Get form data
            username = request.POST.get('username', '').strip()
            email = request.POST.get('email', '').strip()
            full_name = request.POST.get('full_name', '').strip()
            role = request.POST.get('role', '').strip()
            school_id = request.POST.get('school', '') or None
            
            # Validation
            if not all([username, email, full_name, role]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            if role not in dict(User.ROLES):
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid user role selected.'
                }, status=400)
            if request.user.role == "admin" and role == "superadmin":
                return JsonResponse({
                    'success': False,
                    'error': 'School administrators cannot create superadmin accounts.'
                }, status=403)
            
            # Check if username already exists
            if User.objects.filter(username=username).exists():
                return JsonResponse({
                    'success': False,
                    'error': 'Username already exists.'
                }, status=400)
            
            # Check if email already exists
            if User.objects.filter(email=email).exists():
                return JsonResponse({
                    'success': False,
                    'error': 'Email already exists.'
                }, status=400)
            
            # Get school
            user_school = None
            if school_id:
                try:
                    user_school = SchoolInformation.objects.get(
                        pk=school_id,
                        is_active=True,
                    )
                    # Regular admin can only assign to their own school
                    if request.user.role == "admin" and user_school != school:
                        return JsonResponse({
                            'success': False,
                            'error': 'Invalid school selected.'
                        }, status=400)
                except SchoolInformation.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid school selected.'
                    }, status=400)
            elif request.user.role == "admin":
                user_school = school

            if role != "superadmin" and user_school is None:
                return JsonResponse({
                    'success': False,
                    'error': 'Select an active school for this user.'
                }, status=400)
            
            # Give new users an unknown random password and email a one-time
            # password setup link instead of collecting or distributing one.
            user = User.objects.create_user(
                username=username,
                email=email,
                password=generate_account_setup_password(),
                full_name=full_name,
                role=role,
                school=user_school,
            )
            schedule_password_setup_email(user)
            
            return JsonResponse({
                'success': True,
                'message': (
                    f'User {user.full_name} created successfully. '
                    'A password setup link will be sent to the provided email.'
                ),
                'user_id': user.id
            })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error creating user: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def user_edit_view(request, user_id):
    """
    Edit an existing user.
    
    POST: Updates user and returns JSON response
    """
    return legacy_write_gone("/api/v1/users/")
    if request.user.role not in ["admin", "superadmin"]:
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:user_list")
    
    school = request.user.school
    
    user = get_object_or_404_with_school(User, request, pk=user_id)
    
    # Prevent admin from editing superadmin
    if request.user.role == "admin" and user.role == "superadmin":
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # POST - Update user
    try:
        with transaction.atomic():
            # Get form data
            username = request.POST.get('username', '').strip()
            email = request.POST.get('email', '').strip()
            full_name = request.POST.get('full_name', '').strip()
            role = request.POST.get('role', '').strip()
            password = request.POST.get('password', '').strip()
            school_id = request.POST.get('school', '') or None
            
            # Validation
            if not all([username, email, full_name, role]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            if role not in dict(User.ROLES):
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid user role selected.'
                }, status=400)
            if request.user.role == "admin" and role == "superadmin":
                return JsonResponse({
                    'success': False,
                    'error': 'School administrators cannot assign the superadmin role.'
                }, status=403)
            
            # Check if username already exists (excluding current user)
            if User.objects.filter(username=username).exclude(pk=user_id).exists():
                return JsonResponse({
                    'success': False,
                    'error': 'Username already exists.'
                }, status=400)
            
            # Check if email already exists (excluding current user)
            if User.objects.filter(email=email).exclude(pk=user_id).exists():
                return JsonResponse({
                    'success': False,
                    'error': 'Email already exists.'
                }, status=400)
            
            # Get school
            user_school = None
            if school_id:
                try:
                    user_school = SchoolInformation.objects.get(
                        pk=school_id,
                        is_active=True,
                    )
                    # Regular admin can only assign to their own school
                    if request.user.role == "admin" and user_school != school:
                        return JsonResponse({
                            'success': False,
                            'error': 'Invalid school selected.'
                        }, status=400)
                except SchoolInformation.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid school selected.'
                    }, status=400)
            elif request.user.role == "admin":
                user_school = school

            if request.user.role == "superadmin" and user.school_id:
                if user_school and user_school.pk != user.school_id:
                    return JsonResponse({
                        'success': False,
                        'error': "Changing a user's school requires a dedicated transfer workflow."
                    }, status=400)
                user_school = user.school
            if role != "superadmin" and user_school is None:
                return JsonResponse({
                    'success': False,
                    'error': 'Select an active school for this user.'
                }, status=400)
            
            # Update user
            user.username = username
            user.email = email
            user.full_name = full_name
            user.role = role
            user.school = user_school
            
            # Update password if provided
            if password:
                user.set_password(password)
            
            user.save()
            
            return JsonResponse({
                'success': True,
                'message': f'User {user.full_name} updated successfully.'
            })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error updating user: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def user_delete_view(request, user_id):
    """
    Delete a user.
    """
    return legacy_write_gone(f"/api/v1/users/{user_id}/")
    
    school = request.user.school
    
    user = get_object_or_404_with_school(User, request, pk=user_id)
    
    # Prevent deleting yourself
    if user == request.user:
        return JsonResponse({
            'success': False,
            'error': 'You cannot delete your own account.'
        }, status=400)
    
    # Prevent admin from deleting superadmin
    if request.user.role == "admin" and user.role == "superadmin":
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    try:
        user_name = user.full_name or user.username
        user.delete()
        return JsonResponse({
            'success': True,
            'message': f'User {user_name} deleted successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error deleting user: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def user_bulk_password_reset_view(request):
    """
    Send password reset links to selected users without changing their passwords.
    
    POST: Sends one-time password reset links to selected users
    """
    return legacy_write_gone("/api/v1/users/bulk-password-reset/")
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # POST - Send password reset links
    try:
        import json
        data = json.loads(request.body)
        user_ids = data.get('user_ids', [])
        
        if not isinstance(user_ids, list) or not user_ids:
            return JsonResponse({
                'success': False,
                'error': 'Select one or more valid users.'
            }, status=400)

        try:
            user_ids = [int(user_id) for user_id in user_ids]
        except (TypeError, ValueError):
            return JsonResponse({
                'success': False,
                'error': 'Invalid user IDs provided.'
            }, status=400)

        if len(user_ids) != len(set(user_ids)):
            return JsonResponse({
                'success': False,
                'error': 'User IDs must be unique.'
            }, status=400)
        
        school = get_write_school(request, data.get('school_id'))
        if school is None:
            return JsonResponse({
                'success': False,
                'error': 'Select a valid target school.',
            }, status=400)
        users = User.objects.filter(pk__in=user_ids)
        users = users.filter(school=school)
        users = users.select_related("student_profile", "teacher_profile")
        
        # Exclude superadmin from regular admin
        if request.user.role == "admin":
            users = users.exclude(role="superadmin")
        
        # Prevent resetting your own password
        users = users.exclude(pk=request.user.pk)
        
        selected_users = list(users)
        if len(selected_users) != len(user_ids):
            return JsonResponse({
                'success': False,
                'error': 'One or more selected users are invalid or cannot receive reset links.'
            }, status=400)

        if any(not can_receive_password_setup_email(user) for user in selected_users):
            return JsonResponse({
                'success': False,
                'error': 'All selected users must have active accounts and deliverable email addresses.'
            }, status=400)

        with transaction.atomic():
            for user in selected_users:
                schedule_password_setup_email(user)
        
        return JsonResponse({
            'success': True,
            'message': f'Password reset links queued for {len(selected_users)} user(s). Their current passwords are unchanged.'
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error resetting passwords: {str(e)}'
        }, status=500)
