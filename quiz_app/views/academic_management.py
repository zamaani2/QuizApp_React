"""
Academic Year and Term management views for admin users.

This module provides views for managing academic years and terms including:
- Listing academic years and terms
- Creating new academic years and terms
- Editing existing academic years and terms
- Deleting academic years and terms
- Setting current academic year and term
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.core.exceptions import ValidationError

from ..models import (
    AcademicYear,
    Term,
)
from ..utils.tenant_utils import get_object_or_404_with_school, get_write_school


# ==================== Academic Year Views ====================

@login_required
@require_http_methods(["GET"])
def academic_year_list_view(request):
    """
    Display list of all academic years with filtering and search capabilities.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse(
            {"success": False, "error": "You don't have permission to access this page."},
            status=403,
        )

    return redirect("/app/admin/academic-years")


@login_required
@require_http_methods(["GET", "POST"])
def academic_year_create_view(request):
    """
    Create a new academic year.
    
    GET: Returns form in modal
    POST: Creates academic year and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        return JsonResponse(
            {"success": False, "error": "You don't have permission to perform this action."},
            status=403,
        )

    if request.method == "GET":
        return redirect("/app/admin/academic-years")

    school = request.user.school
    
    # For non-superadmin users, school is required
    if request.user.role != "superadmin" and not school:
        if request.method == "GET":
            return JsonResponse({'error': 'No school associated with your account. Please contact administrator.'}, status=400)
        return JsonResponse({
            'success': False,
            'error': 'No school associated with your account. Please contact administrator.'
        }, status=400)
    
    # POST - Create academic year
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
            start_date_str = request.POST.get('start_date', '').strip()
            end_date_str = request.POST.get('end_date', '').strip()
            is_current = request.POST.get('is_current', '') == 'on'
            
            # Debug logging (remove in production)
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(f'Academic year creation - name: {name}, start_date: {start_date_str}, end_date: {end_date_str}, school: {school}')
            
            # Validation - check if fields are provided
            if not name:
                return JsonResponse({
                    'success': False,
                    'error': 'Academic year name is required.'
                }, status=400)
            
            if not start_date_str:
                return JsonResponse({
                    'success': False,
                    'error': 'Start date is required.'
                }, status=400)
            
            if not end_date_str:
                return JsonResponse({
                    'success': False,
                    'error': 'End date is required.'
                }, status=400)
            
            # Parse dates
            try:
                from datetime import datetime
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            except ValueError as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Invalid date format: {str(e)}. Expected format: YYYY-MM-DD'
                }, status=400)
            
            # Validate date logic
            if start_date >= end_date:
                return JsonResponse({
                    'success': False,
                    'error': 'Start date must be before end date.'
                }, status=400)
            
            # Check for duplicate academic year name for the same school
            existing = AcademicYear.objects.filter(name=name, school=school)
            if existing.exists():
                return JsonResponse({
                    'success': False,
                    'error': f'An academic year with the name "{name}" already exists for this school.'
                }, status=400)
            
            # Create academic year
            academic_year = AcademicYear(
                name=name,
                start_date=start_date,
                end_date=end_date,
                is_current=is_current,
                school=school,
            )
            
            # Validate model
            try:
                academic_year.full_clean()
            except ValidationError as ve:
                # Extract field-specific errors
                error_messages = []
                if hasattr(ve, 'message_dict'):
                    for field, messages_list in ve.message_dict.items():
                        for msg in messages_list:
                            error_messages.append(f'{field}: {msg}')
                elif hasattr(ve, 'messages'):
                    error_messages = [str(msg) for msg in ve.messages]
                else:
                    error_messages.append(str(ve))
                
                return JsonResponse({
                    'success': False,
                    'error': '; '.join(error_messages) if error_messages else 'Validation error occurred.'
                }, status=400)
            
            academic_year.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Academic year {academic_year.name} created successfully.',
                'academic_year_id': academic_year.id,
            })
    
    except ValidationError as e:
        error_messages = []
        if hasattr(e, 'message_dict'):
            for field, messages_list in e.message_dict.items():
                for msg in messages_list:
                    error_messages.append(f'{field}: {msg}')
        elif hasattr(e, 'messages'):
            error_messages = list(e.messages)
        else:
            error_messages.append(str(e))
        
        error_text = '; '.join(error_messages) if error_messages else 'Validation error occurred.'
        
        return JsonResponse({
            'success': False,
            'error': error_text
        }, status=400)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return JsonResponse({
            'success': False,
            'error': f'Error creating academic year: {str(e)}',
            'details': error_details if request.user.is_superuser else None
        }, status=500)


@login_required
@require_http_methods(["GET", "POST"])
def academic_year_edit_view(request, academic_year_id):
    """
    Edit an existing academic year.
    
    GET: Returns form in modal
    POST: Updates academic year and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        return JsonResponse(
            {"success": False, "error": "You don't have permission to perform this action."},
            status=403,
        )

    if request.method == "GET":
        return redirect("/app/admin/academic-years")
    
    academic_year = get_object_or_404_with_school(
        AcademicYear, request, pk=academic_year_id
    )
    school = academic_year.school

    # POST - Update academic year
    try:
        with transaction.atomic():
            # Get form data
            name = request.POST.get('name', '').strip()
            start_date_str = request.POST.get('start_date', '').strip()
            end_date_str = request.POST.get('end_date', '').strip()
            is_current = request.POST.get('is_current', '') == 'on'
            
            # Validation - check if fields are provided
            if not name:
                return JsonResponse({
                    'success': False,
                    'error': 'Academic year name is required.'
                }, status=400)
            
            if not start_date_str:
                return JsonResponse({
                    'success': False,
                    'error': 'Start date is required.'
                }, status=400)
            
            if not end_date_str:
                return JsonResponse({
                    'success': False,
                    'error': 'End date is required.'
                }, status=400)
            
            # Parse dates
            try:
                from datetime import datetime
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            except ValueError as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Invalid date format: {str(e)}'
                }, status=400)
            
            # Update academic year
            academic_year.name = name
            academic_year.start_date = start_date
            academic_year.end_date = end_date
            academic_year.is_current = is_current
            
            # Validate
            academic_year.full_clean()
            academic_year.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Academic year {academic_year.name} updated successfully.',
                'academic_year_id': academic_year.id,
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
            'error': f'Error updating academic year: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def academic_year_delete_view(request, academic_year_id):
    """
    Delete an academic year.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    academic_year = get_object_or_404_with_school(
        AcademicYear, request, pk=academic_year_id
    )

    try:
        with transaction.atomic():
            academic_year = AcademicYear.objects.select_for_update().get(
                pk=academic_year.pk,
                school=academic_year.school,
            )
            has_academic_history = (
                academic_year.term_set.exists()
                or academic_year.classes.exists()
                or academic_year.quizzes.exists()
                or academic_year.quiz_attempts.exists()
            )
            if has_academic_history:
                return JsonResponse({
                    'success': False,
                    'error': (
                        'Cannot delete an academic year with terms, classes, '
                        'quizzes, or recorded attempts. Archive or retain its '
                        'records instead.'
                    )
                }, status=400)

            academic_year_name = academic_year.name
            academic_year.delete()

        return JsonResponse({
            'success': True,
            'message': f'Academic year {academic_year_name} deleted successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error deleting academic year: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def academic_year_set_current_view(request, academic_year_id):
    """
    Set an academic year as current.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)

    school = request.user.school

    academic_year = get_object_or_404_with_school(
        AcademicYear, request, pk=academic_year_id
    )

    try:
        with transaction.atomic():
            academic_year = AcademicYear.objects.select_for_update().get(
                pk=academic_year.pk,
                school=academic_year.school,
            )
            academic_year.is_current = True
            academic_year.save()
            if school:
                school.current_academic_year = academic_year
                school.save()
        return JsonResponse({
            'success': True,
            'message': f'Academic year {academic_year.name} set as current successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error setting current academic year: {str(e)}'
        }, status=500)


