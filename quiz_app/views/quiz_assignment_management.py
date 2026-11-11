"""
Quiz Class Assignment management views for teachers.

This module provides views for managing quiz assignments to classes including:
- Listing quiz assignments
- Assigning classes to quizzes
- Unassigning classes from quizzes
- Bulk assignment operations
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.models import Q, Count
from django.db import transaction

from ..models import (
    Quiz,
    Class,
    Teacher,
    AcademicYear,
    SchoolInformation,
    TeacherSubjectAssignment,
)


@login_required
@require_http_methods(["GET"])
def quiz_assignment_list_view(request, quiz_id):
    """
    Display list of classes assigned to a specific quiz.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
    school = request.user.school
    
    # Teachers can only access their own quizzes, admins can access any quiz in their school
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect("quiz_app:dashboard")
        teacher = request.user.teacher_profile
        quiz = get_object_or_404(Quiz, pk=quiz_id, teacher=teacher, school=school)
    else:
        quiz = get_object_or_404(Quiz, pk=quiz_id, school=school)

    return redirect(f"/app/teacher/quizzes/{quiz.pk}/assignments")
    

@login_required
@require_http_methods(["POST"])
def quiz_assignment_create_view(request, quiz_id):
    """
    Assign classes to a quiz.
    
    POST: Assigns classes and returns JSON response
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:quiz_list")
    
    school = request.user.school
    
    # Teachers can only access their own quizzes, admins can access any quiz in their school
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect("quiz_app:quiz_list")
        teacher = request.user.teacher_profile
        quiz = get_object_or_404(Quiz, pk=quiz_id, teacher=teacher, school=school)
    else:
        # Admin can access any quiz in their school
        quiz = get_object_or_404(Quiz, pk=quiz_id, school=school)
        teacher = quiz.teacher  # Use quiz's teacher for context

    # Validate quiz has a subject
    if not quiz.subject:
        messages.error(request, 'Quiz must have a subject assigned before assigning classes.')
        return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)

    # POST - Assign classes
    try:
        class_ids = request.POST.getlist('classes')
        
        if not class_ids:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'success': False,
                    'error': 'Please select at least one class to assign.'
                }, status=400)
            messages.error(request, 'Please select at least one class to assign.')
            return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)
        
        # Validate classes belong to school and teacher is assigned to teach the subject in those classes
        classes = Class.objects.filter(
            pk__in=class_ids,
            school=school
        )
        
        if classes.count() != len(class_ids):
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'success': False,
                    'error': 'One or more selected classes are invalid.'
                }, status=400)
            messages.error(request, 'One or more selected classes are invalid.')
            return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)
        
        # For teachers, verify they are assigned to teach the quiz's subject in each selected class
        # Admins can assign to any class
        if request.user.role == "teacher":
            teacher_assignments = TeacherSubjectAssignment.objects.filter(
                teacher=teacher,
                subject=quiz.subject,
                class_assigned__in=classes,
                is_active=True,
                school=school
            )
            
            assigned_class_ids = set(teacher_assignments.values_list('class_assigned_id', flat=True))
            selected_class_ids = set([int(cid) for cid in class_ids])
            
            if assigned_class_ids != selected_class_ids:
                invalid_classes = Class.objects.filter(
                    id__in=selected_class_ids - assigned_class_ids
                ).values_list('name', flat=True)
                
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return JsonResponse({
                        'success': False,
                        'error': f'You are not assigned to teach "{quiz.subject.subject_name}" in the following class(es): {", ".join(invalid_classes)}. Please ensure you are assigned to teach this subject in the class before assigning the quiz.'
                    }, status=400)
                messages.error(request, f'You are not assigned to teach "{quiz.subject.subject_name}" in one or more selected classes.')
                return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)
        
        # Add classes to quiz (ManyToMany - add() handles duplicates)
        with transaction.atomic():
            quiz.classes.add(*classes)
        
        assigned_count = classes.count()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True,
                'message': f'Successfully assigned {assigned_count} class(es) to the quiz.',
                'assigned_count': assigned_count,
            })
        
        messages.success(request, f'Successfully assigned {assigned_count} class(es) to the quiz.')
        return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)
    
    except Exception as e:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'success': False,
                'error': f'Error assigning classes: {str(e)}'
            }, status=500)
        messages.error(request, f'Error assigning classes: {str(e)}')
        return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)


@login_required
@require_http_methods(["POST"])
def quiz_assignment_delete_view(request, quiz_id, class_id):
    """
    Unassign a class from a quiz.
    """
    if request.user.role not in ["teacher", "admin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    if request.user.role == "teacher" and not request.user.teacher_profile:
        return JsonResponse({'error': 'Teacher profile not found'}, status=404)

    school = request.user.school
    quiz_filters = {'pk': quiz_id, 'school': school}
    if request.user.role == "teacher":
        quiz_filters['teacher'] = request.user.teacher_profile
    quiz = get_object_or_404(Quiz, **quiz_filters)
    class_obj = get_object_or_404(Class, pk=class_id, school=school)
    if not quiz.classes.filter(pk=class_obj.pk, school=school).exists():
        return JsonResponse({'error': 'Class is not assigned to this quiz'}, status=404)
    
    try:
        # Remove class from quiz
        quiz.classes.remove(class_obj)
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True,
                'message': f'Class "{class_obj.name}" has been unassigned from the quiz.'
            })
        
        messages.success(request, f'Class "{class_obj.name}" has been unassigned from the quiz.')
        return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)
    
    except Exception as e:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'success': False,
                'error': f'Error unassigning class: {str(e)}'
            }, status=500)
        messages.error(request, f'Error unassigning class: {str(e)}')
        return redirect("quiz_app:quiz_assignment_list", quiz_id=quiz_id)


@login_required
@require_http_methods(["POST"])
def quiz_assignment_bulk_delete_view(request, quiz_id):
    """
    Bulk unassign classes from a quiz.
    
    POST: Unassigns multiple classes
    """
    if request.user.role not in ["teacher", "admin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    if request.user.role == "teacher" and not request.user.teacher_profile:
        return JsonResponse({'error': 'Teacher profile not found'}, status=404)

    school = request.user.school
    quiz_filters = {'pk': quiz_id, 'school': school}
    if request.user.role == "teacher":
        quiz_filters['teacher'] = request.user.teacher_profile
    quiz = get_object_or_404(Quiz, **quiz_filters)
    # POST - Bulk unassign
    try:
        import json
        data = json.loads(request.body)
        class_ids = data.get('class_ids', [])
        
        if not class_ids:
            return JsonResponse({
                'success': False,
                'error': 'No classes selected.'
            }, status=400)
        
        # Convert to integers and filter out invalid IDs
        try:
            class_ids = [int(cid) for cid in class_ids if cid]
        except (ValueError, TypeError):
            return JsonResponse({
                'success': False,
                'error': 'Invalid class IDs provided.'
            }, status=400)

        if len(class_ids) != len(set(class_ids)):
            return JsonResponse({
                'success': False,
                'error': 'Class IDs must be unique.',
            }, status=400)

        classes = Class.objects.filter(
            pk__in=class_ids,
            school=school,
            assigned_quizzes=quiz,
        )

        count = classes.count()
        if count == 0 or count != len(class_ids):
            return JsonResponse({
                'success': False,
                'error': 'One or more classes are invalid or not assigned to this quiz.'
            }, status=400)
        
        with transaction.atomic():
            # Remove classes from quiz
            quiz.classes.remove(*classes)
        
        return JsonResponse({
            'success': True,
            'message': f'{count} class(es) unassigned successfully.'
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error unassigning classes: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["GET"])
def quiz_assignment_overview_view(request):
    """
    Redirect the legacy quiz assignment overview to the React quiz catalog.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
    if request.user.role == "teacher" and not request.user.teacher_profile:
        messages.error(request, "Teacher profile not found. Please contact administrator.")
        return redirect("quiz_app:dashboard")

    return redirect("/app/teacher/quizzes")


