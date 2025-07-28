from PyQt5.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLineEdit, 
    QProgressBar, QLabel, QToolBar, QAction, QMessageBox
)
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtCore import QUrl, Qt
from PyQt5.QtGui import QIcon


class BrowserWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.initUI()
        
    def initUI(self):
        self.setWindowTitle('Poo Browser - SparkPanel')
        self.setGeometry(100, 100, 1200, 800)
        
        # Создаем центральный виджет
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout()
        central_widget.setLayout(layout)
        
        # Создаем панель инструментов
        self.create_toolbar()
        layout.addWidget(self.toolbar)
        
        # Создаем строку адреса
        self.create_address_bar()
        layout.addWidget(self.address_bar)
        
        # Создаем прогресс-бар
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # Создаем веб-просмотр
        self.web_view = QWebEngineView()
        self.web_view.loadStarted.connect(self.load_started)
        self.web_view.loadProgress.connect(self.load_progress)
        self.web_view.loadFinished.connect(self.load_finished)
        
        # Загружаем главную страницу панели (локальный файл для демонстрации)
        self.web_view.setHtml(self.get_sparkpanel_html())
        
        layout.addWidget(self.web_view)
        
        # Статус бар
        self.status_bar = QLabel("Готов")
        layout.addWidget(self.status_bar)
        
    def create_toolbar(self):
        """Создание панели инструментов"""
        self.toolbar = QToolBar()
        self.toolbar.setMovable(False)
        
        # Кнопки навигации
        self.back_btn = QAction("Назад", self)
        self.back_btn.triggered.connect(self.web_view.back)
        self.toolbar.addAction(self.back_btn)
        
        self.forward_btn = QAction("Вперед", self)
        self.forward_btn.triggered.connect(self.web_view.forward)
        self.toolbar.addAction(self.forward_btn)
        
        self.reload_btn = QAction("Перезагрузить", self)
        self.reload_btn.triggered.connect(self.web_view.reload)
        self.toolbar.addAction(self.reload_btn)
        
        self.home_btn = QAction("Домой", self)
        self.home_btn.triggered.connect(self.go_home)
        self.toolbar.addAction(self.home_btn)
        
        self.toolbar.addSeparator()
        
        # Кнопки управления
        self.fullscreen_btn = QAction("Полный экран", self)
        self.fullscreen_btn.triggered.connect(self.toggle_fullscreen)
        self.toolbar.addAction(self.fullscreen_btn)
        
    def create_address_bar(self):
        """Создание строки адреса"""
        self.address_bar = QLineEdit()
        self.address_bar.returnPressed.connect(self.load_url)
        self.address_bar.setText("http://localhost/sparkpanel")  # Заглушка для демонстрации
        self.address_bar.setPlaceholderText("Введите адрес панели управления")
        
    def load_url(self):
        """Загрузка URL"""
        url = self.address_bar.text()
        if not url.startswith("http://") and not url.startswith("https://"):
            url = "http://" + url
            
        self.web_view.load(QUrl(url))
        self.status_bar.setText(f"Загрузка {url}...")
        
    def load_started(self):
        """Начало загрузки"""
        self.progress_bar.setVisible(True)
        self.status_bar.setText("Загрузка...")
        
    def load_progress(self, progress):
        """Прогресс загрузки"""
        self.progress_bar.setValue(progress)
        
    def load_finished(self, success):
        """Завершение загрузки"""
        self.progress_bar.setVisible(False)
        if success:
            self.status_bar.setText("Готов")
        else:
            self.status_bar.setText("Ошибка загрузки")
            
    def go_home(self):
        """Переход на домашнюю страницу"""
        self.web_view.setHtml(self.get_sparkpanel_html())
        self.address_bar.setText("http://localhost/sparkpanel")
        self.status_bar.setText("Главная страница")
        
    def toggle_fullscreen(self):
        """Переключение полноэкранного режима"""
        if self.isFullScreen():
            self.showNormal()
            self.fullscreen_btn.setText("Полный экран")
        else:
            self.showFullScreen()
            self.fullscreen_btn.setText("Оконный режим")
            
    def get_sparkpanel_html(self):
        """Возвращает HTML для демонстрации SparkPanel"""
        return """
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SparkPanel - Демонстрация</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                header {
                    text-align: center;
                    padding: 40px 0;
                }
                h1 {
                    font-size: 3rem;
                    margin-bottom: 10px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                }
                .subtitle {
                    font-size: 1.2rem;
                    opacity: 0.9;
                }
                .features {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin-top: 40px;
                }
                .feature-card {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 15px;
                    padding: 30px;
                    text-align: center;
                    transition: transform 0.3s ease;
                }
                .feature-card:hover {
                    transform: translateY(-10px);
                    background: rgba(255, 255, 255, 0.15);
                }
                .feature-icon {
                    font-size: 3rem;
                    margin-bottom: 20px;
                }
                .feature-title {
                    font-size: 1.5rem;
                    margin-bottom: 15px;
                }
                .feature-desc {
                    font-size: 1rem;
                    opacity: 0.8;
                }
                .cta {
                    text-align: center;
                    margin: 50px 0;
                }
                .cta-button {
                    background: #fff;
                    color: #667eea;
                    border: none;
                    padding: 15px 40px;
                    font-size: 1.2rem;
                    border-radius: 50px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-weight: bold;
                }
                .cta-button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                }
                footer {
                    text-align: center;
                    padding: 30px 0;
                    margin-top: 50px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1>SparkPanel</h1>
                    <div class="subtitle">Современная панель управления Minecraft-серверами</div>
                </header>
                
                <div class="features">
                    <div class="feature-card">
                        <div class="feature-icon">🖥️</div>
                        <div class="feature-title">Управление серверами</div>
                        <div class="feature-desc">Полный контроль над вашими Minecraft-серверами с интуитивным интерфейсом</div>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">🔒</div>
                        <div class="feature-title">Расширенная безопасность</div>
                        <div class="feature-desc">Двухфакторная аутентификация, ограничения по IP и аудит действий</div>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">📊</div>
                        <div class="feature-title">Мониторинг в реальном времени</div>
                        <div class="feature-desc">Отслеживайте использование ресурсов и активность игроков</div>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">🔄</div>
                        <div class="feature-title">Автоматизация</div>
                        <div class="feature-desc">Планировщик задач, автоматическое резервное копирование</div>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">🔔</div>
                        <div class="feature-title">Уведомления</div>
                        <div class="feature-desc">Получайте уведомления по Email, Telegram и Discord</div>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">👥</div>
                        <div class="feature-title">Управление пользователями</div>
                        <div class="feature-desc">Система ролей и разрешений для командной работы</div>
                    </div>
                </div>
                
                <div class="cta">
                    <button class="cta-button" onclick="alert('В настоящей реализации здесь будет форма входа в панель управления')">Войти в панель управления</button>
                </div>
                
                <footer>
                    <p>SparkPanel &copy; 2025 | Современное решение для управления серверами</p>
                </footer>
            </div>
            
            <script>
                // Имитация интерактивности
                document.addEventListener('DOMContentLoaded', function() {
                    const cards = document.querySelectorAll('.feature-card');
                    cards.forEach((card, index) => {
                        setTimeout(() => {
                            card.style.opacity = '0';
                            card.style.transform = 'translateY(20px)';
                            card.style.transition = 'all 0.5s ease';
                            
                            setTimeout(() => {
                                card.style.opacity = '1';
                                card.style.transform = 'translateY(0)';
                            }, 100);
                        }, index * 100);
                    });
                });
            </script>
        </body>
        </html>
        """


if __name__ == '__main__':
    from PyQt5.QtWidgets import QApplication
    import sys
    
    app = QApplication(sys.argv)
    browser = BrowserWindow()
    browser.show()
    sys.exit(app.exec_())