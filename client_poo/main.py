#!/usr/bin/env python3
"""
Poo - клиент для установки и управления SparkPanel
"""

import sys
import os
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QLabel, QLineEdit, QPushButton, QTextEdit, QGroupBox, QMessageBox,
    QTabWidget, QProgressBar, QFileDialog
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from installer.ssh_installer import SSHInstaller


class InstallationThread(QThread):
    progress_update = pyqtSignal(str)
    installation_complete = pyqtSignal(bool, str)
    
    def __init__(self, host, port, username, auth):
        super().__init__()
        self.host = host
        self.port = port
        self.username = username
        self.auth = auth
        
    def run(self):
        try:
            self.progress_update.emit("Подключение к серверу...")
            installer = SSHInstaller(self.host, self.port, self.username, self.auth)
            installer.connect()
            
            self.progress_update.emit("Установка LEMP стека...")
            installer.install_stack()
            
            self.progress_update.emit("Разворачивание SparkPanel...")
            installer.deploy_sparkpanel()
            
            self.progress_update.emit("Настройка веб-сервера...")
            installer.configure_webserver()
            
            self.progress_update.emit("Настройка безопасности...")
            installer.setup_security()
            
            installer.disconnect()
            
            self.installation_complete.emit(True, "Установка успешно завершена!")
        except Exception as e:
            self.installation_complete.emit(False, f"Ошибка установки: {str(e)}")


