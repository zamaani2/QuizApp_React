"""
Form, Learning Area, and Department management views for admin users.

This module provides views for managing school structure including:
- Forms (grade levels)
- Learning Areas (programs)
- Departments
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.core.exceptions import ValidationError

from ..models import (
    Form,
    LearningArea,
    Department,
    Teacher,
)
from ..utils.tenant_utils import get_object_or_404_with_school, get_write_school


# ==================== Form Views ====================

@login_required
@require_http_methods(["GET"])
def form_list_view(request):
    """
    Display list of all forms with filtering and search capabilities.
    """
    if request.user.role not in ["admin", "superadmin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")

    return redirect("/app/admin/forms")


@login_required
@require_http_methods(["GET", "POST"])
def form_create_view(request):
    """
    Create a new form.
    
    GET: Returns form in modal
    POST: Creates form and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:form_list")
    
    if request.method == "GET":
        return redirect("/app/admin/forms")
    
    # POST - Create form
    school = get_write_school(request)
    if school is None:
        return JsonResponse({
            'success': False,
            'error': 'Select a valid target school.',
        }, status=400)

    try:
        with transaction.atomic():
            # Get form data
            form_number = request.POST.get('form_number', '').strip()
            name = request.POST.get('name', '').strip()
            description = request.POST.get('description', '').strip() or None
            
            # Validation
            if not all([form_number, name]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            
            try:
                form_number = int(form_number)
            except ValueError:
                return JsonResponse({
                    'success': False,
                    'error': 'Form number must be a valid number.'
                }, status=400)
            
            # Create form
            form_obj = Form(
                form_number=form_number,
                name=name,
                description=description,
                school=school,
            )
            
            # Validate
            form_obj.full_clean()
            form_obj.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Form {form_obj.name} created successfully.',
                'form_id': form_obj.id,
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
            'error': f'Error creating form: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET", "POST"])
def form_edit_view(request, form_id):
    """
    Edit an existing form.
    
    GET: Returns form in modal
    POST: Updates form and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:form_list")
    
    if request.method == "GET":
        return redirect("/app/admin/forms")

    form_obj = get_object_or_404_with_school(Form, request, pk=form_id)
    school = form_obj.school
    
    # POST - Update form
    try:
        with transaction.atomic():
            # Get form data
            form_number = request.POST.get('form_number', '').strip()
            name = request.POST.get('name', '').strip()
            description = request.POST.get('description', '').strip() or None
            
            try:
                form_obj.form_number = int(form_number)
            except ValueError:
                return JsonResponse({
                    'success': False,
                    'error': 'Form number must be a valid number.'
                }, status=400)
            
            form_obj.name = name
            form_obj.description = description
            
            # Validate
            form_obj.full_clean()
            form_obj.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Form {form_obj.name} updated successfully.',
                'form_id': form_obj.id,
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
            'error': f'Error updating form: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def form_delete_view(request, form_id):
    """
    Delete a form.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    school = request.user.school
    
    form_obj = get_object_or_404_with_school(Form, request, pk=form_id)
    
    try:
        # Check if form has students
        student_count = form_obj.student_set.count()
        if student_count > 0:
            return JsonResponse({
                'success': False,
                'error': f'Cannot delete form. It has {student_count} student(s) associated with it.'
            }, status=400)
        
        form_name = form_obj.name
        form_obj.delete()
        return JsonResponse({
            'success': True,
            'message': f'Form {form_name} deleted successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error deleting form: {str(e)}'
        }, status=500)


# ==================== Learning Area Views ====================

@login_required
@require_http_methods(["GET"])
def learning_area_list_view(request):
    """
    Display list of all learning areas with filtering and search capabilities.
    """
    if request.user.role not in ["admin", "superadmin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")

    return redirect("/app/admin/learning-areas")


@login_required
@require_http_methods(["GET", "POST"])
def learning_area_create_view(request):
    """
    Create a new learning area.
    
    GET: Returns form in modal
    POST: Creates learning area and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:learning_area_list")
    
    if request.method == "GET":
        return redirect("/app/admin/learning-areas")
    
    # POST - Create learning area
    school = get_write_school(request)
    if school is None:
        return JsonResponse({
            'success': False,
            'error': 'Select a valid target school.',
        }, status=400)

    try:
        with transaction.atomic():
            # Get form data
            code = request.POST.get('code', '').strip()
            name = request.POST.get('name', '').strip()
            description = request.POST.get('description', '').strip() or None
            
            # Validation
            if not all([code, name]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            
            # Create learning area
            learning_area = LearningArea(
                code=code,
                name=name,
                description=description,
                school=school,
            )
            
            # Validate
            learning_area.full_clean()
            learning_area.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Learning area {learning_area.name} created successfully.',
                'learning_area_id': learning_area.id,
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
            'error': f'Error creating learning area: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET", "POST"])
def learning_area_edit_view(request, learning_area_id):
    """
    Edit an existing learning area.
    
    GET: Returns form in modal
    POST: Updates learning area and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:learning_area_list")
    
    if request.method == "GET":
        return redirect("/app/admin/learning-areas")

    learning_area = get_object_or_404_with_school(
        LearningArea, request, pk=learning_area_id
    )
    school = learning_area.school
    
    # POST - Update learning area
    try:
        with transaction.atomic():
            # Get form data
            learning_area.code = request.POST.get('code', '').strip()
            learning_area.name = request.POST.get('name', '').strip()
            learning_area.description = request.POST.get('description', '').strip() or None
            
            # Validate
            learning_area.full_clean()
            learning_area.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Learning area {learning_area.name} updated successfully.',
                'learning_area_id': learning_area.id,
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
            'error': f'Error updating learning area: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def learning_area_delete_view(request, learning_area_id):
    """
    Delete a learning area.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    school = request.user.school
    
    learning_area = get_object_or_404_with_school(
        LearningArea, request, pk=learning_area_id
    )
    
    try:
        # Check if learning area has students
        student_count = learning_area.student_set.count()
        if student_count > 0:
            return JsonResponse({
                'success': False,
                'error': f'Cannot delete learning area. It has {student_count} student(s) associated with it.'
            }, status=400)
        
        learning_area_name = learning_area.name
        learning_area.delete()
        return JsonResponse({
            'success': True,
            'message': f'Learning area {learning_area_name} deleted successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error deleting learning area: {str(e)}'
        }, status=500)


# ==================== Department Views ====================

@login_required
@require_http_methods(["GET"])
def department_list_view(request):
    """
    Display list of all departments with filtering and search capabilities.
    """
    if request.user.role not in ["admin", "superadmin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")

    return redirect("/app/admin/departments")


@login_required
@require_http_methods(["GET", "POST"])
def department_create_view(request):
    """
    Create a new department.
    
    GET: Returns form in modal
    POST: Creates department and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:department_list")
    
    if request.method == "GET":
        return redirect("/app/admin/departments")
    
    # POST - Create department
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
            code = request.POST.get('code', '').strip()
            description = request.POST.get('description', '').strip() or None
            head_of_department_id = request.POST.get('head_of_department', '') or None
            
            # Validation
            if not all([name, code]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            
            # Get head of department if provided
            head_of_department = None
            if head_of_department_id:
                try:
                    head_of_department = Teacher.objects.get(pk=head_of_department_id, school=school)
                except Teacher.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid head of department selected.'
                    }, status=400)
            
            # Create department
            department = Department(
                name=name,
                code=code,
                description=description,
                head_of_department=head_of_department,
                school=school,
            )
            
            # Validate
            department.full_clean()
            department.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Department {department.name} created successfully.',
                'department_id': department.id,
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
            'error': f'Error creating department: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET", "POST"])
