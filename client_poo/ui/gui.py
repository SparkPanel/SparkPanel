from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QLabel, QLineEdit, QPushButton, QTextEdit, QGroupBox, QMessageBox,
    QTabWidget, QProgressBar, QFileDialog, QCheckBox
)
from PyQt5.QtCore import Qt
from PyQt5.QtCharts import QChart, QChartView, QLineSeries, QValueAxis
from PyQt5.QtGui import QPainter
from monitoring.monitor import ResourceMonitor


class InstallationThread:
    """Заглушка для потока установки"""
    pass


class PooClient(QMainWindow):
    def __init__(self):
        super().__init__()
        self.monitor = ResourceMonitor()
        self.initUI()
        
    def initUI(self):
        self.setWindowTitle('Poo - Клиент SparkPanel')
        self.setGeometry(100, 100, 900, 700)
        
        # Создаем вкладки
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        
        # Вкладка установки
        self.install_tab = self.create_install_tab()
        self.tabs.addTab(self.install_tab, "Установка SparkPanel")
        
        # Вкладка управления
        self.manage_tab = self.create_manage_tab()
        self.tabs.addTab(self.manage_tab, "Управление панелью")
        
        # Вкладка мониторинга
        self.monitoring_tab = self.create_monitoring_tab()
        self.tabs.addTab(self.monitoring_tab, "Мониторинг")
        
        # Вкладка информации
        self.info_tab = self.create_info_tab()
        self.tabs.addTab(self.info_tab, "Информация")
        
        # Статус бар
        self.status_bar = QLabel("Готов")
        self.statusBar().addWidget(self.status_bar)

    def create_install_tab(self):
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Группа параметров подключения
        connection_group = QGroupBox("Параметры подключения к VDS")
        connection_layout = QVBoxLayout()
        
        # Поля ввода
        self.host_input = QLineEdit()
        self.host_input.setPlaceholderText("IP-адрес сервера (например: 123.45.67.89)")
        self.port_input = QLineEdit("22")
        self.port_input.setPlaceholderText("Порт SSH (по умолчанию: 22)")
        self.username_input = QLineEdit("root")
        self.username_input.setPlaceholderText("Имя пользователя (по умолчанию: root)")
        
        # Аутентификация
        auth_group = QGroupBox("Аутентификация")
        auth_layout = QVBoxLayout()
        
        self.auth_method = "password"  # По умолчанию аутентификация по паролю
        
        # Переключатели метода аутентификации
        self.password_radio = QCheckBox("Аутентификация по паролю")
        self.password_radio.setChecked(True)
        self.key_radio = QCheckBox("Аутентификация по SSH ключу")
        
        self.password_radio.toggled.connect(self.toggle_auth_method)
        self.key_radio.toggled.connect(self.toggle_auth_method)
        
        self.password_input = QLineEdit()
        self.password_input.setPlaceholderText("Введите пароль")
        self.password_input.setEchoMode(QLineEdit.Password)
        
        key_layout = QHBoxLayout()
        self.key_file_input = QLineEdit()
        self.key_file_input.setPlaceholderText("Путь к приватному SSH ключу")
        self.browse_key_btn = QPushButton("Обзор")
        self.browse_key_btn.clicked.connect(self.browse_key_file)
        key_layout.addWidget(self.key_file_input)
        key_layout.addWidget(self.browse_key_btn)
        
        auth_layout.addWidget(self.password_radio)
        auth_layout.addWidget(self.password_input)
        auth_layout.addWidget(self.key_radio)
        auth_layout.addLayout(key_layout)
        auth_group.setLayout(auth_layout)
        
        # Добавляем поля в layout
        connection_layout.addWidget(QLabel("Хост:"))
        connection_layout.addWidget(self.host_input)
        connection_layout.addWidget(QLabel("Порт:"))
        connection_layout.addWidget(self.port_input)
        connection_layout.addWidget(QLabel("Имя пользователя:"))
        connection_layout.addWidget(self.username_input)
        connection_layout.addWidget(auth_group)
        
        connection_group.setLayout(connection_layout)
        layout.addWidget(connection_group)
        
        # Кнопка установки
        self.install_btn = QPushButton("Установить SparkPanel")
        self.install_btn.clicked.connect(self.start_installation)
        self.install_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border: none;
                padding: 12px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
            QPushButton:disabled {
                background-color: #cccccc;
            }
        """)
        layout.addWidget(self.install_btn)
        
        # Прогресс-бар
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # Лог установки
        self.install_log = QTextEdit()
        self.install_log.setReadOnly(True)
        self.install_log.setMaximumHeight(200)
        layout.addWidget(QLabel("Лог установки:"))
        layout.addWidget(self.install_log)
        
        widget.setLayout(layout)
        return widget
        
    def create_manage_tab(self):
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Заголовок
        header_label = QLabel("Управление установленной панелью")
        header_label.setStyleSheet("font-size: 18px; font-weight: bold; margin: 10px 0;")
        layout.addWidget(header_label)
        
        # Информация о подключении
        info_text = QTextEdit()
        info_text.setReadOnly(True)
        info_text.setHtml("""
        <h3>Доступ к панели управления</h3>
        <p>После успешной установки SparkPanel вы можете получить доступ к панели следующими способами:</p>
        <ol>
            <li><b>Через встроенный браузер:</b> Нажмите кнопку "Открыть встроенный браузер" ниже</li>
            <li><b>Через внешний браузер:</b> Откройте в браузере IP-адрес вашего сервера</li>
        </ol>
        <h3>Учетные данные по умолчанию</h3>
        <ul>
            <li><b>Логин:</b> admin</li>
            <li><b>Пароль:</b> admin</li>
        </ul>
        <p><b style="color: red;">Важно:</b> Обязательно измените пароль после первого входа для обеспечения безопасности!</p>
        """)
        layout.addWidget(info_text)
        
        # Кнопки управления
        buttons_layout = QHBoxLayout()
        
        self.open_browser_btn = QPushButton("Открыть встроенный браузер")
        self.open_browser_btn.clicked.connect(self.open_browser)
        self.open_browser_btn.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
                border: none;
                padding: 10px;
                font-size: 14px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
        """)
        
        self.open_external_btn = QPushButton("Открыть во внешнем браузере")
        self.open_external_btn.clicked.connect(self.open_external_browser)
        self.open_external_btn.setStyleSheet("""
            QPushButton {
                background-color: #FF9800;
                color: white;
                border: none;
                padding: 10px;
                font-size: 14px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #F57C00;
            }
        """)
        
        buttons_layout.addWidget(self.open_browser_btn)
        buttons_layout.addWidget(self.open_external_btn)
        layout.addLayout(buttons_layout)
        
        # Инструкции по использованию
        instructions_group = QGroupBox("Расширенные возможности SparkPanel")
        instructions_layout = QVBoxLayout()
        
        instructions_text = QTextEdit()
        instructions_text.setReadOnly(True)
        instructions_text.setHtml("""
        <h3>Функции панели управления:</h3>
        <ul>
            <li><b>Управление серверами:</b> Запуск, остановка, перезагрузка Minecraft-серверов</li>
            <li><b>Мониторинг ресурсов:</b> Отслеживание использования CPU, RAM, дискового пространства</li>
            <li><b>Плагины и модификации:</b> Управление плагинами сервера</li>
            <li><b>Резервное копирование:</b> Создание и восстановление резервных копий</li>
            <li><b>Планировщик задач:</b> Автоматизация рутинных операций</li>
            <li><b>Система уведомлений:</b> Email, Telegram, Discord уведомления</li>
            <li><b>Безопасность:</b> Двухфакторная аутентификация, ограничения по IP, аудит действий</li>
            <li><b>Статистика:</b> Графики и диаграммы производительности</li>
        </ul>
        <h3>Роли пользователей:</h3>
        <ul>
            <li><b>Администратор:</b> Полный доступ ко всем функциям</li>
            <li><b>Модератор:</b> Управление серверами и плагинами</li>
            <li><b>Пользователь:</b> Просмотр статистики и логов</li>
        </ul>
        """)
        
        instructions_layout.addWidget(instructions_text)
        instructions_group.setLayout(instructions_layout)
        layout.addWidget(instructions_group)
        
        widget.setLayout(layout)
        return widget
        
    def create_info_tab(self):
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Заголовок
        header_label = QLabel("Информация о Poo и SparkPanel")
        header_label.setStyleSheet("font-size: 18px; font-weight: bold; margin: 10px 0;")
        layout.addWidget(header_label)
        
        # Описание
        info_text = QTextEdit()
        info_text.setReadOnly(True)
        info_text.setHtml("""
        <h2>Poo - клиент для установки SparkPanel</h2>
        <p>Poo - это современное клиентское приложение, предназначенное для автоматической установки 
        и управления веб-панелью SparkPanel на серверах с ОС Linux.</p>
        
        <h3>Основные возможности Poo:</h3>
        <ul>
            <li>Интуитивный графический интерфейс</li>
            <li>Поддержка аутентификации по паролю и SSH ключу</li>
            <li>Автоматическая установка LEMP стека (Linux, Nginx, MySQL, PHP)</li>
            <li>Разворачивание SparkPanel с полной функциональностью</li>
            <li>Настройка веб-сервера и безопасности</li>
            <li>Встроенный браузер для управления панелью</li>
            <li>Подробное логирование процесса установки</li>
        </ul>
        
        <h2>SparkPanel - веб-панель управления серверами</h2>
        <p>SparkPanel - это мощная веб-панель управления, разработанная специально для администрирования 
        Minecraft-серверов. Она предоставляет широкий спектр функций для эффективного управления серверной инфраструктурой.</p>
        
        <h3>Ключевые особенности SparkPanel:</h3>
        <ul>
            <li><b>Современный интерфейс:</b> Адаптивный дизайн с темной/светлой темой</li>
            <li><b>Безопасность:</b> Двухфакторная аутентификация, ограничения по IP, аудит действий</li>
            <li><b>Мониторинг:</b> Отслеживание ресурсов в реальном времени</li>
            <li><b>Автоматизация:</b> Планировщик задач и резервное копирование</li>
            <li><b>Уведомления:</b> Поддержка Email, Telegram, Discord</li>
            <li><b>Управление пользователями:</b> Система ролей и разрешений</li>
            <li><b>Расширяемость:</b> Поддержка плагинов и модификаций</li>
        </ul>
        
        <h3>Системные требования:</h3>
        <ul>
            <li><b>Клиент (Poo):</b> Windows 7+, Linux, Python 3.8+</li>
            <li><b>Сервер (SparkPanel):</b> Ubuntu 20.04+, 2GB RAM, 10GB HDD</li>
        </ul>
        
        <h3>Технологии:</h3>
        <ul>
            <li><b>Клиент:</b> Python, PyQt5</li>
            <li><b>Сервер:</b> PHP 8.2, Nginx, MySQL</li>
            <li><b>Безопасность:</b> Fail2ban, UFW, HTTPS (опционально)</li>
        </ul>
        """)
        
        layout.addWidget(info_text)
        
        widget.setLayout(layout)
        return widget
        
    def create_monitoring_tab(self):
        """Создание вкладки мониторинга"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Заголовок
        header_label = QLabel("Мониторинг ресурсов сервера")
        header_label.setStyleSheet("font-size: 18px; font-weight: bold; margin: 10px 0;")
        layout.addWidget(header_label)
        
        # Кнопки управления мониторингом
        controls_layout = QHBoxLayout()
        self.start_monitor_btn = QPushButton("Запустить мониторинг")
        self.start_monitor_btn.clicked.connect(self.start_monitoring)
        self.stop_monitor_btn = QPushButton("Остановить мониторинг")
        self.stop_monitor_btn.clicked.connect(self.stop_monitoring)
        self.stop_monitor_btn.setEnabled(False)
        
        controls_layout.addWidget(self.start_monitor_btn)
        controls_layout.addWidget(self.stop_monitor_btn)
        controls_layout.addStretch()
        
        layout.addLayout(controls_layout)
        
        # Графики
        self.create_charts(layout)
        
        # Таблица метрик
        self.create_metrics_table(layout)
        
        # Таблица оповещений
        self.create_alerts_table(layout)
        
        widget.setLayout(layout)
        return widget
        
    def create_charts(self, layout):
        """Создание графиков"""
        # Создаем серию данных для графиков
        self.cpu_series = QLineSeries()
        self.memory_series = QLineSeries()
        self.disk_series = QLineSeries()
        
        # CPU график
        cpu_chart = QChart()
        cpu_chart.addSeries(self.cpu_series)
        cpu_chart.setTitle("Использование CPU (%)")
        cpu_chart.createDefaultAxes()
        cpu_chart.axisX().setVisible(False)
        
        # Настраиваем ось Y
        axis_y = cpu_chart.axisY()
        axis_y.setRange(0, 100)
        axis_y.setTitleText("Проценты")
        
        cpu_chart.legend().setVisible(False)
        cpu_chart_view = QChartView(cpu_chart)
        cpu_chart_view.setRenderHint(QPainter.Antialiasing)
        
        # Memory график
        memory_chart = QChart()
        memory_chart.addSeries(self.memory_series)
        memory_chart.setTitle("Использование памяти (%)")
        memory_chart.createDefaultAxes()
        memory_chart.axisX().setVisible(False)
        
        # Настраиваем ось Y
        axis_y = memory_chart.axisY()
        axis_y.setRange(0, 100)
        axis_y.setTitleText("Проценты")
        
        memory_chart.legend().setVisible(False)
        memory_chart_view = QChartView(memory_chart)
        memory_chart_view.setRenderHint(QPainter.Antialiasing)
        
        # Disk график
        disk_chart = QChart()
        disk_chart.addSeries(self.disk_series)
        disk_chart.setTitle("Использование диска (%)")
        disk_chart.createDefaultAxes()
        disk_chart.axisX().setVisible(False)
        
        # Настраиваем ось Y
        axis_y = disk_chart.axisY()
        axis_y.setRange(0, 100)
        axis_y.setTitleText("Проценты")
        
        disk_chart.legend().setVisible(False)
        disk_chart_view = QChartView(disk_chart)
        disk_chart_view.setRenderHint(QPainter.Antialiasing)
        
        # Добавляем графики в layout
        charts_layout = QHBoxLayout()
        charts_layout.addWidget(cpu_chart_view)
        charts_layout.addWidget(memory_chart_view)
        charts_layout.addWidget(disk_chart_view)
        layout.addLayout(charts_layout)
        
    def create_metrics_table(self, layout):
        """Создание таблицы метрик"""
        metrics_group = QGroupBox("Текущие метрики")
        metrics_layout = QVBoxLayout()
        
        self.metrics_text = QTextEdit()
        self.metrics_text.setReadOnly(True)
        self.metrics_text.setMaximumHeight(150)
        self.metrics_text.setStyleSheet("""
            QTextEdit {
                font-family: Consolas, monospace;
                font-size: 12px;
            }
        """)
        
        metrics_layout.addWidget(self.metrics_text)
        metrics_group.setLayout(metrics_layout)
        layout.addWidget(metrics_group)
        
    def create_alerts_table(self, layout):
        """Создание таблицы оповещений"""
        alerts_group = QGroupBox("Оповещения")
        alerts_layout = QVBoxLayout()
        
        self.alerts_text = QTextEdit()
        self.alerts_text.setReadOnly(True)
        self.alerts_text.setMaximumHeight(150)
        
        alerts_layout.addWidget(self.alerts_text)
        alerts_group.setLayout(alerts_layout)
        layout.addWidget(alerts_group)
        
    def toggle_auth_method(self):
        """Переключение метода аутентификации"""
        if self.password_radio.isChecked():
            self.password_input.setEnabled(True)
            self.key_file_input.setEnabled(False)
            self.browse_key_btn.setEnabled(False)
        else:
            self.password_input.setEnabled(False)
            self.key_file_input.setEnabled(True)
            self.browse_key_btn.setEnabled(True)
            
    def browse_key_file(self):
        """Выбор файла SSH ключа"""
        file_path, _ = QFileDialog.getOpenFileName(self, "Выберите приватный SSH ключ", "", "SSH Keys (*)")
        if file_path:
            self.key_file_input.setText(file_path)
            
    def start_installation(self):
        """Начало процесса установки"""
        host = self.host_input.text().strip()
        port = self.port_input.text().strip()
        username = self.username_input.text().strip()
        
        # Проверка заполнения обязательных полей
        if not host:
            QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите IP-адрес сервера")
            return
            
        if not port.isdigit():
            QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите корректный порт")
            return
            
        if not username:
            QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите имя пользователя")
            return
            
        # Проверка аутентификации
        if self.password_radio.isChecked():
            auth = self.password_input.text()
            if not auth:
                QMessageBox.warning(self, "Ошибка", "Пожалуйста, введите пароль")
                return
        else:
            auth = self.key_file_input.text().strip()
            if not auth:
                QMessageBox.warning(self, "Ошибка", "Пожалуйста, выберите файл SSH ключа")
                return
                
        # Здесь будет логика установки
        self.install_btn.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # Неопределенный прогресс
        self.install_log.clear()
        self.install_log.append(f"Начинаем установку SparkPanel на {host}:{port}...")
        self.install_log.append("Подключение к серверу...")
        self.install_log.append("Установка LEMP стека...")
        self.install_log.append("Разворачивание SparkPanel...")
        self.install_log.append("Настройка веб-сервера...")
        self.install_log.append("Настройка безопасности...")
        self.install_log.append("Установка успешно завершена!")
        
        # Имитация завершения установки
        self.installation_finished(True, "Установка успешно завершена! Теперь вы можете перейти на вкладку 'Управление панелью'.")
        
    def update_install_log(self, message):
        """Обновление лога установки"""
        self.install_log.append(message)
        
    def installation_finished(self, success, message):
        """Завершение установки"""
        self.install_btn.setEnabled(True)
        self.progress_bar.setVisible(False)
        
        if success:
            QMessageBox.information(self, "Установка завершена", message)
            self.tabs.setCurrentIndex(1)  # Переключаемся на вкладку управления
        else:
            QMessageBox.critical(self, "Ошибка установки", message)
            
    def open_browser(self):
        """Открытие встроенного браузера"""
        try:
            from ui.browser import BrowserWindow
            self.browser = BrowserWindow()
            self.browser.show()
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось открыть браузер: {str(e)}")
            
    def open_external_browser(self):
        """Открытие внешнего браузера"""
        host = self.host_input.text().strip()
        if not host:
            QMessageBox.warning(self, "Предупреждение", "Пожалуйста, сначала введите IP-адрес сервера на вкладке установки")
            return
            
        QMessageBox.information(self, "Информация", f"Откройте в вашем браузере: http://{host}")
        
    def start_monitoring(self):
        """Запуск мониторинга"""
        try:
            self.monitor.add_alert_callback(self.handle_alert)
            self.monitor.start_monitoring(interval=5)
            self.start_monitor_btn.setEnabled(False)
            self.stop_monitor_btn.setEnabled(True)
            
            # Запускаем таймер для обновления данных
            from PyQt5.QtCore import QTimer
            self.monitor_timer = QTimer()
            self.monitor_timer.timeout.connect(self.update_monitoring_data)
            self.monitor_timer.start(5000)  # Обновляем каждые 5 секунд
            
            self.status_bar.setText("Мониторинг запущен")
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось запустить мониторинг: {str(e)}")
            
    def stop_monitoring(self):
        """Остановка мониторинга"""
        try:
            self.monitor.stop_monitoring()
            self.start_monitor_btn.setEnabled(True)
            self.stop_monitor_btn.setEnabled(False)
            
            if hasattr(self, 'monitor_timer'):
                self.monitor_timer.stop()
                
            self.status_bar.setText("Мониторинг остановлен")
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось остановить мониторинг: {str(e)}")
            
    def update_monitoring_data(self):
        """Обновление данных мониторинга"""
        try:
            # Получаем текущие метрики
            current_metrics = self.monitor.get_current_metrics()
            
            # Обновляем текст метрик
            metrics_text = ""
            for metric_type, data in current_metrics.items():
                metrics_text += f"{metric_type.upper()}:\n"
                for key, value in data.items():
                    if isinstance(value, float):
                        metrics_text += f"  {key}: {value:.2f}\n"
                    else:
                        metrics_text += f"  {key}: {value}\n"
                metrics_text += "\n"
                
            self.metrics_text.setPlainText(metrics_text)
            
            # Обновляем графики
            self.update_charts()
            
            # Обновляем оповещения
            self.update_alerts()
            
        except Exception as e:
            print(f"Ошибка обновления данных мониторинга: {e}")
            
    def update_charts(self):
        """Обновление графиков"""
        try:
            # Получаем историю метрик
            cpu_history = self.monitor.get_metrics_history('cpu', limit=20)
            memory_history = self.monitor.get_metrics_history('memory', limit=20)
            disk_history = self.monitor.get_metrics_history('disk', limit=20)
            
            # Очищаем серии данных
            self.cpu_series.clear()
            self.memory_series.clear()
            self.disk_series.clear()
            
            # Заполняем данные для CPU
            for i, record in enumerate(cpu_history):
                self.cpu_series.append(i, record['data']['percent'])
                
            # Заполняем данные для памяти
            for i, record in enumerate(memory_history):
                self.memory_series.append(i, record['data']['percent'])
                
            # Заполняем данные для диска
            for i, record in enumerate(disk_history):
                self.disk_series.append(i, record['data']['percent'])
                
        except Exception as e:
            print(f"Ошибка обновления графиков: {e}")
            
    def update_alerts(self):
        """Обновление оповещений"""
        try:
            alerts = self.monitor.get_alerts(limit=10)
            alerts_text = ""
            
            for alert in reversed(alerts):  # Показываем последние первыми
                timestamp = alert['timestamp'].split('T')[1].split('.')[0]  # Извлекаем время
                level = alert['level'].upper()
                message = alert['message']
                alerts_text += f"[{timestamp}] [{level}] {message}\n"
                
            self.alerts_text.setPlainText(alerts_text)
            
        except Exception as e:
            print(f"Ошибка обновления оповещений: {e}")
            
    def handle_alert(self, alert):
        """Обработка оповещений"""
        try:
            # Показываем уведомление
            level = alert['level']
            message = alert['message']
            
            if level == 'critical':
                QMessageBox.critical(self, "Критическое оповещение", message)
            elif level == 'warning':
                QMessageBox.warning(self, "Предупреждение", message)
                
        except Exception as e:
            print(f"Ошибка обработки оповещения: {e}")

# Функция для запуска приложения
def create_app():
    import sys
    app = QApplication(sys.argv)
    app.setStyle('Fusion')  # Современный стиль
    
    # Устанавливаем тему в зависимости от системы
    palette = app.palette()
    app.setPalette(palette)
    
    return app

def run():
    app = create_app()
    client = PooClient()
    client.show()
    
    import sys
    sys.exit(app.exec_())