class PooClient(QMainWindow):
    def __init__(self):
        super().__init__()
        self.initUI()
        
    def initUI(self):
        self.setWindowTitle('Poo - Клиент SparkPanel')
        self.setGeometry(100, 100, 800, 600)
        
        # Создаем вкладки
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        
        # Вкладка установки
        self.install_tab = self.create_install_tab()
        self.tabs.addTab(self.install_tab, "Установка SparkPanel")
        
        # Вкладка управления
        self.manage_tab = self.create_manage_tab()
        self.tabs.addTab(self.manage_tab, "Управление панелью")
        
    def create_install_tab(self):
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Группа параметров подключения
        connection_group = QGroupBox("Параметры подключения")
        connection_layout = QVBoxLayout()
        
        # Поля ввода
        self.host_input = QLineEdit()
        self.host_input.setPlaceholderText("IP-адрес сервера")
        self.port_input = QLineEdit("22")
        self.port_input.setPlaceholderText("Порт SSH")
        self.username_input = QLineEdit("root")
        self.username_input.setPlaceholderText("Имя пользователя")
        self.password_input = QLineEdit()
        self.password_input.setPlaceholderText("Пароль")
        self.password_input.setEchoMode(QLineEdit.Password)
        self.key_file_input = QLineEdit()
        self.key_file_input.setPlaceholderText("Путь к SSH ключу (необязательно)")
        
        # Кнопка выбора ключа
        key_layout = QHBoxLayout()
        key_layout.addWidget(self.key_file_input)
        self.browse_key_btn = QPushButton("Обзор")
        self.browse_key_btn.clicked.connect(self.browse_key_file)
        key_layout.addWidget(self.browse_key_btn)
        
        # Добавляем поля в layout
        connection_layout.addWidget(QLabel("Хост:"))
        connection_layout.addWidget(self.host_input)
        connection_layout.addWidget(QLabel("Порт:"))
        connection_layout.addWidget(self.port_input)
        connection_layout.addWidget(QLabel("Имя пользователя:"))
        connection_layout.addWidget(self.username_input)
        connection_layout.addWidget(QLabel("Пароль:"))
        connection_layout.addWidget(self.password_input)
        connection_layout.addWidget(QLabel("SSH ключ:"))
        connection_layout.addLayout(key_layout)
        
        connection_group.setLayout(connection_layout)
        layout.addWidget(connection_group)
        
        # Кнопка установки
        self.install_btn = QPushButton("Установить SparkPanel")
        self.install_btn.clicked.connect(self.start_installation)
        layout.addWidget(self.install_btn)
        
        # Прогресс-бар
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # Лог установки
        self.install_log = QTextEdit()
        self.install_log.setReadOnly(True)
        layout.addWidget(self.install_log)
        
        widget.setLayout(layout)
        return widget
        
    def create_manage_tab(self):
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Информация о подключении
        info_label = QLabel("После установки SparkPanel откройте браузер и перейдите по адресу вашего сервера.")
        info_label.setWordWrap(True)
        layout.addWidget(info_label)
        
        # Кнопка открытия браузера
        self.open_browser_btn = QPushButton("Открыть встроенный браузер")
        self.open_browser_btn.clicked.connect(self.open_browser)
        layout.addWidget(self.open_browser_btn)
        
        # Инструкции
        instructions = QTextEdit()
        instructions.setReadOnly(True)
        instructions.setHtml("""
        <h3>Инструкции по использованию:</h3>
        <ol>
            <li><b>Установка:</b> Заполните параметры подключения на вкладке "Установка SparkPanel" и нажмите "Установить SparkPanel"</li>
            <li><b>Доступ:</b> После установки откройте встроенный браузер и войдите в панель управления</li>
            <li><b>Учетные данные:</b> По умолчанию логин: admin, пароль: admin</li>
            <li><b>Безопасность:</b> Не забудьте изменить пароль после первого входа</li>
        </ol>
        <h3>Основные функции SparkPanel:</h3>
        <ul>
            <li>Управление Minecraft-серверами</li>
            <li>Мониторинг ресурсов</li>
            <li>Плагины и модификации</li>
            <li>Резервное копирование</li>
            <li>Планировщик задач</li>
            <li>Система уведомлений</li>
            <li>Расширенные функции безопасности</li>
        </ul>
        """)
        layout.addWidget(instructions)
        
        widget.setLayout(layout)
        return widget
        
    def browse_key_file(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Выберите SSH ключ", "", "SSH Keys (*)")
        if file_path:
            self.key_file_input.setText(file_path)
            
    def start_installation(self):
        host = self.host_input.text().strip()
        port = self.port_input.text().strip()
        username = self.username_input.text().strip()
        password = self.password_input.text()
        key_file = self.key_file_input.text().strip()
        
        # Проверка заполнения полей
        if not host:
            QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите IP-адрес сервера")
            return
            
        if not port.isdigit():
            QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите корректный порт")
            return
            
        if not username:
            QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите имя пользователя")
            return
            
        if not password and not key_file:
            QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите пароль или выберите SSH ключ")
            return
            
        # Определяем метод аутентификации
        auth = key_file if key_file else password
        
        # Запускаем установку в отдельном потоке
        self.install_btn.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # Неопределенный прогресс
        self.install_log.clear()
        
        self.install_thread = InstallationThread(host, int(port), username, auth)
        self.install_thread.progress_update.connect(self.update_install_log)
        self.install_thread.installation_complete.connect(self.installation_finished)
        self.install_thread.start()
        
    def update_install_log(self, message):
        self.install_log.append(message)
        
    def installation_finished(self, success, message):
        self.install_btn.setEnabled(True)
        self.progress_bar.setVisible(False)
        
        if success:
            QMessageBox.information(self, "Успех", message)
            self.tabs.setCurrentIndex(1)  # Переключаемся на вкладку управления
        else:
            QMessageBox.critical(self, "Ошибка", message)
            
    def open_browser(self):
        from ui.browser import BrowserWindow
        self.browser = BrowserWindow()
        self.browser.show()


if __name__ == '__main__':
    app = QApplication(sys.argv)
    app.setStyle('Fusion')  # Современный стиль
    
    # Устанавливаем тему в зависимости от системы
    palette = app.palette()
    palette.setColor(palette.Window, Qt.lightGray)
    app.setPalette(palette)
    
    client = PooClient()
    client.show()
    
    sys.exit(app.exec_())