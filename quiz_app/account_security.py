import logging
import secrets
import smtplib
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import BadHeaderError, EmailMultiAlternatives
from django.db import transaction
from django.urls import reverse

logger = logging.getLogger(__name__)

EMAIL_DELIVERY_ERRORS = (
    BadHeaderError,
    ImproperlyConfigured,
    OSError,
    smtplib.SMTPException,
)


class PasswordResetEmailDeliveryError(Exception):
    pass


def generate_account_setup_password():
    """Return a high-entropy initial password that is never delivered."""
    return secrets.token_urlsafe(48)


def can_receive_password_setup_email(user):
    if not user.email or not user.is_active or not user.has_usable_password():
        return False
    if (
        user.student_profile_id
        and not user.student_profile.email
        and user.email == f"{user.student_profile.admission_number}@example.com"
    ):
        return False
    if (
        user.teacher_profile_id
        and not user.teacher_profile.email
        and user.email == f"{user.teacher_profile.staff_id}@example.com"
    ):
        return False
    return True


class SafePasswordResetForm(PasswordResetForm):
    def send_mail(
        self,
        subject_template_name,
        email_template_name,
        context,
        from_email,
        to_email,
        html_email_template_name=None,
    ):
        subject = "Reset your QuizApp password"
        user = context["user"]
        reset_path = reverse(
            "quiz_app:password_reset_confirm",
            kwargs={"uidb64": context["uid"], "token": context["token"]},
        )
        reset_url = (
            f"{context['protocol']}://{context['domain']}{reset_path}"
        )
        body = (
            f"Hello {user.get_full_name() or user.get_username()},\n\n"
            "Use the one-time link below to set or reset your QuizApp password:\n\n"
            f"{reset_url}\n\n"
            "If you did not request this, you can ignore this email."
        )
        email_message = EmailMultiAlternatives(subject, body, from_email, [to_email])
        if html_email_template_name is not None:
            html_email = loader.render_to_string(html_email_template_name, context)
            email_message.attach_alternative(html_email, "text/html")

        try:
            sent_count = email_message.send()
        except EMAIL_DELIVERY_ERRORS as exc:
            raise PasswordResetEmailDeliveryError(type(exc).__name__) from None
        if not sent_count:
            raise PasswordResetEmailDeliveryError("EmailNotSent")

    def save(
        self,
        domain_override=None,
        subject_template_name=None,
        email_template_name=None,
        use_https=False,
        token_generator=default_token_generator,
        from_email=None,
        request=None,
        html_email_template_name=None,
        extra_email_context=None,
    ):
        try:
            super().save(
                domain_override=domain_override,
                subject_template_name=subject_template_name,
                email_template_name=email_template_name,
                use_https=use_https,
                token_generator=token_generator,
                from_email=from_email,
                request=request,
                html_email_template_name=html_email_template_name,
                extra_email_context=extra_email_context,
            )
        except PasswordResetEmailDeliveryError as exc:
            logger.warning(
                "Password reset email delivery failed (error_type=%s).",
                str(exc),
            )
            return False
        return True


def schedule_password_setup_email(user):
    """Send a password setup/reset link after the account transaction commits."""
    if not can_receive_password_setup_email(user):
        return False

    site_url = urlparse(settings.SITE_URL)
    if not site_url.scheme or not site_url.netloc:
        logger.error("Password setup email could not be sent: SITE_URL is invalid.")
        return False

    def send_setup_email():
        form = SafePasswordResetForm({"email": user.email})
        if not form.is_valid():
            logger.error(
                "Password setup email could not be sent for user_id=%s.",
                user.pk,
            )
            return

        form.save(
            domain_override=site_url.netloc,
            use_https=site_url.scheme == "https",
            from_email=settings.DEFAULT_FROM_EMAIL,
        )

    transaction.on_commit(send_setup_email)
    return True
