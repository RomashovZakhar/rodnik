from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from django.urls import reverse
import logging

logger = logging.getLogger(__name__)


def send_verification_email(user, verification_code):
    """
    Отправляет письмо с кодом верификации на email пользователя
    
    Args:
        user: Объект пользователя
        verification_code: Код верификации
    """
    try:
        # Формируем URL для верификации
        verification_url = f"{settings.FRONTEND_URL}/verify-email?email={user.email}&code={verification_code}"
        
        # Параметры для шаблона
        context = {
            'username': user.username,
            'verification_code': verification_code,
            'verification_url': verification_url
        }
        
        # Генерируем HTML и текстовую версии письма
        html_message = render_to_string('email/verification_email.html', context)
        plain_message = render_to_string('email/verification_email.txt', context)
        
        # Отправляем письмо
        result = send_mail(
            subject='Подтверждение Email',
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_message,
            fail_silently=False
        )
        
        logger.info(f"Письмо подтверждения отправлено на {user.email}")
        return True
    
    except Exception as e:
        logger.error(f"Ошибка при отправке письма подтверждения на {user.email}: {str(e)}")
        return False 
