"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/components/auth"
import { useEffect, useState } from "react"
import api from "@/lib/api"
import { AcmeLogo } from "@/components/ui/acme-logo"
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"

// Тип для документа в избранном
interface FavoriteDocument {
  id: string;
  title: string;
}

// Тип для общего документа
interface SharedDocument {
  id: string;
  title: string;
  owner_username: string;
  role?: 'editor' | 'viewer';
}

interface AppSidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AppSidebar({ className, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuth()
  const [favoriteDocuments, setFavoriteDocuments] = useState<FavoriteDocument[]>([])
  const [sharedDocuments, setSharedDocuments] = useState<SharedDocument[]>([])

  // Загрузка избранных документов
  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const response = await api.get("/documents/favorites/");
        if (Array.isArray(response.data)) {
          setFavoriteDocuments(response.data);
        } else {
          setFavoriteDocuments([]);
        }
      } catch (err) {
        console.error("Ошибка при загрузке избранных документов:", err);
        setFavoriteDocuments([]);
      }
    };

    fetchFavorites();
  }, []);

  // Загрузка совместных документов
  useEffect(() => {
    const fetchSharedDocuments = async () => {
      try {
        const response = await api.get("/documents/shared_with_me/");
        if (Array.isArray(response.data)) {
          setSharedDocuments(response.data);
        } else {
          setSharedDocuments([]);
        }
      } catch (err) {
        console.error("Ошибка при загрузке совместных документов:", err);
        setSharedDocuments([]);
      }
    };

    fetchSharedDocuments();
  }, []);

  // Обработка обновлений избранных документов в реальном времени
  useEffect(() => {
    const handleFavoriteUpdated = (event: StorageEvent) => {
      if (event.key === 'favorite_document_updated' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.isFavorite) {
            setFavoriteDocuments(prev => {
              const exists = prev.some(doc => doc.id === data.documentId);
              if (exists) return prev;
              return [...prev, { id: data.documentId, title: data.title }];
            });
          } else {
            setFavoriteDocuments(prev => 
              prev.filter(doc => doc.id !== data.documentId)
            );
          }
        } catch (err) {
          console.error('Ошибка при обработке обновления избранных:', err);
        }
      }
    };
    
    window.addEventListener('storage', handleFavoriteUpdated);
    return () => {
      window.removeEventListener('storage', handleFavoriteUpdated);
    };
  }, []);

  // Функция для перехода к корневому документу
  const navigateToRoot = async () => {
    try {
      const response = await api.get("/documents/?root=true");
      let rootDocumentId = null;
      
      if (Array.isArray(response.data) && response.data.length > 0) {
        const sortedDocs = [...response.data].sort((a, b) => {
          const idA = parseInt(a.id);
          const idB = parseInt(b.id);
          return idA - idB;
        });
        rootDocumentId = sortedDocs[0].id;
      } else if (response.data && response.data.id) {
        rootDocumentId = response.data.id;
      }
      
      if (rootDocumentId) {
        if (pathname !== `/documents/${rootDocumentId}`) {
          router.push(`/documents/${rootDocumentId}`);
        }
      } else {
        router.push('/');
      }
    } catch (err) {
      console.error("Ошибка при загрузке корневого документа:", err);
      router.push('/');
    }
  };

  return (
    <Sidebar 
      className={cn("border-r bg-background flex flex-col", className)}
      style={{ "--sidebar-width": "16rem", maxWidth: "16rem" } as React.CSSProperties}
      {...props}
    >
      <SidebarContent className="flex flex-col flex-1 w-full overflow-hidden">
        <div className="flex h-16 items-center px-6">
          <AcmeLogo />
          <span className="ml-2 text-lg font-semibold truncate">Acme Inc.</span>
        </div>
        <ScrollArea className="flex-1 w-full [&_[style*='display:table']]:!block [&_[style*='display:table']]:!w-full">
          <SidebarMenu className="w-full max-w-full">
            {/* Главная / Рабочее пространство */}
            <SidebarGroup className="w-full">
              <SidebarMenuItem
                active={pathname === "/"}
                onClick={navigateToRoot}
                className="px-6 w-full"
              >
                <span className="block truncate w-full">Рабочее пространство</span>
              </SidebarMenuItem>
            </SidebarGroup>

            {/* Избранные документы */}
            {favoriteDocuments.length > 0 && (
              <SidebarGroup className="w-full">
                <SidebarGroupLabel className="px-6 w-full">
                  Избранное
                </SidebarGroupLabel>
                <SidebarGroupContent className="w-full">
                  {favoriteDocuments.map((doc) => (
                    <SidebarMenuItem
                      key={doc.id}
                      active={pathname === `/documents/${doc.id}`}
                      onClick={() => router.push(`/documents/${doc.id}`)}
                      className="px-6 w-full"
                    >
                      <span className="block truncate w-full">{doc.title || "Без названия"}</span>
                    </SidebarMenuItem>
                  ))}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Совместные документы */}
            {sharedDocuments.length > 0 && (
              <SidebarGroup className="w-full">
                <SidebarGroupLabel className="px-6 w-full">
                  Совместные документы
                </SidebarGroupLabel>
                <SidebarGroupContent className="w-full">
                  {sharedDocuments.map((doc) => (
                    <SidebarMenuItem
                      key={doc.id}
                      active={pathname === `/documents/${doc.id}`}
                      onClick={() => router.push(`/documents/${doc.id}`)}
                      className="px-6 w-full"
                    >
                      <div className="flex flex-col w-full">
                        <span className="block truncate w-full">{doc.title || "Без названия"}</span>
                        <span className="block text-xs text-muted-foreground truncate w-full">
                          От: {doc.owner_username}
                          {doc.role && (
                            <span className={cn(
                              "ml-2 px-1.5 py-0.5 rounded text-[10px]",
                              doc.role === 'editor' ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                            )}>
                              {doc.role === 'editor' ? 'редактор' : 'наблюдатель'}
                            </span>
                          )}
                        </span>
                      </div>
                    </SidebarMenuItem>
                  ))}
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarMenu>
        </ScrollArea>

        {/* Нижняя часть с настройками и выходом */}
        <div className="mt-auto border-t w-full">
          <SidebarMenu className="w-full max-w-full">
            <SidebarMenuItem 
              onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
              className="px-6 w-full"
            >
              <span className="block truncate w-full">Настройки</span>
            </SidebarMenuItem>
            <SidebarMenuItem 
              onClick={logout}
              className="px-6 w-full"
            >
              <span className="block truncate w-full">Выйти</span>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  )
} 