"""
API views and React Shell view for the React frontend migration.

Governed by REACT_FRONTEND_MIGRATION_PLAN.md and docs/REACT_API_CONTRACTS.md.
"""
import json
from datetime import datetime
from urllib.parse import urlencode

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie
from django.middleware.csrf import get_token
from django.shortcuts import render, redirect, get_object_or_404
from django.db.models import Q, Avg, Count, Max, Prefetch, F
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.text import slugify
from django.core.exceptions import ValidationError
from django.core.paginator import Paginator

from .account_security import (
    generate_account_setup_password,
    schedule_password_setup_email,
)
from .models import (
    SchoolInformation,
    User,
    Student,
    Teacher,
    Class,
    Quiz,
    QuizCategory,
    Question,
    AnswerChoice,
    QuizAttempt,
    QuizResponse,
    AcademicYear,
    Term,
    TeacherSubjectAssignment,
    StudentClass,
    ClassSubject,
    Subject,
    Form,
    LearningArea,
    Department,
)
from .utils.tenant_utils import (
    get_user_school,
    get_write_school,
    is_authorized_superadmin,
)
from .views.student_quiz_management import (
    _submit_attempt_safely,
    _attempt_review_snapshot,
    get_client_ip,
)


@ensure_csrf_cookie
@require_http_methods(["GET"])
def me_api_view(request):
    """
    Return identity, profile, school context, and UI preferences for the current session.
    Returns 401 if unauthenticated, 403 if school user lacks valid school association.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse(
            {
                "code": "UNAUTHORIZED",
                "message": "Authentication required. Please log in.",
            },
            status=401,
        )

    is_superadmin = is_authorized_superadmin(user)
    school = None
    if not is_superadmin:
        school = get_user_school(request)
        if school is None:
            return JsonResponse(
                {
                    "code": "FORBIDDEN",
                    "message": "A valid school association is required.",
                },
                status=403,
            )

    # Build profile data
    role = getattr(user, "role", "unknown")
    profile_data = {
        "type": role,
        "id": user.pk,
        "teacher_id": None,
        "student_id": None,
        "department": None,
        "current_class": None,
    }

    if role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if teacher:
            profile_data["id"] = teacher.pk
            profile_data["teacher_id"] = getattr(teacher, "staff_id", None)
            profile_data["staff_id"] = getattr(teacher, "staff_id", None)
            dept = getattr(teacher, "department", None)
            profile_data["department"] = dept.name if dept else None
    elif role == "student":
        student = getattr(user, "student_profile", None)
        if student:
            profile_data["id"] = student.pk
            profile_data["student_id"] = getattr(student, "admission_number", None)
            profile_data["admission_number"] = getattr(student, "admission_number", None)
            if hasattr(student, "get_current_class"):
                current_cls = student.get_current_class()
                if current_cls:
                    profile_data["current_class"] = {
                        "id": current_cls.pk,
                        "name": str(current_cls),
                    }

    full_name = getattr(user, "full_name", "") or f"{user.first_name} {user.last_name}".strip() or user.username

    school_data = None
    if school:
        logo_url = None
        try:
            if school.logo:
                logo_url = school.logo.url
        except Exception:
            logo_url = None

        school_data = {
            "id": school.pk,
            "name": getattr(school, "name", ""),
            "school_code": getattr(school, "school_code", "") or getattr(school, "short_name", ""),
            "short_name": getattr(school, "short_name", ""),
            "slug": getattr(school, "slug", ""),
            "logo_url": logo_url,
            "is_active": getattr(school, "is_active", True),
        }

    return JsonResponse(
        {
            "user": {
                "id": user.pk,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "full_name": full_name,
                "role": role,
                "is_superadmin": is_superadmin,
            },
            "school": school_data,
            "profile": profile_data,
            "ui_preferences": {
                "theme": request.session.get("preferredTheme", "academic"),
            },
        }
    )


# --- Phase 3: Superadmin Endpoints ---

@require_http_methods(["GET"])
def superadmin_dashboard_api_view(request):
    """Return system-wide metrics and activity for the superadmin workspace."""
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse(
            {"code": "UNAUTHORIZED", "message": "Authentication required."},
            status=401,
        )
    if not is_authorized_superadmin(user):
        return JsonResponse(
            {"code": "FORBIDDEN", "message": "Superadmin permission required."},
            status=403,
        )

    schools = SchoolInformation.objects.all()
    stats = {
        "total_schools": schools.filter(is_active=True).count(),
        "inactive_schools": schools.filter(is_active=False).count(),
        "total_users": User.objects.count(),
        "total_admins": User.objects.filter(role="admin").count(),
        "total_teachers": User.objects.filter(role="teacher").count(),
        "total_students": User.objects.filter(role="student").count(),
        "total_superadmins": User.objects.filter(role="superadmin").count(),
        "total_students_all": Student.objects.count(),
        "total_teachers_all": Teacher.objects.count(),
        "total_classes": Class.objects.count(),
        "total_subjects": Subject.objects.count(),
        "total_quizzes": Quiz.objects.count(),
        "published_quizzes": Quiz.objects.filter(
            status="published", is_active=True
        ).count(),
        "draft_quizzes": Quiz.objects.filter(
            status="draft", is_active=True
        ).count(),
        "total_attempts": QuizAttempt.objects.count(),
        "completed_attempts": QuizAttempt.objects.filter(is_submitted=True).count(),
    }

    recent_schools = [
        {
            "id": school.pk,
            "name": school.name,
            "is_active": school.is_active,
            "created_at": school.date_created.isoformat()
            if school.date_created
            else None,
        }
        for school in schools.order_by("-date_created")[:5]
    ]
    schools_with_users = [
        {
            "id": school.pk,
            "name": school.name,
            "is_active": school.is_active,
            "user_count": school.user_count,
        }
        for school in SchoolInformation.objects.annotate(
            user_count=Count("users", distinct=True)
        ).order_by("-user_count", "name")[:5]
    ]
    schools_with_students = [
        {
            "id": school.pk,
            "name": school.name,
            "is_active": school.is_active,
            "student_count": school.student_count,
        }
        for school in SchoolInformation.objects.annotate(
            student_count=Count("students", distinct=True)
        ).order_by("-student_count", "name")[:5]
    ]
    recent_quizzes = [
        {
            "id": quiz.pk,
            "title": quiz.title,
            "status": quiz.status,
            "school_name": quiz.school.name if quiz.school else "",
            "teacher_name": quiz.teacher.full_name if quiz.teacher else "",
            "subject_name": quiz.subject.subject_name if quiz.subject else "",
            "created_at": quiz.created_at.isoformat() if quiz.created_at else None,
        }
        for quiz in Quiz.objects.select_related(
            "school", "teacher", "subject"
        ).order_by("-created_at")[:10]
    ]
    return JsonResponse(
        {
            "stats": stats,
            "recent_schools": recent_schools,
            "schools_with_users": schools_with_users,
            "schools_with_students": schools_with_students,
            "recent_quizzes": recent_quizzes,
        }
    )


def _school_validation_error(error):
    fields = getattr(error, "message_dict", {"__all__": error.messages})
    message = " ".join(message for messages in fields.values() for message in messages)
    return JsonResponse(
        {
            "code": "VALIDATION_ERROR",
            "message": message or "Please check the school details.",
            "fields": fields,
        },
        status=400,
    )


def _unique_school_slug(name, school_id=None):
    base = slugify(name)[:90] or "school"
    slug = base
    suffix = 2
    schools = SchoolInformation.objects.all()
    if school_id is not None:
        schools = schools.exclude(pk=school_id)
    while schools.filter(slug=slug).exists():
        slug = f"{base[:90 - len(str(suffix))]}-{suffix}"
        suffix += 1
    return slug


def _apply_school_form_data(school, request):
    form = request.POST
    school.name = form.get("name", "").strip()
    school.short_name = form.get("short_name", "").strip()
    school.address = form.get("address", "").strip()
    school.phone_number = form.get("phone_number", "").strip()
    school.postal_code = form.get("postal_code", "").strip() or None
    school.email = form.get("email", "").strip() or None
    school.website = form.get("website", "").strip() or None
    school.school_code = form.get("school_code", "").strip() or None
    school.motto = form.get("motto", "").strip() or None
    school.vision = form.get("vision", "").strip() or None
    school.mission = form.get("mission", "").strip() or None
    school.report_header = form.get("report_header", "").strip() or None
    school.report_footer = form.get("report_footer", "").strip() or None
    school.grading_system_description = (
        form.get("grading_system_description", "").strip() or None
    )

    if "is_active" in form:
        school.is_active = form.get("is_active", "").lower() in {"on", "true", "1"}
    if "logo" in request.FILES:
        school.logo = request.FILES["logo"]
    if "school_stamp" in request.FILES:
        school.school_stamp = request.FILES["school_stamp"]

    academic_year_id = form.get("current_academic_year", "").strip()
    if academic_year_id:
        try:
            school.current_academic_year = AcademicYear.objects.get(
                pk=academic_year_id, school=school
            )
        except (AcademicYear.DoesNotExist, ValueError):
            raise ValidationError(
                {"current_academic_year": "Invalid academic year selected."}
            )
    else:
        school.current_academic_year = None

    term_id = form.get("current_term", "").strip()
    if term_id:
        try:
            term = Term.objects.get(pk=term_id, school=school)
        except (Term.DoesNotExist, ValueError):
            raise ValidationError({"current_term": "Invalid term selected."})
        if (
            school.current_academic_year_id
            and term.academic_year_id != school.current_academic_year_id
        ):
            raise ValidationError(
                {
                    "current_term": (
                        "Selected term must belong to the current academic year."
                    )
                }
            )
        school.current_term = term
    else:
        school.current_term = None


def _serialize_superadmin_school_detail(request, school):
    current_year = school.current_academic_year
    current_term = school.current_term
    academic_years = AcademicYear.objects.filter(school=school).order_by("-start_date")
    terms = Term.objects.filter(school=school).select_related("academic_year").order_by(
        "-academic_year__start_date", "term_number"
    )
    return {
        "id": school.pk,
        "name": school.name,
        "short_name": school.short_name,
        "slug": school.slug,
        "address": school.address,
        "postal_code": school.postal_code or "",
        "phone_number": school.phone_number,
        "email": school.email or "",
        "website": school.website or "",
        "school_code": school.school_code or "",
        "is_active": school.is_active,
        "motto": school.motto or "",
        "vision": school.vision or "",
        "mission": school.mission or "",
        "report_header": school.report_header or "",
        "report_footer": school.report_footer or "",
        "grading_system_description": school.grading_system_description or "",
        "logo_url": request.build_absolute_uri(school.logo.url) if school.logo else None,
        "school_stamp_url": (
            request.build_absolute_uri(school.school_stamp.url)
            if school.school_stamp
            else None
        ),
        "current_academic_year": (
            {"id": current_year.pk, "name": current_year.name}
            if current_year
            else None
        ),
        "current_term": (
            {
                "id": current_term.pk,
                "name": f"Term {current_term.term_number}",
                "term_number": current_term.term_number,
                "academic_year_id": current_term.academic_year_id,
                "academic_year_name": current_term.academic_year.name,
            }
            if current_term
            else None
        ),
        "academic_years": [
            {
                "id": year.pk,
                "name": year.name,
                "start_date": year.start_date.isoformat(),
                "end_date": year.end_date.isoformat(),
                "is_current": year.is_current,
            }
            for year in academic_years
        ],
        "terms": [
            {
                "id": term.pk,
                "name": f"Term {term.term_number}",
                "term_number": term.term_number,
                "academic_year_id": term.academic_year_id,
                "academic_year_name": term.academic_year.name,
            }
            for term in terms
        ],
        "created_at": school.date_created.isoformat(),
        "updated_at": school.last_updated.isoformat(),
        "created_by_name": school.created_by.full_name if school.created_by else "",
    }


@require_http_methods(["GET", "POST"])
def superadmin_schools_api_view(request):
    """
    List schools or create a school (superadmin only).
    """
    if not getattr(request.user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)
    if not is_authorized_superadmin(request.user):
        return JsonResponse({"code": "FORBIDDEN", "message": "Superadmin permission required."}, status=403)

    if request.method == "POST":
        school = SchoolInformation(
            created_by=request.user,
            updated_by=request.user,
        )
        try:
            _apply_school_form_data(school, request)
            school.slug = _unique_school_slug(school.name)
            school.full_clean(exclude=["created_by"])
        except ValidationError as error:
            return _school_validation_error(error)
        with transaction.atomic():
            school.save()
        return JsonResponse(
            {
                "success": True,
                "message": f"School {school.name} created successfully.",
                "school_id": school.pk,
            },
            status=201,
        )

    schools = SchoolInformation.objects.all().order_by("name")

    search_query = request.GET.get("search", "").strip()
    if search_query:
        schools = schools.filter(
            Q(name__icontains=search_query)
            | Q(short_name__icontains=search_query)
            | Q(school_code__icontains=search_query)
            | Q(address__icontains=search_query)
        )

    active_filter = request.GET.get("is_active", "").strip().lower()
    if active_filter == "true":
        schools = schools.filter(is_active=True)
    elif active_filter == "false":
        schools = schools.filter(is_active=False)

    results = []
    for s in schools:
        results.append({
            "id": s.pk,
            "name": s.name,
            "short_name": s.short_name,
            "school_code": s.school_code or s.short_name,
            "slug": s.slug,
            "address": s.address,
            "phone_number": s.phone_number,
            "email": s.email or "",
            "website": s.website or "",
            "is_active": s.is_active,
            "current_academic_year": (
                s.current_academic_year.name if s.current_academic_year else None
            ),
            "total_students": s.students.count(),
            "total_teachers": s.teachers.count(),
            "total_classes": s.classes.count(),
        })

    return JsonResponse({"count": len(results), "results": results})


@require_http_methods(["GET", "POST", "DELETE"])
def superadmin_school_detail_api_view(request, school_id):
    """Retrieve, update, or safely delete one school (superadmin only)."""
    if not getattr(request.user, "is_authenticated", False):
        return JsonResponse(
            {"code": "UNAUTHORIZED", "message": "Authentication required."},
            status=401,
        )
    if not is_authorized_superadmin(request.user):
        return JsonResponse(
            {"code": "FORBIDDEN", "message": "Superadmin permission required."},
            status=403,
        )

    school = SchoolInformation.objects.filter(pk=school_id).first()
    if school is None:
        return JsonResponse(
            {"code": "NOT_FOUND", "message": "School not found."}, status=404
        )

    if request.method == "GET":
        return JsonResponse({"school": _serialize_superadmin_school_detail(request, school)})

    if request.method == "DELETE":
        if school.users.exists() or school.students.exists() or school.teachers.exists():
            return JsonResponse(
                {
                    "code": "SCHOOL_HAS_ASSOCIATED_RECORDS",
                    "message": (
                        "Cannot delete school. It has associated users, students, "
                        "or teachers."
                    ),
                },
                status=400,
            )
        school_name = school.name
        school.delete()
        return JsonResponse(
            {"success": True, "message": f"School {school_name} deleted successfully."}
        )

    try:
        _apply_school_form_data(school, request)
        school.updated_by = request.user
        if not school.slug or school.slug == "default-school":
            school.slug = _unique_school_slug(school.name, school.pk)
        school.full_clean(exclude=["created_by"])
    except ValidationError as error:
        return _school_validation_error(error)
    with transaction.atomic():
        school.save()
    return JsonResponse(
        {
            "success": True,
            "message": "School information updated successfully.",
            "school_id": school.pk,
        }
    )


def _serialize_superadmin_admin(admin):
    school = admin.school
    return {
        "id": admin.pk,
        "username": admin.username,
        "email": admin.email,
        "full_name": admin.full_name or admin.username,
        "is_active": admin.is_active,
        "date_joined": admin.date_joined.isoformat(),
        "last_login": admin.last_login.isoformat() if admin.last_login else None,
        "last_login_ip": admin.last_login_ip,
        "school": (
            {
                "id": school.pk,
                "name": school.name,
                "school_code": school.school_code or school.short_name,
                "address": school.address,
                "phone_number": school.phone_number,
                "is_active": school.is_active,
            }
            if school
            else None
        ),
    }


def _admin_validation_error(error):
    fields = getattr(error, "message_dict", {"__all__": error.messages})
    message = " ".join(message for messages in fields.values() for message in messages)
    return JsonResponse(
        {
            "code": "VALIDATION_ERROR",
            "message": message or "Please check the administrator details.",
            "fields": fields,
        },
        status=400,
    )


@require_http_methods(["GET", "POST"])
def superadmin_admins_api_view(request):
    """
    List or create school administrators across all schools (superadmin only).
    """
    if not getattr(request.user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)
    if not is_authorized_superadmin(request.user):
        return JsonResponse({"code": "FORBIDDEN", "message": "Superadmin permission required."}, status=403)

    if request.method == "POST":
        form = request.POST
        username = form.get("username", "").strip()
        email = form.get("email", "").strip()
        full_name = form.get("full_name", "").strip()
        school_id = form.get("school", "").strip()
        errors = {}
        if not username:
            errors["username"] = ["Username is required."]
        if not email:
            errors["email"] = ["Email is required."]
        if not full_name:
            errors["full_name"] = ["Full name is required."]
        if not school_id:
            errors["school"] = ["School is required."]
        if errors:
            return _admin_validation_error(ValidationError(errors))

        if not school_id.isdigit():
            return _admin_validation_error(
                ValidationError({"school": "Invalid school selected."})
            )
        school = SchoolInformation.objects.filter(
            pk=school_id, is_active=True
        ).first()
        if school is None:
            return _admin_validation_error(
                ValidationError({"school": "Invalid school selected."})
            )

        admin = User(
            username=username,
            email=email,
            full_name=full_name,
            role="admin",
            school=school,
            is_active=True,
        )
        admin.set_password(generate_account_setup_password())
        try:
            admin.full_clean()
        except ValidationError as error:
            return _admin_validation_error(error)

        with transaction.atomic():
            admin.save()
            email_scheduled = schedule_password_setup_email(admin)
        if email_scheduled:
            message = (
                f"Administrator {admin.full_name} created successfully for "
                f"{school.name}. A password setup link will be sent to the "
                "provided email."
            )
        else:
            message = (
                f"Administrator {admin.full_name} was created for {school.name}, "
                "but a password setup email could not be scheduled."
            )
        return JsonResponse(
            {
                "success": True,
                "message": message,
                "admin_id": admin.pk,
                "password_setup_email_scheduled": email_scheduled,
            },
            status=201,
        )

    admins = User.objects.filter(role="admin").select_related("school").order_by("school__name", "full_name")

    search_query = request.GET.get("search", "").strip()
    if search_query:
        admins = admins.filter(
            Q(full_name__icontains=search_query)
            | Q(username__icontains=search_query)
            | Q(email__icontains=search_query)
            | Q(school__name__icontains=search_query)
        )

    school_filter = request.GET.get("school_id") or request.GET.get("school")
    if school_filter:
        if not school_filter.isdigit():
            return _admin_validation_error(
                ValidationError({"school": "Select a valid school."})
            )
        admins = admins.filter(school_id=school_filter)

    active_filter = request.GET.get("is_active", "").strip().lower()
    if active_filter == "true":
        admins = admins.filter(is_active=True)
    elif active_filter == "false":
        admins = admins.filter(is_active=False)

    results = [_serialize_superadmin_admin(admin) for admin in admins]

    return JsonResponse({"count": len(results), "results": results})


@require_http_methods(["GET", "POST", "DELETE"])
def superadmin_admin_detail_api_view(request, admin_id):
    """Retrieve, update, or delete one school administrator."""
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse(
            {"code": "UNAUTHORIZED", "message": "Authentication required."},
            status=401,
        )
    if not is_authorized_superadmin(user):
        return JsonResponse(
            {"code": "FORBIDDEN", "message": "Superadmin permission required."},
            status=403,
        )

    admin = User.objects.filter(pk=admin_id, role="admin").select_related("school").first()
    if admin is None:
        return JsonResponse(
            {"code": "NOT_FOUND", "message": "Administrator not found."}, status=404
        )

    if request.method == "GET":
        return JsonResponse({"admin": _serialize_superadmin_admin(admin)})

    if request.method == "DELETE":
        if admin.pk == user.pk:
            return JsonResponse(
                {
                    "code": "SELF_DELETE_FORBIDDEN",
                    "message": "You cannot delete your own account.",
                },
                status=400,
            )
        admin_name = admin.full_name
        school_name = admin.school.name if admin.school else "Unknown"
        admin.delete()
        return JsonResponse(
            {
                "success": True,
                "message": (
                    f"Administrator {admin_name} from {school_name} deleted successfully."
                ),
            }
        )

    form = request.POST
    email = form.get("email", "").strip()
    full_name = form.get("full_name", "").strip()
    school_id = form.get("school", "").strip()
    password = form.get("password", "").strip()
    errors = {}
    if not email:
        errors["email"] = ["Email is required."]
    if not full_name:
        errors["full_name"] = ["Full name is required."]
    if not school_id:
        errors["school"] = ["School is required."]
    if errors:
        return _admin_validation_error(ValidationError(errors))

    if not school_id.isdigit():
        return _admin_validation_error(
            ValidationError({"school": "Invalid school selected."})
        )
    school = SchoolInformation.objects.filter(pk=school_id).filter(
        Q(is_active=True) | Q(pk=admin.school_id)
    ).first()
    if school is None:
        return _admin_validation_error(
            ValidationError({"school": "Invalid school selected."})
        )

    admin.email = email
    admin.full_name = full_name
    admin.school = school
    admin.is_active = form.get("is_active", "").lower() in {"on", "true", "1"}
    if password:
        admin.set_password(password)
    try:
        admin.full_clean(exclude=["password"])
    except ValidationError as error:
        return _admin_validation_error(error)
    with transaction.atomic():
        admin.save()
    return JsonResponse(
        {
            "success": True,
            "message": f"Administrator {admin.full_name} updated successfully.",
            "admin_id": admin.pk,
        }
    )


# --- Phase 3: School Admin & Teacher Scoped Endpoints ---

@require_http_methods(["GET"])
def students_api_view(request):
    """
    List students scoped strictly to user's school and teacher assignments.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["admin", "superadmin", "teacher"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Permission denied."}, status=403)

    school = get_user_school(request)
    if not is_authorized_superadmin(user) and school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    students = Student.objects.all()

    if role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        school = teacher.school
        teacher_assignments = TeacherSubjectAssignment.objects.filter(
            teacher=teacher,
            is_active=True,
            school=school,
        )
        teacher_classes = teacher_assignments.values_list("class_assigned", flat=True).distinct()
        if not teacher_classes:
            students = Student.objects.none()
        else:
            students = students.filter(
                studentclass__assigned_class__in=teacher_classes,
                studentclass__is_active=True,
                studentclass__school=school,
                school=school,
                is_active=True,
            ).distinct()
    elif role == "admin":
        students = students.filter(school=school)
    elif role == "superadmin":
        school_id = request.GET.get("school_id")
        if school_id:
            school = SchoolInformation.objects.filter(
                pk=school_id, is_active=True
            ).first()
            if not school:
                return JsonResponse({"code": "VALIDATION_ERROR", "message": "Select an active school."}, status=400)
            students = students.filter(school=school)

    if role in ["admin", "superadmin"]:
        status_filter = request.GET.get("status", "active").strip().lower()
        if status_filter == "archived":
            students = students.filter(is_active=False)
        elif status_filter != "all":
            students = students.filter(is_active=True)
        status_filter = request.GET.get("status", "active").strip().lower()
        if status_filter == "archived":
            students = students.filter(is_active=False)
        elif status_filter == "active":
            students = students.filter(is_active=True)

    search_query = request.GET.get("search", "").strip()
    if search_query:
        students = students.filter(
            Q(full_name__icontains=search_query)
            | Q(admission_number__icontains=search_query)
            | Q(email__icontains=search_query)
        )

    class_id = request.GET.get("class_id")
    if class_id:
        enrollment_filter = {
            "studentclass__assigned_class_id": class_id,
            "studentclass__is_active": True,
        }
        if school:
            enrollment_filter["studentclass__school"] = school
        students = students.filter(**enrollment_filter)

    form_id = request.GET.get("form_id")
    if form_id:
        enrollment_filter = {
            "studentclass__assigned_class__form_id": form_id,
            "studentclass__is_active": True,
        }
        if school:
            enrollment_filter["studentclass__school"] = school
        students = students.filter(**enrollment_filter)

    learning_area_id = request.GET.get("learning_area_id")
    if learning_area_id:
        students = students.filter(learning_area_id=learning_area_id)

    gender = request.GET.get("gender")
    if gender:
        students = students.filter(gender=gender)

    students = students.select_related("form", "learning_area", "school").prefetch_related(
        "studentclass_set__assigned_class"
    ).order_by("full_name")

    page_obj = Paginator(students, 50).get_page(request.GET.get("page"))

    results = []
    for s in page_obj.object_list:
        curr_cls = s.get_current_class() if hasattr(s, "get_current_class") else None
        current_form = curr_cls.form if curr_cls and curr_cls.form_id else s.form
        current_learning_area = (
            curr_cls.learning_area
            if curr_cls and curr_cls.learning_area_id
            else s.learning_area
        )
        results.append({
            "id": s.pk,
            "admission_number": s.admission_number,
            "full_name": s.full_name,
            "gender": s.gender,
            "date_of_birth": s.date_of_birth.isoformat() if s.date_of_birth else None,
            "admission_date": s.admission_date.isoformat() if s.admission_date else None,
            "parent_contact": s.parent_contact,
            "email": s.email or "",
            "form": s.form.name if s.form else None,
            "form_id": s.form_id,
            "learning_area_id": s.learning_area_id,
            "form_name": current_form.name if current_form else None,
            "class_name": str(curr_cls) if curr_cls else "",
            "learning_area": current_learning_area.name if current_learning_area else None,
            "current_class": {
                "id": curr_cls.pk,
                "name": str(curr_cls),
            } if curr_cls else None,
            "school_id": s.school_id,
            "school_name": s.school.name if s.school else "",
            "is_active": s.is_active,
        })

    return JsonResponse({
        "count": page_obj.paginator.count,
        "page": page_obj.number,
        "total_pages": page_obj.paginator.num_pages,
        "results": results,
    })


