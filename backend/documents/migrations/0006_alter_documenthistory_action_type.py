# Generated by Django 4.2.7 on 2025-04-01 21:41

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0005_alter_documenthistory_action_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="documenthistory",
            name="action_type",
            field=models.CharField(
                choices=[
                    ("edit", "Редактирование"),
                    ("create", "Создание"),
                    ("view", "Просмотр"),
                    ("share", "Предоставление доступа"),
                    ("revoke", "Отзыв доступа"),
                    ("title_change", "Изменение заголовка"),
                    ("nested_create", "Создание вложенного документа"),
                    ("task_complete", "Завершение задачи"),
                ],
                default="edit",
                max_length=20,
            ),
        ),
    ]
