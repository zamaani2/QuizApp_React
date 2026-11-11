import datetime

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction

from ..account_security import generate_account_setup_password, schedule_password_setup_email
from ..models import (
    Class,
    Department,
    LearningArea,
    Form,
    SchoolInformation,
    Student,
    StudentClass,
    Teacher,
    TeacherSubjectAssignment,
    ClassTeacher,
)
from ..utils.import_utils import read_tabular_upload
from ..utils.tenant_utils import get_write_school

User = get_user_model()
MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_IMPORT_COLUMNS = 64


def _validate_model(instance, exclude=()):
    try:
        instance.full_clean(exclude=list(exclude))
    except ValidationError as error:
        raise error


def save_student(data, school, student=None, profile_picture=None):
    creating = student is None
    student = student or Student(school=school)
    if student.school_id != school.pk:
        raise ValidationError({"school": ["Student belongs to another school."]})

    required = ("full_name", "date_of_birth", "gender", "parent_contact", "admission_date")
    field_errors = {
        key: ["This field is required."]
        for key in required
        if not str(
            data.get(key, getattr(student, key, "") if not creating else "") or ""
        ).strip()
    }
    if field_errors:
        raise ValidationError(field_errors)

    for key in ("full_name", "gender", "parent_contact", "email"):
            value = str(data.get(key) or "").strip()
            if key == "email" and not value:
                value = None
            setattr(student, key, value)
    for key in ("date_of_birth", "admission_date"):
        if key in data:
            setattr(student, key, data[key])
    for key, model, attribute in (
        ("form", Form, "form"),
        ("learning_area", LearningArea, "learning_area"),
    ):
        if key in data:
            related_id = data.get(key) or None
            related = model.objects.filter(pk=related_id, school=school).first() if related_id else None
            if related_id and related is None:
                raise ValidationError({key: ["Select a valid choice."]})
            setattr(student, attribute, related)
    if profile_picture:
        student.profile_picture = profile_picture
    _validate_model(student, exclude=("admission_number",) if creating else ())
    try:
        student.save()
    except IntegrityError as error:
        raise ValidationError({"admission_number": ["Admission number already exists."]}) from error
    return student


def save_teacher(data, school, teacher=None, profile_picture=None):
    creating = teacher is None
    teacher = teacher or Teacher(school=school)
    if teacher.school_id != school.pk:
        raise ValidationError({"school": ["Teacher belongs to another school."]})
    field_errors = {}
    if not str(data.get("full_name", getattr(teacher, "full_name", "") if not creating else "") or "").strip():
        field_errors["full_name"] = ["This field is required."]
    if not str(data.get("contact_number", getattr(teacher, "contact_number", "") if not creating else "") or "").strip():
        field_errors["contact_number"] = ["This field is required."]
    if field_errors:
        raise ValidationError(field_errors)
    for key in ("full_name", "contact_number", "gender", "email"):
        if key in data:
            value = str(data.get(key) or "").strip()
            if key in {"gender", "email"} and not value:
                value = None
            setattr(teacher, key, value)
    if "department" in data:
        department_id = data.get("department") or None
        department = Department.objects.filter(pk=department_id, school=school).first() if department_id else None
        if department_id and department is None:
            raise ValidationError({"department": ["Select a valid choice."]})
        teacher.department = department
    if profile_picture:
        teacher.profile_picture = profile_picture
    _validate_model(teacher, exclude=("staff_id",) if creating else ())
    teacher.save()
    return teacher


def set_student_archive_state(student, *, is_active):
    account = User.objects.select_for_update().filter(student_profile=student).first()
    if is_active and not student.is_active:
        student.is_active = True
        student.save(update_fields=["is_active", "updated_at"])
        if account and student.account_active_before_archive is not None:
            account.is_active = student.account_active_before_archive
            account.save(update_fields=["is_active"])
        student.account_active_before_archive = None
        student.save(update_fields=["account_active_before_archive", "updated_at"])
        return True
    if not is_active and student.is_active:
        student.account_active_before_archive = account.is_active if account else None
        student.is_active = False
        student.save(update_fields=["is_active", "account_active_before_archive", "updated_at"])
        if student.school_id:
            StudentClass.objects.filter(
                student=student, school_id=student.school_id,
                assigned_class__school_id=student.school_id, is_active=True,
            ).update(is_active=False)
        if account:
            account.is_active = False
            account.save(update_fields=["is_active"])
        return True
    return False