@require_http_methods(["GET"])
def teachers_api_view(request):
    """
    List teachers scoped strictly to user's school.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["admin", "superadmin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Admin permission required."}, status=403)

    school = get_user_school(request)
    if not is_authorized_superadmin(user) and school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    if is_authorized_superadmin(user) and request.GET.get("school_id"):
        school = SchoolInformation.objects.filter(
            pk=request.GET.get("school_id"), is_active=True
        ).first()
        if school is None:
            return JsonResponse({"code": "VALIDATION_ERROR", "message": "Select an active school."}, status=400)

    teachers = (Teacher.objects.filter(school=school) if school else Teacher.objects.all()).annotate(
        assigned_classes_count=Count(
            "teachersubjectassignment__class_assigned",
            filter=Q(teachersubjectassignment__is_active=True),
            distinct=True,
        )
    )

    search_query = request.GET.get("search", "").strip()
    if search_query:
        teachers = teachers.filter(
            Q(full_name__icontains=search_query)
            | Q(staff_id__icontains=search_query)
            | Q(email__icontains=search_query)
        )

    dept_id = request.GET.get("department_id")
    if dept_id:
        teachers = teachers.filter(department_id=dept_id)

    active_filter = request.GET.get("is_active", "").strip().lower()
    if active_filter == "true":
        teachers = teachers.filter(is_active=True)
    elif active_filter == "false":
        teachers = teachers.filter(is_active=False)

    teachers = teachers.select_related("department", "school").order_by("full_name")

    results = []
    for t in teachers:
        results.append({
            "id": t.pk,
            "staff_id": t.staff_id,
            "full_name": t.full_name,
            "gender": t.gender,
            "contact_number": t.contact_number,
            "email": t.email or "",
            "department": t.department.name if t.department else None,
            "department_name": t.department.name if t.department else "",
            "department_id": t.department_id,
            "assigned_classes_count": t.assigned_classes_count,
            "is_active": getattr(t, "is_active", True),
            "school_id": t.school_id,
        })

    return JsonResponse({"count": len(results), "results": results})


@require_http_methods(["GET"])
def users_api_view(request):
    """
    List users scoped to the current admin or superadmin context.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["admin", "superadmin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Admin permission required."}, status=403)

    school = get_user_school(request)
    if not is_authorized_superadmin(user) and school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    users = User.objects.select_related("school")
    if role == "admin":
        users = users.filter(school=school).exclude(role="superadmin")
    else:
        school_id = request.GET.get("school_id")
        if school_id:
            users = users.filter(school_id=school_id)

    search_query = request.GET.get("search", "").strip()
    if search_query:
        users = users.filter(
            Q(username__icontains=search_query)
            | Q(email__icontains=search_query)
            | Q(full_name__icontains=search_query)
        )

    filter_role = request.GET.get("role", "").strip()
    if filter_role and filter_role in dict(User.ROLES):
        users = users.filter(role=filter_role)

    users = users.order_by("full_name", "username")
    page_obj = Paginator(users, 50).get_page(request.GET.get("page"))

    results = []
    for u in page_obj.object_list:
        results.append({
            "id": u.pk,
            "username": u.username,
            "email": u.email or "",
            "full_name": u.full_name or u.get_full_name() or u.username,
            "role": u.role,
            "is_active": getattr(u, "is_active", True),
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "school": {
                "id": u.school.pk,
                "name": u.school.name,
                "school_code": u.school.school_code or u.school.short_name,
            } if u.school else None,
        })

    return JsonResponse({
        "count": page_obj.paginator.count,
        "page": page_obj.number,
        "total_pages": page_obj.paginator.num_pages,
        "results": results,
    })


@require_http_methods(["GET"])
def admin_dashboard_api_view(request):
    """
    Return summary metrics for the Admin Dashboard.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["admin", "superadmin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Admin permission required."}, status=403)

    school = get_user_school(request)
    if not is_authorized_superadmin(user) and school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    if school:
        total_students = Student.objects.filter(school=school, is_active=True).count()
        total_teachers = Teacher.objects.filter(school=school).count()
        total_classes = Class.objects.filter(school=school).count()
        total_quizzes = Quiz.objects.filter(school=school).count()
        curr_year = AcademicYear.objects.filter(school=school, is_current=True).first()
        curr_term = Term.objects.filter(school=school, is_current=True).first()
        school_name = school.name
    else:
        total_students = Student.objects.filter(is_active=True).count()
        total_teachers = Teacher.objects.count()
        total_classes = Class.objects.count()
        total_quizzes = Quiz.objects.count()
        curr_year = AcademicYear.objects.filter(is_current=True).first()
        curr_term = Term.objects.filter(is_current=True).first()
        school_name = "Global Registry"

    return JsonResponse({
        "school_name": school_name,
        "total_students": total_students,
        "total_teachers": total_teachers,
        "total_classes": total_classes,
        "total_quizzes": total_quizzes,
        "active_academic_year": curr_year.name if curr_year else None,
        "active_term": curr_term.get_term_number_display() if curr_term else None,
    })


# --- Phase 4: Teacher Workspace Endpoints ---

@require_http_methods(["GET"])
def teacher_dashboard_api_view(request):
    """
    Teacher dashboard view with quiz statistics and recent activity.
    - Teachers see their own quiz statistics
    - Admins see all quiz statistics in their school
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)

    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    if role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        teacher_name = teacher.full_name
        quizzes = Quiz.objects.filter(teacher=teacher, school=school, is_active=True)
    else:
        teacher_name = user.full_name or user.username
        quizzes = Quiz.objects.filter(school=school, is_active=True)

    total_quizzes = quizzes.count()
    published_quizzes = quizzes.filter(status="published").count()
    draft_quizzes = quizzes.filter(status="draft").count()
    archived_quizzes = quizzes.filter(status="archived").count()

    quiz_ids = quizzes.values_list("id", flat=True)
    attempts = QuizAttempt.objects.filter(
        quiz_id__in=quiz_ids,
        school=school,
    )

    total_attempts = attempts.count()
    completed_attempts = attempts.filter(is_submitted=True, is_completed=True)
    completed_attempts_count = completed_attempts.count()

    quizzes_needing_grading_count = attempts.filter(
        needs_grading=True,
        is_graded=False,
        is_submitted=True,
    ).values("quiz_id").distinct().count()

    avg_score = completed_attempts.aggregate(avg=Avg("percentage"))["avg"] or 0

    recent_quizzes = []
    for q in quizzes.select_related("subject").order_by("-created_at")[:5]:
        recent_quizzes.append({
            "id": q.pk,
            "title": q.title,
            "subject_name": q.subject.subject_name if q.subject else "",
            "status": q.status,
            "total_questions": q.questions.count(),
            "total_marks": q.total_marks,
            "created_at": q.created_at.isoformat() if hasattr(q, "created_at") and q.created_at else None,
        })

    recent_attempts = []
    for a in attempts.filter(is_submitted=True).select_related("quiz", "student").order_by("-submitted_at")[:5]:
        recent_attempts.append({
            "id": a.pk,
            "quiz_title": a.quiz.title,
            "student_name": a.student.full_name,
            "admission_number": a.student.admission_number,
            "score": a.score,
            "total_marks": a.quiz.total_marks,
            "percentage": round(a.percentage, 1),
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            "is_graded": a.is_graded,
        })

    return JsonResponse({
        "teacher_name": teacher_name,
        "total_quizzes": total_quizzes,
        "published_quizzes": published_quizzes,
        "draft_quizzes": draft_quizzes,
        "archived_quizzes": archived_quizzes,
        "total_attempts": total_attempts,
        "completed_attempts_count": completed_attempts_count,
        "quizzes_needing_grading_count": quizzes_needing_grading_count,
        "avg_score": round(avg_score, 1),
        "recent_quizzes": recent_quizzes,
        "recent_attempts": recent_attempts,
    })


@require_http_methods(["GET"])
def teacher_quizzes_api_view(request):
    """
    List quizzes for the teacher (or all quizzes in school if admin).
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)

    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    if role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        quizzes = Quiz.objects.filter(teacher=teacher, school=school, is_active=True)
    else:
        quizzes = Quiz.objects.filter(school=school, is_active=True)

    status_filter = request.GET.get("status", "").strip().lower()
    if status_filter in ["draft", "published", "archived"]:
        quizzes = quizzes.filter(status=status_filter)

    search_query = request.GET.get("search", "").strip()
    if search_query:
        quizzes = quizzes.filter(
            Q(title__icontains=search_query)
            | Q(subject__subject_name__icontains=search_query)
        )

    quizzes = quizzes.select_related("subject", "academic_year", "term").order_by("-created_at")

    results = []
    for q in quizzes[:150]:
        attempts = q.attempts.filter(school=school, is_submitted=True)
        avg_score = attempts.aggregate(avg=Avg("percentage"))["avg"] or 0
        results.append({
            "id": q.pk,
            "title": q.title,
            "subject_name": q.subject.subject_name if q.subject else "",
            "academic_year": q.academic_year.name if q.academic_year else "",
            "term": q.term.get_term_number_display() if q.term else "",
            "status": q.status,
            "duration_minutes": q.time_limit,
            "total_questions": q.questions.count(),
            "total_marks": q.total_marks,
            "total_attempts": attempts.count(),
            "avg_score": round(avg_score, 1),
            "created_at": q.created_at.isoformat() if hasattr(q, "created_at") and q.created_at else None,
        })

    return JsonResponse({
        "count": len(results),
        "page": 1,
        "total_pages": 1,
        "results": results,
    })


@require_http_methods(["GET"])
def teacher_quiz_detail_api_view(request, quiz_id):
    """
    Detailed quiz metadata and question preview for teachers/admins.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)

    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    if role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        quiz = get_object_or_404(Quiz, pk=quiz_id, teacher=teacher, school=school)
    else:
        quiz = get_object_or_404(Quiz, pk=quiz_id, school=school)

    assigned_classes = [
        {"id": c.pk, "name": c.name}
        for c in quiz.classes.filter(school=school)
    ]

    questions_data = []
    for q in quiz.questions.filter(school=school).prefetch_related(
        Prefetch(
            "answer_choices",
            queryset=AnswerChoice.objects.filter(school=school),
        )
    ).order_by("order", "created_at"):
        choices_data = [
            {
                "id": ch.pk,
                "choice_text": ch.choice_text,
                "is_correct": ch.is_correct,
            }
            for ch in q.answer_choices.all().order_by("order")
        ]
        questions_data.append({
            "id": q.pk,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "marks": q.marks,
            "order": q.order,
            "explanation": q.explanation or "",
            "correct_answer_text": q.correct_answer_text or "",
            "config": q.config or {},
            "difficulty": q.difficulty,
            "negative_marks": q.negative_marks,
            "is_required": q.is_required,
            "section_id": q.section_id,
            "group_id": q.group_id,
            "choices": choices_data,
        })

    pass_pct = round((quiz.passing_marks / quiz.total_marks * 100), 1) if quiz.total_marks > 0 else 0
    sections_data = []
    for section in quiz.sections.filter(school=school).prefetch_related("groups", "questions"):
        sections_data.append({
            "id": section.pk,
            "title": section.title,
            "instructions": section.instructions,
            "order": section.order,
            "time_limit_minutes": section.time_limit_minutes,
            "choose_n": section.choose_n,
            "question_ids": list(
                section.questions.filter(school=school).order_by("order", "pk").values_list("pk", flat=True)
            ),
            "groups": [
                {
                    "id": group.pk,
                    "title": group.title,
                    "stimulus_text": group.stimulus_text,
                    "order": group.order,
                }
                for group in section.groups.filter(school=school)
            ],
        })

    return JsonResponse({
        "id": quiz.pk,
        "title": quiz.title,
        "description": quiz.description or "",
        "instructions": quiz.instructions or "",
        "subject_name": quiz.subject.subject_name if quiz.subject else "",
        "subject_id": quiz.subject_id,
        "category_id": quiz.category_id,
        "teacher_id": quiz.teacher_id,
        "academic_year": quiz.academic_year.name if quiz.academic_year else "",
        "academic_year_id": quiz.academic_year_id,
        "term": quiz.term.get_term_number_display() if quiz.term else "",
        "term_id": quiz.term_id,
        "status": quiz.status,
        "difficulty": quiz.difficulty,
        "duration_minutes": quiz.time_limit,
        "passing_marks": quiz.passing_marks,
        "pass_percentage": pass_pct,
        "max_attempts": quiz.max_attempts,
        "available_from": quiz.available_from.isoformat() if quiz.available_from else None,
        "available_until": quiz.available_until.isoformat() if quiz.available_until else None,
        "randomize_questions": quiz.randomize_questions,
        "randomize_answers": quiz.randomize_answers,
        "show_results_immediately": quiz.show_results_immediately,
        "show_correct_answers": quiz.show_correct_answers,
        "allow_review": quiz.allow_review,
        "require_password": quiz.require_password,
        "quiz_password": quiz.quiz_password or "",
        "total_questions": quiz.questions.count(),
        "total_marks": quiz.total_marks,
        "total_attempts": quiz.attempts.filter(school=school, is_submitted=True).count(),
        "assigned_classes": assigned_classes,
        "questions": questions_data,
        "sections": sections_data,
    })


@require_http_methods(["GET"])
def teacher_quiz_form_options_api_view(request):
    """Return school-scoped reference data for the React quiz editor."""
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)
    if getattr(user, "role", "") not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)

    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    teacher = getattr(user, "teacher_profile", None) if user.role == "teacher" else None
    if user.role == "teacher" and not teacher:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)

    subjects = Subject.objects.filter(school=school, is_active=True)
    if teacher:
        assigned_subject_ids = TeacherSubjectAssignment.objects.filter(
            teacher=teacher, school=school, is_active=True
        ).values_list("subject_id", flat=True)
        subjects = subjects.filter(pk__in=assigned_subject_ids)
        quiz_id = request.GET.get("quiz_id")
        if quiz_id:
            current_quiz = get_object_or_404(Quiz, pk=quiz_id, teacher=teacher, school=school)
            if current_quiz.subject_id:
                subjects = Subject.objects.filter(
                    school=school, is_active=True
                ).filter(Q(pk__in=assigned_subject_ids) | Q(pk=current_quiz.subject_id))

    classes = Class.objects.filter(school=school, is_active=True)
    if teacher:
        class_ids = TeacherSubjectAssignment.objects.filter(
            teacher=teacher, school=school, is_active=True
        ).values_list("class_assigned_id", flat=True)
        classes = classes.filter(pk__in=class_ids)

    years = AcademicYear.objects.filter(school=school).order_by("-start_date")
    categories = QuizCategory.objects.filter(
        school=school, is_active=True
    ).order_by("name")
    teachers = Teacher.objects.filter(school=school, is_active=True).order_by("full_name") if user.role == "admin" else []

    return JsonResponse({
        "subjects": [{"id": item.pk, "name": item.subject_name} for item in subjects.order_by("subject_name")],
        "classes": [{"id": item.pk, "name": item.name} for item in classes.order_by("name")],
        "academic_years": [{"id": item.pk, "name": item.name} for item in years],
        "terms": [
            {
                "id": item.pk,
                "academic_year_id": item.academic_year_id,
                "name": item.get_term_number_display(),
            }
            for item in Term.objects.filter(
                school=school, academic_year__in=years
            ).order_by("academic_year_id", "term_number")
        ],
        "categories": [{"id": item.pk, "name": item.name} for item in categories],
        "teachers": [{"id": item.pk, "name": item.full_name} for item in teachers],
        "is_admin": user.role == "admin",
    })


@require_http_methods(["GET"])
def teacher_quiz_assignments_api_view(request, quiz_id):
    """Return assigned and assignable classes for a school-scoped quiz."""
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)
    if getattr(user, "role", "") not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)
    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    quiz_filters = {"pk": quiz_id, "school": school}
    teacher = getattr(user, "teacher_profile", None) if user.role == "teacher" else None
    if user.role == "teacher":
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        quiz_filters["teacher"] = teacher
    quiz = get_object_or_404(Quiz, **quiz_filters)
    if not quiz.subject_id:
        return JsonResponse(
            {"code": "INVALID_QUIZ", "message": "Quiz must have a subject assigned before assigning classes."},
            status=400,
        )

    classes = Class.objects.filter(school=school, is_active=True)
    if teacher and quiz.subject_id:
        class_ids = TeacherSubjectAssignment.objects.filter(
            teacher=teacher,
            subject_id=quiz.subject_id,
            school=school,
            is_active=True,
        ).values_list("class_assigned_id", flat=True)
        classes = classes.filter(pk__in=class_ids)
    assigned = quiz.classes.filter(school=school).order_by("name")
    return JsonResponse({
        "quiz_id": quiz.pk,
        "quiz_title": quiz.title,
        "assigned_classes": [{"id": item.pk, "name": item.name} for item in assigned],
        "available_classes": [{"id": item.pk, "name": item.name} for item in classes.order_by("name")],
    })


@require_http_methods(["GET"])
def teacher_grading_detail_api_view(request, attempt_id):
    """Return a school-scoped submitted attempt and its responses for manual grading."""
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)
    if getattr(user, "role", "") not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)
    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    attempts = QuizAttempt.objects.filter(
        pk=attempt_id,
        school=school,
        quiz__school=school,
        student__school=school,
        is_submitted=True,
    )
    if user.role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        attempts = attempts.filter(quiz__teacher=teacher)
    attempt = get_object_or_404(attempts.select_related("quiz", "student"))
    responses = attempt.responses.filter(
        school=school,
        question__school=school,
        question__quiz_id=attempt.quiz_id,
        question__question_type="essay",
    ).select_related("question").order_by("question__order")
    return JsonResponse({
        "id": attempt.pk,
        "quiz_id": attempt.quiz_id,
        "quiz_title": attempt.quiz.title,
        "student_name": attempt.student.full_name,
        "admission_number": attempt.student.admission_number,
        "score": attempt.score,
        "total_marks": attempt.quiz.total_marks,
        "responses": [
            {
                "id": item.pk,
                "question_text": item.question.question_text,
                "question_marks": item.question.marks,
                "marks_awarded": item.marks_awarded,
                "text_answer": item.text_answer or "",
                "grading_notes": item.grading_notes or "",
                "is_graded": item.is_graded,
            }
            for item in responses
        ],
    })


