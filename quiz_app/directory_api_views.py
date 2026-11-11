import json

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_http_methods

from .account_security import generate_account_setup_password, schedule_password_setup_email
from .models import Student, Teacher
from .services.directory_management import (
    import_students,
    import_teachers,
    read_directory_upload,
    save_student,
    save_teacher,
    save_user,
    set_student_archive_state,
    set_teacher_archive_state,
)
from .utils.export_utils import build_tabular_export
from .utils.tenant_utils import get_object_or_404_with_school, get_write_school

User = get_user_model()
MANAGER_ROLES = {"admin", "superadmin"}


def _error(code, message, status, fields=None):
    result = {"code": code, "message": message}
    if fields:
        result["fields"] = fields
    return JsonResponse(result, status=status)


def _data(request):
    if request.content_type == "application/json":
        try:
            data = json.loads(request.body or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValidationError({"body": ["Request body must be valid JSON."]})
        if not isinstance(data, dict):
            raise ValidationError({"body": ["Request body must be a JSON object."]})
        return data
    return request.POST


def _manager(request):
    if not getattr(request.user, "is_authenticated", False):
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    if request.user.role not in MANAGER_ROLES:
        return _error("FORBIDDEN", "Admin permission required.", 403)
    return None


@require_http_methods(["GET", "POST", "PATCH"])
def students_collection_api_view(request):
    if request.method == "GET":
        from .api_views import students_api_view
        return students_api_view(request)
    return student_write_api_view(request)


@require_http_methods(["GET", "POST", "PATCH"])
def teachers_collection_api_view(request):
    if request.method == "GET":
        from .api_views import teachers_api_view
        return teachers_api_view(request)
    return teacher_write_api_view(request)


@require_http_methods(["GET", "POST", "PATCH"])
def users_collection_api_view(request):
    if request.method == "GET":
        from .api_views import users_api_view
        return users_api_view(request)
    return user_write_api_view(request)


def _validation_error(error):
    if hasattr(error, "message_dict"):
        fields = error.message_dict
    else:
        fields = {"non_field_errors": error.messages}
    return _error("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields)


@require_http_methods(["POST", "PATCH"])
def student_write_api_view(request, student_id=None):
    denied = _manager(request)
    if denied:
        return denied
    try:
        data = _data(request)
        if request.method == "PATCH":
            student_id = student_id or data.get("id")
            if not student_id:
                return _error("VALIDATION_ERROR", "Student id is required.", 400, {"id": ["This field is required."]})
            student = get_object_or_404_with_school(Student, request, pk=student_id)
            school = student.school
        else:
            school = get_write_school(request, data.get("school_id") or data.get("school"))
            if school is None:
                return _error("VALIDATION_ERROR", "Select a valid target school.", 400, {"school_id": ["This field is required."]})
            student = None
        with transaction.atomic():
            student = save_student(data, school, student, request.FILES.get("profile_picture"))
        return JsonResponse({
            "id": student.pk, "student_id": student.pk, "admission_number": student.admission_number,
            "message": f"Student {student.full_name} {'created' if request.method == 'POST' else 'updated'} successfully.",
        }, status=201 if request.method == "POST" else 200)
    except ValidationError as error:
        return _validation_error(error)
    except Http404:
        return _error("NOT_FOUND", "Student not found.", 404)
    except IntegrityError:
        return _error("VALIDATION_ERROR", "Admission number already exists.", 400, {"admission_number": ["Admission number already exists."]})


@require_http_methods(["POST", "PATCH"])
def teacher_write_api_view(request, teacher_id=None):
    denied = _manager(request)
    if denied:
        return denied
    try:
        data = _data(request)
        if request.method == "PATCH":
            teacher_id = teacher_id or data.get("id")
            if not teacher_id:
                return _error("VALIDATION_ERROR", "Teacher id is required.", 400, {"id": ["This field is required."]})
            teacher = get_object_or_404_with_school(Teacher, request, pk=teacher_id)
            school = teacher.school
        else:
            school = get_write_school(request, data.get("school_id") or data.get("school"))
            if school is None:
                return _error("VALIDATION_ERROR", "Select a valid target school.", 400, {"school_id": ["This field is required."]})
            teacher = None
        with transaction.atomic():
            teacher = save_teacher(data, school, teacher, request.FILES.get("profile_picture"))
        return JsonResponse({
            "id": teacher.pk, "teacher_id": teacher.pk, "staff_id": teacher.staff_id,
            "message": f"Teacher {teacher.full_name} {'created' if request.method == 'POST' else 'updated'} successfully.",
        }, status=201 if request.method == "POST" else 200)
    except ValidationError as error:
        return _validation_error(error)
    except Http404:
        return _error("NOT_FOUND", "Teacher not found.", 404)
    except IntegrityError:
        return _error("VALIDATION_ERROR", "Could not save teacher.", 400)


def _archive_api_view(request, model, object_id, active, state_service, label):
    denied = _manager(request)
    if denied:
        return denied
    try:
        record = get_object_or_404_with_school(model, request, pk=object_id)
    except Http404:
        return _error("NOT_FOUND", f"{label} not found.", 404)
    with transaction.atomic():
        record = model.objects.select_for_update().get(pk=record.pk, school=record.school)
        changed = state_service(record, is_active=active)
    action = ("restored" if active else "archived") if changed else ("already active" if active else "already archived")
    return JsonResponse({"message": f"{label} {record.full_name} {action} successfully."})


@require_http_methods(["POST"])
def student_archive_api_view(request, student_id):
    return _archive_api_view(request, Student, student_id, False, set_student_archive_state, "Student")


@require_http_methods(["POST"])
def student_restore_api_view(request, student_id):
    return _archive_api_view(request, Student, student_id, True, set_student_archive_state, "Student")


@require_http_methods(["POST"])
def teacher_archive_api_view(request, teacher_id):
    return _archive_api_view(request, Teacher, teacher_id, False, set_teacher_archive_state, "Teacher")


@require_http_methods(["POST"])
def teacher_restore_api_view(request, teacher_id):
    return _archive_api_view(request, Teacher, teacher_id, True, set_teacher_archive_state, "Teacher")


def _bulk_archive(request, model, state_service, id_key, label):
    denied = _manager(request)
    if denied:
        return denied
    try:
        data = _data(request)
        ids = data.get(id_key)
        if not isinstance(ids, list) or not ids or any(not str(value).isdigit() for value in ids):
            return _error("VALIDATION_ERROR", f"Select one or more valid {label.lower()}s.", 400, {id_key: ["Provide a non-empty list of ids."]})
        if len(set(map(int, ids))) != len(ids):
            return _error("VALIDATION_ERROR", "Ids must be unique.", 400, {id_key: ["Ids must be unique."]})
        action = data.get("action", "archive")
        if action not in {"archive", "restore"}:
            return _error("VALIDATION_ERROR", "Choose archive or restore.", 400, {"action": ["Invalid action."]})
        school = get_write_school(request, data.get("school_id"))
        if school is None:
            return _error("VALIDATION_ERROR", "Select a valid target school.", 400, {"school_id": ["This field is required."]})
        with transaction.atomic():
            records = list(model.objects.filter(pk__in=ids, school=school).select_for_update().order_by("pk"))
            if len(records) != len(ids):
                return _error("NOT_FOUND", f"One or more selected {label.lower()}s are unavailable.", 404)
            count = sum(state_service(record, is_active=(action == "restore")) for record in records)
        action_label = "restored" if action == "restore" else "archived"
        return JsonResponse({"updated": count, "message": f"{count} {label.lower()}(s) {action_label} successfully."})
    except ValidationError as error:
        return _validation_error(error)


@require_http_methods(["POST"])
def student_bulk_archive_api_view(request):
    return _bulk_archive(request, Student, set_student_archive_state, "student_ids", "Student")


@require_http_methods(["POST"])
def teacher_bulk_archive_api_view(request):
    return _bulk_archive(request, Teacher, set_teacher_archive_state, "teacher_ids", "Teacher")


def _import_preview(request, required_headers):
    denied = _manager(request)
    if denied:
        return denied
    uploaded_file = request.FILES.get("file") or request.FILES.get("csv_file")
    if uploaded_file is None:
        return _error("VALIDATION_ERROR", "Choose a file to preview.", 400, {"file": ["This field is required."]})
    try:
        headers, rows = read_directory_upload(uploaded_file)
    except ValueError as error:
        return _error("VALIDATION_ERROR", str(error), 400, {"file": [str(error)]})
    missing = [field for field in required_headers if field not in headers]
    if missing:
        message = "File must contain columns: " + ", ".join(missing)
        return _error("VALIDATION_ERROR", message, 400, {"file": [message]})
    return JsonResponse({"headers": headers, "preview_rows": rows[:5]})


@require_http_methods(["POST"])
def student_import_preview_api_view(request):
    return _import_preview(request, ("full_name", "gender", "date_of_birth", "parent_contact", "admission_date"))


@require_http_methods(["POST"])
def teacher_import_preview_api_view(request):
    return _import_preview(request, ("full_name", "contact_number"))


def _import(request, importer, label):
    denied = _manager(request)
    if denied:
        return denied
    uploaded_file = request.FILES.get("file") or request.FILES.get("csv_file")
    if uploaded_file is None:
        return _error("VALIDATION_ERROR", "Choose a file to import.", 400, {"file": ["This field is required."]})
    try:
        data = _data(request)
        school = get_write_school(request, data.get("school_id") or data.get("school"))
        if school is None:
            return _error("VALIDATION_ERROR", "Select a valid target school.", 400, {"school_id": ["This field is required."]})
        if importer is import_students:
            mappings = json.loads(data.get("column_mappings", "{}"))
            result = importer(
                uploaded_file, mappings, school, data.get("assign_class") or None,
                request.user,
            )
        else:
            result = importer(uploaded_file, school, data.get("default_department") or None)
        return JsonResponse(result)
    except json.JSONDecodeError:
        return _error("VALIDATION_ERROR", "Column mappings must be valid JSON.", 400, {"column_mappings": ["Enter valid JSON."]})
    except ValidationError as error:
        return _validation_error(error)
    except ValueError as error:
        return _error("VALIDATION_ERROR", str(error), 400, {"file": [str(error)]})


@require_http_methods(["POST"])
def student_import_api_view(request):
    return _import(request, import_students, "Student")


@require_http_methods(["POST"])
def teacher_import_api_view(request):
    return _import(request, import_teachers, "Teacher")


@require_http_methods(["GET"])
def teacher_export_api_view(request):
    denied = _manager(request)
    if denied:
        return denied
    school = get_write_school(request, request.GET.get("school_id"))
    if school is None:
        return _error("VALIDATION_ERROR", "Select a valid target school.", 400, {"school_id": ["This field is required."]})
    format_type = request.GET.get("format", "csv")
    if format_type not in {"csv", "xlsx"}:
        return _error("VALIDATION_ERROR", "Choose CSV or XLSX format.", 400, {"format": ["Unsupported export format."]})
    teachers = Teacher.objects.filter(school=school).select_related("department").order_by("full_name", "pk")
    headers = ["Staff ID", "Full Name", "Gender", "Contact Number", "Email", "Department", "Status"]
    def rows():
        for teacher in teachers.iterator(chunk_size=500):
            yield [
                teacher.staff_id, teacher.full_name, teacher.get_gender_display(),
                teacher.contact_number, teacher.email or "",
                teacher.department.name if teacher.department_id else "",
                "Active" if teacher.is_active else "Archived",
            ]
    return build_tabular_export(headers, rows(), format_type, f"{school.slug}_teachers", "Teachers")


@require_http_methods(["POST", "PATCH"])
def _user_write_api_view_unused(request, user_id=None):
    denied = _manager(request)
    if denied:
        return denied
    try:
        data = _data(request)
        if request.method == "PATCH":
            user_id = user_id or data.get("id")
            if not user_id:
                return _error("VALIDATION_ERROR", "User id is required.", 400, {"id": ["This field is required."]})
            try:
                target = get_object_or_404_with_school(User, request, pk=user_id)
            except Http404:
                return _error("NOT_FOUND", "User not found.", 404)
        else:
            target = None

        required = ("username", "email", "full_name", "role")
        values = {
            key: str(data.get(key, getattr(target, key, "") if target else "") or "").strip()
            for key in required
        }
        fields = {key: ["This field is required."] for key, value in values.items() if not value}
        if fields:
            return _error("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields)
        try:
            User._meta.get_field("email").clean(values["email"], target)
        except ValidationError as error:
            return _error("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, {"email": error.messages})
        role = values["role"]
        if role not in dict(User.ROLES):
            return _error("VALIDATION_ERROR", "Invalid role.", 400, {"role": ["Select a valid role."]})
        if request.user.role == "admin" and role == "superadmin":
            return _error("FORBIDDEN", "School administrators cannot assign the superadmin role.", 403, {"role": ["This role is not permitted."]})
        duplicate_username = User.objects.filter(username=values["username"])
        duplicate_email = User.objects.filter(email=values["email"])
        if target:
            duplicate_username = duplicate_username.exclude(pk=target.pk)
            duplicate_email = duplicate_email.exclude(pk=target.pk)
        fields = {}
        if duplicate_username.exists():
            fields["username"] = ["Username already exists."]
        if duplicate_email.exists():
            fields["email"] = ["Email already exists."]
        if fields:
            return _error("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields)

        requested_school = data.get("school_id") or data.get("school")
        if target and "school" not in data and "school_id" not in data:
            requested_school = target.school_id
        if target and request.user.role == "superadmin" and target.school_id:
            if requested_school and str(requested_school) != str(target.school_id):
                return _error("VALIDATION_ERROR", "Changing a user's school requires a dedicated transfer workflow.", 400, {"school": ["School transfer is not supported."]})
            school = target.school
        elif role == "superadmin":
            school = None
        else:
            school = get_write_school(request, requested_school)
            if school is None:
                return _error("VALIDATION_ERROR", "Select a valid target school.", 400, {"school": ["This field is required."]})
        if target:
            if request.user.role == "admin" and target.role == "superadmin":
                return _error("FORBIDDEN", "Permission denied.", 403)
            target.username = values["username"]
            target.email = values["email"]
            target.full_name = values["full_name"]
            target.role = role
            target.school = school
            if data.get("password"):
                target.set_password(data["password"])
            target.save()
            user = target
            status = 200
        else:
            user = User.objects.create_user(
                username=values["username"], email=values["email"],
                password=generate_account_setup_password(), full_name=values["full_name"],
                role=role, school=school, is_superadmin=(role == "superadmin"),
            )
            schedule_password_setup_email(user)
            status = 201
        return JsonResponse({"id": user.pk, "user_id": user.pk, "message": f"User {user.full_name} saved successfully."}, status=status)
    except ValidationError as error:
        return _validation_error(error)
    except IntegrityError:
        return _error(
            "VALIDATION_ERROR",
            "Username or email is already in use.",
            400,
            {"username": ["Username or email is already in use."], "email": ["Username or email is already in use."]},
        )


@require_http_methods(["POST", "PATCH"])
def user_write_api_view(request, user_id=None):
    denied = _manager(request)
    if denied:
        return denied
    try:
        data = _data(request)
        target = None
        if request.method == "PATCH":
            user_id = user_id or data.get("id")
            if not user_id:
                return _error("VALIDATION_ERROR", "User id is required.", 400, {"id": ["This field is required."]})
            try:
                target = get_object_or_404_with_school(User, request, pk=user_id)
            except Http404:
                return _error("NOT_FOUND", "User not found.", 404)
        user, created = save_user(data, request, target)
        return JsonResponse(
            {
                "id": user.pk,
                "user_id": user.pk,
                "message": f"User {user.full_name} {'created' if created else 'updated'} successfully.",
            },
            status=201 if created else 200,
        )
    except PermissionDenied as error:
        return _error("FORBIDDEN", str(error), 403)
    except ValidationError as error:
        return _validation_error(error)
    except IntegrityError:
        return _error(
            "VALIDATION_ERROR",
            "Username or email is already in use.",
            400,
            {"username": ["Username or email is already in use."], "email": ["Username or email is already in use."]},
        )


@require_http_methods(["DELETE"])
def user_delete_api_view(request, user_id):
    denied = _manager(request)
    if denied:
        return denied
    try:
        target = get_object_or_404_with_school(User, request, pk=user_id)
    except Http404:
        return _error("NOT_FOUND", "User not found.", 404)
    if target.pk == request.user.pk:
        return _error("VALIDATION_ERROR", "You cannot delete your own account.", 400)
    if request.user.role == "admin" and target.role == "superadmin":
        return _error("FORBIDDEN", "Permission denied.", 403)
    target.delete()
    return JsonResponse({"message": "User deleted successfully."})


@require_http_methods(["PATCH", "DELETE"])
def user_detail_api_view(request, user_id):
    if request.method == "DELETE":
        return user_delete_api_view(request, user_id)
    return user_write_api_view(request, user_id)


@require_http_methods(["POST"])
def user_bulk_password_reset_api_view(request):
    denied = _manager(request)
    if denied:
        return denied
    try:
        data = _data(request)
        ids = data.get("user_ids")
        if not isinstance(ids, list) or not ids or any(not str(value).isdigit() for value in ids):
            return _error("VALIDATION_ERROR", "Select one or more users.", 400, {"user_ids": ["Provide a non-empty list of ids."]})
        if len(set(map(int, ids))) != len(ids):
            return _error("VALIDATION_ERROR", "User ids must be unique.", 400, {"user_ids": ["Ids must be unique."]})
        school = get_write_school(request, data.get("school_id"))
        if school is None:
            return _error("VALIDATION_ERROR", "Select a valid target school.", 400, {"school_id": ["This field is required."]})
        users = list(User.objects.filter(pk__in=ids, school=school).exclude(pk=request.user.pk))
        if request.user.role == "admin":
            users = [user for user in users if user.role != "superadmin"]
        if len(users) != len(ids):
            return _error("NOT_FOUND", "One or more selected users are unavailable.", 404)
        for user in users:
            schedule_password_setup_email(user)
        return JsonResponse({"message": f"Password setup links sent for {len(users)} user(s)."})
    except ValidationError as error:
        return _validation_error(error)
