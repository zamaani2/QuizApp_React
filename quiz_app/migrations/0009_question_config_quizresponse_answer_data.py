from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("quiz_app", "0008_quizattempt_answer_order_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="question",
            name="config",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Question-type configuration, including answer keys and type-specific settings",
            ),
        ),
        migrations.AddField(
            model_name="quizresponse",
            name="answer_data",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Structured answer for any registered question type",
            ),
        ),
    ]
