from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from users.views import (
    UserViewSet,
    RegisterView,
    VerifyEmailView,
    ResendVerificationView,
    EmailVerifiedTokenObtainPairView
)
from documents.views import DocumentViewSet
from tasks.views import TaskViewSet

# Создаем и регистрируем маршруты через роутер
router = DefaultRouter()
router.register('documents', DocumentViewSet, basename='document')
router.register('users', UserViewSet, basename='user')

urlpatterns = [
    # JWT аутентификация
    path('token/', EmailVerifiedTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Регистрация и верификация
    path('register/', RegisterView.as_view(), name='register'),
    path('verify-email/', VerifyEmailView.as_view(), name='verify_email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='resend_verification'),
    
    # API endpoints через роутер
    path('', include(router.urls)),
]
