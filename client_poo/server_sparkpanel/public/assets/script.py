content = '''// Функциональность SparkPanel

document.addEventListener('DOMContentLoaded', function() {
    // Обработчик для кнопки добавления сервера
    const addServerBtn = document.getElementById('add-server');
    if (addServerBtn) {
        addServerBtn.addEventListener('click', function() {
            alert('Функция добавления сервера будет реализована в полной версии');
        });
    }
    
    // Обработчики для кнопок управления серверами
    const serverActionButtons = document.querySelectorAll('.server-actions button');
    serverActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.classList.contains('start') ? 'запустить' : 
                          this.classList.contains('stop') ? 'остановить' : 'удалить';
            const serverName = this.closest('.server-item').querySelector('h4').textContent;
            
            if (confirm(`Вы уверены, что хотите ${action} сервер ${serverName}?`)) {
                alert(`Сервер будет ${action}. Реализация в полной версии.`);
            }
        });
    });
    
    // Имитация обновления статистики
    function updateStats() {
        const statValues = document.querySelectorAll('.stat-value');
        statValues.forEach(element => {
            // Генерируем случайное значение для демонстрации
            element.textContent = Math.floor(Math.random() * 100);
        });
    }
    
    // Обновляем статистику каждые 30 секунд
    setInterval(updateStats, 30000);
});

// Функция для загрузки логов
function loadLogs() {
    const logViewer = document.getElementById('log-viewer');
    if (logViewer) {
        logViewer.innerHTML = `
            <div class="log-entry">[INFO] Сервер запущен</div>
            <div class="log-entry warning">[WARN] Низкая память</div>
            <div class="log-entry">[INFO] Игрок подключился</div>
            <div class="log-entry error">[ERROR] Ошибка плагина</div>
            <div class="log-entry">[INFO] Резервная копия создана</div>
        `;
    }
}

// Загружаем логи при открытии страницы логов
if (window.location.search.includes('page=logs')) {
    loadLogs();
}'''