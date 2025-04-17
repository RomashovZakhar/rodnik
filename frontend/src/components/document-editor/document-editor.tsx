"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import api from "@/lib/api"
import { useAuth } from "@/components/auth"
import { nanoid } from "nanoid"
import { useToast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import Cookies from "js-cookie"
import CursorOverlay from "./CursorOverlay"
import EditorJS from "@editorjs/editorjs"
import Header from "@editorjs/header"
import List from "@editorjs/list"
import Image from "@editorjs/image"
// Добавляем статические импорты вместо динамических
import Table from "@editorjs/table"
import { TaskModalsProvider, useTaskModals, TaskModalsContextType } from "@/components/tasks/task-modals-provider"
import { GlobalTaskModals } from "@/components/tasks/global-task-modals"
import React from "react"

// Добавляем глобальные стили для курсоров
import "./remote-cursor.css"
// Добавляем стили для редактора
import "./editor-styles.css"

// Типы для документа
interface Document {
  id: string;
  title: string;
  content: unknown;
  parent: string | null;
  is_favorite?: boolean;
}

interface DocumentEditorProps {
  document: Document;
  onChange: (document: Document) => void;
  titleInputRef?: React.RefObject<HTMLInputElement | null>;
}

// Интерфейс для курсора другого пользователя
interface RemoteCursor {
  id: string;
  username: string;
  color: string;
  position: {
    x: number;
    y: number;
  } | null;
  timestamp: number;
}

// Добавляем интерфейсы для типизации
interface EditorApi {
  blocks: {
    insert: (type: string, data?: any) => void;
  };
  save: () => Promise<any>;
}

interface WebSocketError extends Event {
  error?: Error;
  message?: string;
}

// Кастомный блок для вложенного документа
const NestedDocumentTool = {
  class: class {
    api: any;
    data: {
      id: string;
      title: string;
    };
    block: HTMLElement;
    container: HTMLElement;
    pendingCreation: boolean;
    isNewBlock: boolean;
    
    static get toolbox() {
      return {
        title: 'Вложенный документ',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5Z" stroke="currentColor" stroke-width="2"/><path d="M7 7H17" stroke="currentColor" stroke-width="2"/><path d="M7 12H17" stroke="currentColor" stroke-width="2"/><path d="M7 17H13" stroke="currentColor" stroke-width="2"/></svg>'
      };
    }
    
    constructor({ data, api, block }: { data: any, api: any, block: HTMLElement }) {
      this.api = api;
      this.data = data || { id: '', title: 'Новый документ' };
      this.block = block;
      this.container = document.createElement('div');
      this.container.classList.add('nested-document-block');
      this.pendingCreation = false;
      
      // Определяем, является ли блок новым или существующим
      // Новый блок - созданный через тулбар (без ID)
      // Существующий блок - загруженный из сохраненного документа (с или без ID)
      this.isNewBlock = !this.data.id && !block.innerHTML;
      
      console.log('Создан блок вложенного документа:', {
        isNewBlock: this.isNewBlock, 
        hasId: !!this.data.id, 
        title: this.data.title
      });
    }
    
    // Отображает блок в редакторе
    render() {
      // Если это существующий документ с ID, просто отображаем ссылку
      if (this.data.id) {
        this.renderExistingDocument();
        return this.container;
      }
      
      // Если это новый блок (созданный через тулбар), то создаем новый документ
      if (this.isNewBlock) {
        // Сразу отображаем состояние загрузки
        this.renderLoadingState();
        
        // Начинаем создание с небольшой задержкой
        setTimeout(() => {
          this.createDocument().catch(error => {
            console.error('Ошибка при создании документа:', error);
            this.renderErrorState(error.message || 'Не удалось создать документ');
          });
        }, 100);
      } else {
        // Если это существующий блок без ID (например, загруженный из сохраненного документа),
        // то отображаем кнопку для создания документа
        this.renderCreateButton();
      }
      
      return this.container;
    }
    
    // Отображает ссылку на существующий документ
    renderExistingDocument() {
      // Если у нас есть id документа, загружаем актуальные данные
      if (this.data.id) {
        // Загружаем актуальные данные о документе с сервера
        this.fetchDocumentDetails(this.data.id);
      } else {
        // Если ID нет, просто отображаем с имеющимися данными
        this.renderDocumentLink();
      }
      
      return this.container;
    }
    
    // Загружает актуальные данные о документе
    async fetchDocumentDetails(documentId: string) {
      try {
        console.log(`Загрузка актуальных данных для документа: ${documentId}`);
        const response = await api.get(`/documents/${documentId}/`);
        
        if (response.data && response.data.title) {
          console.log(`Получены данные, текущее название: ${this.data.title}, актуальное название: ${response.data.title}`);
          
          // Обновляем данные только если название изменилось
          if (this.data.title !== response.data.title) {
            this.data.title = response.data.title;
            console.log(`Название обновлено на: ${this.data.title}`);
            
            // Обновляем данные блока в EditorJS
            try {
              if (this.api && typeof this.api.blocks?.getCurrentBlockIndex === 'function') {
                const blockIndex = this.api.blocks.getCurrentBlockIndex();
                if (typeof blockIndex === 'number') {
                  await this.api.blocks.update(blockIndex, this.data);
                  console.log(`Блок ${blockIndex} обновлен с новым названием`);
                }
              }
            } catch (e) {
              console.error('Ошибка при обновлении блока:', e);
            }
          }
        }
        
        // Отображаем ссылку с актуальными данными
        this.renderDocumentLink();
      } catch (error) {
        console.error('Ошибка при загрузке документа:', error);
        // В случае ошибки просто отображаем с имеющимися данными
        this.renderDocumentLink();
      }
    }
    
    // Непосредственно отображает ссылку
    renderDocumentLink() {
      // Безопасно экранируем title
      const safeTitle = (this.data.title || 'Документ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      
      // Создаем контейнер для ссылки в стиле Notion
      const linkContainer = document.createElement('div');
      linkContainer.className = 'py-1 px-2 -mx-2 my-0.5 inline-block rounded hover:bg-muted/80 transition-colors cursor-pointer';
      
      // Текст ссылки в стиле Notion с подчеркиванием
      const textSpan = document.createElement('span');
      textSpan.className = 'font-medium text-m text-foreground border-b border-muted-foreground/40';
      textSpan.textContent = safeTitle;
      
      // Добавляем текст в контейнер
      linkContainer.appendChild(textSpan);
      
      // Добавляем обработчик клика
      linkContainer.addEventListener('click', () => {
        window.location.href = `/documents/${this.data.id}`;
      });
      
      // Очищаем и добавляем новое содержимое
      this.container.innerHTML = '';
      this.container.appendChild(linkContainer);
    }
    
    // Отображает кнопку для создания документа
    renderCreateButton() {
      // Создаем контейнер в стиле Notion
      const container = document.createElement('div');
      container.className = 'py-1 my-1';
      
      // Создаем интерактивный элемент в стиле Notion
      const createLink = document.createElement('div');
      createLink.className = 'inline-flex items-center py-1 px-2 -mx-2 rounded hover:bg-muted/80 transition-colors cursor-pointer text-blue-600 hover:text-blue-700';
      
      // Иконка "плюс" в том же стиле
      const plusIcon = document.createElement('span');
      plusIcon.className = 'mr-1 h-4 w-4';
      plusIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4V20M4 12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      
      // Текст ссылки
      const linkText = document.createElement('span');
      linkText.className = 'font-medium text-sm';
      linkText.textContent = 'Создать документ';
      
      // Собираем элементы
      createLink.appendChild(plusIcon);
      createLink.appendChild(linkText);
      container.appendChild(createLink);
      
      // Добавляем обработчик нажатия
      createLink.addEventListener('click', async () => {
        // Показываем загрузку
        this.renderLoadingState();
        
        try {
          await this.createDocument();
        } catch (error) {
          // В случае ошибки возвращаем кнопку создания
          this.renderCreateButton();
        }
      });
      
      // Очищаем и добавляем новое содержимое
      this.container.innerHTML = '';
      this.container.appendChild(container);
    }
    
    // Отображает состояние загрузки
    renderLoadingState() {
      // Создаем контейнер в стиле Notion
      const loadingContainer = document.createElement('div');
      loadingContainer.className = 'py-1 px-2 -mx-2 my-0.5 inline-block rounded bg-muted/30';
      
      // Текст загрузки
      const textSpan = document.createElement('span');
      textSpan.className = 'font-medium text-sm text-muted-foreground';
      textSpan.textContent = 'Создание документа';
      
      // Добавляем анимацию точек
      const dotsSpan = document.createElement('span');
      dotsSpan.className = 'inline-flex ml-1';
      dotsSpan.innerHTML = '<span class="animate-pulse">.</span><span class="animate-pulse delay-100">.</span><span class="animate-pulse delay-200">.</span>';
      
      // Добавляем элементы в контейнер
      textSpan.appendChild(dotsSpan);
      loadingContainer.appendChild(textSpan);
      
      // Очищаем и добавляем новое содержимое
      this.container.innerHTML = '';
      this.container.appendChild(loadingContainer);
    }
    
    // Создает новый вложенный документ
    async createDocument() {
      if (this.pendingCreation) return; // Предотвращаем двойное создание
      
      this.pendingCreation = true;
      
      try {
        // Сначала отображаем состояние загрузки
        this.renderLoadingState();
        
        // Получаем ID текущего документа
        const currentPathParts = window.location.pathname.split('/');
        const currentDocumentId = currentPathParts[currentPathParts.length - 1];
        
        if (!currentDocumentId) {
          throw new Error('Не удалось определить ID текущего документа');
        }
        
        // Шаг 1: Получаем текущий контент родительского документа перед созданием нового
        const parentResponse = await api.get(`/documents/${currentDocumentId}/`);
        const parentDoc = parentResponse.data;
        
        if (!parentDoc.content) {
          parentDoc.content = {
            time: new Date().getTime(),
            version: "2.27.0",
            blocks: []
          };
        }
        
        if (!Array.isArray(parentDoc.content.blocks)) {
          parentDoc.content.blocks = [];
        }
        
        console.log('Создание вложенного документа...');
        
        // Шаг 2: Создаем новый документ
        const response = await api.post('/documents/', {
          title: 'Новый документ',
          content: {
            time: new Date().getTime(),
            version: "2.27.0",
            blocks: []
          },
          parent: currentDocumentId
        });
        
        if (!response.data || !response.data.id) {
          throw new Error('Сервер вернул некорректный ответ');
        }
        
        const newDocumentId = response.data.id;
        const newTitle = response.data.title || 'Новый документ';
        
        // Обновляем данные блока в локальном представлении
        this.data = {
          id: newDocumentId,
          title: newTitle
        };
        
        // Обновляем отображение блока - НЕ вызываем здесь renderExistingDocument,
        // так как он будет вызван позже при редиректе
        
        // Шаг 3: Создаем новый блок в родительском документе
        // Вместо обновления существующего блока, просто добавляем новый
        if (typeof this.api.blocks.getCurrentBlockIndex() === 'number') {
          // Получаем текущий индекс блока для замены
          const blockIndex = this.api.blocks.getCurrentBlockIndex();
          
          // Добавляем новый блок вместо текущего
          const updatedBlock = {
            type: 'nestedDocument',
            data: {
              id: newDocumentId,
              title: newTitle
            }
          };
          
          // Обновляем блоки в родительском документе
          parentDoc.content.blocks[blockIndex] = updatedBlock;
          
          // Шаг 4: Сохраняем обновленный родительский документ
          const saveResponse = await api.put(`/documents/${currentDocumentId}/`, {
            content: parentDoc.content,
            title: parentDoc.title,
            parent: parentDoc.parent
          });
          
          console.log('Родительский документ успешно обновлен с ссылкой на новый документ', saveResponse.data);
          
          // Добавляем задержку перед редиректом, чтобы убедиться что сохранение завершено
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.warn('Не удалось получить индекс текущего блока');
        }
        
        // Шаг 5: Редирект на новый документ
        window.location.href = `/documents/${newDocumentId}`;
      } catch (error: any) {
        this.pendingCreation = false;
        console.error('Ошибка при создании документа:', error);
        this.renderErrorState(error.message || 'Не удалось создать документ');
        throw error; // Пробрасываем ошибку дальше
      }
    }
    
    // Отображает состояние ошибки
    renderErrorState(errorMessage: string) {
      // Создаем элементы вручную
      const errorContainer = document.createElement('div');
      errorContainer.className = 'flex items-center p-4 my-2 bg-red-50 rounded-lg border border-red-200 text-red-700';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'flex-1';
      
      const titleElement = document.createElement('h4');
      titleElement.className = 'font-medium';
      titleElement.textContent = 'Ошибка при создании документа';
      
      const descElement = document.createElement('p');
      descElement.className = 'text-sm';
      descElement.textContent = errorMessage;
      
      contentDiv.appendChild(titleElement);
      contentDiv.appendChild(descElement);
      errorContainer.appendChild(contentDiv);
      
      // Очищаем и добавляем новое содержимое
      this.container.innerHTML = '';
      this.container.appendChild(errorContainer);
    }
    
    // Метод сохранения данных блока
    save() {
      return this.data;
    }
  }
};

// Получение случайного цвета на основе ID пользователя
function getRandomColor(userId: string | number | null | undefined) {
  const colors = [
    '#FF5252', '#FF4081', '#E040FB', '#7C4DFF', 
    '#536DFE', '#448AFF', '#40C4FF', '#18FFFF', 
    '#64FFDA', '#69F0AE', '#B2FF59', '#EEFF41', 
    '#FFFF00', '#FFD740', '#FFAB40', '#FF6E40'
  ];
  
  // Если userId отсутствует, возвращаем случайный цвет
  if (userId === null || userId === undefined) {
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  // Преобразуем userId в строку
  const userIdStr = String(userId);
  
  // Вычисляем хеш для выбора цвета
  const hash = userIdStr.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return colors[Math.abs(hash) % colors.length];
}

export function DocumentEditor({ document, onChange, titleInputRef }: DocumentEditorProps) {
  const [title, setTitle] = useState(document.title)
  const editorRef = useRef<HTMLDivElement>(null)
  const editorInstanceRef = useRef<any>(null)
  const cursorIdRef = useRef(nanoid())
  const cursorPositionRef = useRef<{blockIndex: number, offset: number} | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const router = useRouter()
  const { user } = useAuth()
  const [editor, setEditor] = useState<any | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const cursorUpdateTimer = useRef<NodeJS.Timeout | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastDocumentContent = useRef<any>(document.content);
  const isSavingRef = useRef(false);
  const hasChangesRef = useRef(false);
  
  // Переименуем параметр document чтобы избежать конфликта с глобальным window.document
  const documentData = document;

  // Состояние для хранения содержимого документа
  const [content, setContent] = useState<any[]>([]);
  
  // Состояние для отслеживания статуса WebSocket соединения
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  
  // Состояние для отслеживания загрузки документа
  const [loading, setLoading] = useState(true);
  
  // Добавляем ref для контейнера редактора
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Функция для обновления содержимого редактора из внешнего источника (WebSocket)
  const setContentFromExternal = useCallback((content: any) => {
    if (!editorInstanceRef.current) return;
    
    try {
      console.log('📥 Применяем внешний контент к редактору');
      
      // Обновляем lastContentRef, чтобы избежать повторной отправки тех же данных
      lastDocumentContent.current = content;
      
      // Применяем контент к редактору без вызова события onChange
      editorInstanceRef.current.render(content);
      
      // Обновляем состояние документа
      if (typeof onChange === 'function') {
        onChange({
          ...documentData,
          content
        });
      }
      
      console.log('✅ Внешний контент успешно применен');
    } catch (error) {
      console.error('❌ Ошибка при применении внешнего контента:', error);
    }
  }, [documentData, onChange]);

  // Команды редактора - убираем зависимость от loadedModules
  const getEditorCommands = useCallback(() => {
    return [
      {
        name: "Заголовок 2-го уровня",
        icon: "H2",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("header", { 
              text: "",
              level: 2
            })
          }
        }
      },
      {
        name: "Заголовок 3-го уровня",
        icon: "H3",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("header", {
              text: "",
              level: 3
            })
          }
        }
      },
      {
        name: "Заголовок 4-го уровня",
        icon: "H4",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("header", {
              text: "",
              level: 4
            })
          }
        }
      },
      {
        name: "Нумерованный список",
        icon: "1.",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("list", { style: "ordered" })
          }
        }
      },
      {
        name: "Маркированный список",
        icon: "•",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("list", { style: "unordered" })
          }
        }
      },
      {
        name: "Чекбокс (задача)",
        icon: "☐",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("checklist")
          }
        }
      },
      {
        name: "Вставка изображения",
        icon: "🖼️",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("image")
          }
        }
      },
      {
        name: "Таблица",
        icon: "▦",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("table")
          }
        }
      },
      {
        name: "Новый документ",
        icon: "📄",
        action: () => {
          if (editorInstanceRef.current) {
            editorInstanceRef.current.blocks.insert("nestedDocument")
          }
        }
      }
    ];
  }, []); // Убираем зависимость от loadedModules

  // Используем команды в компоненте
  const editorCommands = useMemo(() => getEditorCommands(), [getEditorCommands]);

  // Настройка WebSocket соединения
  const setupWs = useCallback(() => {
    if (!documentData.id) {
      console.warn('Отсутствует ID документа для установки WebSocket соединения');
      return;
    }

    // Генерируем уникальный ID курсора, если он еще не существует
    if (!cursorIdRef.current) {
      cursorIdRef.current = nanoid();
    }

    const token = Cookies.get('access_token') || '';
    const sessionid = window.document.cookie.split('; ').find((row: string) => row.startsWith('sessionid='))?.split('=')[1] || '';
    
    // Формируем URL для WebSocket соединения
    const wsUrl = documentData.id
      ? `ws://localhost:8001/documents/${documentData.id}/?token=${token}&sessionid=${sessionid}`
      : null;
    
    console.log(`Установка WebSocket соединения: ${wsUrl}`);
    console.log(`Токен доступа присутствует: ${!!token}, Session ID присутствует: ${!!sessionid}`);
    
    if (!wsUrl) {
      console.error('Невозможно установить WebSocket соединение: отсутствует URL');
      return;
    }
    
    // Создаем новое WebSocket соединение
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('WebSocket соединение установлено');
      setWsConnectionStatus('connected');
      
      // Отправляем информацию о подключении курсора
      if (ws.readyState === WebSocket.OPEN && user) {
        try {
          ws.send(JSON.stringify({
            type: 'cursor_connect',
            cursor_id: cursorIdRef.current,
            username: user?.username || user?.first_name || 'Пользователь',
            user_id: user?.id || 'anonymous'
          }));
        } catch (err) {
          console.error('Ошибка при отправке данных о курсоре:', err);
        }
      }
    };
    
    ws.onmessage = (event) => {
      try {
        // Логируем все входящие сообщения
        console.log('🔍 Получено WebSocket сообщение:', event.data);
        
        // Анализируем полученное сообщение
        const message = JSON.parse(event.data);
        const messageType = message.type;
        
        console.log('📋 Тип сообщения:', messageType, message);
        
        // Обрабатываем разные типы сообщений
        if (messageType === 'document_update') {
          console.log('📄 Обновление документа получено');
          
          // Если это наше собственное обновление, игнорируем его
          if (message.sender_id === cursorIdRef.current) {
            console.log('🔄 Игнорируем собственное обновление');
            return;
          }
          
          // Обновляем содержимое редактора из внешнего источника
          setContentFromExternal(message.content);
        } 
        else if (messageType === 'cursor_update') {
          console.log('👆 Обновление позиции курсора получено:', {
            cursor_id: message.cursor_id,
            is_my_cursor: message.cursor_id === cursorIdRef.current,
            username: message.username,
            position: message.position
          });
          
          // Если у нас есть информация о позиции курсора и это не наш курсор
          if (message.cursor_id && message.cursor_id !== cursorIdRef.current) {
            console.log('🎯 Обновляем позицию удаленного курсора:', message.username);
            // Обновляем информацию о курсорах других пользователей
            updateRemoteCursor(message.cursor_id, message.position, message.username, message.user_id);
          } else {
            console.log('⏩ Пропускаем обновление собственного курсора');
          }
        }
        // Добавляем обработку cursor_position_update - используется сервером
        else if (messageType === 'cursor_position_update') {
          console.log('👆 Обновление позиции курсора получено (position_update):', {
            cursor_id: message.cursor_id,
            is_my_cursor: message.cursor_id === cursorIdRef.current,
            username: message.username,
            position: message.position
          });
          
          // Если у нас есть информация о позиции курсора и это не наш курсор
          if (message.cursor_id && message.cursor_id !== cursorIdRef.current) {
            console.log('🎯 Обновляем позицию удаленного курсора:', message.username);
            // Обновляем информацию о курсорах других пользователей
            updateRemoteCursor(message.cursor_id, message.position, message.username, message.user_id);
          } else {
            console.log('⏩ Пропускаем обновление собственного курсора');
          }
        }
        // Обработка сообщения о подключении курсора
        else if (messageType === 'cursor_connected') {
          console.log('🟢 Курсор пользователя подключен:', message.username);
          // Можно добавить анимацию или уведомление о новом пользователе
        }
        // Обработка сообщения об отключении курсора
        else if (messageType === 'cursor_disconnected') {
          console.log('🔴 Курсор пользователя отключен:', message.username);
          
          // Удаляем курсор из DOM
          removeRemoteCursor(message.cursor_id);
        }
        // Обработка сообщения об активном курсоре
        else if (messageType === 'cursor_active') {
          console.log('🔵 Получена информация о активном курсоре:', message.username);
          
          // Если у нас есть информация о курсоре и его позиции, отображаем его
          if (message.cursor_id && message.position) {
            updateRemoteCursor(message.cursor_id, message.position, message.username, message.user_id);
          }
        }
      } catch (error) {
        console.error('❌ Ошибка при обработке сообщения WebSocket:', error);
      }
    };

    ws.onclose = (event) => {
      console.log(`WebSocket соединение закрыто: ${event.code}`);
      setWsConnectionStatus('disconnected');
      
      // Удаляем все курсоры при отключении
      const allCursors = window.document.querySelectorAll('.remote-cursor');
      allCursors.forEach(cursor => {
        cursor.remove();
        console.log('Удален курсор при закрытии соединения');
      });
      
      // Повторное подключение через 1 секунду, если соединение было закрыто неожиданно
      if (event.code !== 1000) {
        console.log('Повторное подключение через 1 секунду...');
        setTimeout(() => {
          setupWs();
        }, 1000);
      }
    };

    ws.onerror = (error) => {
      console.error('Ошибка WebSocket:', error);
      setWsConnectionStatus('error');
    };
  }, [documentData.id, user]);

  // Отправка позиции курсора
  const sendCursorPosition = (position: {blockIndex: number, offset: number} | null) => {
    // Проверяем доступность WebSocket перед отправкой
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.debug('WebSocket недоступен для отправки позиции курсора');
      return;
    }
    
    try {
      // Сохраняем текущую позицию
      cursorPositionRef.current = position;
      
      // Безопасно получаем данные пользователя
      const userId = user?.id || 'anonymous';
      const username = user?.username || user?.first_name || 'Пользователь';
      
      // Конвертируем blockIndex и offset в координаты x, y
      let xyPosition = null;
      if (position !== null) {
        const editorContainer = editorContainerRef.current;
        if (editorContainer) {
          const blocks = editorContainer.querySelectorAll('.ce-block');
          if (position.blockIndex >= 0 && position.blockIndex < blocks.length) {
            const targetBlock = blocks[position.blockIndex];
            const blockRect = targetBlock.getBoundingClientRect();
            const containerRect = editorContainer.getBoundingClientRect();
            
            // Вычисляем позицию относительно контейнера
            const x = blockRect.left - containerRect.left + (position.offset || 0);
            const y = blockRect.top - containerRect.top;
            
            xyPosition = { x, y };
          }
        }
      }
      
      // Отправляем данные о позиции
      wsRef.current.send(JSON.stringify({
        type: 'cursor_update',
        cursor_id: cursorIdRef.current,
        position: xyPosition,
        username: username,
        user_id: userId
      }));
      
      console.log('Отправлена позиция курсора:', xyPosition);
    } catch (err) {
      console.warn('Ошибка при отправке позиции курсора:', err);
    }
  };

  // Первый render редактора (только один раз)
  const isFirstRender = useRef(true);
  
  // Последнее состояние контента для сравнения
  const lastContentRef = useRef<any>(null);
  
  // Получаем кэшированный контент при инициализации
  const getCachedContent = useCallback((documentId: string) => {
    try {
      const cachedData = localStorage.getItem(`document_cache_${documentId}`);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        const timestamp = parsed.timestamp || 0;
        const content = parsed.content;
        
        // Проверяем, не устарел ли кэш (24 часа)
        const cacheLifetime = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
        if (Date.now() - timestamp < cacheLifetime) {
          console.log('Найден действительный кэшированный контент:', content);
          return content;
        } else {
          console.log('Кэшированный контент устарел, удаляем');
          localStorage.removeItem(`document_cache_${documentId}`);
        }
      }
    } catch (err) {
      console.warn('Ошибка при чтении кэшированного контента:', err);
    }
    return null;
  }, []);

  // Сохраняем контент в локальное хранилище
  const updateContentCache = useCallback((documentId: string, content: any) => {
    try {
      localStorage.setItem(`document_cache_${documentId}`, JSON.stringify({
        content,
        timestamp: Date.now()
      }));
      console.log('Контент сохранен в кэш');
    } catch (e) {
      console.error('Ошибка при сохранении в кэш:', e);
    }
  }, []);

  // Добавляем эффект загрузки кэшированного контента при монтировании
  useEffect(() => {
    if (documentData.id) {
      const cachedContent = getCachedContent(documentData.id);
      if (cachedContent && (!documentData.content || Object.keys(documentData.content).length === 0)) {
        console.log('Используем кэшированный контент вместо пустого контента с сервера');
        onChange({
          ...documentData,
          content: cachedContent
        });
      }
    }
  }, [documentData.id, documentData.content, getCachedContent, onChange]);

  // Модифицируем triggerAutosave для кэширования
  const triggerAutosave = useCallback((content: any) => {
    // Если уже идет сохранение, пропускаем
    if (isSavingRef.current) return;
    
    // Если контент не изменился, не сохраняем
    if (lastContentRef.current && 
        JSON.stringify(lastContentRef.current) === JSON.stringify(content)) {
      console.log('Содержимое не изменилось, пропускаем сохранение');
      return;
    }
    
    console.log('Контент изменился, планируем сохранение...');
    console.log('Новый контент:', content);
    
    // Сразу кэшируем контент локально для защиты от потери данных
    updateContentCache(documentData.id, content);
    
    // Очищаем предыдущий таймер, если он был
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Устанавливаем новый таймер для сохранения с большим дебаунсом
    saveTimeoutRef.current = setTimeout(async () => {
      isSavingRef.current = true;
      
      try {
        // Сначала сохраняем локально
        if (typeof onChange === 'function') {
          onChange({
            ...documentData,
            title,
            content
          });
        }
        
        // Затем сохраняем в базе данных
        try {
          await api.put(`/documents/${documentData.id}/`, {
            title,
            content,
            parent: documentData.parent,
            is_favorite: documentData.is_favorite
          });
          console.log('✅ Документ успешно сохранен');
          
          // Кэшируем контент для избежания лишних сохранений
          updateContentCache(documentData.id, content);
          
          // Отправляем обновление через WebSocket
          try {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && user) {
              const wsMessage = {
                type: 'document_update',
                content: content,
                sender_id: cursorIdRef.current,
                user_id: user.id,
                username: user.username || user.first_name || 'Пользователь'
              };
              
              console.log('🟢 Отправляемое сообщение:', wsMessage);
              
              // Отправляем сообщение
              wsRef.current.send(JSON.stringify(wsMessage));
              
              console.log('✅ Обновления успешно отправлены через WebSocket');
            } else {
              console.warn('⚠️ WebSocket недоступен, обновления не были отправлены');
              console.log('⚠️ Состояние соединения:', wsRef.current ? {
                readyState: wsRef.current.readyState,
                OPEN: WebSocket.OPEN
              } : 'Соединение не инициализировано');
            }
          } catch (wsError) {
            console.error('❌ Ошибка при отправке обновлений через WebSocket:', wsError);
          }
        } catch (error: any) {
          console.error('Ошибка при автосохранении:', error);
          console.error('Детали ошибки:', error.response?.data || error.message);
          
          // Повторная попытка сохранения через 5 секунд при ошибке
          setTimeout(() => {
            isSavingRef.current = false;
            triggerAutosave(content);
          }, 5000);
        } finally {
          // Снимаем флаг сохранения
          isSavingRef.current = false;
        }
      } catch (error: any) {
        console.error('Ошибка при автосохранении:', error);
        console.error('Детали ошибки:', error.response?.data || error.message);
        
        // Повторная попытка сохранения через 5 секунд при ошибке
        setTimeout(() => {
          isSavingRef.current = false;
          triggerAutosave(content);
        }, 5000);
      } finally {
        // Снимаем флаг сохранения
        isSavingRef.current = false;
      }
    }, 300); // Уменьшаем задержку до 300 миллисекунд для более быстрой синхронизации
  }, [documentData.id, documentData.parent, documentData.is_favorite, title, onChange, updateContentCache]);

  // Создаем экземпляр EditorJS
  useEffect(() => {
    // Для предотвращения ненужных пересозданий редактора
    if (!isFirstRender.current && editorInstanceRef.current) {
      // Если это не первый рендер и редактор уже существует, просто обновляем данные
      console.log("Пропускаем пересоздание редактора, так как он уже существует");
      return;
    }
    
    isFirstRender.current = false;
    
    // Динамический импорт EditorJS для клиентской стороны
    const initEditor = async () => {
      try {
        // Проверяем, что мы на клиенте и элемент существует
        if (typeof window === "undefined") {
          console.log("Не на клиенте, пропускаем инициализацию EditorJS");
          return;
        }
        
        // Проверяем наличие DOM элемента
        if (!editorRef.current) {
          console.log("DOM элемент для редактора не найден, пропускаем инициализацию");
          return;
        }

        console.log("Начинаем инициализацию редактора...");

        // Импортируем все необходимые модули
        const [
          EditorJSModule,
          HeaderModule,
          ListModule,
          ChecklistModule,
          ImageModule
        ] = await Promise.all([
          import('@editorjs/editorjs'),
          import('@editorjs/header'),
          import('@editorjs/list'),
          import('@editorjs/checklist'),
          import('@editorjs/image')
        ]);

        // Извлекаем классы из модулей
        const EditorJS = EditorJSModule.default;
        const Header = HeaderModule.default;
        const List = ListModule.default;
        const Checklist = ChecklistModule.default;
        const Image = ImageModule.default;
        // Используем уже импортированные модули Table и Code напрямую
        // вместо динамической загрузки

        // Если редактор уже существует, безопасно уничтожаем его
        if (editorInstanceRef.current) {
          try {
            console.log("Уничтожаем предыдущий экземпляр редактора...");
            
            // Безопасное уничтожение экземпляра
            if (typeof editorInstanceRef.current.destroy === 'function') {
              const destroyPromise = editorInstanceRef.current.destroy();
              if (destroyPromise && typeof destroyPromise.then === 'function') {
                await destroyPromise;
              }
            } else {
              console.log("Метод destroy не найден, очищаем ссылку напрямую");
            }
          } catch (destroyError) {
            console.error("Ошибка при уничтожении предыдущего экземпляра:", destroyError);
          }
          
          // В любом случае, сбрасываем ссылку
          editorInstanceRef.current = null;
        }

        console.log("Подготавливаем данные для редактора...");
        console.log("Исходные данные документа:", documentData.content);

        // Гарантируем, что у нас есть данные в правильном формате
        let editorData;
        
        // Проверяем наличие кэшированного контента
        const cachedContent = getCachedContent(documentData.id);
        
        // Функция для проверки валидности структуры данных
        const isValidEditorData = (data: any) => {
          return data && 
                 typeof data === 'object' && 
                 Array.isArray(data.blocks);
        };
        
        // Сначала пробуем использовать кэшированный контент
        if (cachedContent && isValidEditorData(cachedContent)) {
          console.log("Используем кэшированный контент");
          editorData = {
            time: cachedContent.time || new Date().getTime(),
            version: cachedContent.version || "2.27.0",
            blocks: cachedContent.blocks
          };
        }
        // Затем пытаемся использовать существующие данные
        else if (isValidEditorData(documentData.content)) {
          console.log("Найдены корректные данные в контенте документа");
          editorData = {
            time: documentData.content.time || new Date().getTime(),
            version: documentData.content.version || "2.27.0",
            blocks: documentData.content.blocks
          };
        } 
        // Если content - пустой объект, создаем базовую структуру
        else if (documentData.content && typeof documentData.content === 'object' && Object.keys(documentData.content).length === 0) {
          console.log("Контент - пустой объект, создаем базовую структуру");
          editorData = {
            time: new Date().getTime(),
            version: "2.27.0",
            blocks: []
          };
        } else if (typeof documentData.content === 'string') {
          // Пробуем распарсить JSON-строку
          try {
            console.log("Контент в виде строки, пробуем распарсить JSON");
            const parsedContent = JSON.parse(documentData.content);
            
            if (isValidEditorData(parsedContent)) {
              console.log("JSON успешно распарсен");
              editorData = {
                time: parsedContent.time || new Date().getTime(),
                version: parsedContent.version || "2.27.0",
                blocks: parsedContent.blocks
              };
            } else {
              console.log("Распарсенный JSON не содержит корректных данных");
              // Создаем базовый текстовый блок из строки
              editorData = {
                time: new Date().getTime(),
                version: "2.27.0",
                blocks: [
                  {
                    type: "paragraph",
                    data: {
                      text: typeof documentData.content === 'string' ? documentData.content : ""
                    }
                  }
                ]
              };
            }
          } catch (parseErr) {
            console.warn("Ошибка при парсинге JSON:", parseErr);
            // Создаем базовый текстовый блок из строки
            editorData = {
              time: new Date().getTime(),
              version: "2.27.0",
              blocks: [
                {
                  type: "paragraph",
                  data: {
                    text: typeof documentData.content === 'string' ? documentData.content : ""
                  }
                }
              ]
            };
          }
        } else if (documentData.content === null || documentData.content === undefined) {
          // Документ новый или без контента
          console.log("Документ без контента, создаем пустую структуру");
          editorData = {
            time: new Date().getTime(),
            version: "2.27.0",
            blocks: []
          };
        } else {
          // Непонятный формат данных
          console.log("Неизвестный формат данных, создаем пустую структуру");
          editorData = {
            time: new Date().getTime(),
            version: "2.27.0",
            blocks: []
          };
        }
        
        // Сохраняем подготовленные данные для автосохранения
        lastContentRef.current = editorData;
        
        // Обновляем кэш с подготовленными данными
        updateContentCache(documentData.id, editorData);
        
        console.log("Подготовленные данные для редактора:", editorData);

        // Создаем новый экземпляр
        console.log("Создаем экземпляр EditorJS...");
        const editor = new EditorJS({
          holder: editorRef.current,
          data: editorData,
          onReady: () => {
            console.log('EditorJS готов к работе');
            editorInstanceRef.current = editor;
            
            // Устанавливаем редактор в состояние
            setEditor(editor);
            setIsReady(true);
            
            // Загружаем контент, если есть
            if (documentData.content && typeof documentData.content === 'object') {
              console.log("Загружаем контент из данных документа:", documentData.content);
              try {
                editor.render(documentData.content);
              } catch (e) {
                console.error("Ошибка при рендеринге контента:", e);
              }
            } else {
              console.log("Создаем пустой документ - нет данных контента");
            }
            
            // Устанавливаем наблюдатель за изменениями в DOM
            const observer = new MutationObserver((mutations) => {
              // Проверяем, были ли изменения в блоках кода
              const shouldHighlight = mutations.some(mutation => {
                return Array.from(mutation.addedNodes).some(node => {
                  const element = node as HTMLElement;
                  return element.nodeType === 1 && 
                         (element.classList?.contains('ce-code') || 
                          element.querySelector?.('.ce-code'));
                });
              });
              
              if (shouldHighlight) {
                // Удаляем вызов applyCodeHighlighting
              }
            });
            
            observer.observe(editorRef.current as Node, {
              childList: true,
              subtree: true
            });
          },
          onChange: function(api: any) {
            try {
              // Пропускаем автосохранение, если сейчас идет сохранение
              if (isSavingRef.current) return;
              
              // Используем безопасное сохранение с явным this
              editor.save().then((outputData: any) => {
                // Обновляем только состояние компонента без перерисовки редактора
                onChange({ ...documentData, content: outputData, title });
                
                // Запускаем автосохранение отдельно от обновления состояния
                triggerAutosave(outputData);
              }).catch((saveErr: Error) => {
                console.error('Ошибка при сохранении:', saveErr);
              });
            } catch (err) {
              console.error('Ошибка в обработчике onChange:', err);
            }
          },
          autofocus: true,
          placeholder: 'Нажмите "/" для вызова меню команд',
          tools: {
            header: {
              class: Header,
              inlineToolbar: true,
              config: {
                levels: [2, 3, 4],
                defaultLevel: 2,
                placeholder: 'Введите заголовок',
                defaultStyle: {
                  2: 'text-2xl font-bold mb-4 !font-inherit !text-inherit',
                  3: 'text-xl font-semibold mb-3 !font-inherit !text-inherit',
                  4: 'text-lg font-medium mb-2 !font-inherit !text-inherit'
                }
              },
              shortcut: 'CMD+SHIFT+H',
              toolbox: [
                {
                  title: 'Заголовок 2',
                  icon: 'H2',
                  data: { level: 2 }
                },
                {
                  title: 'Заголовок 3',
                  icon: 'H3',
                  data: { level: 3 }
                },
                {
                  title: 'Заголовок 4',
                  icon: 'H4',
                  data: { level: 4 }
                }
              ]
            },
            list: {
              class: List,
              inlineToolbar: true,
              config: {
                defaultStyle: 'unordered'
              }
            },
            image: {
              class: Image,
              config: {
                endpoints: {
                  byFile: '/api/upload-image'
                },
                field: 'file',
                types: 'image/*',
                captionPlaceholder: 'Подпись к изображению',
                uploader: {
                  uploadByFile(file: File) {
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    return fetch('/api/upload-image', {
                      method: 'POST',
                      body: formData
                    })
                    .then(response => response.json())
                    .then(result => {
                      if (result.success === 1) {
                        return {
                          success: 1,
                          file: {
                            url: result.file.url,
                            name: result.file.name,
                            size: result.file.size
                          }
                        };
                      } else {
                        console.error('Ошибка загрузки изображения:', result);
                        return {
                          success: 0,
                          message: result.message || 'Ошибка загрузки изображения'
                        };
                      }
                    })
                    .catch(error => {
                      console.error('Ошибка при загрузке изображения:', error);
                      return {
                        success: 0,
                        message: 'Ошибка при загрузке изображения'
                      };
                    });
                  }
                }
              }
            },
            table: {
              class: Table,
              inlineToolbar: true,
              config: {
                rows: 2,
                cols: 3,
              }
            },
            nestedDocument: NestedDocumentTool 
          },
          i18n: {
            messages: {
              ui: {
                "blockTunes": {
                  "toggler": {
                    "Click to tune": "Нажмите, чтобы настроить",
                  }
                },
                "inlineToolbar": {
                  "converter": {
                    "Convert to": "Конвертировать в"
                  }
                },
                "toolbar": {
                  "toolbox": {
                    "Add": "Добавить"
                  }
                }
              },
              toolNames: {
                "Text": "Текст",
                "Header": "Заголовок",
                "List": "Список",
                "Checklist": "Чек-лист",
                "Image": "Изображение",
                "Table": "Таблица",
                "Nested Document": "Вложенный документ"
              },
              tools: {
                "header": {
                  "Heading": "Заголовок"
                },
                "list": {
                  "Unordered": "Маркированный список",
                  "Ordered": "Нумерованный список"
                },
                "table": {
                  "Add row above": "Добавить строку выше",
                  "Add row below": "Добавить строку ниже",
                  "Add column to the left": "Добавить столбец слева",
                  "Add column to the right": "Добавить столбец справа",
                  "Delete row": "Удалить строку",
                  "Delete column": "Удалить столбец"
                },
                "nestedDocument": {
                  "Nested Document": "Вложенный документ"
                }
              }
            }
          }
        });
        
        console.log("Экземпляр EditorJS создан");
      } catch (err) {
        console.error('Ошибка при инициализации EditorJS:', err);
      }
    };

    // Запускаем инициализацию с небольшой задержкой
    console.log("Установка таймера для инициализации EditorJS...");
    const timer = setTimeout(() => {
      initEditor();
    }, 300); // Увеличиваем задержку для надежности

    return () => {
      console.log("Очистка при размонтировании компонента DocumentEditor");
      clearTimeout(timer);
      
      if (editorInstanceRef.current) {
        try {
          // Проверяем, является ли destroy функцией
          if (typeof editorInstanceRef.current.destroy === 'function') {
            // Некоторые версии EditorJS могут не возвращать промис из destroy
            const destroyResult = editorInstanceRef.current.destroy();
            
            // Обрабатываем случай, если destroy возвращает промис
            if (destroyResult && typeof destroyResult.then === 'function') {
              destroyResult.then(() => {
                console.log('Редактор успешно уничтожен');
              }).catch((err: Error) => {
                console.error('Ошибка при уничтожении редактора:', err.message || 'Неизвестная ошибка');
              });
            }
          } else {
            console.log('Метод destroy не найден, используем альтернативную очистку');
          }
        } catch (err) {
          console.error('Ошибка при попытке уничтожить редактор:', err);
        } finally {
        editorInstanceRef.current = null;
        }
      }
    };
  }, [documentData.id]); // Убираем зависимость от loadedModules

  // Очистка таймера автосохранения при размонтировании
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Обновляем заголовок документа
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    onChange({ ...documentData, title: newTitle });
  };

  // Сохранение перед уходом
  useEffect(() => {
    // Функция для сохранения данных перед уходом со страницы
    const saveBeforeLeavingPage = async (event: BeforeUnloadEvent) => {
      try {
        // Если редактор существует, сохраняем его содержимое
        if (editorInstanceRef.current) {
          try {
            // Синхронное блокирующее сохранение
            const contentToSave = await editorInstanceRef.current.save();
            
            // Если контент изменился с момента последнего сохранения
            if (JSON.stringify(lastDocumentContent.current) !== JSON.stringify(contentToSave)) {
              console.log('Сохранение контента перед выходом...');
              
              // Отправляем данные с использованием navigator.sendBeacon
              if (typeof navigator.sendBeacon === 'function') {
                const blob = new Blob([
                  JSON.stringify({
                    title,
                    content: contentToSave,
                    parent: documentData.parent
                  })
                ], { type: 'application/json' });

                const success = navigator.sendBeacon(`/api/documents/${documentData.id}/`, blob);
                console.log('Запрос sendBeacon отправлен:', success);
              } else {
                // Альтернативный вариант с fetch и keepalive
                fetch(`/api/documents/${documentData.id}/`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
                  },
                  body: JSON.stringify({
                    title,
                    content: contentToSave,
                    parent: documentData.parent
                  }),
                  keepalive: true
                });
              }
              
              // Обновляем последнее сохраненное состояние
              lastDocumentContent.current = contentToSave;
            }
          } catch (editorErr) {
            console.error('Ошибка при получении контента редактора:', editorErr);
          }
        }
      } catch (err) {
        console.error('Ошибка при сохранении перед уходом:', err);
      }
    };
    
    window.addEventListener('beforeunload', saveBeforeLeavingPage);
    
    return () => {
      window.removeEventListener('beforeunload', saveBeforeLeavingPage);
    };
  }, [documentData.id, title, documentData.parent]);
  
  // Функция для обновления информации о курсорах других пользователей
  const updateRemoteCursor = useCallback((cursorId: string, position: any, username: string, userId: string) => {
    try {
      console.log('🔄 Обновление курсора:', { cursorId, position, username, userId });
      
      // Если позиция null - скрываем курсор
      if (position === null) {
        // Удаляем курсор из состояния
        setRemoteCursors(prevCursors => 
          prevCursors.filter(cursor => cursor.id !== cursorId)
        );
        return;
      }
      
      // Конвертируем позицию к x, y координатам для отображения
      let cursorPosition;
      
      if (position && typeof position.blockIndex === 'number') {
        // Находим блок редактора по индексу
        const editorContainer = editorContainerRef.current;
        if (!editorContainer) {
          console.error('❌ Не найден контейнер редактора');
          return;
        }
        
        const blocks = editorContainer.querySelectorAll('.ce-block');
        if (position.blockIndex >= 0 && position.blockIndex < blocks.length) {
          const targetBlock = blocks[position.blockIndex];
          
          // Получаем размеры и координаты
          const blockRect = targetBlock.getBoundingClientRect();
          const containerRect = editorContainer.getBoundingClientRect();
          
          // Вычисляем позицию относительно контейнера
          const x = blockRect.left - containerRect.left + (position.offset || 0);
          const y = blockRect.top - containerRect.top;
          
          cursorPosition = { x, y };
        } else {
          // Если блок не найден, используем дефолтную позицию
          cursorPosition = { x: 10, y: 10 };
        }
      } else if (position && typeof position.x === 'number' && typeof position.y === 'number') {
        // Если уже есть x, y координаты, используем их
        cursorPosition = { x: position.x, y: position.y };
      } else {
        // Если нет данных о позиции, используем дефолтную
        cursorPosition = { x: 10, y: 10 };
      }
      
      // Генерируем цвет для курсора, если нет
      const cursorColor = getRandomColor(userId);
      
      // Обновляем состояние со списком курсоров
      setRemoteCursors(prevCursors => {
        // Проверяем, есть ли уже курсор с таким id
        const existingCursorIndex = prevCursors.findIndex(cursor => cursor.id === cursorId);
        
        if (existingCursorIndex !== -1) {
          // Обновляем существующий курсор
          const updatedCursors = [...prevCursors];
          updatedCursors[existingCursorIndex] = {
            ...updatedCursors[existingCursorIndex],
            position: cursorPosition,
            username
          };
          return updatedCursors;
        } else {
          // Добавляем новый курсор
          return [...prevCursors, {
            id: cursorId,
            position: cursorPosition,
            username,
            color: cursorColor,
            timestamp: Date.now()
          }];
        }
      });
    } catch (error) {
      console.error('❌ Ошибка при обновлении курсора:', error);
    }
  }, []);

  // Добавляем функцию для удаления курсора
  const removeRemoteCursor = useCallback((cursorId: string) => {
    console.log('🗑️ Удаление курсора:', cursorId);
    
    setRemoteCursors(prevCursors => 
      prevCursors.filter(cursor => cursor.id !== cursorId)
    );
  }, []);

  // Обработка изменений в редакторе
  const handleEditorChange = useCallback((editor: any) => {
    if (!editor) return;
    
    const content = editor.getHTML();
    console.log('Содержимое редактора обновлено', content);
    
    // Можно здесь добавить сохранение или другие действия
  }, []);

  // Инициализация WebSocket соединения при загрузке компонента
  useEffect(() => {
    if (documentData.id) {
      setupWs();
    }
    
    // Очистка соединения при размонтировании компонента
    return () => {
      if (wsRef.current) {
        console.log('Закрытие WebSocket соединения при размонтировании...');
        wsRef.current.close();
      }
    };
  }, [documentData.id, setupWs]);

  // Функция для логирования данных редактора
  const logEditorData = async () => {
    try {
      if (!editorInstanceRef.current) {
        console.error("Редактор не определен");
        return;
      }
      
      // Получаем данные из редактора
      const outputData = await editorInstanceRef.current.save();
      
      // Логируем структуру данных для диагностики
      console.log("Выходные данные редактора:", outputData);
      
      if (outputData && outputData.blocks) {
        // Подсчет всех типов блоков
        const blockTypes: Record<string, number> = {};
        outputData.blocks.forEach((block: any) => {
          const blockType = block.type as string;
          if (!blockTypes[blockType]) {
            blockTypes[blockType] = 0;
          }
          blockTypes[blockType]++;
          
          // Выводим данные о каждом блоке
          console.log(`Блок типа ${blockType}:`, block);
        });
        
        console.log("Типы блоков в документе:", blockTypes);
        
        // Проверяем list блоки, которые могут быть чеклистами
        const lists = outputData.blocks.filter(
          (block: any) => block.type === 'list'
        );
        console.log("Найденные списки:", lists);
        
        const checklists = outputData.blocks.filter(
          (block: any) => block.type === 'checklist'
        );
        console.log("Найденные чеклисты:", checklists);
      }
    } catch (error) {
      console.error("Ошибка получения данных редактора:", error);
    }
  };

  // Запускаем логирование данных после инициализации редактора
  setTimeout(() => {
    if (editorInstanceRef.current) {
      console.log("Запуск диагностики данных редактора...");
      logEditorData();
    }
  }, 5000);

  return (
    <TaskModalsProvider>
      <GlobalTaskModals />
      <div className="flex flex-col h-full relative">
        <div className="flex items-center justify-between mx-auto w-full" style={{ maxWidth: '650px', padding: '20px 0' }}>
          <Input
            className="border-none text-3xl font-bold focus-visible:ring-0 p-0 h-auto"
            placeholder="Untitled"
            value={title}
            onChange={handleTitleChange}
            ref={titleInputRef as any}
            autoFocus={false}
          />
        </div>
        
        <div 
          ref={editorContainerRef}
          className="flex-1 editor-container relative" 
          style={{ position: 'relative', minHeight: '300px' }}
        >
          <div ref={editorRef} className="min-h-full" />
          
          <CursorOverlay 
            cursors={remoteCursors} 
            containerRef={editorContainerRef} 
          />
        </div>
      </div>
    </TaskModalsProvider>
  );
}
