import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { FlashMessage, Input, Button, Icon } from '@/components';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

interface LoginFormValues {
    email: string;
    password: string;
}

const LoginContainer: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [twoFactorRequired, setTwoFactorRequired] = useState(false);
    const [telegramTokenSent, setTelegramTokenSent] = useState(false);
    const [rememberToken, setRememberToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [tokenExpired, setTokenExpired] = useState(false);
    const [timeLeft, setTimeLeft] = useState(300); // 5 минут в секундах
    const [verificationInterval, setVerificationInterval] = useState<NodeJS.Timeout | null>(null);
    const [tokenCheckInterval, setTokenCheckInterval] = useState<NodeJS.Timeout | null>(null);
    const [lastRequestTime, setLastRequestTime] = useState<number>(0);
    const [verificationAttempts, setVerificationAttempts] = useState(0);
    const [maxAttemptsReached, setMaxAttemptsReached] = useState(false);

    // Очищаем все интервалы при размонтировании компонента
    useEffect(() => {
        return () => {
            if (verificationInterval) clearInterval(verificationInterval);
            if (tokenCheckInterval) clearInterval(tokenCheckInterval);
        };
    }, []);

    // Сбрасываем состояние при изменении twoFactorRequired или tokenExpired
    useEffect(() => {
        if (!twoFactorRequired || tokenExpired) {
            setTimeLeft(300);
            setVerificationAttempts(0);
            setMaxAttemptsReached(false);
            if (tokenCheckInterval) {
                clearInterval(tokenCheckInterval);
                setTokenCheckInterval(null);
            }
        }
    }, [twoFactorRequired, tokenExpired]);

    // Обновляем оставшееся время до истечения токена
    useEffect(() => {
        if (twoFactorRequired && !tokenExpired && rememberToken) {
            // Запускаем таймер обратного отсчета
            const interval = setInterval(() => {
                setTimeLeft((prevTime) => {
                    if (prevTime <= 1) {
                        // Токен считается просроченным через 5 минут после отправки
                        setTokenExpired(true);
                        if (tokenCheckInterval) {
                            clearInterval(tokenCheckInterval);
                            setTokenCheckInterval(null);
                        }
                        return 0;
                    }
                    return prevTime - 1;
                });
            }, 1000);
            
            setVerificationInterval(interval);
            
            // Периодически проверяем статус токена на сервере
            const checkInterval = setInterval(() => {
                if (rememberToken) {
                    axios.get(`/auth/2fa/check-token?token=${rememberToken}`)
                        .catch(() => {
                            setTokenExpired(true);
                            if (tokenCheckInterval) {
                                clearInterval(tokenCheckInterval);
                                setTokenCheckInterval(null);
                            }
                        });
                }
            }, 30000); // Проверяем каждые 30 секунд
            
            setTokenCheckInterval(checkInterval);
        }
        
        return () => {
            if (interval) clearInterval(interval);
            if (checkInterval) clearInterval(checkInterval);
        };
    }, [twoFactorRequired, tokenExpired, rememberToken]);

    const formatTime = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const handleLogin = async (values: LoginFormValues) => {
        setLoading(true);
        setError(null);
        setTwoFactorRequired(false);
        setTelegramTokenSent(false);
        setTokenExpired(false);
        setTimeLeft(300);

        try {
            // Отправляем данные для аутентификации
            const response = await axios.post('/api/client/auth/login', values);
            
            // Получаем токен из ответа
            const rememberToken = response.data.remember_token;
            setRememberToken(rememberToken);
            
            // Проверяем, требуется ли двухфакторная аутентификация
            if (response.data.two_factor_required) {
                setTwoFactorRequired(true);
                setTelegramTokenSent(true);
            } else {
                // Перенаправляем пользователя на главную страницу
                navigate('/dashboard');
            }
        } catch (err: any) {
            // Обработка ошибок
            if (err.response?.status === 422) {
                setError(t('auth.login_failed_invalid_credentials'));
            } else if (err.response?.data?.message === 'two-factor-authentication-required') {
                setTwoFactorRequired(true);
                setTelegramTokenSent(true);
                setRememberToken(err.response.data.remember_token);
            } else {
                setError(t('auth.unexpected_error'));
                console.error('Login error:', err);
            }
        } finally {
            setLoading(false);
        }
        
        // Обновляем время последнего запроса
        setLastRequestTime(Date.now());
    };
    
    const handleTelegramVerification = async () => {
        if (!rememberToken) return;
        
        // Проверяем, не достигнуто ли максимальное количество попыток
        const maxAttempts = config('auth.two_factor.max_verification_attempts', 5);
        const attemptKey = 'telegram_verification_attempts';
        const attempts = localStorage.getItem(attemptKey);
        const attemptCount = attempts ? parseInt(attempts, 10) : 0;
        
        if (attemptCount >= maxAttempts) {
            setError(t('auth.max_verification_attempts_reached'));
            return;
        }
        
        setLoading(true);
        
        try {
            // Ждем подтверждения через Telegram
            const response = await axios.get(`/auth/2fa/confirm?token=${rememberToken}`);
            
            if (response.status === 200) {
                // Сбрасываем счетчик попыток
                localStorage.removeItem(attemptKey);
                
                // Перенаправляем пользователя на главную страницу
                navigate('/dashboard');
            }
        } catch (err: any) {
            if (err.response?.status === 429) {
                setError(t('auth.too_many_attempts_please_wait'));
            } else {
                setError(t('auth.telegram_verification_failed'));
                console.error('Telegram verification failed:', err);
                
                // Увеличиваем счетчик попыток
                localStorage.setItem(attemptKey, (attemptCount + 1).toString());
            }
        } finally {
            setLoading(false);
        }
    };
    const handleResendTelegramToken = async () => {
        if (!rememberToken) return;
        
        // Проверяем, не было ли недавнего запроса
        const minDelay = config('auth.two_factor.verification_attempt_delay', 10) * 1000; // в миллисекундах
        const now = Date.now();
        
        if (now - lastRequestTime < minDelay) {
            setError(t('auth.please_wait_before_retry'));
            return;
        }
        
        setLoading(true);
        
        try {
            // Генерируем и отправляем новый токен
            const response = await axios.post('/api/client/auth/resend-verification', {
                token: rememberToken
            });
            
            if (response.status === 200) {
                setError(null);
                setTokenExpired(false);
                setTimeLeft(300);
                setVerificationAttempts(0);
                setMaxAttemptsReached(false);
                setLastRequestTime(Date.now());
                
                // Обновляем текущий токен
                const newToken = response.data.new_token;
                if (newToken) {
                    setRememberToken(newToken);
                }
            }
        } catch (err: any) {
            if (err.response?.status === 429) {
                setError(t('auth.too_many_attempts_please_wait'));
                setLastRequestTime(Date.now() + minDelay); // Добавляем дополнительную задержку
            } else {
                console.error('Failed to resend Telegram token:', err);
                
                if (err.response?.status === 401) {
                    setError(t('auth.expired_or_invalid_token'));
                    setTokenExpired(true);
                } else if (err.response?.status === 503) {
                    setError(t('auth.failed_to_resend_telegram_token_server_error'));
                } else {
                    setError(t('auth.failed_to_resend_telegram_token'));
                }
                
                setLastRequestTime(Date.now());
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResendTelegramToken = async () => {
        if (!rememberToken) return;
        
        // Проверяем, не достигнуто ли максимальное количество попыток
        if (verificationAttempts >= config('auth.two_factor.max_verification_attempts', 5)) {
            setError(t('auth.max_attempts_reached_wait_before_retry'));
            setMaxAttemptsReached(true);
            return;
        }
        
        setLoading(true);
        
        try {
            // Генерируем и отправляем новый токен
            const response = await axios.post('/api/client/auth/resend-verification', {
                token: rememberToken
            });
            
            if (response.status === 200) {
                setError(null);
                setTokenExpired(false);
                setTimeLeft(300);
                setVerificationAttempts(0);
                setMaxAttemptsReached(false);
                
                // Обновляем текущий токен
                const newToken = response.data.new_token;
                if (newToken) {
                    setRememberToken(newToken);
                }
            }
        } catch (err: any) {
            console.error('Failed to resend Telegram token:', err);
            
            if (err.response?.status === 401) {
                setError(t('auth.expired_or_invalid_token'));
                setTokenExpired(true);
            } else if (err.response?.status === 503) {
                setError(t('auth.failed_to_resend_telegram_token_server_error'));
            } else {
                setError(t('auth.failed_to_resend_telegram_token'));
            }
        } finally {
            setLoading(false);
        }
    };

    // ... existing JSX ...
};

export default LoginContainer;