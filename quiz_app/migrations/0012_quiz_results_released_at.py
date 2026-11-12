from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("quiz_app", "0011_quiz_pass_percentage"),
    ]

    operations = [
        migrations.AddField(
            model_name="quiz",
            name="results_released_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When delayed quiz results were released to students",
                null=True,
            ),
        ),
    ]