@login_required
@require_http_methods(["GET"])
def class_quiz_list_view(request, class_id):
    """
    Display list of quizzes assigned to a specific class.
    """
    if request.user.role not in ["teacher", "admin", "superadmin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
    school = request.user.school
    class_obj = get_object_or_404(Class, pk=class_id, school=school)
    
    # Get quizzes assigned to this class
    quizzes = Quiz.objects.filter(
        classes=class_obj,
        school=school
    ).select_related('subject', 'teacher', 'academic_year', 'term').prefetch_related('questions').order_by('-created_at')
    
    # Search functionality
    search_query = request.GET.get('search', '')
    if search_query:
        quizzes = quizzes.filter(
            Q(title__icontains=search_query) |
            Q(subject__subject_name__icontains=search_query) |
            Q(description__icontains=search_query)
        )
    
    # Filter by subject
    subject_filter = request.GET.get('subject', '')
    if subject_filter:
        quizzes = quizzes.filter(subject_id=subject_filter)
    
    # Filter by academic year
    academic_year_filter = request.GET.get('academic_year', '')
    if academic_year_filter:
        quizzes = quizzes.filter(academic_year_id=academic_year_filter)
    
    # Filter by status
    status_filter = request.GET.get('status', '')
    if status_filter:
        quizzes = quizzes.filter(status=status_filter)
    
    # Get filter options
    from ..models import Subject, AcademicYear
    subjects = Subject.objects.filter(
        id__in=quizzes.values_list('subject_id', flat=True).distinct(),
        school=school
    ).order_by('subject_name')
    
    academic_years = AcademicYear.objects.filter(
        id__in=quizzes.values_list('academic_year_id', flat=True).distinct(),
        school=school
    ).order_by('-start_date')
    
    context = {
        'class_obj': class_obj,
        'quizzes': quizzes,
        'subjects': subjects,
        'academic_years': academic_years,
        'search_query': search_query,
        'subject_filter': subject_filter,
        'academic_year_filter': academic_year_filter,
        'status_filter': status_filter,
    }
    
    return redirect("/app/teacher/quizzes")