def _serialize_result_school_info(school):
    return {
        "name": school.name or "",
        "address": school.address or "",
        "phone_number": school.phone_number or "",
        "email": school.email or "",
        "logo_url": school.logo.url if school.logo else None,
    }


@require_http_methods(["GET"])
def teacher_result_detail_api_view(request, attempt_id):
    """Return a school-scoped teacher view of a submitted quiz attempt."""
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)
    if getattr(user, "role", "") not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)
    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    attempts = QuizAttempt.objects.filter(
        pk=attempt_id,
        school=school,
        quiz__school=school,
        student__school=school,
        is_submitted=True,
    )
    if user.role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        attempts = attempts.filter(quiz__teacher=teacher)
    attempt = get_object_or_404(attempts.select_related("quiz", "student"))
    responses = attempt.responses.filter(
        school=school,
        question__school=school,
        question__quiz_id=attempt.quiz_id,
    ).filter(
        Q(selected_choice__isnull=True) | Q(selected_choice__school=school)
    ).select_related("question", "selected_choice").prefetch_related(
        Prefetch("selected_choices", queryset=AnswerChoice.objects.filter(school=school)),
        Prefetch("question__answer_choices", queryset=AnswerChoice.objects.filter(school=school)),
    ).order_by("question__order")
    questions = attempt.quiz.questions.filter(school=school).prefetch_related(
        Prefetch("answer_choices", queryset=AnswerChoice.objects.filter(school=school))
    ).order_by("order")
    _, questions, responses = _attempt_review_snapshot(
        attempt, attempt.quiz, questions, responses
    )
    responses_by_question = {item.question_id: item for item in responses}
    response_data = []
    from .question_types import serialize_for_review

    for question in questions:
        question_snapshot = attempt.configuration_snapshot.get(
            "questions", {}
        ).get(str(question.pk), {})
        choice_snapshots = question_snapshot.get("choices", {})
        question_text = question_snapshot.get("question_text", question.question_text)
        question_type = question_snapshot.get("question_type", question.question_type)
        question_marks = question_snapshot.get("marks", question.marks)
        item = responses_by_question.get(question.pk)
        if item is None:
            response_data.append({
                "id": -question.pk,
                "question_text": question_text,
                "question_type": question_type,
                "marks": question_marks,
                "marks_awarded": 0,
                "text_answer": "",
                "selected_choice": "",
                "selected_choices": [],
                "answer_data": {},
                "review_data": {"student_answer": "", "correct_answer": None},
                "is_correct": False,
                "is_answered": False,
                "answer_key": question_snapshot.get(
                    "correct_answer_text", question.correct_answer_text or ""
                ),
                "correct_choices": [
                    choice.get("text", "")
                    for choice in choice_snapshots.values()
                    if choice.get("is_correct")
                ],
                "grading_notes": "",
            })
            continue
        selected_choices = [
            choice.choice_text
            for choice in item.selected_choices.all()
            if choice.school_id == school.pk
        ]
        review_data = serialize_for_review(
            question, item, question_snapshot, show_correct_answers=True
        )
        response_data.append({
            "id": item.pk,
            "question_text": question_text,
            "question_type": question_type,
            "marks": question_marks,
            "marks_awarded": item.marks_awarded,
            "text_answer": item.text_answer or "",
            "selected_choice": item.selected_choice.choice_text if item.selected_choice else "",
            "selected_choices": selected_choices,
            "answer_data": item.answer_data or {},
            "review_data": review_data,
            "is_correct": item.is_correct,
            "is_answered": bool(
                item.text_answer or item.selected_choice_id or selected_choices or item.answer_data
            ),
            "answer_key": question_snapshot.get(
                "correct_answer_text", item.question.correct_answer_text or ""
            ),
            "correct_choices": [
                choice.get("text", "")
                for choice in choice_snapshots.values()
                if choice.get("is_correct")
            ],
            "grading_notes": item.grading_notes or "",
        })
    return JsonResponse({
        "id": attempt.pk,
        "quiz_title": attempt.quiz.title,
        "student_name": attempt.student.full_name,
        "admission_number": attempt.student.admission_number,
        "subject_name": attempt.quiz.subject.subject_name if attempt.quiz.subject else "",
        "teacher_name": attempt.quiz.teacher.full_name if attempt.quiz.teacher else "",
        "academic_year": attempt.academic_year.name if attempt.academic_year else "",
        "score": attempt.score,
        "total_marks": attempt.quiz.total_marks,
        "percentage": round(attempt.percentage, 1),
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "duration_minutes": attempt.get_duration_minutes(),
        "correct_answers": attempt.correct_answers,
        "wrong_answers": attempt.wrong_answers,
        "unanswered": attempt.unanswered,
        "school_info": _serialize_result_school_info(school),
        "is_graded": attempt.is_graded,
        "responses": response_data,
    })


@require_http_methods(["GET"])
def teacher_results_api_view(request):
    """
    List completed quiz attempts and scores for teacher's quizzes.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)

    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    if role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        quizzes = Quiz.objects.filter(teacher=teacher, school=school)
    else:
        quizzes = Quiz.objects.filter(school=school)

    attempts = QuizAttempt.objects.filter(
        quiz__in=quizzes,
        school=school,
        is_submitted=True,
    )

    quiz_id = request.GET.get("quiz_id")
    if quiz_id:
        attempts = attempts.filter(quiz_id=quiz_id)

    search_query = request.GET.get("search", "").strip()
    if search_query:
        attempts = attempts.filter(
            Q(student__full_name__icontains=search_query)
            | Q(student__admission_number__icontains=search_query)
            | Q(quiz__title__icontains=search_query)
        )

    attempts = attempts.select_related("quiz", "student").order_by("-submitted_at")

    results = []
    for a in attempts[:250]:
        curr_cls = a.student.get_current_class() if hasattr(a.student, "get_current_class") else None
        is_passed = a.score >= a.quiz.passing_marks if a.quiz.passing_marks else True
        results.append({
            "id": a.pk,
            "quiz_id": a.quiz.pk,
            "quiz_title": a.quiz.title,
            "student_name": a.student.full_name,
            "admission_number": a.student.admission_number,
            "class_name": curr_cls.name if curr_cls else "Unassigned",
            "score": a.score,
            "total_marks": a.quiz.total_marks,
            "percentage": round(a.percentage, 1),
            "is_passed": is_passed,
            "needs_grading": a.needs_grading,
            "is_graded": a.is_graded,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        })

    return JsonResponse({
        "count": len(results),
        "results": results,
    })


@require_http_methods(["GET"])
def teacher_grading_api_view(request):
    """
    List quiz attempts waiting for manual essay grading.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required."}, status=401)

    role = getattr(user, "role", "")
    if role not in ["teacher", "admin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Teacher or Admin role required."}, status=403)

    school = get_user_school(request)
    if school is None:
        return JsonResponse({"code": "FORBIDDEN", "message": "A valid school association is required."}, status=403)

    if role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return JsonResponse({"code": "FORBIDDEN", "message": "Teacher profile not found."}, status=403)
        quizzes = Quiz.objects.filter(teacher=teacher, school=school)
    else:
        quizzes = Quiz.objects.filter(school=school)

    attempts = QuizAttempt.objects.filter(
        quiz__in=quizzes,
        school=school,
        is_submitted=True,
        needs_grading=True,
        is_graded=False,
    ).select_related("quiz", "student").order_by("-submitted_at")

    results = []
    for a in attempts[:100]:
        ungraded_count = a.responses.filter(
            question__question_type="essay",
            is_graded=False,
        ).count()
        curr_cls = a.student.get_current_class() if hasattr(a.student, "get_current_class") else None
        results.append({
            "id": a.pk,
            "quiz_id": a.quiz.pk,
            "quiz_title": a.quiz.title,
            "student_name": a.student.full_name,
            "admission_number": a.student.admission_number,
            "class_name": curr_cls.name if curr_cls else "Unassigned",
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            "ungraded_responses_count": ungraded_count,
        })

    return JsonResponse({
        "count": len(results),
        "results": results,
    })


def _parse_request_data(request):
    """Parse JSON or form payload from request."""
    if request.content_type and "application/json" in request.content_type:
        try:
            return json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            return {}
    return request.POST


def _get_authenticated_student(request):
    """
    Validate that request.user is authenticated, has role 'student',
    has a valid Student profile, and a valid school association matching the user's school.
    Returns (student, school, error_response).
    """
    user = getattr(request, "user", None)
    if not getattr(user, "is_authenticated", False):
        return None, None, JsonResponse(
            {"code": "UNAUTHORIZED", "message": "Authentication required. Please log in."},
            status=401,
        )
    if getattr(user, "role", "") != "student":
        return None, None, JsonResponse(
            {"code": "FORBIDDEN", "message": "Access denied. Student role required."},
            status=403,
        )
    student = getattr(user, "student_profile", None)
    if not student:
        return None, None, JsonResponse(
            {"code": "NOT_FOUND", "message": "Student profile not found. Please contact your administrator."},
            status=404,
        )
    school = get_user_school(request)
    if not school or student.school_id != school.pk:
        return None, None, JsonResponse(
            {"code": "FORBIDDEN", "message": "A valid school association is required."},
            status=403,
        )
    return student, school, None


@require_http_methods(["GET"])
def student_dashboard_api_view(request):
    """
    Return student dashboard metrics, current class, active quizzes, in-progress attempts,
    and recent attempt history.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    current_enrollment = StudentClass.objects.filter(
        student=student,
        school=school,
        assigned_class__school=school,
        is_active=True,
    ).select_related("assigned_class", "assigned_class__academic_year").order_by("-date_assigned").first()

    if not current_enrollment:
        return JsonResponse({
            "student_name": student.full_name,
            "admission_number": student.admission_number,
            "class_name": None,
            "academic_year": None,
            "term": None,
            "total_available": 0,
            "total_completed": 0,
            "total_in_progress": 0,
            "avg_score": 0.0,
            "best_score": 0.0,
            "available_quizzes": [],
            "in_progress_attempts": [],
            "recent_attempts": [],
        })

    assigned_class = current_enrollment.assigned_class
    now = timezone.now()

    available_quizzes_qs = Quiz.objects.filter(
        classes=assigned_class,
        school=school,
        status="published",
        is_active=True,
    ).filter(
        Q(available_from__lte=now) | Q(available_from__isnull=True),
        Q(available_until__gte=now) | Q(available_until__isnull=True),
    ).select_related("subject").distinct()

    all_attempts = QuizAttempt.objects.filter(
        student=student,
        school=school,
    ).select_related("quiz", "quiz__subject")

    completed_attempts = all_attempts.filter(is_submitted=True)
    in_progress_attempts = all_attempts.filter(is_submitted=False, is_completed=False)

    avg_score = completed_attempts.aggregate(avg=Avg("percentage"))["avg"] or 0.0
    best_attempt = completed_attempts.order_by("-percentage", "-score").first()
    best_score = best_attempt.percentage if best_attempt else 0.0

    avail_list = []
    for q in available_quizzes_qs[:10]:
        avail_list.append({
            "id": q.pk,
            "title": q.title,
            "subject_name": q.subject.subject_name if q.subject else "General",
            "duration_minutes": q.time_limit or 0,
            "total_questions": q.questions.count(),
            "total_marks": q.total_marks,
            "available_until": q.available_until.isoformat() if q.available_until else None,
        })

    in_prog_list = []
    for a in in_progress_attempts[:5]:
        time_rem = None
        if a.quiz.time_limit and a.quiz.time_limit > 0:
            elapsed = (now - a.started_at).total_seconds() / 60
            time_rem = max(0, int((a.quiz.time_limit - elapsed) * 60))
        in_prog_list.append({
            "id": a.pk,
            "quiz_id": a.quiz.pk,
            "quiz_title": a.quiz.title,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "time_remaining_seconds": time_rem,
        })

    recent_list = []
    for a in completed_attempts.order_by("-submitted_at")[:5]:
        recent_list.append({
            "id": a.pk,
            "quiz_id": a.quiz.pk,
            "quiz_title": a.quiz.title,
            "subject_name": a.quiz.subject.subject_name if a.quiz.subject else "General",
            "score": a.score,
            "total_marks": a.quiz.total_marks,
            "percentage": a.percentage,
            "is_passed": a.is_passed() if callable(getattr(a, "is_passed", None)) else False,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        })

    return JsonResponse({
        "student_name": student.full_name,
        "admission_number": student.admission_number,
        "class_name": assigned_class.name,
        "academic_year": assigned_class.academic_year.name if assigned_class.academic_year else None,
        "term": school.current_term.get_term_number_display() if getattr(school, "current_term", None) else None,
        "total_available": available_quizzes_qs.count(),
        "total_completed": completed_attempts.count(),
        "total_in_progress": in_progress_attempts.count(),
        "avg_score": round(float(avg_score), 1),
        "best_score": round(float(best_score), 1),
        "available_quizzes": avail_list,
        "in_progress_attempts": in_prog_list,
        "recent_attempts": recent_list,
    })


@require_http_methods(["GET"])
def student_quizzes_api_view(request):
    """
    Return list of published quizzes assigned to the logged-in student's active class.
    Includes attempt counts, eligibility, best scores, and in-progress status.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    current_class = student.get_current_class()
    if not current_class:
        return JsonResponse({
            "class_name": None,
            "quizzes": [],
        })

    quizzes = Quiz.objects.filter(
        classes=current_class,
        classes__school=school,
        school=school,
        status="published",
        is_active=True,
    ).select_related("subject", "teacher", "academic_year", "term").distinct()

    subject_filter = request.GET.get("subject", "").strip()
    if subject_filter:
        quizzes = quizzes.filter(subject_id=subject_filter)

    year_filter = request.GET.get("academic_year", "").strip()
    if year_filter:
        quizzes = quizzes.filter(academic_year_id=year_filter)

    term_filter = request.GET.get("term", "").strip()
    if term_filter:
        quizzes = quizzes.filter(term_id=term_filter)

    search_query = request.GET.get("search", "").strip()
    if search_query:
        quizzes = quizzes.filter(
            Q(title__icontains=search_query) |
            Q(description__icontains=search_query) |
            Q(subject__subject_name__icontains=search_query)
        )

    status_filter = request.GET.get("status", "").strip()
    now = timezone.now()
    quiz_results = []

    for quiz in quizzes:
        attempts = QuizAttempt.objects.filter(quiz=quiz, student=student, school=school)
        attempts_count = attempts.count()
        can_attempt, attempt_message = quiz.can_student_attempt(student)
        in_prog = attempts.filter(is_submitted=False, is_completed=False).first()

        completed = attempts.filter(is_submitted=True)
        best_att = completed.order_by("-percentage").first()

        if attempts_count >= quiz.max_attempts:
            item_status = "completed"
        elif in_prog:
            item_status = "in_progress"
        elif not can_attempt:
            if quiz.available_until and quiz.available_until < now:
                item_status = "expired"
            elif quiz.available_from and quiz.available_from > now:
                item_status = "upcoming"
            else:
                item_status = "unavailable"
        else:
            item_status = "available"

        if status_filter and status_filter != "all" and item_status != status_filter:
            continue

        quiz_results.append({
            "id": quiz.pk,
            "title": quiz.title,
            "description": quiz.description,
            "subject_name": quiz.subject.subject_name if quiz.subject else "General",
            "teacher_name": quiz.teacher.full_name if quiz.teacher else "Instructor",
            "academic_year": quiz.academic_year.name if quiz.academic_year else "",
            "term": quiz.term.get_term_number_display() if quiz.term else "",
            "duration_minutes": quiz.time_limit or 0,
            "total_questions": quiz.questions.count(),
            "total_marks": quiz.total_marks,
            "max_attempts": quiz.max_attempts,
            "attempts_count": attempts_count,
            "status": item_status,
            "can_attempt": can_attempt,
            "attempt_message": attempt_message or "",
            "best_score": best_att.score if best_att else 0,
            "best_percentage": best_att.percentage if best_att else 0,
            "in_progress_attempt_id": in_prog.pk if in_prog else None,
            "available_from": quiz.available_from.isoformat() if quiz.available_from else None,
            "available_until": quiz.available_until.isoformat() if quiz.available_until else None,
        })

    return JsonResponse({
        "class_name": current_class.name,
        "quizzes": quiz_results,
    })