def set_teacher_archive_state(teacher, *, is_active):
    account = User.objects.select_for_update().filter(teacher_profile=teacher).first()
    if is_active and not teacher.is_active:
        teacher.is_active = True
        teacher.save(update_fields=["is_active", "updated_at"])
        if account and teacher.account_active_before_archive is not None:
            account.is_active = teacher.account_active_before_archive
            account.save(update_fields=["is_active"])
        teacher.account_active_before_archive = None
        teacher.save(update_fields=["account_active_before_archive", "updated_at"])
        return True
    if not is_active and teacher.is_active:
        teacher.account_active_before_archive = account.is_active if account else None
        teacher.is_active = False
        teacher.save(update_fields=["is_active", "account_active_before_archive", "updated_at"])
        if teacher.school_id:
            TeacherSubjectAssignment.objects.filter(
                teacher=teacher, school_id=teacher.school_id,
                class_assigned__school_id=teacher.school_id,
                subject__school_id=teacher.school_id,
                academic_year__school_id=teacher.school_id, is_active=True,
            ).update(is_active=False)
            ClassTeacher.objects.filter(
                teacher=teacher, school_id=teacher.school_id,
                class_assigned__school_id=teacher.school_id,
                academic_year__school_id=teacher.school_id, is_active=True,
            ).update(is_active=False)
        if account:
            account.is_active = False
            account.save(update_fields=["is_active"])
        return True
    return False


def save_user(data, request, user=None):
    actor = request.user
    values = {
        key: str(data.get(key, getattr(user, key, "") if user else "") or "").strip()
        for key in ("username", "email", "full_name", "role")
    }
    errors = {
        key: ["This field is required."]
        for key, value in values.items()
        if not value
    }
    if errors:
        raise ValidationError(errors)
    try:
        User._meta.get_field("email").clean(values["email"], user)
    except ValidationError as error:
        raise ValidationError({"email": error.messages}) from error
    if values["role"] not in dict(User.ROLES):
        raise ValidationError({"role": ["Select a valid role."]})
    if actor.role == "admin" and values["role"] == "superadmin":
        raise PermissionDenied("School administrators cannot assign the superadmin role.")

    username_matches = User.objects.filter(username=values["username"])
    email_matches = User.objects.filter(email=values["email"])
    if user:
        if actor.role == "admin" and user.role == "superadmin":
            raise PermissionDenied("Permission denied.")
        username_matches = username_matches.exclude(pk=user.pk)
        email_matches = email_matches.exclude(pk=user.pk)
    if username_matches.exists():
        errors["username"] = ["Username already exists."]
    if email_matches.exists():
        errors["email"] = ["Email already exists."]
    if errors:
        raise ValidationError(errors)

    requested_school = data.get("school_id") or data.get("school")
    if user and "school" not in data and "school_id" not in data:
        requested_school = user.school_id
    if actor.role == "admin" and requested_school and str(requested_school) != str(actor.school_id):
        raise ValidationError({"school": ["Select an active school in your own organization."]})
    if user and actor.role == "superadmin" and user.school_id:
        if requested_school and str(requested_school) != str(user.school_id):
            raise ValidationError({
                "school": ["Changing a user's school requires a dedicated transfer workflow."]
            })
        school = user.school
    elif values["role"] == "superadmin":
        school = None
    else:
        school = get_write_school(request, requested_school)
        if school is None:
            raise ValidationError({"school": ["Select a valid active school."]})

    if user:
        user.username = values["username"]
        user.email = values["email"]
        user.full_name = values["full_name"]
        user.role = values["role"]
        user.school = school
        if data.get("password"):
            user.set_password(data["password"])
        user.save()
        return user, False

    user = User.objects.create_user(
        username=values["username"],
        email=values["email"],
        password=generate_account_setup_password(),
        full_name=values["full_name"],
        role=values["role"],
        school=school,
        is_superadmin=(values["role"] == "superadmin"),
    )
    schedule_password_setup_email(user)
    return user, True


def read_directory_upload(uploaded_file):
    return read_tabular_upload(
        uploaded_file, MAX_IMPORT_FILE_SIZE, MAX_IMPORT_ROWS, MAX_IMPORT_COLUMNS
    )