# ==================== Term Views ====================

@login_required
@require_http_methods(["GET"])
def term_list_view(request):
    """
    Display list of all terms with filtering and search capabilities.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse(
            {"success": False, "error": "You don't have permission to access this page."},
            status=403,
        )

    return redirect("/app/admin/terms")


@login_required
@require_http_methods(["GET", "POST"])
def term_create_view(request):
    """
    Create a new term.
    
    GET: Returns form in modal
    POST: Creates term and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        return JsonResponse(
            {"success": False, "error": "You don't have permission to perform this action."},
            status=403,
        )

    school = request.user.school
    if request.method == "GET":
        return redirect("/app/admin/terms")
    
    # POST - Create term
    try:
        with transaction.atomic():
            # Get form data
            academic_year_id = request.POST.get('academic_year', '')
            term_number = request.POST.get('term_number', '')
            start_date = request.POST.get('start_date', '')
            end_date = request.POST.get('end_date', '')
            is_current = request.POST.get('is_current', '') == 'on'
            
            # Validation
            if not all([academic_year_id, term_number, start_date, end_date]):
                return JsonResponse({
                    'success': False,
                    'error': 'Please fill in all required fields.'
                }, status=400)
            
            # Get academic year
            academic_years = AcademicYear.objects.filter(pk=academic_year_id)
            if school is not None:
                academic_years = academic_years.filter(school=school)
            try:
                academic_year = academic_years.get()
            except AcademicYear.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid academic year selected.'
                }, status=400)
            school = academic_year.school
            if school is None or not school.is_active:
                return JsonResponse({
                    'success': False,
                    'error': 'The selected academic year does not belong to an active school.'
                }, status=400)
            
            # Create term
            term = Term(
                academic_year=academic_year,
                term_number=int(term_number),
                start_date=start_date,
                end_date=end_date,
                is_current=is_current,
                school=school,
            )
            
            # Validate
            term.full_clean()
            term.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Term {term.get_term_number_display()} created successfully.',
                'term_id': term.id,
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
            'error': f'Error creating term: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET", "POST"])