@require_http_methods(["GET"])
def student_quiz_detail_api_view(request, quiz_id):
    """
    Return detailed quiz instructions, rules, and student's attempt history before taking.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    quiz = get_object_or_404(
        Quiz,
        id=quiz_id,
        school=school,
        status="published",
        is_active=True,
    )

    current_class = student.get_current_class()
    if not current_class or not quiz.classes.filter(pk=current_class.pk, school=school).exists():
        return JsonResponse(
            {"code": "FORBIDDEN", "message": "This quiz is not assigned to your class."},
            status=403,
        )

    attempts = QuizAttempt.objects.filter(
        quiz=quiz,
        student=student,
        school=school,
    ).order_by("-started_at")

    attempts_count = attempts.count()
    completed_attempts = attempts.filter(is_submitted=True)
    best_attempt = completed_attempts.order_by("-percentage", "-score").first()
    in_prog = attempts.filter(is_submitted=False, is_completed=False).first()
    can_attempt, attempt_message = quiz.can_student_attempt(student)
    remaining_attempts = max(0, quiz.max_attempts - attempts_count)

    past_attempts = []
    for a in attempts:
        past_attempts.append({
            "id": a.pk,
            "attempt_number": a.attempt_number,
            "score": a.score,
            "total_marks": a.quiz.total_marks,
            "percentage": a.percentage,
            "is_passed": a.is_passed() if callable(getattr(a, "is_passed", None)) else False,
            "is_submitted": a.is_submitted,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        })

    return JsonResponse({
        "id": quiz.pk,
        "title": quiz.title,
        "description": quiz.description,
        "instructions": quiz.instructions or "",
        "subject_name": quiz.subject.subject_name if quiz.subject else "General",
        "teacher_name": quiz.teacher.full_name if quiz.teacher else "Instructor",
        "duration_minutes": quiz.time_limit or 0,
        "total_questions": quiz.questions.count(),
        "total_marks": quiz.total_marks,
        "passing_marks": quiz.passing_marks,
        "pass_percentage": round((quiz.passing_marks / quiz.total_marks * 100), 1) if quiz.total_marks else 0,
        "max_attempts": quiz.max_attempts,
        "attempts_count": attempts_count,
        "remaining_attempts": remaining_attempts,
        "can_attempt": can_attempt,
        "attempt_message": attempt_message or "",
        "require_password": bool(quiz.require_password),
        "in_progress_attempt_id": in_prog.pk if in_prog else None,
        "best_score": best_attempt.score if best_attempt else 0,
        "best_percentage": best_attempt.percentage if best_attempt else 0,
        "available_from": quiz.available_from.isoformat() if quiz.available_from else None,
        "available_until": quiz.available_until.isoformat() if quiz.available_until else None,
        "past_attempts": past_attempts,
    })


@require_http_methods(["POST"])
def student_quiz_start_api_view(request, quiz_id):
    """
    Start or resume a quiz attempt for the student.
    Handles optional password verification and captures configuration snapshot.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    quiz = get_object_or_404(
        Quiz,
        id=quiz_id,
        school=school,
        status="published",
        is_active=True,
    )

    current_class = student.get_current_class()
    if not current_class or not quiz.classes.filter(pk=current_class.pk, school=school).exists():
        return JsonResponse(
            {"code": "FORBIDDEN", "message": "This quiz is not assigned to your class."},
            status=403,
        )

    data = _parse_request_data(request)
    if quiz.require_password:
        password = data.get("password", "").strip()
        if not password or not quiz.verify_password(password):
            return JsonResponse(
                {"code": "INVALID_PASSWORD", "message": "Incorrect quiz password. Please try again."},
                status=400,
            )

    try:
        with transaction.atomic():
            student = Student.objects.select_for_update().get(pk=student.pk, school_id=school.pk)
            quiz = Quiz.objects.select_for_update().get(
                pk=quiz.pk,
                school_id=school.pk,
                status="published",
                is_active=True,
            )

            existing_attempt = QuizAttempt.objects.filter(
                quiz=quiz,
                student=student,
                school=school,
                is_submitted=False,
                is_completed=False,
            ).order_by("started_at").first()

            if existing_attempt:
                if not existing_attempt.configuration_snapshot:
                    existing_attempt.capture_configuration()
                return JsonResponse({
                    "success": True,
                    "attempt_id": existing_attempt.id,
                    "resumed": True,
                    "message": "Resuming your previous attempt.",
                })

            can_attempt, attempt_message = quiz.can_student_attempt(student)
            now = timezone.now()
            if (
                not can_attempt
                or (quiz.available_from and quiz.available_from > now)
                or (quiz.available_until and quiz.available_until < now)
            ):
                return JsonResponse(
                    {"code": "CANNOT_ATTEMPT", "message": attempt_message or "This quiz is not currently available."},
                    status=400,
                )

            max_attempt = QuizAttempt.objects.filter(
                quiz=quiz,
                student=student,
                school=school,
            ).aggregate(max_attempt=Max("attempt_number"))["max_attempt"]
            attempt_number = (max_attempt + 1) if max_attempt else 1

            ip_address = get_client_ip(request)
            user_agent = request.META.get("HTTP_USER_AGENT", "")

            attempt = QuizAttempt.objects.create(
                quiz=quiz,
                student=student,
                school=school,
                attempt_number=attempt_number,
                academic_year=quiz.academic_year,
                term=quiz.term,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            attempt.capture_configuration()

            return JsonResponse({
                "success": True,
                "attempt_id": attempt.id,
                "resumed": False,
                "message": "Quiz started successfully. Good luck!",
            })
    except Exception as e:
        return JsonResponse({"code": "SERVER_ERROR", "message": str(e)}, status=500)


def _section_timing_enabled(attempt):
    return any(
        section.get("time_limit_minutes") is not None
        for section in attempt.configuration_snapshot.get("sections", [])
    )


def _section_progress(attempt, now=None):
    sections = attempt.configuration_snapshot.get("sections", [])
    if not sections or not _section_timing_enabled(attempt):
        return None, set()

    now = now or timezone.now()
    state = dict(attempt.section_state or {})
    expired_ids = set()
    active_section_id = None
    for section in sections:
        section_id = str(section["id"])
        entry = dict(state.get(section_id) or {})
        if entry.get("submitted_at"):
            continue
        if not entry.get("started_at"):
            entry["started_at"] = now.isoformat()
        limit = section.get("time_limit_minutes")
        started_at = datetime.fromisoformat(entry["started_at"])
        if limit is not None and (now - started_at).total_seconds() >= limit * 60:
            entry["submitted_at"] = now.isoformat()
            expired_ids.add(int(section["id"]))
            state[section_id] = entry
            continue
        state[section_id] = entry
        active_section_id = int(section["id"])
        break

    if state != (attempt.section_state or {}):
        attempt.section_state = state
        attempt.save(update_fields=["section_state"])
    return active_section_id, expired_ids


def _section_time_remaining(section, state, now=None):
    limit = section.get("time_limit_minutes")
    if limit is None:
        return None
    entry = (state or {}).get(str(section["id"]), {})
    if entry.get("submitted_at"):
        return 0
    if not entry.get("started_at"):
        return limit * 60
    now = now or timezone.now()
    started_at = datetime.fromisoformat(entry["started_at"])
    return max(0, int(limit * 60 - (now - started_at).total_seconds()))


def _answer_data_has_answer(question_type, answer_data, choice_ids=None):
    if question_type in {"multiple_choice", "true_false"}:
        return bool(choice_ids)
    if not isinstance(answer_data, dict):
        return bool(str(answer_data or "").strip())
    if question_type == "matching":
        return bool(answer_data.get("matches"))
    if question_type == "ordering":
        return bool(answer_data.get("items"))
    value = answer_data.get("text")
    if isinstance(value, (list, tuple)):
        return any(str(item or "").strip() for item in value)
    return bool(str(value or "").strip())


def _response_has_answer(response, question_type):
    if response.selected_choice_id or response.selected_choices.exists():
        return True
    return _answer_data_has_answer(
        question_type, response.answer_data, response.selected_choice_id
    ) or bool((response.text_answer or "").strip())


def _attempt_section_scores(attempt):
    question_snapshots = attempt.configuration_snapshot.get("questions", {})
    responses = {
        str(response.question_id): response
        for response in attempt.responses.filter(school_id=attempt.school_id)
    }
    results = []
    for section in attempt.configuration_snapshot.get("sections", []):
        question_items = [
            snapshot for snapshot in question_snapshots.values()
            if snapshot.get("section_id") == section.get("id")
        ]
        question_marks = [item.get("marks", 0) for item in question_items]
        choose_n = section.get("choose_n")
        total_marks = (
            choose_n * question_marks[0]
            if choose_n is not None and question_marks
            else sum(question_marks)
        )
        score = sum(
            responses[str(item["question_id"])].marks_awarded
            for item in question_items
            if str(item["question_id"]) in responses
        )
        results.append({
            "section_id": section["id"],
            "title": section["title"],
            "score": score,
            "total_marks": total_marks,
        })
    return results


@require_http_methods(["GET"])
def student_quiz_take_api_view(request, attempt_id):
    """
    Return active quiz taking questions, timer, and saved responses.
    HIGH-RISK SAFEGUARD: Correct answers ('is_correct') are NEVER included in response choices.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    attempt = get_object_or_404(
        QuizAttempt,
        id=attempt_id,
        student=student,
        school=school,
    )

    if attempt.is_submitted:
        return JsonResponse({
            "attempt_id": attempt.id,
            "is_submitted": True,
            "message": "This quiz has already been submitted.",
        })

    if attempt.is_time_expired():
        _submit_attempt_safely(attempt.pk, student, school)
        return JsonResponse({
            "attempt_id": attempt.id,
            "is_submitted": True,
            "time_expired": True,
            "message": "Time limit expired. Your quiz has been automatically submitted.",
        })

    quiz = attempt.quiz
    if not attempt.configuration_snapshot:
        with transaction.atomic():
            attempt = QuizAttempt.objects.select_for_update().get(pk=attempt.pk)
            if not attempt.configuration_snapshot:
                attempt.capture_configuration()
    active_section_id = None
    expired_section_ids = set()
    if _section_timing_enabled(attempt):
        with transaction.atomic():
            attempt = QuizAttempt.objects.select_for_update().get(pk=attempt.pk)
            active_section_id, expired_section_ids = _section_progress(attempt)

    questions = list(quiz.questions.filter(school=school).prefetch_related(
        "answer_choices"
    ).order_by("order", "created_at", "pk"))

    question_positions = {
        question_id: position
        for position, question_id in enumerate(attempt.question_order, start=1)
    }
    if attempt.configuration_snapshot:
        snapshot_question_ids = set(attempt.configuration_snapshot.get("questions", {}))
        questions = [q for q in questions if str(q.pk) in snapshot_question_ids]

    questions.sort(
        key=lambda q: (
            question_positions.get(q.pk, len(question_positions)),
            q.pk,
        )
    )

    answer_order = attempt.answer_order or {}
    questions_data = []

    for position, q in enumerate(questions, start=1):
        q_snapshot = attempt.configuration_snapshot.get("questions", {}).get(str(q.pk), {})
        from .question_types import serialize_for_student

        question_data = serialize_for_student(
            q, q_snapshot, answer_order.get(str(q.pk), [])
        )
        question_data["order"] = position
        question_data["section_id"] = q_snapshot.get("section_id")
        question_data["group_id"] = q_snapshot.get("group_id")
        questions_data.append(question_data)

    # Existing responses
    existing_responses = {}
    for r in attempt.responses.filter(school=school).select_related("selected_choice").prefetch_related("selected_choices"):
        selected_ids = [c.pk for c in r.selected_choices.all()]
        if not selected_ids and r.selected_choice_id:
            selected_ids = [r.selected_choice_id]
        existing_responses[str(r.question_id)] = {
            "selected_choice_id": r.selected_choice_id,
            "selected_choice_ids": selected_ids,
            "text_answer": r.text_answer or "",
            "answer_data": r.answer_data or {},
        }

    # Time remaining
    time_remaining_seconds = None
    attempt_time_limit = attempt.configuration_snapshot.get("quiz", {}).get(
        "time_limit", quiz.time_limit
    )
    if attempt_time_limit and attempt_time_limit > 0:
        elapsed = timezone.now() - attempt.started_at
        elapsed_minutes = elapsed.total_seconds() / 60
        time_remaining_minutes = max(0, attempt_time_limit - elapsed_minutes)
        time_remaining_seconds = int(time_remaining_minutes * 60)

    answered_count = len(existing_responses)
    sections_data = []
    snapshot_sections = attempt.configuration_snapshot.get("sections", [])
    for section in snapshot_sections:
        section_questions = [
            item for item in questions_data
            if item.get("section_id") == section["id"]
        ]
        groups = []
        for group in section.get("groups", []):
            groups.append({
                **group,
                "questions": [
                    item for item in section_questions
                    if item.get("group_id") == group["id"]
                ],
            })
        section_state = (attempt.section_state or {}).get(str(section["id"]), {})
        sections_data.append({
            **section,
            "questions": section_questions,
            "groups": groups,
            "started_at": section_state.get("started_at"),
            "submitted_at": section_state.get("submitted_at"),
            "is_active": section["id"] == active_section_id,
            "is_locked": (
                bool(section_state.get("submitted_at"))
                or (
                    _section_timing_enabled(attempt)
                    and section["id"] != active_section_id
                )
            ),
            "remaining_seconds": _section_time_remaining(
                section, attempt.section_state
            ),
            "time_expired": section["id"] in expired_section_ids,
        })
    unsectioned_questions = [
        item for item in questions_data if item.get("section_id") is None
    ]
    has_unsectioned_groups = any(
        group.get("section_id") is None
        for group in attempt.configuration_snapshot.get("groups", [])
    )
    if unsectioned_questions and (snapshot_sections or has_unsectioned_groups):
        unsectioned_groups = [
            {
                **group,
                "questions": [
                    item for item in unsectioned_questions
                    if item.get("group_id") == group["id"]
                ],
            }
            for group in attempt.configuration_snapshot.get("groups", [])
            if group.get("section_id") is None
        ]
        sections_data.append({
            "id": None,
            "title": "Other questions",
            "instructions": "",
            "order": len(sections_data) + 1,
            "time_limit_minutes": None,
            "choose_n": None,
            "questions": unsectioned_questions,
            "groups": unsectioned_groups,
            "started_at": None,
            "submitted_at": None,
            "is_active": not _section_timing_enabled(attempt),
            "is_locked": False,
            "remaining_seconds": None,
            "time_expired": False,
        })

    return JsonResponse({
        "attempt_id": attempt.id,
        "quiz_id": quiz.id,
        "quiz_title": quiz.title,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "time_remaining_seconds": time_remaining_seconds,
        "is_submitted": False,
        "total_questions": len(questions_data),
        "answered_count": answered_count,
        "questions": questions_data,
        "sections": sections_data,
        "active_section_id": active_section_id,
        "section_timing_enabled": _section_timing_enabled(attempt),
        "existing_responses": existing_responses,
    })


@require_http_methods(["POST"])
def student_quiz_save_api_view(request, attempt_id):
    """
    Save student's response to an individual question asynchronously (Autosave).
    Validates question, choices, and timer deadline server-side.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    data = _parse_request_data(request)
    question_id = data.get("question_id")
    if not question_id:
        return JsonResponse(
            {"code": "MISSING_QUESTION_ID", "message": "Question ID required."},
            status=400,
        )

    try:
        with transaction.atomic():
            try:
                attempt = QuizAttempt.objects.select_for_update().select_related("quiz").get(
                    id=attempt_id,
                    student=student,
                    school=school,
                )
            except QuizAttempt.DoesNotExist:
                return JsonResponse(
                    {"code": "NOT_FOUND", "message": "Attempt not found."},
                    status=404,
                )

            if attempt.is_submitted:
                return JsonResponse(
                    {"code": "ALREADY_SUBMITTED", "message": "Quiz already submitted."},
                    status=400,
                )

            if attempt.is_time_expired():
                attempt.submit()
                return JsonResponse(
                    {
                        "success": False,
                        "submitted": True,
                        "error": "Time limit expired. Quiz has been submitted.",
                    },
                    status=400,
                )

            if not attempt.configuration_snapshot:
                attempt.capture_configuration()

            try:
                question = attempt.quiz.questions.get(id=question_id, school=school)
            except Question.DoesNotExist:
                return JsonResponse(
                    {"code": "NOT_FOUND", "message": "Question not found."},
                    status=404,
                )

            question_snapshot = attempt.configuration_snapshot.get("questions", {}).get(str(question.pk))
            if question_snapshot is None:
                return JsonResponse(
                    {"code": "INVALID_QUESTION", "message": "Question was not part of this attempt."},
                    status=400,
                )

            section_id = question_snapshot.get("section_id")
            if section_id is not None and _section_timing_enabled(attempt):
                active_section_id, expired_section_ids = _section_progress(attempt)
                if section_id in expired_section_ids:
                    return JsonResponse(
                        {
                            "code": "SECTION_TIME_EXPIRED",
                            "message": "This section's time has expired. Its answers are locked.",
                        },
                        status=409,
                    )
                if section_id != active_section_id:
                    return JsonResponse(
                        {
                            "code": "SECTION_LOCKED",
                            "message": "This section is not active and its answers are locked.",
                        },
                        status=409,
                    )

            question_type = question_snapshot.get("question_type", question.question_type)
            choices = []
            choice_ids = []
            submitted_answer_data = data.get("answer_data")
            if isinstance(submitted_answer_data, str):
                try:
                    submitted_answer_data = json.loads(submitted_answer_data)
                except json.JSONDecodeError:
                    return JsonResponse(
                        {"code": "INVALID_ANSWER", "message": "answer_data must be valid JSON."},
                        status=400,
                    )
            if submitted_answer_data is not None and not isinstance(
                submitted_answer_data, dict
            ):
                return JsonResponse(
                    {"code": "INVALID_ANSWER", "message": "answer_data must be an object."},
                    status=400,
                )
            if question_type in ["multiple_choice", "true_false"]:
                question_config = question_snapshot.get("config", {})
                if submitted_answer_data is not None:
                    try:
                        from .question_types import validate_answer_data

                        submitted_answer_data = validate_answer_data(
                            question_type, question_config, submitted_answer_data
                        )
                    except (TypeError, ValueError) as error:
                        return JsonResponse(
                            {"code": "INVALID_ANSWER", "message": str(error)},
                            status=400,
                        )
                raw_ids = (
                    submitted_answer_data.get("choice_ids")
                    if submitted_answer_data is not None
                    else data.get("choice_ids")
                )
                if raw_ids is None and data.get("choice_id") is not None:
                    raw_ids = [data.get("choice_id")]
                if raw_ids is None:
                    raw_ids = []
                elif not isinstance(raw_ids, list):
                    raw_ids = [raw_ids]
                try:
                    choice_ids = [int(choice_id) for choice_id in raw_ids]
                except (TypeError, ValueError):
                    return JsonResponse(
                        {"code": "INVALID_CHOICE", "message": "Invalid choice ID."},
                        status=400,
                    )
                allowed_choice_ids = set(question_snapshot.get("choices", {}))
                choices = list(question.answer_choices.filter(id__in=choice_ids, school=school))
                if (
                    len({c.pk for c in choices}) != len(set(choice_ids))
                    or len(choice_ids) != len(set(choice_ids))
                    or any(str(c.pk) not in allowed_choice_ids for c in choices)
                ):
                    return JsonResponse(
                        {"code": "INVALID_CHOICE", "message": "Invalid choice selection."},
                        status=400,
                    )
                if question_type == "true_false" and len(choices) > 1:
                    return JsonResponse(
                        {"code": "INVALID_CHOICE", "message": "Select only one answer."},
                        status=400,
                    )
                if (
                    question_type == "multiple_choice"
                    and len(choice_ids) > 1
                    and not question_config.get(
                        "allow_multiple",
                        sum(
                            choice.get("is_correct", False)
                            for choice in question_snapshot.get("choices", {}).values()
                        ) > 1,
                    )
                ):
                    return JsonResponse(
                        {"code": "INVALID_CHOICE", "message": "Select only one answer."},
                        status=400,
                    )
                submitted_answer_data = {"choice_ids": choice_ids}
            else:
                if submitted_answer_data is None:
                    if question_type in ["matching", "ordering"]:
                        submitted_answer_data = {}
                    else:
                        submitted_answer_data = {
                            "text": data.get("text_answer", "")
                        }
                question_config = question_snapshot.get("config", {})
                try:
                    from .question_types import validate_answer_data

                    submitted_answer_data = validate_answer_data(
                        question_type, question_config, submitted_answer_data
                    )
                except (TypeError, ValueError) as error:
                    return JsonResponse(
                        {"code": "INVALID_ANSWER", "message": str(error)},
                        status=400,
                    )
                if question_type == "matching":
                    matches = submitted_answer_data.get("matches", {})
                    from .question_types import get_question_type

                    pair_config = get_question_type("matching").pairs(
                        question, question_snapshot
                    )
                    allowed_left_ids = {
                        f"left:{pair['left_id']}" for pair in pair_config
                    }
                    allowed_right_ids = {
                        f"right:{pair['right_id']}" for pair in pair_config
                    }
                    if any(
                        left_id not in allowed_left_ids
                        or right_id not in allowed_right_ids
                        for left_id, right_id in matches.items()
                    ) or len(set(matches.values())) != len(matches):
                        return JsonResponse(
                            {"code": "INVALID_ANSWER", "message": "Invalid matching answer."},
                            status=400,
                        )
                elif question_type == "ordering":
                    from .question_types import get_question_type

                    ordering_handler = get_question_type("ordering")
                    allowed_ids = {
                        f"item:{item_id}"
                        for item_id in ordering_handler.item_ids(
                            question, question_snapshot
                        )
                    }
                    submitted_items = submitted_answer_data.get("items", [])
                    if any(item_id not in allowed_ids for item_id in submitted_items) or (
                        len(submitted_items) != len(set(submitted_items))
                    ):
                        return JsonResponse(
                            {"code": "INVALID_ANSWER", "message": "Invalid ordering answer."},
                            status=400,
                        )

            section_snapshot = next(
                (
                    section for section in attempt.configuration_snapshot.get("sections", [])
                    if section.get("id") == section_id
                ),
                None,
            )
            choose_n = section_snapshot.get("choose_n") if section_snapshot else None
            if choose_n is not None and _answer_data_has_answer(
                question_type, submitted_answer_data, choice_ids
            ):
                section_question_ids = [
                    int(question_id)
                    for question_id, snapshot in attempt.configuration_snapshot.get("questions", {}).items()
                    if snapshot.get("section_id") == section_id
                ]
                current_response = attempt.responses.filter(question=question).first()
                already_answered = (
                    _response_has_answer(current_response, question_type)
                    if current_response
                    else False
                )
                answered_in_section = 0
                for existing_response in attempt.responses.filter(
                    question_id__in=section_question_ids
                ).prefetch_related("selected_choices"):
                    existing_type = attempt.configuration_snapshot["questions"].get(
                        str(existing_response.question_id), {}
                    ).get("question_type", existing_response.question.question_type)
                    if _response_has_answer(existing_response, existing_type):
                        answered_in_section += 1
                if not already_answered and answered_in_section >= choose_n:
                    return JsonResponse(
                        {
                            "code": "CHOOSE_N_LIMIT",
                            "message": f"You may answer only {choose_n} question(s) in this section.",
                        },
                        status=400,
                    )

            response, _ = QuizResponse.objects.get_or_create(
                attempt=attempt,
                question=question,
                defaults={"school": school},
            )

            if question_type in ["multiple_choice", "true_false"]:
                response.selected_choice = choices[0] if len(choices) == 1 else None
                response.selected_choices.set(choices)
            else:
                text_answer = str(data.get("text_answer", "")).strip()
                if question_type == "matching" and submitted_answer_data.get("matches"):
                    text_answer = "; ".join(
                        f"{left}={right}"
                        for left, right in submitted_answer_data.get("matches", {}).items()
                    )
                elif question_type == "ordering" and submitted_answer_data.get("items"):
                    text_answer = "; ".join(
                        submitted_answer_data.get("items", [])
                    )
                elif not text_answer and isinstance(
                    submitted_answer_data.get("text"), str
                ):
                    text_answer = submitted_answer_data["text"]
                response.text_answer = text_answer
            response.answer_data = submitted_answer_data

            response.save()

            return JsonResponse({
                "success": True,
                "message": "Response saved successfully",
                "answered_count": attempt.responses.count(),
            })
    except Exception as e:
        return JsonResponse({"code": "SERVER_ERROR", "message": str(e)}, status=500)


@require_http_methods(["POST"])
def student_quiz_section_submit_api_view(request, attempt_id, section_id):
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    try:
        with transaction.atomic():
            try:
                attempt = QuizAttempt.objects.select_for_update().get(
                    pk=attempt_id, student=student, school=school
                )
            except QuizAttempt.DoesNotExist:
                return JsonResponse(
                    {"code": "NOT_FOUND", "message": "Attempt not found."},
                    status=404,
                )
            if attempt.is_submitted:
                return JsonResponse(
                    {"code": "ALREADY_SUBMITTED", "message": "Quiz already submitted."},
                    status=409,
                )
            if not attempt.configuration_snapshot:
                attempt.capture_configuration()
            section = next(
                (
                    item for item in attempt.configuration_snapshot.get("sections", [])
                    if item.get("id") == section_id
                ),
                None,
            )
            if section is None:
                return JsonResponse(
                    {"code": "NOT_FOUND", "message": "Section not found in this attempt."},
                    status=404,
                )
            if attempt.is_time_expired():
                attempt.submit()
                return JsonResponse(
                    {"code": "TIME_EXPIRED", "message": "The quiz time limit has expired."},
                    status=409,
                )
            if not _section_timing_enabled(attempt):
                return JsonResponse({
                    "success": True,
                    "active_section_id": None,
                    "section_timing_enabled": False,
                })

            active_section_id, expired_section_ids = _section_progress(attempt)
            if section_id in expired_section_ids:
                return JsonResponse(
                    {
                        "code": "SECTION_TIME_EXPIRED",
                        "message": "This section's time has expired and it is now locked.",
                    },
                    status=409,
                )
            if section_id != active_section_id:
                return JsonResponse(
                    {
                        "code": "SECTION_LOCKED",
                        "message": "Sections must be completed in order.",
                    },
                    status=409,
                )

            now = timezone.now()
            state = dict(attempt.section_state or {})
            entry = dict(state.get(str(section_id)) or {})
            entry["submitted_at"] = now.isoformat()
            state[str(section_id)] = entry
            ordered_sections = attempt.configuration_snapshot.get("sections", [])
            current_index = next(
                index for index, item in enumerate(ordered_sections)
                if item["id"] == section_id
            )
            next_section = next(
                (
                    item for item in ordered_sections[current_index + 1:]
                    if not (state.get(str(item["id"])) or {}).get("submitted_at")
                ),
                None,
            )
            if next_section:
                next_entry = dict(state.get(str(next_section["id"])) or {})
                next_entry.setdefault("started_at", now.isoformat())
                state[str(next_section["id"])] = next_entry
            attempt.section_state = state
            attempt.save(update_fields=["section_state"])

        return JsonResponse({
            "success": True,
            "active_section_id": next_section["id"] if next_section else None,
            "section_timing_enabled": True,
        })
    except Exception as e:
        return JsonResponse({"code": "SERVER_ERROR", "message": str(e)}, status=500)


@require_http_methods(["POST"])
def student_quiz_submit_api_view(request, attempt_id):
    """
    Submit a quiz attempt idempotently.
    Calculates scores, updates pass/fail status, and locks attempt.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    attempt = get_object_or_404(
        QuizAttempt,
        id=attempt_id,
        student=student,
        school=school,
    )

    attempt = _submit_attempt_safely(attempt_id, student, school)
    return JsonResponse({
        "success": True,
        "attempt_id": attempt.id,
        "score": attempt.score,
        "total_marks": attempt.configuration_snapshot.get("quiz", {}).get(
            "total_marks", attempt.quiz.total_marks
        ),
        "section_scores": _attempt_section_scores(attempt),
        "percentage": attempt.percentage,
        "is_passed": attempt.is_passed() if callable(getattr(attempt, "is_passed", None)) else False,
        "message": "Quiz submitted successfully!",
    })


@require_http_methods(["GET"])
def student_attempts_api_view(request):
    """
    Return student's quiz attempt history with score metrics and filters.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    attempts = QuizAttempt.objects.filter(
        student=student,
        school=school,
    ).select_related("quiz", "quiz__subject").order_by("-submitted_at", "-started_at")

    quiz_filter = request.GET.get("quiz", "").strip()
    if quiz_filter:
        attempts = attempts.filter(quiz_id=quiz_filter)

    subject_filter = request.GET.get("subject", "").strip()
    if subject_filter:
        attempts = attempts.filter(quiz__subject_id=subject_filter)

    status_filter = request.GET.get("status", "").strip()
    if status_filter == "completed":
        attempts = attempts.filter(is_submitted=True, is_completed=True)
    elif status_filter == "in_progress":
        attempts = attempts.filter(is_submitted=False, is_completed=False)
    elif status_filter == "passed":
        attempts = attempts.filter(is_passed=True)
    elif status_filter == "failed":
        attempts = attempts.filter(is_submitted=True, is_passed=False)

    search_query = request.GET.get("search", "").strip()
    if search_query:
        attempts = attempts.filter(
            Q(quiz__title__icontains=search_query) |
            Q(quiz__subject__subject_name__icontains=search_query)
        )

    all_student_attempts = QuizAttempt.objects.filter(student=student, school=school)
    completed = all_student_attempts.filter(is_submitted=True, is_completed=True)
    total_attempts = all_student_attempts.count()
    completed_count = completed.count()
    avg_score = completed.aggregate(avg=Avg("score"))["avg"] or 0.0
    avg_percentage = completed.aggregate(avg=Avg("percentage"))["avg"] or 0.0
    best_percentage = completed.aggregate(best=Max("percentage"))["best"] or 0.0

    attempts_data = []
    for a in attempts[:100]:
        attempts_data.append({
            "id": a.pk,
            "quiz_id": a.quiz.pk,
            "quiz_title": a.quiz.title,
            "subject_name": a.quiz.subject.subject_name if a.quiz.subject else "General",
            "attempt_number": a.attempt_number,
            "score": a.score,
            "total_marks": a.quiz.total_marks,
            "percentage": a.percentage,
            "is_passed": a.is_passed() if callable(getattr(a, "is_passed", None)) else False,
            "is_submitted": a.is_submitted,
            "is_completed": a.is_completed,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        })

    return JsonResponse({
        "total_attempts": total_attempts,
        "completed_attempts_count": completed_count,
        "avg_score": round(float(avg_score), 1),
        "avg_percentage": round(float(avg_percentage), 1),
        "best_percentage": round(float(best_percentage), 1),
        "attempts": attempts_data,
    })


