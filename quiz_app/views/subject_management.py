"""
Subject management views for admin users.

This module provides views for managing subjects including:
- Listing subjects
- Creating new subjects
- Editing existing subjects
- Deleting subjects
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.core.exceptions import ValidationError

from ..models import (
    Subject,
    LearningArea,
    Department,
    TeacherSubjectAssignment,
)
from ..utils.tenant_utils import get_object_or_404_with_school, get_write_school


@login_required
@require_http_methods(["GET"])
def subject_list_view(request):
    """
    Display list of all subjects with filtering and search capabilities.
    """
    if request.user.role not in ["admin", "superadmin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")

    return redirect("/app/admin/subjects")


@login_required
@require_http_methods(["GET", "POST"])
def subject_create_view(request):
    """
    Create a new subject.
    
    GET: Returns form in modal
    POST: Creates subject and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:subject_list")
    
    if request.method == "GET":
        return redirect("/app/admin/subjects")
    
    # POST - Create subject
    school = get_write_school(request)
    if school is None:
        return JsonResponse({
            'success': False,
            'error': 'Select a valid target school.',
        }, status=400)

    try:
        with transaction.atomic():
            # Get form data
            subject_name = request.POST.get('subject_name', '').strip()
            learning_area_id = request.POST.get('learning_area', '') or None
            department_id = request.POST.get('department', '') or None
            
            # Validation
            if not subject_name:
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            
            # Get learning area if provided
            learning_area = None
            if learning_area_id:
                try:
                    learning_area = LearningArea.objects.get(pk=learning_area_id, school=school)
                except LearningArea.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid learning area selected.'
                    }, status=400)
            
            # Get department if provided
            department = None
            if department_id:
                try:
                    department = Department.objects.get(pk=department_id, school=school)
                except Department.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid department selected.'
                    }, status=400)
            
            # Create subject
            subject = Subject(
                subject_name=subject_name,
                learning_area=learning_area,
                department=department,
                school=school,
            )
            
            # Validate
            subject.full_clean(exclude=["learning_area"])
            subject.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Subject {subject.subject_name} created successfully.',
                'subject_id': subject.id,
                'subject_code': subject.subject_code,
            })
    
    except ValidationError as e:
        error_messages = []
        if hasattr(e, 'message_dict'):
            for field, messages_list in e.message_dict.items():
                error_messages.extend(messages_list)
        else:
            error_messages.append(str(e))
        
        return JsonResponse({
            'success': False,
            'error': ' '.join(error_messages)
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error creating subject: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET", "POST"])
def subject_edit_view(request, subject_id):
    """
    Edit an existing subject.
    
    GET: Returns form in modal
    POST: Updates subject and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:subject_list")
    
    if request.method == "GET":
        return redirect("/app/admin/subjects")

    subject = get_object_or_404_with_school(Subject, request, pk=subject_id)
    school = subject.school
    
    # POST - Update subject
    try:
        with transaction.atomic():
            # Get form data
            subject.subject_name = request.POST.get('subject_name', '').strip()
            learning_area_id = request.POST.get('learning_area', '') or None
            department_id = request.POST.get('department', '') or None
            
            # Get learning area if provided
            if learning_area_id:
                try:
                    subject.learning_area = LearningArea.objects.get(pk=learning_area_id, school=school)
                except LearningArea.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid learning area selected.'
                    }, status=400)
            else:
                subject.learning_area = None
            
            # Get department if provided
            if department_id:
                try:
                    subject.department = Department.objects.get(pk=department_id, school=school)
                except Department.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid department selected.'
                    }, status=400)
            else:
                subject.department = None
            
            # Validate
            subject.full_clean(exclude=["learning_area"])
            subject.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Subject {subject.subject_name} updated successfully.',
                'subject_id': subject.id,
            })
    
    except ValidationError as e:
        error_messages = []
        if hasattr(e, 'message_dict'):
            for field, messages_list in e.message_dict.items():
                error_messages.extend(messages_list)
        else:
            error_messages.append(str(e))
        
        return JsonResponse({
            'success': False,
            'error': ' '.join(error_messages)
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error updating subject: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def subject_delete_view(request, subject_id):
    """
    Archive a subject while preserving its historical records.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    subject = get_object_or_404_with_school(Subject, request, pk=subject_id)
    
    try:
        with transaction.atomic():
            subject = Subject.objects.select_for_update().get(pk=subject.pk)
            if subject.is_active:
                TeacherSubjectAssignment.objects.filter(
                    subject=subject, is_active=True
                ).update(is_active=False)
                subject.is_active = False
                subject.save(update_fields=["is_active"])
        return JsonResponse({
            'success': True,
            'message': f'Subject {subject.subject_name} archived successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error archiving subject: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def subject_restore_view(request, subject_id):
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)

    subject = get_object_or_404_with_school(Subject, request, pk=subject_id)
    if not subject.is_active:
        subject.is_active = True
        subject.save(update_fields=["is_active"])
    return JsonResponse({
        "success": True,
        "message": f"Subject {subject.subject_name} restored. Historical assignments remain inactive.",
    })