def term_edit_view(request, term_id):
    """
    Edit an existing term.
    
    GET: Returns form in modal
    POST: Updates term and returns JSON response
    """
    if request.user.role not in ["admin", "superadmin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        return JsonResponse(
            {"success": False, "error": "You don't have permission to perform this action."},
            status=403,
        )

    if request.method == "GET":
        return redirect("/app/admin/terms")

    term = get_object_or_404_with_school(Term, request, pk=term_id)
    school = term.academic_year.school

    # POST - Update term
    try:
        with transaction.atomic():
            # Get form data
            academic_year_id = request.POST.get('academic_year', '')
            term_number = request.POST.get('term_number', '')
            start_date = request.POST.get('start_date', '')
            end_date = request.POST.get('end_date', '')
            is_current = request.POST.get('is_current', '') == 'on'
            
            # Get academic year
            try:
                academic_year = AcademicYear.objects.get(
                    pk=academic_year_id,
                    school=school,
                )
            except AcademicYear.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid academic year selected.'
                }, status=400)
            
            term.academic_year = academic_year
            term.term_number = int(term_number)
            term.start_date = start_date
            term.end_date = end_date
            term.is_current = is_current
            
            # Validate
            term.full_clean()
            term.save()
            
            return JsonResponse({
                'success': True,
                'message': f'Term {term.get_term_number_display()} updated successfully.',
                'term_id': term.id,
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
            'error': f'Error updating term: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def term_delete_view(request, term_id):
    """
    Delete a term only if no quiz or attempt history references it.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    term = get_object_or_404_with_school(Term, request, pk=term_id)
    
    try:
        with transaction.atomic():
            term = Term.objects.select_for_update().get(
                pk=term.pk,
                school=term.school,
            )
            if term.quizzes.exists() or term.quiz_attempts.exists():
                return JsonResponse({
                    'success': False,
                    'error': (
                        'Cannot delete a term referenced by quizzes or recorded '
                        'attempts. Retain the term to preserve assessment history.'
                    ),
                }, status=400)

            term_name = f"{term.academic_year.name} - {term.get_term_number_display()}"
            term.delete()
        return JsonResponse({
            'success': True,
            'message': f'Term {term_name} deleted successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error deleting term: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def term_set_current_view(request, term_id):
    """
    Set a term as current.
    """
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    term = get_object_or_404_with_school(Term, request, pk=term_id)
    school = term.academic_year.school
    
    try:
        with transaction.atomic():
            # Set this term as current
            term.is_current = True
            term.save()
            
            # Update school's current term if school exists
            if school:
                school.current_term = term
                school.save()
        
        return JsonResponse({
            'success': True,
            'message': f'Term {term.get_term_number_display()} set as current successfully.'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error setting current term: {str(e)}'
        }, status=500)
