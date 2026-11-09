"""
Quiz Grading Management views for teachers.

This module provides views for grading student quiz attempts, especially essay questions:
- Listing attempts that need grading
- Viewing attempt details for grading
- Grading individual responses
- Bulk grading operations
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.models import Q, F
from django.db import transaction
from django.utils import timezone

from ..models import (
    QuizAttempt,
    QuizResponse,
)


@login_required
@require_http_methods(["GET"])
def quiz_grading_list_view(request):
    """
    Redirect the legacy grading queue to the React grading queue.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect("quiz_app:dashboard")
    return redirect("/app/teacher/grading")


@login_required
@require_http_methods(["GET"])
def quiz_attempt_grading_view(request, attempt_id):
    """
    Display attempt details for grading.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
    school = request.user.school
    
    # Teachers can only grade their own quizzes, admins can grade any quiz in their school
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect("quiz_app:dashboard")
        teacher = request.user.teacher_profile
        attempt = get_object_or_404(
            QuizAttempt,
            pk=attempt_id,
            quiz__teacher=teacher,
            quiz__school=school,
            student__school=school,
            school=school,
            is_submitted=True
        )
    else:
        # Admin can grade any attempt in their school
        attempt = get_object_or_404(
            QuizAttempt,
            pk=attempt_id,
            quiz__school=school,
            student__school=school,
            school=school,
            is_submitted=True
        )

    return redirect(f"/app/teacher/grading/{attempt.pk}")
@login_required
@require_http_methods(["GET", "POST"])
def quiz_response_grade_view(request, response_id):
    """
    Grade a single quiz response (especially for essay questions).
    
    GET: Returns grading form modal
    POST: Saves grade and returns JSON response
    """
    if request.user.role not in ["teacher", "admin"]:
        if request.method == "GET":
            return JsonResponse({'error': 'Permission denied'}, status=403)
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    school = request.user.school
    responses = QuizResponse.objects.filter(
        pk=response_id,
        school=school,
        attempt__school=school,
        attempt__quiz__school=school,
        attempt__student__school=school,
        question__school=school,
        question__quiz_id=F('attempt__quiz_id'),
    ).filter(
        Q(selected_choice__isnull=True) | Q(selected_choice__school=school)
    )
    if request.user.role == "teacher":
        teacher = request.user.teacher_profile
        if not teacher:
            return JsonResponse({'error': 'Teacher profile not found'}, status=404)
        responses = responses.filter(attempt__quiz__teacher=teacher)
    response = get_object_or_404(responses)
    
    if request.method == "GET":
        return redirect(f"/app/teacher/grading/{response.attempt_id}")
    
    # POST - Save grade
    try:
        import json
        data = json.loads(request.body) if request.body else {}
        
        marks_awarded = data.get('marks_awarded', '')
        grading_notes = data.get('grading_notes', '')
        
        # Validate marks
        try:
            marks_awarded = float(marks_awarded)
        except (ValueError, TypeError):
            return JsonResponse({
                'success': False,
                'error': 'Invalid marks value. Please enter a valid number.'
            }, status=400)
        
        # Validate marks are within question's max marks
        max_marks = response.attempt.configuration_snapshot.get(
            "questions", {}
        ).get(str(response.question_id), {}).get("marks", response.question.marks)
        if marks_awarded < 0:
            return JsonResponse({
                'success': False,
                'error': 'Marks cannot be negative.'
            }, status=400)
        
        if marks_awarded > max_marks:
            return JsonResponse({
                'success': False,
                'error': f'Marks cannot exceed the maximum marks for this question ({max_marks}).'
            }, status=400)
        
        with transaction.atomic():
            # Update response
            response.marks_awarded = marks_awarded
            response.grading_notes = grading_notes
            response.is_graded = True
            response.graded_by = request.user
            response.graded_at = timezone.now()
            response.grading_history = [
                *response.grading_history,
                {
                    "marks_awarded": marks_awarded,
                    "graded_by_id": request.user.pk,
                    "graded_at": response.graded_at.isoformat(),
                    "grading_notes": grading_notes,
                },
            ]
            
            # Determine if response is correct based on marks
            # For essay questions, consider it correct if marks > 0
            if response.question.question_type == 'essay':
                response.is_correct = marks_awarded > 0
            else:
                # For other types, check correctness normally
                response.check_correctness()
            
            response.save()
            
            # Recalculate attempt score
            response.attempt.calculate_score()
            
            # Check if all essay questions are now graded
            essay_responses = response.attempt.responses.filter(
                school=school,
                question__school=school,
                question__quiz_id=F('attempt__quiz_id'),
                question__question_type='essay',
            ).filter(
                Q(selected_choice__isnull=True)
                | Q(selected_choice__school=school)
            )
            all_graded = all(r.is_graded for r in essay_responses)
            
            if all_graded and essay_responses.exists():
                response.attempt.is_graded = True
                response.attempt.needs_grading = False
                response.attempt.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Response graded successfully.',
            'marks_awarded': marks_awarded,
            'all_graded': all_graded,
        })
    
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error grading response: {str(e)}", exc_info=True)
        return JsonResponse({
            'success': False,
            'error': f'Error grading response: {str(e)}'
        }, status=500)


@login_required
@require_http_methods(["POST"])
def quiz_attempt_bulk_grade_view(request, attempt_id):
    """
    Bulk grade multiple responses in an attempt.
    """
    if request.user.role not in ["teacher", "admin"]:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    school = request.user.school
    attempts = QuizAttempt.objects.filter(
        pk=attempt_id,
        school=school,
        quiz__school=school,
        student__school=school,
        is_submitted=True,
    )
    if request.user.role == "teacher":
        teacher = request.user.teacher_profile
        if not teacher:
            return JsonResponse({'error': 'Teacher profile not found'}, status=404)
        attempts = attempts.filter(quiz__teacher=teacher)
    attempt = get_object_or_404(attempts)
    
    try:
        import json
        data = json.loads(request.body)
        grades = data.get('grades', [])  # List of {response_id, marks_awarded, grading_notes}
        
        if not grades:
            return JsonResponse({
                'success': False,
                'error': 'No grades provided.'
            }, status=400)
        
        graded_count = 0
        errors = []
        
        with transaction.atomic():
            for grade_data in grades:
                response_id = grade_data.get('response_id')
                marks_awarded = grade_data.get('marks_awarded', 0)
                grading_notes = grade_data.get('grading_notes', '')
                
                try:
                    response = QuizResponse.objects.filter(
                        pk=response_id,
                        attempt=attempt,
                        school=school,
                        question__school=school,
                        question__quiz_id=F('attempt__quiz_id'),
                    ).filter(
                        Q(selected_choice__isnull=True)
                        | Q(selected_choice__school=school)
                    ).get()
                    
                    # Validate marks
                    marks_awarded = float(marks_awarded)
                    max_marks = response.attempt.configuration_snapshot.get(
                        "questions", {}
                    ).get(str(response.question_id), {}).get(
                        "marks", response.question.marks
                    )
                    
                    if marks_awarded < 0 or marks_awarded > max_marks:
                        errors.append(f"Response {response_id}: Invalid marks (0-{max_marks})")
                        continue
                    
                    # Update response
                    response.marks_awarded = marks_awarded
                    response.grading_notes = grading_notes
                    response.is_graded = True
                    response.graded_by = request.user
                    response.graded_at = timezone.now()
                    response.grading_history = [
                        *response.grading_history,
                        {
                            "marks_awarded": marks_awarded,
                            "graded_by_id": request.user.pk,
                            "graded_at": response.graded_at.isoformat(),
                            "grading_notes": grading_notes,
                        },
                    ]
                    
                    if response.question.question_type == 'essay':
                        response.is_correct = marks_awarded > 0
                    else:
                        response.check_correctness()
                    
                    response.save()
                    graded_count += 1
                    
                except QuizResponse.DoesNotExist:
                    errors.append(f"Response {response_id}: Not found")
                except (ValueError, TypeError):
                    errors.append(f"Response {response_id}: Invalid marks value")
                except Exception as e:
                    errors.append(f"Response {response_id}: {str(e)}")
            
            # Recalculate attempt score
            attempt.calculate_score()
            
            # Check if all essay questions are graded
            essay_responses = attempt.responses.filter(
                school=school,
                question__school=school,
                question__quiz_id=F('attempt__quiz_id'),
                question__question_type='essay',
            )
            all_graded = all(r.is_graded for r in essay_responses) if essay_responses.exists() else True
            
            if all_graded and essay_responses.exists():
                attempt.is_graded = True
                attempt.needs_grading = False
                attempt.save()
        
        if errors:
            return JsonResponse({
                'success': True,
                'message': f'{graded_count} response(s) graded successfully. {len(errors)} error(s) occurred.',
                'graded_count': graded_count,
                'errors': errors,
                'all_graded': all_graded,
            })
        
        return JsonResponse({
            'success': True,
            'message': f'{graded_count} response(s) graded successfully.',
            'graded_count': graded_count,
            'all_graded': all_graded,
        })
    
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error bulk grading: {str(e)}", exc_info=True)
        return JsonResponse({
            'success': False,
            'error': f'Error bulk grading: {str(e)}'
        }, status=500)
