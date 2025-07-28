#!/usr/bin/env python3
"""
Конфигурация базы данных SparkPanel
"""

import sqlite3
import os


# Параметры подключения к базе данных
DB_FILE = "sparkpanel.db"


def get_db_connection():
    """
    Получение подключения к базе данных
    
    Returns:
        sqlite3.Connection: Объект подключения к базе данных
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row  # Позволяет обращаться к столбцам по имени
        return conn
    except sqlite3.Error as e:
        raise Exception(f"Ошибка подключения к базе данных: {e}")


def initialize_database():
    """
    Инициализация таблиц базы данных
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Создание таблицы пользователей
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Создание таблицы серверов
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER NOT NULL,
                status TEXT DEFAULT 'offline',
                players TEXT DEFAULT '0/20',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Создание таблицы плагинов
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS plugins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                author TEXT NOT NULL,
                status TEXT DEFAULT 'enabled',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Создание таблицы резервных копий
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                size TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Добавление тестового пользователя (admin/admin)
        cursor.execute("""
            INSERT OR IGNORE INTO users (username, password, role) 
            VALUES (?, ?, ?)
        """, ("admin", "admin", "admin"))
        
        conn.commit()
        conn.close()
        
        print("База данных успешно инициализирована")
        
    except sqlite3.Error as e:
        raise Exception(f"Ошибка инициализации базы данных: {e}")


def get_users():
    """
    Получение списка пользователей
    
    Returns:
        list: Список пользователей
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role FROM users")
        users = cursor.fetchall()
        conn.close()
        return [dict(user) for user in users]
    except sqlite3.Error as e:
        print(f"Ошибка получения пользователей: {e}")
        return []


def get_servers():
    """
    Получение списка серверов
    
    Returns:
        list: Список серверов
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM servers")
        servers = cursor.fetchall()
        conn.close()
        return [dict(server) for server in servers]
    except sqlite3.Error as e:
        print(f"Ошибка получения серверов: {e}")
        return []


def main():
    """Тестирование функций базы данных"""
    print("Тестирование базы данных:")
    initialize_database()
    
    print("Пользователи:", get_users())
    print("Серверы:", get_servers())


if __name__ == "__main__":
    main()