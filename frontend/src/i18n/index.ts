import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ru: { translation: {
    appName: 'SparkPanel',
    login: 'Войти',
    register: 'Регистрация',
    email: 'Email',
    username: 'Имя пользователя',
    password: 'Пароль',
    twofa: 'Код 2FA',
    logout: 'Выйти',
    servers: 'Сервера',
    dashboard: 'Дашборд',
    settings: 'Настройки',
    admin: 'Админ',
    create: 'Создать',
    start: 'Старт',
    stop: 'Стоп',
  } },
  en: { translation: {
    appName: 'SparkPanel',
    login: 'Login',
    register: 'Register',
    email: 'Email',
    username: 'Username',
    password: 'Password',
    twofa: '2FA code',
    logout: 'Logout',
    servers: 'Servers',
    dashboard: 'Dashboard',
    settings: 'Settings',
    admin: 'Admin',
    create: 'Create',
    start: 'Start',
    stop: 'Stop',
  } }
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'ru',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
});

export default i18n;