@require_http_methods(["GET"])
def student_quiz_result_api_view(request, attempt_id):
    """
    Return detailed score breakdown and question review for a submitted quiz attempt.
    Respects quiz policy flags 'allow_review' and 'show_correct_answers'.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    attempt = get_object_or_404(
        QuizAttempt,
        id=attempt_id,
        student=student,
        school=school,
    )

    if not attempt.is_submitted:
        return JsonResponse(
            {"code": "NOT_SUBMITTED", "message": "Quiz has not been submitted yet."},
            status=400,
        )

    quiz = attempt.quiz

    live_questions = quiz.questions.filter(school=school).prefetch_related("answer_choices")
    live_responses = attempt.responses.filter(school=school).prefetch_related("selected_choices")
    quiz_snap, review_questions, review_responses = _attempt_review_snapshot(
        attempt, quiz, live_questions, live_responses
    )
    quiz = quiz_snap
    allow_review = getattr(quiz, "allow_review", True) and getattr(
        quiz, "show_results_immediately", True
    )
    show_correct_answers = getattr(quiz, "show_correct_answers", True)

    responses_by_q = {r.question_id: r for r in review_responses}
    questions_data = []

    if allow_review:
        from .question_types import serialize_for_review

        for q in review_questions:
            resp = responses_by_q.get(q.pk)
            marks_obtained = getattr(resp, "score", 0) or 0
            is_correct = getattr(resp, "is_correct", False) if resp else False
            question_snapshot = attempt.configuration_snapshot.get(
                "questions", {}
            ).get(str(q.pk), {})

            student_ans = ""
            if resp:
                if q.question_type in ["multiple_choice", "true_false"]:
                    selected = [c.choice_text for c in resp.selected_choices.all()]
                    if not selected and resp.selected_choice:
                        selected = [resp.selected_choice.choice_text]
                    student_ans = ", ".join(selected)
                else:
                    student_ans = resp.text_answer or ""

            correct_ans = ""
            if show_correct_answers:
                if q.question_type in ["multiple_choice", "true_false"]:
                    correct_choices = [c.choice_text for c in q.answer_choices.all() if c.is_correct]
                    correct_ans = ", ".join(correct_choices)
                else:
                    correct_ans = q.correct_answer_text or ""

            choices_data = []
            if q.question_type in ["multiple_choice", "true_false"]:
                selected_ids = {c.pk for c in resp.selected_choices.all()} if resp else set()
                if resp and resp.selected_choice_id:
                    selected_ids.add(resp.selected_choice_id)
                for c in q.answer_choices.all():
                    c_dict = {
                        "id": c.pk,
                        "choice_text": c.choice_text,
                        "is_selected": c.pk in selected_ids,
                    }
                    if show_correct_answers:
                        c_dict["is_correct"] = c.is_correct
                    choices_data.append(c_dict)

            q_item = {
                "id": q.pk,
                "question_text": q.question_text,
                "question_type": q.question_type,
                "marks": q.marks,
                "marks_obtained": marks_obtained,
                "is_correct": is_correct,
                "student_answer": student_ans,
                "choices": choices_data,
                "review_data": (
                    serialize_for_review(
                        q, resp, question_snapshot, show_correct_answers
                    )
                    if resp
                    else {
                        "student_answer": "",
                        "correct_answer": None,
                    }
                ),
            }
            if show_correct_answers:
                q_item["correct_answer"] = correct_ans
                q_item["explanation"] = q.explanation or ""

            questions_data.append(q_item)

    return JsonResponse({
        "attempt_id": attempt.id,
        "quiz_id": quiz.id,
        "quiz_title": quiz.title,
        "subject_name": quiz.subject.subject_name if quiz.subject else "",
        "student_name": student.full_name,
        "admission_number": student.admission_number,
        "teacher_name": quiz.teacher.full_name if quiz.teacher else "",
        "academic_year": attempt.academic_year.name if attempt.academic_year else "",
        "score": attempt.score,
        "total_marks": attempt.configuration_snapshot.get("quiz", {}).get(
            "total_marks", quiz.total_marks
        ),
        "section_scores": _attempt_section_scores(attempt),
        "percentage": attempt.percentage,
        "duration_minutes": attempt.get_duration_minutes(),
        "correct_answers": attempt.correct_answers,
        "wrong_answers": attempt.wrong_answers,
        "unanswered": attempt.unanswered,
        "school_info": _serialize_result_school_info(school),
        "passing_marks": quiz.passing_marks,
        "is_passed": attempt.is_passed() if callable(getattr(attempt, "is_passed", None)) else False,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "allow_review": allow_review,
        "show_correct_answers": show_correct_answers,
        "questions": questions_data,
    })


@require_http_methods(["GET"])
def student_profile_api_view(request):
    """
    Return comprehensive student profile including personal details, academic cohort,
    active and past class enrollments, and academic performance statistics.
    Accessible only to authenticated students for their own record under fail-closed tenancy.
    """
    student, school, err = _get_authenticated_student(request)
    if err:
        return err

    # Current class
    current_enr = StudentClass.objects.filter(
        student=student,
        school=school,
        is_active=True,
    ).select_related("assigned_class", "assigned_class__academic_year").first()

    current_class_data = None
    if current_enr and current_enr.assigned_class:
        cls = current_enr.assigned_class
        current_class_data = {
            "id": cls.id,
            "name": cls.name,
            "code": cls.class_id,
            "academic_year": cls.academic_year.name if cls.academic_year else None,
        }

    # All enrollment records
    enrollment_records = StudentClass.objects.filter(
        student=student,
        school=school,
    ).select_related("assigned_class", "assigned_class__academic_year", "assigned_by").order_by("-is_active", "-date_assigned", "-id")

    enrollments_data = []
    for enr in enrollment_records:
        cls = enr.assigned_class
        assigned_by_name = None
        if enr.assigned_by:
            assigned_by_name = enr.assigned_by.get_full_name() or enr.assigned_by.username
        enrollments_data.append({
            "id": enr.id,
            "class_id": cls.id if cls else None,
            "class_name": cls.name if cls else "Unknown",
            "class_code": cls.class_id if cls else "",
            "academic_year": cls.academic_year.name if cls and cls.academic_year else None,
            "date_assigned": enr.date_assigned.isoformat() if enr.date_assigned else None,
            "is_active": enr.is_active,
            "assigned_by_name": assigned_by_name,
        })

    # Performance Stats
    completed_attempts = QuizAttempt.objects.filter(
        student=student,
        school=school,
        is_submitted=True,
    ).select_related("quiz", "quiz__subject")

    total_completed = completed_attempts.count()
    passed_count = sum(1 for a in completed_attempts if (a.is_passed() if callable(getattr(a, "is_passed", None)) else False))
    failed_count = total_completed - passed_count
    pass_rate = round((passed_count / total_completed) * 100, 1) if total_completed > 0 else 0

    scores = [a.percentage for a in completed_attempts if a.percentage is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0
    best_score = round(max(scores), 1) if scores else 0

    # Recent 5 attempts
    recent_attempts_data = []
    for a in completed_attempts.order_by("-submitted_at")[:5]:
        recent_attempts_data.append({
            "id": a.id,
            "attempt_id": a.attempt_id,
            "quiz_id": a.quiz.id if a.quiz else None,
            "quiz_title": a.quiz.title if a.quiz else "Quiz",
            "subject_name": a.quiz.subject.subject_name if a.quiz and a.quiz.subject else "",
            "score": a.score,
            "total_marks": a.quiz.total_marks if a.quiz else 0,
            "percentage": a.percentage,
            "is_passed": a.is_passed() if callable(getattr(a, "is_passed", None)) else False,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        })

    # Profile picture
    pic_url = None
    if student.profile_picture:
        try:
            pic_url = student.profile_picture.url
        except Exception:
            pic_url = None

    return JsonResponse({
        "personal": {
            "id": student.id,
            "full_name": student.full_name,
            "admission_number": student.admission_number,
            "gender": student.gender,
            "gender_display": "Male" if student.gender == "M" else "Female",
            "date_of_birth": student.date_of_birth.isoformat() if student.date_of_birth else None,
            "parent_contact": student.parent_contact,
            "email": student.email or "",
            "admission_date": student.admission_date.isoformat() if student.admission_date else None,
            "profile_picture_url": pic_url,
            "is_active": student.is_active,
        },
        "academic": {
            "school_name": school.name if school else "",
            "school_slug": school.slug if school else "",
            "form_name": student.form.name if student.form else None,
            "learning_area_name": student.learning_area.name if student.learning_area else None,
            "current_class": current_class_data,
        },
        "enrollments": enrollments_data,
        "stats": {
            "total_completed": total_completed,
            "passed_count": passed_count,
            "failed_count": failed_count,
            "pass_rate": pass_rate,
            "avg_score": avg_score,
            "best_score": best_score,
            "recent_activity": recent_attempts_data,
        },
    })


@ensure_csrf_cookie
def react_app_shell_view(request, subpath=""):
    """
    Render the React app shell.
    Redirects unauthenticated users to the React authentication app.
    Guarantees a CSRF cookie is present on the client.
    """
    if not getattr(request.user, "is_authenticated", False):
        return redirect(f"/auth-app/?{urlencode({'next': request.path})}")

    return render(
        request,
        "react_app.html",
        {
            "user": request.user,
        },
    )


@ensure_csrf_cookie
def auth_core_shell_view(request, subpath=""):
    """Render the public React authentication and session-management shell."""
    return render(
        request,
        "auth_core_app.html",
        {"csrf_token_value": get_token(request)},
    )


# ==============================================================================
# Academic Structure & School Setup API Views (ADR-014)
# ==============================================================================

def _check_academic_admin_access(request):
    """Verify authenticated session and admin/superadmin role."""
    if not getattr(request.user, "is_authenticated", False):
        return JsonResponse({"code": "UNAUTHORIZED", "message": "Authentication required"}, status=401), None
    if request.user.role not in ["admin", "superadmin"]:
        return JsonResponse({"code": "FORBIDDEN", "message": "Admin privileges required"}, status=403), None
    school = get_user_school(request)
    if request.user.role != "superadmin" and not school:
        return JsonResponse({"code": "FORBIDDEN", "message": "No school associated with user"}, status=403), None
    return None, school


def _school_structure_resource(resource):
    resources = {
        "forms": (Form, "form", "Form"),
        "learning-areas": (LearningArea, "learning_area", "Learning area"),
        "departments": (Department, "department", "Department"),
    }
    return resources.get(resource)


def _school_structure_error(message, status=400, code="VALIDATION_ERROR"):
    return JsonResponse(
        {"success": False, "code": code, "message": message, "error": message},
        status=status,
    )


def _school_structure_validation_message(error):
    if hasattr(error, "message_dict"):
        messages = [
            message
            for field_messages in error.message_dict.values()
            for message in field_messages
        ]
    else:
        messages = error.messages
    return " ".join(messages)


def _school_structure_payload(request):
    try:
        payload = json.loads(request.body.decode("utf-8")) if request.body else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, _school_structure_error("Request body must be valid JSON.")
    if not isinstance(payload, dict):
        return None, _school_structure_error("Request body must be a JSON object.")
    return payload, None


def _serialize_school_structure_item(resource, item):
    result = {
        "id": item.pk,
        "name": item.name,
        "description": item.description or "",
        "school_id": item.school_id,
        "school_name": item.school.name if item.school else "",
    }
    if resource == "forms":
        student_count = (
            item.student_count
            if hasattr(item, "student_count")
            else item.student_set.count()
        )
        result.update(
            form_number=item.form_number,
            student_count=student_count,
        )
    elif resource == "learning-areas":
        student_count = (
            item.student_count
            if hasattr(item, "student_count")
            else item.student_set.count()
        )
        result.update(
            code=item.code,
            student_count=student_count,
        )
    else:
        teacher_count = (
            item.teacher_count
            if hasattr(item, "teacher_count")
            else item.teacher_set.count()
        )
        result.update(
            code=item.code,
            head_of_department_id=item.head_of_department_id,
            head_of_department_name=(
                item.head_of_department.full_name
                if item.head_of_department
                else ""
            ),
            teacher_count=teacher_count,
        )
    return result


def _set_school_structure_fields(resource, item, payload, school):
    name = payload.get("name", "")
    description = payload.get("description", "")
    if not isinstance(name, str):
        return _school_structure_error("Name must be text.")
    if description is not None and not isinstance(description, str):
        return _school_structure_error("Description must be text.")

    item.name = name.strip()
    item.description = (
        description.strip() or None if description is not None else None
    )

    if resource == "forms":
        form_number = payload.get("form_number")
        if isinstance(form_number, bool) or not isinstance(form_number, (int, str)):
            return _school_structure_error("Form number must be a valid number.")
        try:
            item.form_number = int(form_number)
        except (TypeError, ValueError):
            return _school_structure_error("Form number must be a valid number.")
    else:
        code = payload.get("code", "")
        if not isinstance(code, str):
            return _school_structure_error("Code must be text.")
        item.code = code.strip()

    if resource == "departments":
        head_id = payload.get("head_of_department_id")
        if head_id in ("", None):
            item.head_of_department = None
        else:
            if isinstance(head_id, bool) or not isinstance(head_id, (int, str)):
                return _school_structure_error("Invalid head of department selected.")
            try:
                item.head_of_department = Teacher.objects.get(
                    pk=int(head_id), school=school
                )
            except (TypeError, ValueError, Teacher.DoesNotExist):
                return _school_structure_error(
                    "Invalid head of department selected."
                )
    return None


def _school_structure_queryset(resource, school):
    model, _, _ = _school_structure_resource(resource)
    queryset = model.objects.select_related("school")
    if school:
        queryset = queryset.filter(school=school)
    if resource == "forms":
        return queryset.annotate(student_count=Count("student")).order_by(
            "form_number", "name"
        )
    if resource == "learning-areas":
        return queryset.annotate(student_count=Count("student")).order_by("name")
    return (
        queryset.select_related("head_of_department")
        .annotate(teacher_count=Count("teacher"))
        .order_by("name")
    )


@require_http_methods(["GET", "POST"])
def school_structure_api_view(request, resource):
    """List or create forms, learning areas, and departments."""
    config = _school_structure_resource(resource)
    if not config:
        return _school_structure_error("School structure resource not found.", 404, "NOT_FOUND")

    error, school = _check_academic_admin_access(request)
    if error:
        return error

    if request.method == "GET":
        if is_authorized_superadmin(request.user):
            raw_school_id = request.GET.get("school_id", "").strip()
            if raw_school_id:
                try:
                    school_id = int(raw_school_id)
                except ValueError:
                    return _school_structure_error("Select an active school.")
                school = SchoolInformation.objects.filter(
                    pk=school_id, is_active=True
                ).first()
                if not school:
                    return _school_structure_error(
                        "Select an active school."
                    )

        queryset = _school_structure_queryset(resource, school)
        search = request.GET.get("search", "").strip()
        if search:
            filters = Q(name__icontains=search) | Q(description__icontains=search)
            if resource != "forms":
                filters |= Q(code__icontains=search)
            queryset = queryset.filter(filters)

        response = {
            resource.replace("-", "_"): [
                _serialize_school_structure_item(resource, item)
                for item in queryset
            ]
        }
        if is_authorized_superadmin(request.user):
            response["schools"] = list(
                SchoolInformation.objects.filter(is_active=True)
                .order_by("name")
                .values("id", "name")
            )
        if resource == "departments":
            teachers = Teacher.objects.select_related("school").order_by("full_name")
            if school:
                teachers = teachers.filter(school=school)
            response["teachers"] = [
                {
                    "id": teacher.pk,
                    "full_name": teacher.full_name,
                    "school_id": teacher.school_id,
                }
                for teacher in teachers
            ]
        return JsonResponse(response)

    payload, payload_error = _school_structure_payload(request)
    if payload_error:
        return payload_error

    target_school_id = payload.get("school_id")
    if is_authorized_superadmin(request.user) and target_school_id not in (
        None,
        "",
    ):
        if isinstance(target_school_id, bool) or not isinstance(
            target_school_id, (int, str)
        ):
            return _school_structure_error("Select a valid target school.")
        try:
            target_school_id = int(target_school_id)
        except ValueError:
            return _school_structure_error("Select a valid target school.")
    school = get_write_school(request, target_school_id)
    if not school:
        return _school_structure_error("Select a valid target school.")

    model, _, display_name = config
    item = model(school=school)
    field_error = _set_school_structure_fields(resource, item, payload, school)
    if field_error:
        return field_error

    try:
        item.full_clean()
    except ValidationError as validation_error:
        return _school_structure_error(
            _school_structure_validation_message(validation_error)
        )
    item.save()
    item = _school_structure_queryset(resource, school).get(pk=item.pk)
    return JsonResponse(
        {
            "success": True,
            "message": f"{display_name} {item.name} created successfully.",
            "item": _serialize_school_structure_item(resource, item),
        },
        status=201,
    )


@require_http_methods(["GET", "PUT", "DELETE"])
def school_structure_detail_api_view(request, resource, object_id):
    """Retrieve, update, or delete one school structure record."""
    config = _school_structure_resource(resource)
    if not config:
        return _school_structure_error("School structure resource not found.", 404, "NOT_FOUND")

    error, school = _check_academic_admin_access(request)
    if error:
        return error

    queryset = _school_structure_queryset(resource, school)
    item = queryset.filter(pk=object_id).first()
    if not item:
        return _school_structure_error(
            "School structure record not found.", 404, "NOT_FOUND"
        )

    model, _, display_name = config
    if request.method == "GET":
        return JsonResponse(
            {"item": _serialize_school_structure_item(resource, item)}
        )

    if request.method == "DELETE":
        if resource == "departments":
            count = item.teacher_set.count()
            if count:
                return _school_structure_error(
                    f"Cannot delete department. It has {count} teacher(s) associated with it."
                )
        else:
            count = item.student_set.count()
            if count:
                label = "form" if resource == "forms" else "learning area"
                return _school_structure_error(
                    f"Cannot delete {label}. It has {count} student(s) associated with it."
                )
        name = item.name
        item.delete()
        return JsonResponse(
            {
                "success": True,
                "message": f"{display_name} {name} deleted successfully.",
            }
        )

    payload, payload_error = _school_structure_payload(request)
    if payload_error:
        return payload_error

    field_error = _set_school_structure_fields(resource, item, payload, item.school)
    if field_error:
        return field_error

    try:
        item.full_clean()
    except ValidationError as validation_error:
        return _school_structure_error(
            _school_structure_validation_message(validation_error)
        )
    item.save()
    item = _school_structure_queryset(resource, item.school).get(pk=item.pk)
    return JsonResponse(
        {
            "success": True,
            "message": f"{display_name} {item.name} updated successfully.",
            "item": _serialize_school_structure_item(resource, item),
        }
    )


@require_http_methods(["GET", "POST"])
def academic_years_api_view(request):
    """List or create academic years for the current school."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    if request.method == "GET":
        qs = AcademicYear.objects.all()
        if school:
            qs = qs.filter(school=school)
        search_query = request.GET.get("search", "").strip()
        if search_query:
            qs = qs.filter(name__icontains=search_query)
        current_filter = request.GET.get("is_current", "").strip()
        if current_filter == "true":
            qs = qs.filter(is_current=True)
        elif current_filter == "false":
            qs = qs.filter(is_current=False)
        
        years = qs.annotate(
            terms_count=Count("term", distinct=True),
            classes_count=Count("class", distinct=True),
            quizzes_count=Count("quizzes", distinct=True),
        ).order_by("-start_date", "name")

        data = [
            {
                "id": y.id,
                "name": y.name,
                "start_date": y.start_date.isoformat() if y.start_date else None,
                "end_date": y.end_date.isoformat() if y.end_date else None,
                "is_current": y.is_current,
                "terms_count": y.terms_count,
                "classes_count": y.classes_count,
                "quizzes_count": y.quizzes_count,
            }
            for y in years
        ]
        return JsonResponse({"academic_years": data})

    # POST - Create
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    name = str(body.get("name", "")).strip()
    start_date = str(body.get("start_date", "")).strip()
    end_date = str(body.get("end_date", "")).strip()
    is_current = bool(body.get("is_current", False))

    if not name or not start_date or not end_date:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Name, start date, and end date are required."}, status=400)

    import datetime
    try:
        sd = datetime.date.fromisoformat(start_date)
        ed = datetime.date.fromisoformat(end_date)
    except ValueError:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Invalid date format. Use YYYY-MM-DD."}, status=400)

    if sd >= ed:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Start date must be before end date."}, status=400)

    if school and AcademicYear.objects.filter(school=school, name__iexact=name).exists():
        return JsonResponse({"code": "VALIDATION_ERROR", "message": f'Academic year "{name}" already exists for this school.'}, status=400)

    with transaction.atomic():
        if is_current and school:
            AcademicYear.objects.filter(school=school).update(is_current=False)
        
        year = AcademicYear.objects.create(
            name=name,
            start_date=sd,
            end_date=ed,
            is_current=is_current,
            school=school,
        )
        if is_current and school:
            school.current_academic_year = year
            school.save(update_fields=["current_academic_year"])

    return JsonResponse({
        "success": True,
        "message": f'Academic year "{year.name}" created successfully.',
        "academic_year": {
            "id": year.id,
            "name": year.name,
            "start_date": year.start_date.isoformat(),
            "end_date": year.end_date.isoformat(),
            "is_current": year.is_current,
        }
    }, status=201)