def department_edit_view(request, department_id):
    """
    Edit an existing department.
    
    GET: Returns form in modal
    POST: Updates department and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:department_list")
    
    if request.method == "GET":
        return redirect("/app/admin/departments")

    department = get_object_or_404_with_school(Department, request, pk=department_id)
    school = department.school
    
    # POST - Update department
    try:
        with transaction.atomic():
            # Get form data
            department.name = request.POST.get('name', '').strip()
            department.code = request.POST.get('code', '').strip()
            department.description = request.POST.get('description', '').strip() or None
            head_of_department_id = request.POST.get('head_of_department', '') or None
            
            # Get head of department if provided
            if head_of_department_id:
                try:
                    department.head_of_department = Teacher.objects.get(pk=head_of_department_id, school=school)
                except Teacher.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid head of department selected.'
                    }, status=400)
            else:
                department.head_of_department = None
            
            # Validate
            department.full_clean()
            department.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Department {department.name} updated successfully.',
                'department_id': department.id,
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
            'error': f'Error updating department: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def department_delete_view(request, department_id):
    """
    Delete a department.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    school = request.user.school
    
    department = get_object_or_404_with_school(Department, request, pk=department_id)
    
    try:
        # Check if department has teachers
        teacher_count = department.teacher_set.count()
        if teacher_count > 0:
            return JsonResponse({
                'success': False,
                'error': f'Cannot delete department. It has {teacher_count} teacher(s) associated with it.'
            }, status=400)
        
        department_name = department.name
        department.delete()
        return JsonResponse({
            'success': True,
            'message': f'Department {department_name} deleted successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error deleting department: {str(e)}'
        }, status=500)
