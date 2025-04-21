import json
import logging
from channels.generic.websocket import WebsocketConsumer
from django.utils import timezone

logger = logging.getLogger(__name__)

class SimpleTestConsumer(WebsocketConsumer):
    """
    WebSocket-потребитель для тестирования взаимодействия с документами
    Поддерживает:
    - Логирование соединений
    - Эхо-ответы на сообщения
    - Обработку ошибок
    """
    
    def connect(self):
        """Обработка установки соединения"""
        try:
            self._extract_document_id()
            self._log_connection_attempt()
            self.accept()
            self._send_connection_confirmation()
        except Exception as e:
            self._handle_error("Ошибка подключения", e)
            self.close()

    def disconnect(self, close_code):
        """Обработка разрыва соединения"""
        logger.info(f"[TEST] Соединение закрыто (код {close_code})", 
                   extra={'document_id': getattr(self, 'document_id', 'N/A')})

    def receive(self, text_data):
        """Обработка входящих сообщений"""
        try:
            self._log_incoming_message(text_data)
            response = self._create_echo_response(text_data)
            self.send_message(response)
        except Exception as e:
            self._handle_error("Ошибка обработки сообщения", e)

    # Вспомогательные методы
    def _extract_document_id(self):
        """Извлекает ID документа из URL"""
        self.document_id = self.scope['url_route']['kwargs'].get('document_id')
        
    def _log_connection_attempt(self):
        """Логирует попытку подключения"""
        logger.info("[TEST] Попытка подключения", 
                   extra={'document_id': self.document_id})
        
    def _send_connection_confirmation(self):
        """Отправляет подтверждение соединения"""
        self.send_message({
            'type': 'connection_established',
            'message': 'Тестовое соединение установлено',
            'document_id': self.document_id
        })
        
    def _create_echo_response(self, text_data):
        """Формирует эхо-ответ"""
        return {
            'type': 'echo_response',
            'received': text_data,
            'timestamp': timezone.now().isoformat()
        }

    def send_message(self, data):
        """Обертка для отправки сообщений с логированием"""
        self.send(text_data=json.dumps(data))
        logger.debug("[TEST] Отправлено сообщение: %s", data)

    def _handle_error(self, message, error):
        """Унифицированная обработка ошибок"""
        logger.error(f"[TEST] {message}: {str(error)}",
                    exc_info=True,
                    extra={'document_id': getattr(self, 'document_id', 'N/A')})