@require_http_methods(["PUT", "DELETE"])
def academic_year_detail_api_view(request, year_id):
    """Update or delete an academic year."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = AcademicYear.objects.all()
    if school:
        qs = qs.filter(school=school)
    year = qs.filter(id=year_id).first()
    if not year:
        return JsonResponse({"code": "NOT_FOUND", "message": "Academic year not found"}, status=404)

    if request.method == "DELETE":
        # Safety checks: cannot delete if terms, classes, quizzes, or attempts exist
        if year.term_set.exists() or year.class_set.exists() or year.quizzes.exists() or year.quiz_attempts.exists():
            return JsonResponse({
                "code": "VALIDATION_ERROR",
                "message": "Cannot delete academic year with associated terms, classes, quizzes, or attempts. Please archive or reassign related records first."
            }, status=400)
        year_name = year.name
        year.delete()
        return JsonResponse({"success": True, "message": f'Academic year "{year_name}" deleted successfully.'})

    # PUT - Update
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    name = str(body.get("name", year.name)).strip()
    start_date = str(body.get("start_date", year.start_date.isoformat())).strip()
    end_date = str(body.get("end_date", year.end_date.isoformat())).strip()
    is_current = bool(body.get("is_current", year.is_current))

    import datetime
    try:
        sd = datetime.date.fromisoformat(start_date)
        ed = datetime.date.fromisoformat(end_date)
    except ValueError:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Invalid date format. Use YYYY-MM-DD."}, status=400)

    if sd >= ed:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Start date must be before end date."}, status=400)

    if school and AcademicYear.objects.filter(school=school, name__iexact=name).exclude(id=year.id).exists():
        return JsonResponse({"code": "VALIDATION_ERROR", "message": f'Another academic year with name "{name}" already exists.'}, status=400)

    with transaction.atomic():
        if is_current and not year.is_current and school:
            AcademicYear.objects.filter(school=school).update(is_current=False)
            school.current_academic_year = year
            school.save(update_fields=["current_academic_year"])
        
        year.name = name
        year.start_date = sd
        year.end_date = ed
        year.is_current = is_current
        year.save()

    return JsonResponse({
        "success": True,
        "message": f'Academic year "{year.name}" updated successfully.',
        "academic_year": {
            "id": year.id,
            "name": year.name,
            "start_date": year.start_date.isoformat(),
            "end_date": year.end_date.isoformat(),
            "is_current": year.is_current,
        }
    })


@require_http_methods(["POST"])
def academic_year_set_current_api_view(request, year_id):
    """Set the specified academic year as current for the school."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = AcademicYear.objects.all()
    if school:
        qs = qs.filter(school=school)
    year = qs.filter(id=year_id).first()
    if not year:
        return JsonResponse({"code": "NOT_FOUND", "message": "Academic year not found"}, status=404)

    with transaction.atomic():
        if school:
            AcademicYear.objects.filter(school=school).update(is_current=False)
            school.current_academic_year = year
            school.save(update_fields=["current_academic_year"])
        year.is_current = True
        year.save(update_fields=["is_current"])

    return JsonResponse({
        "success": True,
        "message": f'Academic year "{year.name}" set as current successfully.'
    })


@require_http_methods(["GET", "POST"])
def terms_api_view(request):
    """List or create terms for the current school."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    if request.method == "GET":
        qs = Term.objects.all()
        if school:
            qs = qs.filter(school=school)
        year_filter = request.GET.get("academic_year_id", "").strip()
        if year_filter:
            qs = qs.filter(academic_year_id=year_filter)
        
        terms = qs.select_related("academic_year").order_by("-academic_year__start_date", "term_number")
        data = [
            {
                "id": t.id,
                "term_number": t.term_number,
                "term_display": t.get_term_number_display(),
                "academic_year_id": t.academic_year_id,
                "academic_year_name": t.academic_year.name if t.academic_year else None,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "end_date": t.end_date.isoformat() if t.end_date else None,
                "is_current": t.is_current,
            }
            for t in terms
        ]
        return JsonResponse({"terms": data})

    # POST - Create
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    academic_year_id = body.get("academic_year_id")
    term_number = body.get("term_number")
    start_date = str(body.get("start_date", "")).strip()
    end_date = str(body.get("end_date", "")).strip()
    is_current = bool(body.get("is_current", False))

    if not academic_year_id or not term_number or not start_date or not end_date:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Academic year, term number, and dates are required."}, status=400)

    try:
        term_number = int(term_number)
    except ValueError:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Term number must be an integer (1, 2, or 3)."}, status=400)

    # Verify academic year
    year = AcademicYear.objects.filter(id=academic_year_id)
    if school:
        year = year.filter(school=school)
    year = year.first()
    if not year:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Invalid academic year specified."}, status=400)

    import datetime
    try:
        sd = datetime.date.fromisoformat(start_date)
        ed = datetime.date.fromisoformat(end_date)
    except ValueError:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Invalid date format. Use YYYY-MM-DD."}, status=400)

    if sd >= ed:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Start date must be before end date."}, status=400)

    if Term.objects.filter(academic_year=year, term_number=term_number).exists():
        return JsonResponse({"code": "VALIDATION_ERROR", "message": f"Term {term_number} already exists for academic year {year.name}."}, status=400)

    with transaction.atomic():
        if is_current and school:
            Term.objects.filter(school=school).update(is_current=False)

        term = Term.objects.create(
            academic_year=year,
            term_number=term_number,
            start_date=sd,
            end_date=ed,
            is_current=is_current,
            school=school,
        )
        if is_current and school:
            school.current_term = term
            school.save(update_fields=["current_term"])

    return JsonResponse({
        "success": True,
        "message": f"{term.get_term_number_display()} created successfully.",
        "term": {
            "id": term.id,
            "term_number": term.term_number,
            "term_display": term.get_term_number_display(),
            "academic_year_id": term.academic_year_id,
            "start_date": term.start_date.isoformat(),
            "end_date": term.end_date.isoformat(),
            "is_current": term.is_current,
        }
    }, status=201)


@require_http_methods(["PUT", "DELETE"])
def term_detail_api_view(request, term_id):
    """Update or delete a term."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Term.objects.all()
    if school:
        qs = qs.filter(school=school)
    term = qs.filter(id=term_id).first()
    if not term:
        return JsonResponse({"code": "NOT_FOUND", "message": "Term not found"}, status=404)

    if request.method == "DELETE":
        display = term.get_term_number_display()
        term.delete()
        return JsonResponse({"success": True, "message": f"{display} deleted successfully."})

    # PUT - Update
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    start_date = str(body.get("start_date", term.start_date.isoformat())).strip()
    end_date = str(body.get("end_date", term.end_date.isoformat())).strip()
    is_current = bool(body.get("is_current", term.is_current))

    import datetime
    try:
        sd = datetime.date.fromisoformat(start_date)
        ed = datetime.date.fromisoformat(end_date)
    except ValueError:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Invalid date format. Use YYYY-MM-DD."}, status=400)

    if sd >= ed:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Start date must be before end date."}, status=400)

    with transaction.atomic():
        if is_current and not term.is_current and school:
            Term.objects.filter(school=school).update(is_current=False)
            school.current_term = term
            school.save(update_fields=["current_term"])

        term.start_date = sd
        term.end_date = ed
        term.is_current = is_current
        term.save()

    return JsonResponse({
        "success": True,
        "message": f"{term.get_term_number_display()} updated successfully.",
        "term": {
            "id": term.id,
            "term_number": term.term_number,
            "term_display": term.get_term_number_display(),
            "academic_year_id": term.academic_year_id,
            "start_date": term.start_date.isoformat(),
            "end_date": term.end_date.isoformat(),
            "is_current": term.is_current,
        }
    })


@require_http_methods(["POST"])
def term_set_current_api_view(request, term_id):
    """Set the specified term as current for the school."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Term.objects.all()
    if school:
        qs = qs.filter(school=school)
    term = qs.filter(id=term_id).first()
    if not term:
        return JsonResponse({"code": "NOT_FOUND", "message": "Term not found"}, status=404)

    with transaction.atomic():
        if school:
            Term.objects.filter(school=school).update(is_current=False)
            school.current_term = term
            school.save(update_fields=["current_term"])
        term.is_current = True
        term.save(update_fields=["is_current"])

    return JsonResponse({
        "success": True,
        "message": f"{term.get_term_number_display()} set as current successfully."
    })


@require_http_methods(["GET", "POST"])
def classes_api_view(request):
    """List or create classes for the current school."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    if request.method == "GET":
        qs = Class.objects.all()
        if school:
            qs = qs.filter(school=school)
        status_filter = request.GET.get("status", "active").strip()
        if status_filter == "archived":
            qs = qs.filter(is_active=False)
        elif status_filter == "all":
            pass
        else:
            qs = qs.filter(is_active=True)
        
        year_filter = request.GET.get("academic_year_id", "").strip()
        if year_filter:
            qs = qs.filter(academic_year_id=year_filter)

        search_query = request.GET.get("search", "").strip()
        if search_query:
            qs = qs.filter(Q(name__icontains=search_query) | Q(class_id__icontains=search_query))

        classes = qs.select_related("form", "academic_year", "learning_area").annotate(
            student_count=Count("studentclass", filter=Q(studentclass__is_active=True), distinct=True),
            subject_count=Count("classsubject", distinct=True),
        ).order_by("form__form_number", "name")

        data = [
            {
                "id": c.id,
                "class_id": c.class_id,
                "name": c.name,
                "form_id": c.form_id,
                "form_name": c.form.name if c.form else None,
                "academic_year_id": c.academic_year_id,
                "academic_year_name": c.academic_year.name if c.academic_year else None,
                "learning_area_id": c.learning_area_id,
                "learning_area_name": c.learning_area.name if c.learning_area else None,
                "maximum_students": c.maximum_students,
                "student_count": c.student_count,
                "subject_count": c.subject_count,
                "is_active": c.is_active,
            }
            for c in classes
        ]
        return JsonResponse({"classes": data})

    # POST - Create
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    name = str(body.get("name", "")).strip()
    form_id = body.get("form_id")
    learning_area_id = body.get("learning_area_id")
    academic_year_id = body.get("academic_year_id")
    maximum_students = body.get("maximum_students", 40)

    if not name:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Class name is required."}, status=400)

    try:
        max_s = int(maximum_students) if maximum_students else 40
    except ValueError:
        max_s = 40

    form = Form.objects.filter(id=form_id, school=school).first() if form_id and school else None
    learning_area = LearningArea.objects.filter(id=learning_area_id, school=school).first() if learning_area_id and school else None
    academic_year = AcademicYear.objects.filter(id=academic_year_id, school=school).first() if academic_year_id and school else getattr(school, "current_academic_year", None)

    # Check duplicate
    if school and Class.objects.filter(school=school, name__iexact=name, academic_year=academic_year).exists():
        return JsonResponse({"code": "VALIDATION_ERROR", "message": f'Class "{name}" already exists for this academic year.'}, status=400)

    cls_obj = Class.objects.create(
        name=name,
        form=form,
        learning_area=learning_area,
        academic_year=academic_year,
        maximum_students=max_s,
        is_active=True,
        school=school,
    )

    return JsonResponse({
        "success": True,
        "message": f'Class "{cls_obj.name}" created successfully.',
        "class": {
            "id": cls_obj.id,
            "class_id": cls_obj.class_id,
            "name": cls_obj.name,
            "is_active": cls_obj.is_active,
        }
    }, status=201)


@require_http_methods(["GET", "PUT", "DELETE"])
def class_detail_api_view(request, class_id):
    """View details, update, or soft-delete a class."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Class.objects.all()
    if school:
        qs = qs.filter(school=school)
    cls_obj = qs.select_related("form", "academic_year", "learning_area").filter(id=class_id).first()
    if not cls_obj:
        return JsonResponse({"code": "NOT_FOUND", "message": "Class not found"}, status=404)

    if request.method == "DELETE":
        cls_obj.is_active = False
        cls_obj.save(update_fields=["is_active"])
        return JsonResponse({"success": True, "message": f'Class "{cls_obj.name}" archived successfully.'})

    if request.method == "PUT":
        try:
            body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
        except Exception:
            body = request.POST

        name = str(body.get("name", cls_obj.name)).strip()
        form_id = body.get("form_id")
        learning_area_id = body.get("learning_area_id")
        academic_year_id = body.get("academic_year_id")
        maximum_students = body.get("maximum_students")

        if not name:
            return JsonResponse({"code": "VALIDATION_ERROR", "message": "Class name cannot be empty."}, status=400)

        if form_id is not None:
            cls_obj.form = Form.objects.filter(id=form_id, school=school).first() if form_id else None
        if learning_area_id is not None:
            cls_obj.learning_area = LearningArea.objects.filter(id=learning_area_id, school=school).first() if learning_area_id else None
        if academic_year_id is not None:
            cls_obj.academic_year = AcademicYear.objects.filter(id=academic_year_id, school=school).first() if academic_year_id else None
        if maximum_students is not None:
            try:
                cls_obj.maximum_students = int(maximum_students)
            except ValueError:
                pass

        cls_obj.name = name
        cls_obj.save()

        return JsonResponse({
            "success": True,
            "message": f'Class "{cls_obj.name}" updated successfully.',
            "class": {
                "id": cls_obj.id,
                "class_id": cls_obj.class_id,
                "name": cls_obj.name,
                "is_active": cls_obj.is_active,
            }
        })

    # GET - Detail with enrolled students and assigned subjects
    students = StudentClass.objects.filter(
        assigned_class=cls_obj,
        is_active=True,
    ).select_related("student").order_by("student__full_name")

    subjects = ClassSubject.objects.filter(
        class_name=cls_obj,
    ).select_related(
        "subject",
        "subject__department",
        "subject__learning_area",
    ).order_by("subject__subject_name")

    return JsonResponse({
        "class": {
            "id": cls_obj.id,
            "class_id": cls_obj.class_id,
            "name": cls_obj.name,
            "form_id": cls_obj.form_id,
            "form_name": cls_obj.form.name if cls_obj.form else None,
            "academic_year_id": cls_obj.academic_year_id,
            "academic_year_name": cls_obj.academic_year.name if cls_obj.academic_year else None,
            "learning_area_id": cls_obj.learning_area_id,
            "learning_area_name": cls_obj.learning_area.name if cls_obj.learning_area else None,
            "maximum_students": cls_obj.maximum_students,
            "is_active": cls_obj.is_active,
            "students_count": students.count(),
            "subjects_count": subjects.count(),
        },
        "enrolled_students": [
            {
                "id": sc.id,
                "student_id": sc.student_id,
                "admission_number": sc.student.admission_number,
                "full_name": sc.student.full_name,
                "gender": sc.student.gender,
                "date_assigned": sc.date_assigned.isoformat() if sc.date_assigned else None,
            }
            for sc in students
        ],
        "assigned_subjects": [
            {
                "id": cs.id,
                "class_subject_id": cs.class_subject_id,
                "subject_id": cs.subject_id,
                "subject_name": cs.subject.subject_name if cs.subject else None,
                "subject_code": cs.subject.subject_code if cs.subject else None,
                "department_name": cs.subject.department.name if cs.subject and cs.subject.department else None,
                "learning_area_name": (
                    cs.subject.learning_area.name
                    if cs.subject and cs.subject.learning_area
                    else None
                ),
            }
            for cs in subjects
        ]
    })


@require_http_methods(["POST"])
def class_restore_api_view(request, class_id):
    """Restore an archived class."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Class.objects.all()
    if school:
        qs = qs.filter(school=school)
    cls_obj = qs.filter(id=class_id).first()
    if not cls_obj:
        return JsonResponse({"code": "NOT_FOUND", "message": "Class not found"}, status=404)

    cls_obj.is_active = True
    cls_obj.save(update_fields=["is_active"])
    return JsonResponse({"success": True, "message": f'Class "{cls_obj.name}" restored successfully.'})


@require_http_methods(["POST"])
def class_subject_add_api_view(request, class_id):
    """Assign a subject to a class."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Class.objects.all()
    if school:
        qs = qs.filter(school=school)
    cls_obj = qs.filter(id=class_id).first()
    if not cls_obj:
        return JsonResponse({"code": "NOT_FOUND", "message": "Class not found"}, status=404)

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    subject_id = body.get("subject_id")
    if not subject_id:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "subject_id is required."}, status=400)

    sub_qs = Subject.objects.all()
    if school:
        sub_qs = sub_qs.filter(school=school)
    subject = sub_qs.filter(id=subject_id).first()
    if not subject:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Invalid subject specified."}, status=400)

    if ClassSubject.objects.filter(class_name=cls_obj, subject=subject).exists():
        return JsonResponse({"code": "VALIDATION_ERROR", "message": f'Subject "{subject.subject_name}" is already assigned to this class.'}, status=400)

    cs = ClassSubject.objects.create(
        class_name=cls_obj,
        subject=subject,
        academic_year=cls_obj.academic_year,
        school=cls_obj.school,
    )

    return JsonResponse({
        "success": True,
        "message": f'Subject "{subject.subject_name}" assigned to {cls_obj.name}.',
        "assigned_subject": {
            "id": cs.id,
            "class_subject_id": cs.class_subject_id,
            "subject_id": cs.subject_id,
            "subject_name": subject.subject_name,
            "subject_code": subject.subject_code,
        }
    }, status=201)


@require_http_methods(["DELETE"])
def class_subject_remove_api_view(request, class_id, class_subject_id):
    """Remove an assigned subject from a class."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Class.objects.all()
    if school:
        qs = qs.filter(school=school)
    cls_obj = qs.filter(id=class_id).first()
    if not cls_obj:
        return JsonResponse({"code": "NOT_FOUND", "message": "Class not found"}, status=404)

    cs = ClassSubject.objects.filter(id=class_subject_id, class_name=cls_obj).first()
    if not cs:
        return JsonResponse({"code": "NOT_FOUND", "message": "Assigned subject not found for this class."}, status=404)

    sub_name = cs.subject.subject_name if cs.subject else "Subject"
    cs.delete()
    return JsonResponse({"success": True, "message": f'"{sub_name}" removed from {cls_obj.name}.'})