def import_students(uploaded_file, mappings, school, class_id=None, assigned_by=None):
    headers, rows = read_directory_upload(uploaded_file)
    if not isinstance(mappings, dict):
        raise ValidationError({"column_mappings": ["Expected a JSON object."]})
    required = ("full_name", "gender", "date_of_birth", "parent_contact", "admission_date")
    for key in required:
        if mappings.get(key, key) not in headers:
            raise ValidationError({"column_mappings": [f"Map the {key} column."]})
    target_class = None
    if class_id:
        target_class = Class.objects.filter(
            pk=class_id, school=school, is_active=True, academic_year__school=school
        ).select_related("academic_year").first()
        current_year = SchoolInformation.get_current_academic_year(school=school)
        if not target_class or not current_year or target_class.academic_year_id != current_year.pk:
            raise ValidationError({"assign_class": ["Select an active class in the current academic year."]})

    imported, assigned, errors = 0, 0, []
    seen_admission_numbers = set()
    for row_number, row in enumerate(rows, start=2):
        payload = {field: str(row.get(mappings.get(field, field), "") or "").strip()
                   for field in (*required, "email", "admission_number")}
        admission_number = payload.pop("admission_number")
        try:
            if admission_number:
                if admission_number in seen_admission_numbers or Student.objects.filter(admission_number=admission_number).exists():
                    raise ValidationError({"admission_number": ["Admission number already exists."]})
                seen_admission_numbers.add(admission_number)
            payload["gender"] = payload["gender"].upper()
            for key in ("date_of_birth", "admission_date"):
                payload[key] = datetime.date.fromisoformat(payload[key])
            student = Student(school=school, **payload)
            if admission_number:
                student.admission_number = admission_number
            _validate_model(student, exclude=("admission_number",) if not admission_number else ())
            with transaction.atomic():
                student.save()
                if target_class:
                    from ..api_views import _create_student_enrollment
                    _enrollment, _already_enrolled, enrollment_error = _create_student_enrollment(
                        student, target_class, school, assigned_by
                    )
                    if enrollment_error:
                        raise ValidationError({"assign_class": [enrollment_error]})
            imported += 1
            assigned += int(bool(target_class))
        except (ValidationError, ValueError, IntegrityError) as error:
            detail = error.message_dict if isinstance(error, ValidationError) and hasattr(error, "message_dict") else {"row": [str(error)]}
            errors.append(f"Row {row_number}: " + "; ".join(f"{key}: {', '.join(values)}" for key, values in detail.items()))
    return {
        "success": True, "complete": not errors, "partial_success": bool(imported and errors),
        "imported": imported, "assigned_to_class": assigned, "errors": errors,
        "message": f"Imported {imported} student(s)." if imported else "No students were imported.",
    }


def import_teachers(uploaded_file, school, default_department_id=None):
    headers, rows = read_directory_upload(uploaded_file)
    for key in ("full_name", "contact_number"):
        if key not in headers:
            raise ValidationError({"file": [f"File must contain the {key} column."]})
    default_department = None
    if default_department_id:
        default_department = Department.objects.filter(pk=default_department_id, school=school).first()
        if not default_department:
            raise ValidationError({"default_department": ["Select a valid department."]})
    imported, errors = 0, []
    for row_number, row in enumerate(rows, start=2):
        department = default_department
        department_name = str(row.get("department") or "").strip()
        if department_name:
            choices = list(Department.objects.filter(name__iexact=department_name, school=school)[:2])
            if len(choices) != 1:
                errors.append(f'Row {row_number}: Department "{department_name}" was not found or is ambiguous.')
                continue
            department = choices[0]
        payload = {
            "full_name": row.get("full_name", ""),
            "contact_number": row.get("contact_number", ""),
            "gender": row.get("gender", ""),
            "email": row.get("email", ""),
            "department": department.pk if department else "",
        }
        try:
            with transaction.atomic():
                save_teacher(payload, school)
            imported += 1
        except (ValidationError, IntegrityError) as error:
            messages = (
                error.message_dict
                if hasattr(error, "message_dict")
                else {"row": error.messages if hasattr(error, "messages") else [str(error)]}
            )
            errors.append(f"Row {row_number}: " + "; ".join(f"{key}: {', '.join(values)}" for key, values in messages.items()))
    return {
        "success": True, "complete": not errors, "partial_success": bool(imported and errors),
        "imported": imported, "errors": errors,
        "message": f"Imported {imported} teacher(s)." if imported else "No teachers were imported.",
    }
