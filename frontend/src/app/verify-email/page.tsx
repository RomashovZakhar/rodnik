"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/components/auth"

export default function VerifyEmailPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Получаем параметры из URL, если они есть
  const emailParam = searchParams.get('email')
  const codeParam = searchParams.get('code')
  
  // Используем email из URL или из пользовательских данных
  const [email, setEmail] = useState<string>(emailParam || '')
  const [otp, setOtp] = useState<string>(codeParam || '')
  
  // Если есть и email и код в URL, автоматически запускаем верификацию
  useEffect(() => {
    if (emailParam && codeParam && !authLoading) {
      handleVerify()
    }
  }, [emailParam, codeParam, authLoading])
  
  // Если пользователь уже с подтвержденным email, перенаправляем на главную
  useEffect(() => {
    if (user && user.is_email_verified && !authLoading) {
      router.push('/')
    } else if (user && !email) {
      setEmail(user.email)
    }
  }, [user, authLoading])
  
  const handleVerify = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      await api.post('/verify-email/', {
        email: email || user?.email,
        otp,
      })
      
      setSuccess('Email успешно подтвержден! Перенаправление...')
      
      // Перенаправляем на главную страницу через 2 секунды
      setTimeout(() => {
        router.push('/')
      }, 2000)
    } catch (error: any) {
      console.error('Ошибка подтверждения email:', error)
      setError(error.response?.data?.detail || 'Неверный код подтверждения')
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleResend = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      await api.post('/resend-verification/', {
        email: email || user?.email,
      })
      
      setSuccess('Новый код подтверждения отправлен на ваш email')
    } catch (error: any) {
      console.error('Ошибка при повторной отправке кода:', error)
      setError(error.response?.data?.detail || 'Не удалось отправить код повторно')
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Подтверждение Email</CardTitle>
            <CardDescription>
              Введите код подтверждения, отправленный на ваш email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              {error && (
                <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">
                  {error}
                </div>
              )}
              
              {success && (
                <div className="bg-green-100 text-green-800 p-3 rounded-md text-sm">
                  {success}
                </div>
              )}
              
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading || !!user}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="otp">Код подтверждения</Label>
                <Input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  required
                  disabled={isLoading}
                />
              </div>
              
              <Button 
                type="button" 
                className="w-full" 
                disabled={isLoading || !email || !otp}
                onClick={handleVerify}
              >
                {isLoading ? "Подтверждение..." : "Подтвердить Email"}
              </Button>
              
              <div className="text-center">
                <button 
                  type="button" 
                  className="text-sm text-primary hover:underline" 
                  disabled={isLoading || !email}
                  onClick={handleResend}
                >
                  Отправить код повторно
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 