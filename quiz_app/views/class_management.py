"""
Class management views for admin users.

This module provides views for managing classes including:
- Listing classes
- Creating new classes
- Editing existing classes
- Deleting classes
- Viewing class details
- Managing ClassSubjects (subjects assigned to classes)
"""
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.core.exceptions import ValidationError

from ..models import (
    Class,
    ClassSubject,
    Form,
    LearningArea,
    AcademicYear,
    Subject,
    ClassTeacher,
    StudentClass,
    TeacherSubjectAssignment,
)
from ..utils.tenant_utils import get_object_or_404_with_school, get_write_school


@login_required
@require_http_methods(["GET"])
def class_list_view(request):
    """Redirect the legacy class directory URL to the React screen."""
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse(
            {"success": False, "error": "You don't have permission to access this page."},
            status=403,
        )

    app_section = "superadmin" if request.user.role == "superadmin" else "admin"
    return redirect(f"/app/{app_section}/classes")


@login_required
@require_http_methods(["POST"])
def class_create_view(request):
    """
    Create a new class.
    
    POST: Creates class and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse(
            {"success": False, "error": "You don't have permission to perform this action."},
            status=403,
        )
    
    # POST - Create class
    school = get_write_school(request)
    if school is None:
        return JsonResponse({
            'success': False,
            'error': 'Select a valid target school.',
        }, status=400)

    try:
        with transaction.atomic():
            # Get form data
            name = request.POST.get('name', '').strip()
            form_id = request.POST.get('form', '') or None
            learning_area_id = request.POST.get('learning_area', '') or None
            academic_year_id = request.POST.get('academic_year', '')
            maximum_students = request.POST.get('maximum_students', '40')
            
            # Validation
            if not all([name, academic_year_id]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            
            try:
                maximum_students = int(maximum_students)
                if maximum_students <= 0:
                    raise ValueError
            except ValueError:
                return JsonResponse({
                    'success': False,
                    'error': 'Maximum students must be a positive number.'
                }, status=400)
            
            # Get academic year
            try:
                academic_year = AcademicYear.objects.get(pk=academic_year_id, school=school)
            except AcademicYear.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid academic year selected.'
                }, status=400)
            
            # Get form if provided
            form = None
            if form_id:
                try:
                    form = Form.objects.get(pk=form_id, school=school)
                except Form.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid form selected.',
                    }, status=400)
            
            # Get learning area if provided
            learning_area = None
            if learning_area_id:
                try:
                    learning_area = LearningArea.objects.get(pk=learning_area_id, school=school)
                except LearningArea.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid learning area selected.',
                    }, status=400)
            
            # Create class
            class_obj = Class(
                name=name,
                form=form,
                learning_area=learning_area,
                academic_year=academic_year,
                maximum_students=maximum_students,
                school=school,
            )
            
            # Validate
            class_obj.full_clean()
            class_obj.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Class {class_obj.name} created successfully.',
                'class_id': class_obj.id,
                'class_code': class_obj.class_id,
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
            'error': f'Error creating class: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def class_edit_view(request, class_id):
    """
    Edit an existing class.
    
    POST: Updates class and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse(
            {"success": False, "error": "You don't have permission to perform this action."},
            status=403,
        )
    
    class_obj = get_object_or_404_with_school(Class, request, pk=class_id)
    school = class_obj.school
    # POST - Update class
    try:
        with transaction.atomic():
            class_obj = Class.objects.select_for_update().get(
                pk=class_obj.pk,
                school=school,
            )

            # Get form data
            class_obj.name = request.POST.get('name', '').strip()
            form_id = request.POST.get('form', '') or None
            learning_area_id = request.POST.get('learning_area', '') or None
            academic_year_id = request.POST.get('academic_year', '')
            maximum_students = request.POST.get('maximum_students', '40')
            
            try:
                maximum_students = int(maximum_students)
                if maximum_students <= 0:
                    raise ValueError
            except ValueError:
                return JsonResponse({
                    'success': False,
                    'error': 'Maximum students must be a positive number.'
                }, status=400)
            
            # Get academic year
            try:
                class_obj.academic_year = AcademicYear.objects.get(pk=academic_year_id, school=school)
            except AcademicYear.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid academic year selected.'
                }, status=400)
            
            # Get form if provided
            if form_id:
                try:
                    class_obj.form = Form.objects.get(pk=form_id, school=school)
                except Form.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid form selected.',
                    }, status=400)
            else:
                class_obj.form = None
            
            # Get learning area if provided
            if learning_area_id:
                try:
                    class_obj.learning_area = LearningArea.objects.get(pk=learning_area_id, school=school)
                except LearningArea.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid learning area selected.',
                    }, status=400)
            else:
                class_obj.learning_area = None
            
            class_obj.maximum_students = maximum_students
            
            # Validate
            class_obj.full_clean()
            class_obj.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Class {class_obj.name} updated successfully.',
                'class_id': class_obj.id,
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
            'error': f'Error updating class: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def class_delete_view(request, class_id):
    """
    Archive a class while preserving its historical records.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    class_obj = get_object_or_404_with_school(Class, request, pk=class_id)
    try:
        with transaction.atomic():
            class_obj = Class.objects.select_for_update().get(pk=class_obj.pk)
            if class_obj.is_active:
                StudentClass.objects.filter(
                    assigned_class=class_obj, is_active=True
                ).update(is_active=False)
                TeacherSubjectAssignment.objects.filter(
                    class_assigned=class_obj, is_active=True
                ).update(is_active=False)
                ClassTeacher.objects.filter(
                    class_assigned=class_obj, is_active=True
                ).update(is_active=False)
                class_obj.is_active = False
                class_obj.save(update_fields=["is_active"])
        return JsonResponse({
            'success': True,
            'message': f'Class {class_obj.name} archived successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error archiving class: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def class_restore_view(request, class_id):
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)

    class_obj = get_object_or_404_with_school(Class, request, pk=class_id)
    if not class_obj.is_active:
        class_obj.is_active = True
        class_obj.save(update_fields=["is_active"])
    return JsonResponse({
        "success": True,
        "message": f"Class {class_obj.name} restored. Historical enrollments and assignments remain inactive.",
    })


@login_required
@require_http_methods(["GET"])
def class_detail_view(request, class_id):
    """Redirect the legacy class detail URL to its React route."""
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse(
            {"success": False, "error": "You don't have permission to access this page."},
            status=403,
        )
    class_obj = get_object_or_404_with_school(Class, request, pk=class_id)
    app_section = "superadmin" if request.user.role == "superadmin" else "admin"
    return redirect(f"/app/{app_section}/classes/{class_obj.pk}")


@login_required
@require_http_methods(["POST"])
def class_subject_add_view(request, class_id):
    """
    Add a subject to a class.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    class_obj = get_object_or_404_with_school(Class, request, pk=class_id)
    school = class_obj.school
    
    try:
        import json
        data = json.loads(request.body)
        subject_id = data.get('subject_id')
        
        if not subject_id:
            return JsonResponse({
                'success': False,
                'error': 'Subject ID is required.'
            }, status=400)
        
        # Get subject
        try:
            subject = Subject.objects.get(pk=subject_id, school=school)
        except Subject.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Invalid subject selected.'
            }, status=400)
        
        # Check if already assigned
        existing = ClassSubject.objects.filter(
            class_name=class_obj,
            subject=subject,
            academic_year=class_obj.academic_year,
            school=school,
        ).first()
        
        if existing:
            return JsonResponse({
                'success': False,
                'error': 'This subject is already assigned to this class for this academic year.'
            }, status=400)
        
        # Create ClassSubject
        with transaction.atomic():
            class_subject = ClassSubject(
                class_name=class_obj,
                subject=subject,
                academic_year=class_obj.academic_year,
                school=school,
            )
            class_subject.save()
        
        return JsonResponse({
            'success': True,
            'message': f'Subject {subject.subject_name} added to class successfully.',
            'class_subject_id': class_subject.id,
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error adding subject: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def class_subject_remove_view(request, class_id, class_subject_id):
    """
    Remove a subject from a class.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    school = request.user.school
    
    class_obj = get_object_or_404_with_school(Class, request, pk=class_id)
    
    class_subject = get_object_or_404_with_school(
        ClassSubject,
        request,
        pk=class_subject_id,
        school_field="school",
        class_name=class_obj,
        school=class_obj.school,
    )
    
    try:
        subject_name = class_subject.subject.subject_name
        class_subject.delete()
        return JsonResponse({
            'success': True,
            'message': f'Subject {subject_name} removed from class successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error removing subject: {str(e)}'
        }, status=500)