@require_http_methods(["GET", "POST"])
def subjects_api_view(request):
    """List or create subjects within an authorized school scope."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    if request.method == "GET":
        qs = Subject.objects.all()
        school_id = request.GET.get("school_id", "").strip()
        if is_authorized_superadmin(request.user) and school_id:
            school_id, error = _parse_subject_filter_id(school_id, "school")
            if error:
                return error
            school = SchoolInformation.objects.filter(
                pk=school_id, is_active=True
            ).first()
            if school is None:
                return _subject_api_error("Select an active school.")
        if school:
            qs = qs.filter(school=school)

        status_filter = request.GET.get("status", "active").strip()
        if status_filter == "archived":
            qs = qs.filter(is_active=False)
        elif status_filter == "all":
            pass
        else:
            qs = qs.filter(is_active=True)

        search_query = request.GET.get("search", "").strip()
        if search_query:
            qs = qs.filter(
                Q(subject_name__icontains=search_query)
                | Q(subject_code__icontains=search_query)
            )

        department_filter = request.GET.get("department_id", "").strip()
        if department_filter:
            department_filter, error = _parse_subject_filter_id(
                department_filter, "department"
            )
            if error:
                return error
            qs = qs.filter(department_id=department_filter)
        learning_area_filter = request.GET.get("learning_area_id", "").strip()
        if learning_area_filter:
            learning_area_filter, error = _parse_subject_filter_id(
                learning_area_filter, "learning area"
            )
            if error:
                return error
            qs = qs.filter(learning_area_id=learning_area_filter)

        subjects = qs.select_related(
            "department", "learning_area", "school"
        ).annotate(
            class_count=Count("classsubject", distinct=True),
            quiz_count=Count("quizzes", distinct=True),
        ).order_by("subject_name")

        data = [_serialize_subject(s) for s in subjects]
        return JsonResponse({"subjects": data})

    body, error = _subject_api_payload(request)
    if error:
        return error
    subject_name = body.get("subject_name")
    if not isinstance(subject_name, str) or not subject_name.strip():
        return _subject_api_error("Subject name is required.")
    subject_name = subject_name.strip()
    target_school_id = body.get("school_id")
    if is_authorized_superadmin(request.user):
        target_school_id, error = _parse_subject_filter_id(
            target_school_id, "target school"
        )
        if error:
            return error
    school = get_write_school(request, target_school_id)
    if school is None:
        return _subject_api_error("Select a valid active target school.")

    department, error = _resolve_subject_relation(
        Department, body.get("department_id"), school, "department"
    )
    if error:
        return error
    learning_area, error = _resolve_subject_relation(
        LearningArea, body.get("learning_area_id"), school, "learning area"
    )
    if error:
        return error
    if Subject.objects.filter(
        school=school, subject_name__iexact=subject_name
    ).exists():
        return _subject_api_error(
            f'Subject "{subject_name}" already exists for this school.'
        )

    subject = Subject(
        subject_name=subject_name,
        department=department,
        learning_area=learning_area,
        school=school,
    )
    try:
        subject.full_clean(exclude=["learning_area"])
        subject.save()
    except ValidationError as validation_error:
        return _subject_api_error(
            _school_structure_validation_message(validation_error)
        )
    except IntegrityError:
        return _subject_api_error(
            "The subject could not be saved because its code is already in use.",
            status=409,
            code="CONFLICT",
        )

    return JsonResponse({
        "success": True,
        "message": f'Subject "{subject.subject_name}" created successfully.',
        "subject": _serialize_subject(subject),
    }, status=201)


@require_http_methods(["PUT", "DELETE"])
def subject_detail_api_view(request, subject_id):
    """Update or soft-delete a subject."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Subject.objects.all()
    if school:
        qs = qs.filter(school=school)
    subject = qs.filter(id=subject_id).first()
    if not subject:
        return JsonResponse({"code": "NOT_FOUND", "message": "Subject not found"}, status=404)

    if request.method == "DELETE":
        with transaction.atomic():
            subject = Subject.objects.select_for_update().get(pk=subject.pk)
            if subject.is_active:
                TeacherSubjectAssignment.objects.filter(
                    subject=subject, is_active=True
                ).update(is_active=False)
                subject.is_active = False
                subject.save(update_fields=["is_active"])
        return JsonResponse({
            "success": True,
            "message": f'Subject "{subject.subject_name}" archived successfully.',
        })

    body, error = _subject_api_payload(request)
    if error:
        return error
    subject_name = body.get("subject_name", subject.subject_name)
    if not isinstance(subject_name, str) or not subject_name.strip():
        return _subject_api_error("Subject name cannot be empty.")
    subject_name = subject_name.strip()
    if Subject.objects.filter(
        school=subject.school, subject_name__iexact=subject_name
    ).exclude(pk=subject.pk).exists():
        return _subject_api_error(
            f'Another subject named "{subject_name}" already exists.'
        )

    if "department_id" in body:
        subject.department, error = _resolve_subject_relation(
            Department, body["department_id"], subject.school, "department"
        )
        if error:
            return error
    if "learning_area_id" in body:
        subject.learning_area, error = _resolve_subject_relation(
            LearningArea,
            body["learning_area_id"],
            subject.school,
            "learning area",
        )
        if error:
            return error

    subject.subject_name = subject_name
    try:
        subject.full_clean(exclude=["learning_area"])
        subject.save()
    except ValidationError as validation_error:
        return _subject_api_error(
            _school_structure_validation_message(validation_error)
        )
    except IntegrityError:
        return _subject_api_error(
            "The subject could not be saved because its code is already in use.",
            status=409,
            code="CONFLICT",
        )

    return JsonResponse({
        "success": True,
        "message": f'Subject "{subject.subject_name}" updated successfully.',
        "subject": _serialize_subject(subject),
    })


@require_http_methods(["POST"])
def subject_restore_api_view(request, subject_id):
    """Restore an archived subject."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = Subject.objects.all()
    if school:
        qs = qs.filter(school=school)
    subject = qs.filter(id=subject_id).first()
    if not subject:
        return JsonResponse({"code": "NOT_FOUND", "message": "Subject not found"}, status=404)

    if not subject.is_active:
        subject.is_active = True
        subject.save(update_fields=["is_active"])
    return JsonResponse({"success": True, "message": f'Subject "{subject.subject_name}" restored successfully.'})


def _subject_api_error(message, status=400, code="VALIDATION_ERROR"):
    return JsonResponse(
        {"success": False, "code": code, "message": message},
        status=status,
    )


def _subject_api_payload(request):
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, _subject_api_error("Request body must be valid JSON.")
    if not hasattr(body, "get"):
        return None, _subject_api_error("Request body must be a JSON object.")
    return body, None


def _resolve_subject_relation(model, raw_id, school, label):
    if raw_id in (None, ""):
        return None, None
    if isinstance(raw_id, bool):
        return None, _subject_api_error(f"Select a valid {label}.")
    try:
        relation_id = int(raw_id)
    except (TypeError, ValueError):
        return None, _subject_api_error(f"Select a valid {label}.")
    if relation_id < 1:
        return None, _subject_api_error(f"Select a valid {label}.")
    relation = model.objects.filter(pk=relation_id, school=school).first()
    if relation is None:
        return None, _subject_api_error(f"Select a valid {label} from this school.")
    return relation, None


def _parse_subject_filter_id(raw_id, label):
    if isinstance(raw_id, bool):
        return None, _subject_api_error(f"Select a valid {label}.")
    try:
        identifier = int(raw_id)
    except (TypeError, ValueError):
        return None, _subject_api_error(f"Select a valid {label}.")
    if identifier < 1:
        return None, _subject_api_error(f"Select a valid {label}.")
    return identifier, None


def _serialize_subject(subject):
    class_count = getattr(subject, "class_count", None)
    if class_count is None:
        class_count = ClassSubject.objects.filter(subject=subject).count()
    quiz_count = getattr(subject, "quiz_count", None)
    if quiz_count is None:
        quiz_count = Quiz.objects.filter(subject=subject).count()
    return {
        "id": subject.pk,
        "subject_name": subject.subject_name,
        "subject_code": subject.subject_code,
        "department_id": subject.department_id,
        "department_name": subject.department.name if subject.department else "",
        "learning_area_id": subject.learning_area_id,
        "learning_area_name": (
            subject.learning_area.name if subject.learning_area else ""
        ),
        "class_count": class_count,
        "quiz_count": quiz_count,
        "is_active": subject.is_active,
        "school_id": subject.school_id,
        "school_name": subject.school.name if subject.school else "",
    }


@require_http_methods(["GET", "POST", "PUT"])
def school_settings_api_view(request):
    """Retrieve or update current school profile and settings."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    if not school:
        return JsonResponse({"code": "NOT_FOUND", "message": "No school found for the current user."}, status=404)

    if request.method == "GET":
        total_students = Student.objects.filter(school=school, is_active=True).count()
        total_teachers = Teacher.objects.filter(school=school, is_active=True).count()
        total_classes = Class.objects.filter(school=school, is_active=True).count()
        total_subjects = Subject.objects.filter(school=school, is_active=True).count()
        total_quizzes = Quiz.objects.filter(subject__school=school).count()

        return JsonResponse({
            "school": {
                "id": school.id,
                "name": school.name,
                "short_name": school.short_name,
                "school_code": school.school_code,
                "address": school.address or "",
                "postal_code": school.postal_code or "",
                "phone_number": school.phone_number or "",
                "email": school.email or "",
                "website": school.website or "",
                "motto": school.motto or "",
                "vision": school.vision or "",
                "mission": school.mission or "",
                "report_header": school.report_header or "",
                "report_footer": school.report_footer or "",
                "grading_system_description": school.grading_system_description or "",
                "current_academic_year_id": school.current_academic_year_id,
                "current_academic_year_name": school.current_academic_year.name if school.current_academic_year else None,
                "current_term_id": school.current_term_id,
                "current_term_name": (
                    f"Term {school.current_term.term_number}"
                    if school.current_term else None
                ),
                "is_active": school.is_active,
                "logo_url": school.logo.url if school.logo else None,
                "school_stamp_url": school.school_stamp.url if school.school_stamp else None,
            },
            "stats": {
                "total_students": total_students,
                "total_teachers": total_teachers,
                "total_classes": total_classes,
                "total_subjects": total_subjects,
                "total_quizzes": total_quizzes,
            }
        })

    if request.method == "POST" or request.content_type == "application/json":
        try:
            body = (
                json.loads(request.body.decode("utf-8"))
                if request.content_type == "application/json" and request.body
                else request.POST
            )
        except json.JSONDecodeError:
            return JsonResponse(
                {
                    "code": "VALIDATION_ERROR",
                    "message": "The school profile payload must contain valid JSON.",
                },
                status=400,
            )
    else:
        body = request.POST

    def value(key, default=""):
        raw_value = body.get(key, default)
        return raw_value.strip() if isinstance(raw_value, str) else raw_value

    def parse_id(key):
        raw_value = value(key) or None
        if raw_value is None:
            return None, None
        try:
            return int(raw_value), None
        except (TypeError, ValueError):
            return None, f"Select a valid {key.replace('_id', '').replace('_', ' ')}."

    school.name = value("name", school.name)
    school.short_name = value("short_name", school.short_name)
    school.address = value("address", school.address or "")
    school.postal_code = value("postal_code", school.postal_code or "") or None
    school.phone_number = value("phone_number", school.phone_number or "")
    school.email = value("email", school.email or "") or None
    school.website = value("website", school.website or "") or None
    school.school_code = value("school_code", school.school_code or "") or None
    school.motto = value("motto", school.motto or "") or None
    school.vision = value("vision", school.vision or "") or None
    school.mission = value("mission", school.mission or "") or None
    school.report_header = value("report_header", school.report_header or "") or None
    school.report_footer = value("report_footer", school.report_footer or "") or None
    school.grading_system_description = (
        value(
            "grading_system_description",
            school.grading_system_description or "",
        )
        or None
    )
    if "is_active" in body:
        school.is_active = str(body.get("is_active", "")).lower() in {
            "on", "true", "1",
        }

    if request.FILES.get("logo"):
        school.logo = request.FILES["logo"]
    if request.FILES.get("school_stamp"):
        school.school_stamp = request.FILES["school_stamp"]

    year_id, year_error = parse_id("current_academic_year_id")
    term_id, term_error = parse_id("current_term_id")
    fields = {}
    if year_error:
        fields["current_academic_year_id"] = [year_error]
    if term_error:
        fields["current_term_id"] = [term_error]
    if fields:
        return JsonResponse(
            {
                "code": "VALIDATION_ERROR",
                "message": "Please select valid academic settings.",
                "fields": fields,
            },
            status=400,
        )

    year = None
    if year_id is not None:
        year = AcademicYear.objects.filter(pk=year_id, school=school).first()
        if year is None:
            return JsonResponse(
                {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid academic year selected.",
                    "fields": {
                        "current_academic_year_id": ["Invalid academic year selected."]
                    },
                },
                status=400,
            )

    term = None
    if term_id is not None:
        term = Term.objects.filter(pk=term_id, school=school).first()
        if term is None:
            return JsonResponse(
                {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid term selected.",
                    "fields": {"current_term_id": ["Invalid term selected."]},
                },
                status=400,
            )
        if year and term.academic_year_id != year.pk:
            return JsonResponse(
                {
                    "code": "VALIDATION_ERROR",
                    "message": "Selected term must belong to the selected academic year.",
                    "fields": {
                        "current_term_id": [
                            "Selected term must belong to the selected academic year."
                        ]
                    },
                },
                status=400,
            )

    school.current_academic_year = year
    school.current_term = term
    school.updated_by = request.user
    if request.user.role == "superadmin" and (
        not school.slug or school.slug == "default-school"
    ):
        school.slug = slugify(school.name)

    try:
        school.full_clean(exclude=["created_by", "updated_by", "address"])
    except ValidationError as error:
        validation_fields = getattr(error, "message_dict", {"__all__": error.messages})
        message = " ".join(
            item for messages in validation_fields.values() for item in messages
        )
        return JsonResponse(
            {
                "code": "VALIDATION_ERROR",
                "message": message or "Please check the school details.",
                "fields": validation_fields,
            },
            status=400,
        )

    with transaction.atomic():
        AcademicYear.objects.filter(school=school).update(is_current=False)
        if year:
            year.is_current = True
            year.save(update_fields=["is_current"])
        Term.objects.filter(school=school).update(is_current=False)
        if term:
            term.is_current = True
            term.save(update_fields=["is_current"])
        school.save()

    return JsonResponse({
        "success": True,
        "message": "School profile updated successfully.",
        "school": {
            "id": school.id,
            "name": school.name,
            "short_name": school.short_name,
            "school_code": school.school_code,
            "address": school.address,
            "phone_number": school.phone_number,
            "email": school.email,
        }
    })


@require_http_methods(["GET"])
def structure_lookups_api_view(request):
    """Return consolidated structure lookups for modals and dropdown menus."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    if is_authorized_superadmin(request.user):
        school_id = request.GET.get("school_id")
        if school_id:
            school = SchoolInformation.objects.filter(pk=school_id, is_active=True).first()
            if not school:
                return JsonResponse({"code": "VALIDATION_ERROR", "message": "Select an active school."}, status=400)

    years = AcademicYear.objects.filter(school=school).order_by("-start_date") if school else AcademicYear.objects.none()
    terms = Term.objects.filter(school=school).select_related("academic_year").order_by("-academic_year__start_date", "term_number") if school else Term.objects.none()
    forms = Form.objects.filter(school=school).order_by("form_number") if school else Form.objects.none()
    learning_areas = LearningArea.objects.filter(school=school).order_by("name") if school else LearningArea.objects.none()
    classes = Class.objects.filter(school=school, is_active=True).order_by("name") if school else Class.objects.none()
    departments = Department.objects.filter(school=school).order_by("name") if school else Department.objects.none()
    subjects = Subject.objects.filter(school=school, is_active=True).order_by("subject_name") if school else Subject.objects.none()

    response = {
        "academic_years": [{"id": y.id, "name": y.name, "is_current": y.is_current} for y in years],
        "terms": [
            {
                "id": t.id,
                "academic_year_id": t.academic_year_id,
                "academic_year_name": t.academic_year.name if t.academic_year else None,
                "term_number": t.term_number,
                "term_display": t.get_term_number_display(),
                "is_current": t.is_current,
            }
            for t in terms
        ],
        "forms": [{"id": f.id, "name": f.name, "form_number": f.form_number} for f in forms],
        "learning_areas": [{"id": la.id, "name": la.name, "code": la.code} for la in learning_areas],
        "classes": [{"id": c.id, "name": c.name, "academic_year_id": c.academic_year_id} for c in classes],
        "departments": [{"id": d.id, "name": d.name, "code": d.code} for d in departments],
        "subjects": [{"id": s.id, "subject_name": s.subject_name, "subject_code": s.subject_code} for s in subjects],
    }
    if is_authorized_superadmin(request.user):
        response["schools"] = list(
            SchoolInformation.objects.filter(is_active=True)
            .order_by("name")
            .values("id", "name")
        )
    return JsonResponse(response)


# ==============================================================================
# Academic Allocations API Views (ADR-015)
# Student Class Enrollments & Teacher Subject Assignments
# ==============================================================================

def _enrollment_error(message, status=400, code="VALIDATION_ERROR"):
    return JsonResponse(
        {"success": False, "code": code, "message": message, "error": message},
        status=status,
    )


def _enrollment_payload(request):
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, _enrollment_error("Request body must be valid JSON.")
    if not isinstance(body, dict):
        return None, _enrollment_error("Request body must be a JSON object.")
    return body, None


def _parse_enrollment_id(value, label):
    if isinstance(value, bool):
        return None, _enrollment_error(f"{label} must be a valid ID.")
    try:
        identifier = int(value)
    except (TypeError, ValueError):
        return None, _enrollment_error(f"{label} must be a valid ID.")
    if identifier < 1:
        return None, _enrollment_error(f"{label} must be a valid ID.")
    return identifier, None


def _enrollment_school_scope(request, school, raw_school_id, required=False):
    if not is_authorized_superadmin(request.user):
        return school, None
    if raw_school_id in (None, ""):
        if required:
            return None, _enrollment_error("Select a valid target school.")
        return None, None
    school_id, error = _parse_enrollment_id(raw_school_id, "School")
    if error:
        return None, error
    target_school = SchoolInformation.objects.filter(
        pk=school_id, is_active=True
    ).first()
    if target_school is None:
        return None, _enrollment_error("Select a valid active school.")
    return target_school, None


def _valid_enrollment_queryset(school=None):
    queryset = StudentClass.objects.filter(
        school__isnull=False,
        student__school_id=F("school_id"),
        assigned_class__school_id=F("school_id"),
        assigned_class__academic_year__school_id=F("school_id"),
    )
    if school:
        queryset = queryset.filter(school=school)
    return queryset


def _serialize_enrollment(enrollment):
    return {
        "id": enrollment.pk,
        "student_id": enrollment.student_id,
        "student_name": enrollment.student.full_name,
        "admission_number": enrollment.student.admission_number,
        "gender": enrollment.student.gender,
        "assigned_class_id": enrollment.assigned_class_id,
        "class_name": enrollment.assigned_class.name,
        "academic_year_name": (
            enrollment.assigned_class.academic_year.name
            if enrollment.assigned_class.academic_year
            else ""
        ),
        "date_assigned": (
            enrollment.date_assigned.isoformat()
            if enrollment.date_assigned
            else None
        ),
        "is_active": enrollment.is_active,
        "assigned_by_name": (
            enrollment.assigned_by.get_full_name()
            or enrollment.assigned_by.username
            if enrollment.assigned_by
            else None
        ),
        "school_id": enrollment.school_id,
        "school_name": enrollment.school.name if enrollment.school else "",
    }


def _student_crosses_academic_year(student, school, target_class):
    latest_enrollment = (
        StudentClass.objects.select_for_update()
        .filter(student=student, school=school)
        .select_related("assigned_class")
        .order_by("-date_assigned", "-pk")
        .first()
    )
    return (
        latest_enrollment is not None
        and latest_enrollment.assigned_class.academic_year_id
        != target_class.academic_year_id
    )


def _create_student_enrollment(student, class_obj, school, assigned_by):
    existing = (
        StudentClass.objects.select_for_update()
        .filter(
            student=student,
            is_active=True,
            school=school,
            assigned_class__school=school,
        )
        .first()
    )
    if existing and existing.assigned_class_id == class_obj.pk:
        return existing, True, None
    if _student_crosses_academic_year(student, school, class_obj):
        return None, False, (
            "Cross-year promotion is not available until the school defines "
            "promotion eligibility and approval rules."
        )
    if class_obj.is_class_full():
        return None, False, "The selected class has reached its capacity."
    if existing:
        existing.is_active = False
        existing.save(update_fields=["is_active"])
    enrollment = StudentClass(
        student=student,
        assigned_class=class_obj,
        assigned_by=assigned_by,
        school=school,
    )
    enrollment.full_clean()
    enrollment.save()
    return enrollment, False, None


@require_http_methods(["GET", "POST"])
def enrollments_api_view(request):
    """List, filter, or create student class enrollments."""
    error, school = _check_academic_admin_access(request)
    if error:
        return error

    if request.method == "GET":
        school, error = _enrollment_school_scope(
            request, school, request.GET.get("school_id")
        )
        if error:
            return error

        queryset = _valid_enrollment_queryset(school).select_related(
            "student",
            "assigned_class",
            "assigned_class__academic_year",
            "assigned_by",
            "school",
        )
        search = request.GET.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(student__full_name__icontains=search)
                | Q(student__admission_number__icontains=search)
                | Q(assigned_class__name__icontains=search)
            )
        for parameter, field, label in (
            ("class_id", "assigned_class_id", "Class"),
            ("student_id", "student_id", "Student"),
        ):
            raw_id = request.GET.get(parameter)
            if raw_id:
                identifier, error = _parse_enrollment_id(raw_id, label)
                if error:
                    return error
                queryset = queryset.filter(**{field: identifier})

        active_filter = request.GET.get("is_active")
        if active_filter == "true":
            queryset = queryset.filter(is_active=True)
        elif active_filter == "false":
            queryset = queryset.filter(is_active=False)

        enrollments = queryset.order_by("-date_assigned", "student__full_name")
        data = [_serialize_enrollment(item) for item in enrollments]
        return JsonResponse({"enrollments": data, "count": len(data)})

    body, error = _enrollment_payload(request)
    if error:
        return error
    student_id, error = _parse_enrollment_id(
        body.get("student_id") or body.get("student"), "Student"
    )
    if error:
        return error
    class_id, error = _parse_enrollment_id(
        body.get("class_id") or body.get("assigned_class"), "Class"
    )
    if error:
        return error

    try:
        with transaction.atomic():
            class_queryset = Class.objects.select_for_update().filter(
                pk=class_id,
                is_active=True,
                school__is_active=True,
                academic_year__school_id=F("school_id"),
            )
            if school:
                class_queryset = class_queryset.filter(school=school)
            class_obj = class_queryset.get()
            target_school = class_obj.school
            student = Student.objects.select_for_update().get(
                pk=student_id,
                school=target_school,
                is_active=True,
            )
            enrollment, already_assigned, enrollment_error = (
                _create_student_enrollment(
                    student, class_obj, target_school, request.user
                )
            )
            if enrollment_error:
                return _enrollment_error(enrollment_error)
    except (Class.DoesNotExist, Student.DoesNotExist):
        return _enrollment_error(
            "Select an active student and a valid class from the same school.",
            400,
        )
    except ValidationError as validation_error:
        return _enrollment_error(
            " ".join(validation_error.messages), 400
        )
    except IntegrityError:
        return _enrollment_error(
            "The student already has an active class enrollment.",
            409,
            "CONFLICT",
        )

    if already_assigned:
        message = f"Student {student.full_name} is already assigned to class {class_obj.name}."
    else:
        message = f"Student {student.full_name} has been assigned to class {class_obj.name}."
    return JsonResponse(
        {
            "success": True,
            "message": message,
            "enrollment_id": enrollment.pk,
            "enrollment": _serialize_enrollment(enrollment),
        },
        status=200 if already_assigned else 201,
    )


@require_http_methods(["POST"])
def enrollments_bulk_api_view(request):
    """Assign multiple active students while retaining per-student outcomes."""
    error, school = _check_academic_admin_access(request)
    if error:
        return error
    body, error = _enrollment_payload(request)
    if error:
        return error

    raw_student_ids = body.get("student_ids")
    if not isinstance(raw_student_ids, list) or not raw_student_ids:
        return _enrollment_error("Select at least one student.")
    student_ids = []
    for raw_id in raw_student_ids:
        student_id, error = _parse_enrollment_id(raw_id, "Student")
        if error:
            return error
        student_ids.append(student_id)
    if len(student_ids) != len(set(student_ids)):
        return _enrollment_error("Student IDs must be unique.")
    class_id, error = _parse_enrollment_id(body.get("class_id"), "Class")
    if error:
        return error

    created = 0
    skipped = 0
    errors = []
    try:
        with transaction.atomic():
            class_queryset = Class.objects.select_for_update().filter(
                pk=class_id,
                is_active=True,
                school__is_active=True,
                academic_year__school_id=F("school_id"),
            )
            if school:
                class_queryset = class_queryset.filter(school=school)
            class_obj = class_queryset.get()
            target_school = class_obj.school
            students = list(
                Student.objects.select_for_update()
                .filter(pk__in=student_ids, school=target_school)
                .order_by("pk")
            )
            if len(students) != len(student_ids):
                return _enrollment_error("One or more selected students are invalid.")
            if any(not student.is_active for student in students):
                return _enrollment_error(
                    "Archived students cannot be assigned to a class."
                )

            for student in students:
                try:
                    with transaction.atomic():
                        enrollment, was_skipped, item_error = (
                            _create_student_enrollment(
                                student, class_obj, target_school, request.user
                            )
                        )
                        if item_error:
                            errors.append(f"{student.full_name}: {item_error}")
                        elif was_skipped:
                            skipped += 1
                        else:
                            created += 1
                except ValidationError as validation_error:
                    errors.append(
                        f"{student.full_name}: {' '.join(validation_error.messages)}"
                    )
                except IntegrityError:
                    existing = StudentClass.objects.filter(
                        student=student,
                        is_active=True,
                        school=target_school,
                    ).first()
                    if existing and existing.assigned_class_id == class_obj.pk:
                        skipped += 1
                    else:
                        errors.append(
                            f"{student.full_name}: An active enrollment changed "
                            "while this request was being processed."
                        )
    except Class.DoesNotExist:
        return _enrollment_error("Select a valid active class.", 400)

    if created:
        message = f"Successfully assigned {created} student(s) to class {class_obj.name}."
    else:
        message = "No new assignments were created."
    if skipped:
        message += f" {skipped} student(s) were already assigned to this class."
    if errors:
        message += f" {len(errors)} student(s) could not be assigned."
    return JsonResponse(
        {
            "success": True,
            "created": created,
            "enrolled_count": created,
            "skipped": skipped,
            "skipped_count": skipped,
            "errors": errors,
            "error_count": len(errors),
            "error_summary": f"{len(errors)} error(s) occurred." if errors else "",
            "message": message,
        }
    )


@require_http_methods(["PUT", "DELETE"])
def enrollment_detail_api_view(request, enrollment_id):
    """Update enrollment status or create a history-preserving transfer."""
    error, school = _check_academic_admin_access(request)
    if error:
        return error

    queryset = _valid_enrollment_queryset(school).select_related(
        "student",
        "assigned_class",
        "assigned_class__academic_year",
        "assigned_by",
        "school",
    )
    enrollment = queryset.filter(pk=enrollment_id).first()
    if not enrollment:
        return _enrollment_error(
            "Enrollment record not found.", 404, "NOT_FOUND"
        )

    if request.method == "DELETE":
        with transaction.atomic():
            enrollment = StudentClass.objects.select_for_update().get(
                pk=enrollment.pk
            )
            if enrollment.is_active:
                enrollment.is_active = False
                enrollment.save(update_fields=["is_active"])
        return JsonResponse(
            {
                "success": True,
                "message": (
                    f"Student {enrollment.student.full_name} has been unassigned "
                    f"from class {enrollment.assigned_class.name}; enrollment "
                    "history was retained."
                ),
            }
        )

    body, error = _enrollment_payload(request)
    if error:
        return error
    class_id, error = _parse_enrollment_id(
        body.get("class_id", enrollment.assigned_class_id), "Class"
    )
    if error:
        return error
    is_active = body.get("is_active", enrollment.is_active)
    if not isinstance(is_active, bool):
        return _enrollment_error("Enrollment status must be true or false.")

    try:
        with transaction.atomic():
            enrollment = StudentClass.objects.select_for_update().get(
                pk=enrollment.pk
            )
            class_queryset = Class.objects.select_for_update().filter(
                pk=class_id,
                school=enrollment.school,
                is_active=True,
                academic_year__school_id=F("school_id"),
            )
            class_obj = class_queryset.first()
            if not class_obj:
                return _enrollment_error(
                    "Select an active class from the student's school.", 400
                )
            class_changed = class_obj.pk != enrollment.assigned_class_id
            if class_changed and not is_active:
                return _enrollment_error(
                    "Select an active enrollment to transfer the student."
                )

            if not is_active:
                if enrollment.is_active:
                    enrollment.is_active = False
                    enrollment.save(update_fields=["is_active"])
                return JsonResponse(
                    {
                        "success": True,
                        "message": "Enrollment was deactivated; its history was retained.",
                        "enrollment": _serialize_enrollment(enrollment),
                    }
                )

            if not enrollment.student.is_active:
                return _enrollment_error(
                    "Archived students cannot be enrolled in a class."
                )
            if _student_crosses_academic_year(
                enrollment.student, enrollment.school, class_obj
            ):
                return _enrollment_error(
                    "Cross-year promotion is not available until the school "
                    "defines promotion eligibility and approval rules."
                )

            existing = (
                StudentClass.objects.select_for_update()
                .filter(
                    student=enrollment.student,
                    is_active=True,
                    school=enrollment.school,
                    assigned_class__school=enrollment.school,
                )
                .exclude(pk=enrollment.pk)
                .first()
            )
            if existing:
                if existing.assigned_class_id == class_obj.pk:
                    return JsonResponse(
                        {
                            "success": True,
                            "message": "Student is already actively enrolled in this class.",
                            "enrollment": _serialize_enrollment(existing),
                        }
                    )
                return _enrollment_error(
                    "The student already has an active enrollment. "
                    "Update that enrollment to make a transfer.",
                    409,
                    "CONFLICT",
                )
            if enrollment.is_active and not class_changed:
                return JsonResponse(
                    {
                        "success": True,
                        "message": "Enrollment is already active.",
                        "enrollment": _serialize_enrollment(enrollment),
                    }
                )
            if class_obj.is_class_full():
                return _enrollment_error(
                    "The selected class has reached its capacity."
                )

            if enrollment.is_active:
                enrollment.is_active = False
                enrollment.save(update_fields=["is_active"])
            new_enrollment = StudentClass(
                student=enrollment.student,
                assigned_class=class_obj,
                assigned_by=request.user,
                school=enrollment.school,
            )
            new_enrollment.full_clean()
            new_enrollment.save()
    except ValidationError as validation_error:
        return _enrollment_error(" ".join(validation_error.messages))
    except IntegrityError:
        return _enrollment_error(
            "The student already has an active class enrollment.",
            409,
            "CONFLICT",
        )

    return JsonResponse(
        {
            "success": True,
            "message": (
                "A new enrollment was created; the previous enrollment "
                "remains as history."
            ),
            "enrollment": _serialize_enrollment(new_enrollment),
        }
    )


@require_http_methods(["POST"])
def enrollments_bulk_delete_api_view(request):
    """Unassign selected students while preserving enrollment history."""
    error, school = _check_academic_admin_access(request)
    if error:
        return error
    body, error = _enrollment_payload(request)
    if error:
        return error

    raw_ids = body.get("enrollment_ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        return _enrollment_error("Select at least one enrollment to unassign.")
    enrollment_ids = []
    for raw_id in raw_ids:
        enrollment_id, error = _parse_enrollment_id(raw_id, "Enrollment")
        if error:
            return error
        enrollment_ids.append(enrollment_id)
    if len(enrollment_ids) != len(set(enrollment_ids)):
        return _enrollment_error("Enrollment IDs must be unique.")

    target_school, error = _enrollment_school_scope(
        request,
        school,
        body.get("target_school_id"),
        required=is_authorized_superadmin(request.user),
    )
    if error:
        return error

    try:
        with transaction.atomic():
            enrollments = list(
                _valid_enrollment_queryset(target_school)
                .select_for_update()
                .filter(pk__in=enrollment_ids)
            )
            if len(enrollments) != len(enrollment_ids):
                return _enrollment_error(
                    "One or more selected enrollments are invalid."
                )
            for enrollment in enrollments:
                if enrollment.is_active:
                    enrollment.is_active = False
                    enrollment.save(update_fields=["is_active"])
    except IntegrityError:
        return _enrollment_error(
            "The selected enrollments changed while they were being removed.",
            409,
            "CONFLICT",
        )

    return JsonResponse(
        {
            "success": True,
            "unassigned_count": len(enrollments),
            "deleted_count": len(enrollments),
            "message": (
                f"Successfully unassigned {len(enrollments)} student(s) from "
                "their classes; enrollment history was retained."
            ),
        }
    )


@require_http_methods(["GET"])
def enrollments_lookups_api_view(request):
    """Return school-scoped classes, eligible students, and superadmin schools."""
    error, school = _check_academic_admin_access(request)
    if error:
        return error
    school, error = _enrollment_school_scope(
        request, school, request.GET.get("school_id")
    )
    if error:
        return error

    class_queryset = (
        Class.objects.filter(
            is_active=True,
            academic_year__school_id=F("school_id"),
        )
        .select_related("academic_year", "school")
    )
    student_queryset = Student.objects.filter(is_active=True).select_related("school")
    if school:
        class_queryset = class_queryset.filter(school=school)
        student_queryset = student_queryset.filter(school=school)

    classes_data = [
        {
            "id": class_obj.pk,
            "class_id": class_obj.class_id,
            "name": class_obj.name,
            "academic_year_name": (
                class_obj.academic_year.name if class_obj.academic_year else ""
            ),
            "maximum_students": class_obj.maximum_students,
            "current_students": class_obj.get_current_student_count(),
            "is_full": class_obj.is_class_full(),
            "school_id": class_obj.school_id,
        }
        for class_obj in class_queryset.order_by("name")
    ]

    active_assignments = (
        StudentClass.objects.filter(
            is_active=True,
            school__isnull=False,
            student__school_id=F("school_id"),
            assigned_class__school_id=F("school_id"),
            assigned_class__academic_year__school_id=F("school_id"),
        )
        .select_related("assigned_class")
        .order_by("-date_assigned", "-pk")
    )
    if school:
        active_assignments = active_assignments.filter(school=school)
    current_classes = {}
    for assignment in active_assignments:
        current_classes.setdefault(
            assignment.student_id, assignment.assigned_class.name
        )

    students_data = [
        {
            "id": student.pk,
            "admission_number": student.admission_number,
            "full_name": student.full_name,
            "gender": student.gender,
            "current_class": current_classes.get(student.pk),
            "school_id": student.school_id,
        }
        for student in student_queryset.order_by("full_name")
    ]
    response = {"classes": classes_data, "students": students_data}
    if is_authorized_superadmin(request.user):
        response["schools"] = list(
            SchoolInformation.objects.filter(is_active=True)
            .order_by("name")
            .values("id", "name")
        )
    return JsonResponse(response)


@require_http_methods(["GET", "POST"])
def teacher_assignments_api_view(request):
    """List or create teacher subject assignments."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    if request.method == "GET":
        qs = TeacherSubjectAssignment.objects.select_related(
            "teacher", "subject", "class_assigned", "academic_year", "previous_teacher"
        )
        if school:
            qs = qs.filter(school=school)

        search = request.GET.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(teacher__full_name__icontains=search)
                | Q(subject__subject_name__icontains=search)
                | Q(class_assigned__name__icontains=search)
            )

        teacher_id = request.GET.get("teacher_id")
        if teacher_id:
            qs = qs.filter(teacher_id=teacher_id)

        subject_id = request.GET.get("subject_id")
        if subject_id:
            qs = qs.filter(subject_id=subject_id)

        class_id = request.GET.get("class_id")
        if class_id:
            qs = qs.filter(class_assigned_id=class_id)

        year_id = request.GET.get("academic_year_id")
        if year_id:
            qs = qs.filter(academic_year_id=year_id)

        is_active = request.GET.get("is_active")
        if is_active == "true":
            qs = qs.filter(is_active=True)
        elif is_active == "false":
            qs = qs.filter(is_active=False)

        assignments = qs.order_by("-date_assigned", "teacher__full_name")

        data = [
            {
                "id": tsa.id,
                "assignment_id": tsa.assignment_id,
                "teacher_id": tsa.teacher_id,
                "teacher_name": tsa.teacher.full_name if tsa.teacher else "",
                "staff_id": tsa.teacher.staff_id if tsa.teacher else "",
                "subject_id": tsa.subject_id,
                "subject_code": tsa.subject.subject_code if tsa.subject else "",
                "subject_name": tsa.subject.subject_name if tsa.subject else "",
                "class_id": tsa.class_assigned_id,
                "class_name": tsa.class_assigned.name if tsa.class_assigned else "",
                "academic_year_id": tsa.academic_year_id,
                "academic_year_name": tsa.academic_year.name if tsa.academic_year else "",
                "date_assigned": tsa.date_assigned.isoformat() if tsa.date_assigned else None,
                "is_active": tsa.is_active,
                "previous_teacher_name": tsa.previous_teacher.full_name if tsa.previous_teacher else None,
            }
            for tsa in assignments
        ]
        return JsonResponse({"assignments": data, "count": len(data)})

    # POST - Single Assignment
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    teacher_id = body.get("teacher_id") or body.get("teacher")
    subject_id = body.get("subject_id") or body.get("subject")
    class_id = body.get("class_id") or body.get("class_assigned")
    academic_year_id = body.get("academic_year_id") or body.get("academic_year")

    if not all([teacher_id, subject_id, class_id, academic_year_id]):
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Teacher, Subject, Class, and Academic Year are all required."}, status=400)

    try:
        class_qs = Class.objects.filter(pk=class_id)
        teacher_qs = Teacher.objects.filter(pk=teacher_id, is_active=True)
        subject_qs = Subject.objects.filter(pk=subject_id, is_active=True)
        year_qs = AcademicYear.objects.filter(pk=academic_year_id)

        if school:
            class_qs = class_qs.filter(school=school)
            teacher_qs = teacher_qs.filter(school=school)
            subject_qs = subject_qs.filter(school=school)
            year_qs = year_qs.filter(school=school)

        class_obj = class_qs.get()
        teacher = teacher_qs.get()
        subject = subject_qs.get()
        academic_year = year_qs.get()
    except (Class.DoesNotExist, Teacher.DoesNotExist, Subject.DoesNotExist, AcademicYear.DoesNotExist):
        return JsonResponse({"code": "NOT_FOUND", "message": "Invalid selection. Please verify all entities belong to the school."}, status=404)

    target_school = class_obj.school or school

    # Validate that subject is assigned to class via ClassSubject
    class_subject = ClassSubject.objects.filter(
        subject=subject,
        class_name=class_obj,
        academic_year=academic_year,
        school=target_school,
    ).first()

    if not class_subject:
        return JsonResponse({
            "code": "VALIDATION_ERROR",
            "message": f'The subject "{subject.subject_name}" is not assigned to class "{class_obj.name}" for session "{academic_year.name}". Please assign it to the class first.',
        }, status=400)

    with transaction.atomic():
        # Check if identical assignment exists
        existing = TeacherSubjectAssignment.objects.filter(
            subject=subject,
            class_assigned=class_obj,
            academic_year=academic_year,
            is_active=True,
            school=target_school,
        ).first()

        if existing:
            if existing.teacher_id == teacher.id:
                return JsonResponse({
                    "success": True,
                    "message": f'{teacher.full_name} is already assigned to {subject.subject_name} in {class_obj.name}.',
                    "assignment_id": existing.id,
                })
            # Reassign to new teacher
            existing.teacher = teacher
            existing.assigned_by = request.user
            existing.save()
            assignment = existing
        else:
            assignment = TeacherSubjectAssignment.objects.create(
                teacher=teacher,
                subject=subject,
                class_assigned=class_obj,
                academic_year=academic_year,
                is_active=True,
                assigned_by=request.user,
                school=target_school,
            )

    return JsonResponse({
        "success": True,
        "message": f'Assigned {teacher.full_name} to {subject.subject_name} in {class_obj.name} successfully.',
        "assignment": {
            "id": assignment.id,
            "assignment_id": assignment.assignment_id,
            "teacher_id": teacher.id,
            "teacher_name": teacher.full_name,
            "subject_id": subject.id,
            "subject_name": subject.subject_name,
            "class_id": class_obj.id,
            "class_name": class_obj.name,
            "academic_year_id": academic_year.id,
            "academic_year_name": academic_year.name,
            "is_active": assignment.is_active,
        }
    }, status=201)


@require_http_methods(["POST"])
def teacher_assignments_bulk_api_view(request):
    """Bulk assign a teacher to multiple subject/class pairs."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    teacher_id = body.get("teacher_id")
    academic_year_id = body.get("academic_year_id")
    assignments_list = body.get("assignments", [])

    if not teacher_id or not academic_year_id or not assignments_list:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "Teacher ID, Academic Year ID, and a non-empty assignments array are required."}, status=400)

    try:
        teacher_qs = Teacher.objects.filter(pk=teacher_id, is_active=True)
        year_qs = AcademicYear.objects.filter(pk=academic_year_id)
        if school:
            teacher_qs = teacher_qs.filter(school=school)
            year_qs = year_qs.filter(school=school)
        teacher = teacher_qs.get()
        academic_year = year_qs.get()
    except (Teacher.DoesNotExist, AcademicYear.DoesNotExist):
        return JsonResponse({"code": "NOT_FOUND", "message": "Teacher or Academic Year not found."}, status=404)

    target_school = teacher.school or school
    created_count = 0
    skipped_count = 0
    errors = []

    with transaction.atomic():
        for item in assignments_list:
            s_id = item.get("subject_id")
            c_id = item.get("class_id")
            if not s_id or not c_id:
                continue

            # Verify ClassSubject
            cs = ClassSubject.objects.filter(
                subject_id=s_id,
                class_name_id=c_id,
                academic_year=academic_year,
                school=target_school,
            ).first()

            if not cs:
                errors.append(f"Subject #{s_id} is not mapped to Class #{c_id} for this academic year.")
                continue

            existing = TeacherSubjectAssignment.objects.filter(
                subject_id=s_id,
                class_assigned_id=c_id,
                academic_year=academic_year,
                is_active=True,
                school=target_school,
            ).first()

            if existing:
                if existing.teacher_id == teacher.id:
                    skipped_count += 1
                    continue
                existing.teacher = teacher
                existing.assigned_by = request.user
                existing.save()
                created_count += 1
            else:
                TeacherSubjectAssignment.objects.create(
                    teacher=teacher,
                    subject_id=s_id,
                    class_assigned_id=c_id,
                    academic_year=academic_year,
                    is_active=True,
                    assigned_by=request.user,
                    school=target_school,
                )
                created_count += 1

    return JsonResponse({
        "success": True,
        "assigned_count": created_count,
        "skipped_count": skipped_count,
        "errors": errors,
        "message": f"Successfully created/updated {created_count} assignments ({skipped_count} skipped).",
    })


@require_http_methods(["PUT", "DELETE"])
def teacher_assignment_detail_api_view(request, assignment_id):
    """Update or delete a teacher subject assignment."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    qs = TeacherSubjectAssignment.objects.select_related("teacher", "subject", "class_assigned")
    if school:
        qs = qs.filter(school=school)
    assignment = qs.filter(id=assignment_id).first()
    if not assignment:
        return JsonResponse({"code": "NOT_FOUND", "message": "Assignment not found."}, status=404)

    if request.method == "DELETE":
        assignment.delete()
        return JsonResponse({"success": True, "message": "Assignment deleted successfully."})

    # PUT
    try:
        body = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        body = request.POST

    new_teacher_id = body.get("teacher_id")
    is_active = body.get("is_active")

    with transaction.atomic():
        if new_teacher_id and new_teacher_id != assignment.teacher_id:
            teacher_qs = Teacher.objects.filter(pk=new_teacher_id, is_active=True)
            if school:
                teacher_qs = teacher_qs.filter(school=school)
            new_teacher = teacher_qs.first()
            if not new_teacher:
                return JsonResponse({"code": "NOT_FOUND", "message": "Teacher not found."}, status=404)
            assignment.teacher = new_teacher

        if is_active is not None:
            assignment.is_active = bool(is_active)

        assignment.save()

    return JsonResponse({
        "success": True,
        "message": "Assignment updated successfully.",
        "assignment": {
            "id": assignment.id,
            "assignment_id": assignment.assignment_id,
            "teacher_id": assignment.teacher_id,
            "teacher_name": assignment.teacher.full_name if assignment.teacher else "",
            "is_active": assignment.is_active,
        }
    })


@require_http_methods(["GET"])
def teacher_assignments_lookups_api_view(request):
    """Return teachers, classes, and academic years for assignment dropdowns."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    teacher_qs = Teacher.objects.filter(is_active=True)
    class_qs = Class.objects.filter(is_active=True)
    year_qs = AcademicYear.objects.all()

    if school:
        teacher_qs = teacher_qs.filter(school=school)
        class_qs = class_qs.filter(school=school)
        year_qs = year_qs.filter(school=school)

    return JsonResponse({
        "teachers": [{"id": t.id, "staff_id": t.staff_id, "full_name": t.full_name} for t in teacher_qs.order_by("full_name")],
        "classes": [{"id": c.id, "class_id": c.class_id, "name": c.name} for c in class_qs.order_by("name")],
        "academic_years": [{"id": y.id, "name": y.name, "is_current": y.is_current} for y in year_qs.order_by("-start_date")],
    })


@require_http_methods(["GET"])
def teacher_assignment_class_subjects_api_view(request):
    """Return subjects assigned to a specific class and academic year via ClassSubject."""
    err, school = _check_academic_admin_access(request)
    if err:
        return err

    class_id = request.GET.get("class_id")
    year_id = request.GET.get("academic_year_id")

    if not class_id:
        return JsonResponse({"code": "VALIDATION_ERROR", "message": "class_id is required."}, status=400)

    qs = ClassSubject.objects.filter(class_name_id=class_id).select_related("subject")
    if year_id:
        qs = qs.filter(academic_year_id=year_id)
    if school:
        qs = qs.filter(school=school)

    subjects = [
        {
            "id": cs.subject_id,
            "subject_code": cs.subject.subject_code if cs.subject else "",
            "subject_name": cs.subject.subject_name if cs.subject else "",
        }
        for cs in qs
    ]
    return JsonResponse({"subjects": subjects})
