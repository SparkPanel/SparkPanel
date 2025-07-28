// Функциональность SparkPanel

document.addEventListener('DOMContentLoaded', function() {
    // Переключение темы
    const themeSwitch = document.getElementById('theme-switch');
    const body = document.body;
    
    // Проверяем сохраненную тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-theme');
        themeSwitch.checked = true;
    }
    
    themeSwitch.addEventListener('change', function() {
        if (this.checked) {
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
        }
    });
    
    // Навигация между страницами
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Удаляем активный класс у всех ссылок и страниц
            navLinks.forEach(nav => nav.classList.remove('active'));
            pages.forEach(page => page.classList.remove('active'));
            
            // Добавляем активный класс к текущей ссылке
            this.classList.add('active');
            
            // Показываем соответствующую страницу
            const pageId = this.getAttribute('data-page');
            if (pageId) {
                document.getElementById(pageId).classList.add('active');
            }
            
            // Обновляем URL
            const url = new URL(window.location);
            url.searchParams.set('page', pageId);
            window.history.pushState({}, '', url);
        });
    });
    
    // Обработчик для кнопки добавления сервера
    const addServerBtn = document.getElementById('add-server');
    if (addServerBtn) {
        addServerBtn.addEventListener('click', function() {
            // Анимация при нажатии
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            // Показываем модальное окно
            document.getElementById('add-server-modal').style.display = 'block';
        });
    }
    
    // Обработчик для кнопки загрузки плагина
    const uploadPluginBtn = document.getElementById('upload-plugin');
    if (uploadPluginBtn) {
        uploadPluginBtn.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            // Показываем модальное окно
            document.getElementById('add-plugin-modal').style.display = 'block';
        });
    }
    
    // Обработчик для кнопки создания резервной копии
    const createBackupBtn = document.getElementById('create-backup');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            if (confirm('Вы уверены, что хотите создать резервную копию?')) {
                // Отправляем запрос на создание резервной копии
                const formData = new FormData();
                formData.append('action', 'create_backup');
                formData.append('server_id', 1); // Для демонстрации
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('Резервная копия создана успешно!');
                        window.location.reload();
                    } else {
                        alert('Ошибка создания резервной копии: ' + data.message);
                    }
                })
                .catch(error => {
                    alert('Ошибка создания резервной копии: ' + error.message);
                });
            }
        });
    }
    
    // Обработчик для кнопки добавления задачи
    const addTaskBtn = document.getElementById('add-task');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            alert('Функция добавления задачи будет реализована в полной версии');
        });
    }
    
    // Обработчики для кнопок управления серверами
    const serverActionButtons = document.querySelectorAll('.server-actions button');
    serverActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Анимация при нажатии
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('start-server') ? 'start_server' : 
                          this.classList.contains('stop-server') ? 'stop_server' : 'delete_server';
            const serverId = this.getAttribute('data-id');
            const actionText = this.classList.contains('start-server') ? 'запустить' : 
                              this.classList.contains('stop-server') ? 'остановить' : 'удалить';
            
            if (confirm(`Вы уверены, что хотите ${actionText} сервер?`)) {
                // Отправляем запрос на сервер
                const formData = new FormData();
                formData.append('action', action);
                formData.append('id', serverId);
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(`Сервер будет ${actionText}.`);
                        window.location.reload();
                    } else {
                        alert(`Ошибка: ${data.message}`);
                    }
                })
                .catch(error => {
                    alert(`Ошибка: ${error.message}`);
                });
            }
        });
    });
    
    // Обработчики для кнопок управления плагинами
    const pluginActionButtons = document.querySelectorAll('.plugin-actions button');
    pluginActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('enable-plugin') ? 'enable_plugin' : 
                          this.classList.contains('disable-plugin') ? 'disable_plugin' : 'delete_plugin';
            const pluginId = this.getAttribute('data-id');
            const actionText = this.classList.contains('enable-plugin') ? 'включить' : 
                              this.classList.contains('disable-plugin') ? 'отключить' : 'удалить';
            
            if (confirm(`Вы уверены, что хотите ${actionText} плагин?`)) {
                // Отправляем запрос на сервер
                const formData = new FormData();
                formData.append('action', action);
                formData.append('id', pluginId);
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(`Плагин будет ${actionText}.`);
                        window.location.reload();
                    } else {
                        alert(`Ошибка: ${data.message}`);
                    }
                })
                .catch(error => {
                    alert(`Ошибка: ${error.message}`);
                });
            }
        });
    });
    
    // Обработчики для кнопок управления резервными копиями
    const backupActionButtons = document.querySelectorAll('.backup-actions button');
    backupActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('restore-backup') ? 'restore_backup' : 'delete_backup';
            const backupId = this.getAttribute('data-id');
            const actionText = this.classList.contains('restore-backup') ? 'восстановить' : 'удалить';
            
            if (confirm(`Вы уверены, что хотите ${actionText} резервную копию?`)) {
                // Отправляем запрос на сервер
                const formData = new FormData();
                formData.append('action', action);
                formData.append('id', backupId);
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(actionText === 'восстановить' ? 
                              'Резервная копия будет восстановлена. Сервер будет перезапущен.' : 
                              'Резервная копия будет удалена.');
                        window.location.reload();
                    } else {
                        alert(`Ошибка: ${data.message}`);
                    }
                })
                .catch(error => {
                    alert(`Ошибка: ${error.message}`);
                });
            }
        });
    });
    
    // Обработчики для кнопок управления задачами
    const taskActionButtons = document.querySelectorAll('.task-actions button');
    taskActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('enable-task') ? 'enable_task' : 
                          this.classList.contains('disable-task') ? 'disable_task' : 'delete_task';
            const taskId = this.getAttribute('data-id');
            const actionText = this.classList.contains('enable-task') ? 'включить' : 
                              this.classList.contains('disable-task') ? 'отключить' : 'удалить';
            
            if (confirm(`Вы уверены, что хотите ${actionText} задачу?`)) {
                // Отправляем запрос на сервер
                const formData = new FormData();
                formData.append('action', action);
                formData.append('id', taskId);
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(`Задача будет ${actionText}.`);
                        window.location.reload();
                    } else {
                        alert(`Ошибка: ${data.message}`);
                    }
                })
                .catch(error => {
                    alert(`Ошибка: ${error.message}`);
                });
            }
        });
    });
    
    // Имитация обновления статистики
    function updateStats() {
        const statValues = document.querySelectorAll('.stat-value');
        statValues.forEach(element => {
            // Генерируем случайное значение для демонстрации
            const oldValue = parseInt(element.textContent);
            const newValue = Math.max(0, Math.min(100, oldValue + Math.floor(Math.random() * 21) - 10));
            element.textContent = newValue + (element.textContent.includes('GB') ? ' GB' : element.textContent.includes('/') ? '/20' : '');
            
            // Обновляем прогресс-бары
            const progressBar = element.closest('.stat-card, .server-details').querySelector('.progress-fill');
            if (progressBar) {
                progressBar.style.width = newValue + '%';
            }
        });
    }
    
    // Обновляем статистику каждые 5 секунд
    setInterval(updateStats, 5000);
    
    // Анимация прогресс-баров при загрузке страницы
    const progressBars = document.querySelectorAll('.progress-fill');
    progressBars.forEach(bar => {
        const width = bar.style.width;
        bar.style.width = '0';
        setTimeout(() => {
            bar.style.width = width;
        }, 300);
    });
    
    // Фильтры логов
    const logFilterButtons = document.querySelectorAll('.log-filters .btn');
    const logEntries = document.querySelectorAll('.log-entry');
    
    logFilterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Удаляем активный класс у всех кнопок
            logFilterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Добавляем активный класс к текущей кнопке
            this.classList.add('active');
            
            const filter = this.textContent.trim();
            
            logEntries.forEach(entry => {
                if (filter === 'Все') {
                    entry.style.display = 'flex';
                } else if (filter === 'Предупреждения' && entry.classList.contains('log-warning')) {
                    entry.style.display = 'flex';
                } else if (filter === 'Ошибки' && entry.classList.contains('log-error')) {
                    entry.style.display = 'flex';
                } else if (filter === 'Все' || !entry.classList.contains('log-warning') && !entry.classList.contains('log-error')) {
                    entry.style.display = 'flex';
                } else {
                    entry.style.display = 'none';
                }
            });
        });
    });
    
    // Инициализация графиков (имитация)
    initializeCharts();
    
    // Функциональность раздела безопасности
    initSecurityFeatures();
    
    // Обработчики модальных окон
    initModalHandlers();
    
    // Обработчики форм
    initFormHandlers();
});

// Инициализация графиков
function initializeCharts() {
    // Имитация данных для графиков
    const charts = document.querySelectorAll('.chart-placeholder');
    charts.forEach(chart => {
        chart.innerHTML = '<p>График в реальном времени</p>';
        
        // Создаем имитацию обновления графиков
        setInterval(() => {
            const value = Math.floor(Math.random() * 100);
            chart.innerHTML = `<p>Значение: ${value}%</p>`;
        }, 3000);
    });
}

// Функция для загрузки логов
function loadLogs() {
    const logViewer = document.getElementById('log-viewer');
    if (logViewer) {
        logViewer.innerHTML = `
            <div class="log-entry log-info">
                <span class="log-time">[2025-07-27 10:00:00]</span>
                <span class="log-type">[INFO]</span>
                <span class="log-message">Сервер запущен</span>
            </div>
            <div class="log-entry log-warning">
                <span class="log-time">[2025-07-27 10:05:23]</span>
                <span class="log-type">[WARN]</span>
                <span class="log-message">Низкая память</span>
            </div>
            <div class="log-entry log-info">
                <span class="log-time">[2025-07-27 10:10:11]</span>
                <span class="log-type">[INFO]</span>
                <span class="log-message">Игрок подключился</span>
            </div>
            <div class="log-entry log-error">
                <span class="log-time">[2025-07-27 10:15:33]</span>
                <span class="log-type">[ERROR]</span>
                <span class="log-message">Ошибка плагина</span>
            </div>
            <div class="log-entry log-info">
                <span class="log-time">[2025-07-27 10:20:45]</span>
                <span class="log-type">[INFO]</span>
                <span class="log-message">Резервная копия создана</span>
            </div>
        `;
    }
}

// Загружаем логи при открытии страницы логов
if (window.location.search.includes('page=logs')) {
    loadLogs();
}

// Обработка всплытия контента
window.addEventListener('load', function() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.style.opacity = '0';
        page.style.transform = 'translateY(20px)';
    });
    
    setTimeout(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage) {
            activePage.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            activePage.style.opacity = '1';
            activePage.style.transform = 'translateY(0)';
        }
    }, 100);
});

// Инициализация функций безопасности
function initSecurityFeatures() {
    // Переключатель двухфакторной аутентификации
    const twoFAToggle = document.getElementById('2fa-toggle');
    const twoFASetup = document.getElementById('2fa-setup');
    
    if (twoFAToggle) {
        twoFAToggle.addEventListener('change', function() {
            if (this.checked) {
                twoFASetup.style.display = 'block';
                
                // Отправляем запрос на включение 2FA
                const formData = new FormData();
                formData.append('action', 'enable_2fa');
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('Двухфакторная аутентификация включена.');
                    } else {
                        alert('Ошибка включения 2FA: ' + data.message);
                        this.checked = false;
                        twoFASetup.style.display = 'none';
                    }
                })
                .catch(error => {
                    alert('Ошибка включения 2FA: ' + error.message);
                    this.checked = false;
                    twoFASetup.style.display = 'none';
                });
            } else {
                twoFASetup.style.display = 'none';
                
                // Отправляем запрос на отключение 2FA
                if (confirm('Вы уверены, что хотите отключить двухфакторную аутентификацию?')) {
                    const formData = new FormData();
                    formData.append('action', 'disable_2fa');
                    
                    fetch('index.php', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            alert('Двухфакторная аутентификация отключена.');
                        } else {
                            alert('Ошибка отключения 2FA: ' + data.message);
                            this.checked = true;
                            twoFASetup.style.display = 'block';
                        }
                    })
                    .catch(error => {
                        alert('Ошибка отключения 2FA: ' + error.message);
                        this.checked = true;
                        twoFASetup.style.display = 'block';
                    });
                } else {
                    this.checked = true;
                    twoFASetup.style.display = 'block';
                }
            }
        });
    }
    
    // Переключатель ограничения по IP
    const ipRestrictionToggle = document.getElementById('ip-restriction-toggle');
    const ipRestrictionSetup = document.getElementById('ip-restriction-setup');
    
    if (ipRestrictionToggle) {
        ipRestrictionToggle.addEventListener('change', function() {
            if (this.checked) {
                ipRestrictionSetup.style.display = 'block';
            } else {
                ipRestrictionSetup.style.display = 'none';
                
                // Здесь можно добавить запрос на очистку списка разрешенных IP
                if (confirm('Вы уверены, что хотите снять ограничения по IP?')) {
                    // Очищаем список разрешенных IP (в реальной реализации)
                } else {
                    this.checked = true;
                    ipRestrictionSetup.style.display = 'block';
                }
            }
        });
    }
    
    // Добавление IP-адреса
    const addIPButton = document.getElementById('add-ip');
    const newIPInput = document.getElementById('new-ip');
    
    if (addIPButton && newIPInput) {
        addIPButton.addEventListener('click', function() {
            const ip = newIPInput.value.trim();
            if (ip) {
                // Проверка валидности IP-адреса (упрощенная)
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (ipRegex.test(ip)) {
                    // Отправляем запрос на добавление IP
                    const formData = new FormData();
                    formData.append('action', 'add_allowed_ip');
                    formData.append('user_id', 1); // Для демонстрации
                    formData.append('ip', ip);
                    
                    fetch('index.php', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            alert('IP-адрес добавлен.');
                            window.location.reload();
                        } else {
                            alert('Ошибка добавления IP: ' + data.message);
                        }
                    })
                    .catch(error => {
                        alert('Ошибка добавления IP: ' + error.message);
                    });
                } else {
                    alert('Введите корректный IP-адрес');
                }
            }
        });
    }
    
    // Обработчики для кнопок удаления IP
    const removeIPButtons = document.querySelectorAll('.remove-ip');
    removeIPButtons.forEach(button => {
        button.addEventListener('click', function() {
            const ip = this.getAttribute('data-ip');
            if (confirm(`Вы уверены, что хотите удалить IP-адрес ${ip}?`)) {
                // Отправляем запрос на удаление IP
                const formData = new FormData();
                formData.append('action', 'remove_allowed_ip');
                formData.append('user_id', 1); // Для демонстрации
                formData.append('ip', ip);
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('IP-адрес удален.');
                        window.location.reload();
                    } else {
                        alert('Ошибка удаления IP: ' + data.message);
                    }
                })
                .catch(error => {
                    alert('Ошибка удаления IP: ' + error.message);
                });
            }
        });
    });
    
    // Обработчики изменения ролей пользователей
    const userRoleSelects = document.querySelectorAll('.user-role');
    userRoleSelects.forEach(select => {
        select.addEventListener('change', function() {
            const userId = this.getAttribute('data-user-id');
            const role = this.value;
            
            // Отправляем запрос на обновление роли
            const formData = new FormData();
            formData.append('action', 'update_user_role');
            formData.append('user_id', userId);
            formData.append('role', role);
            
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Роль пользователя обновлена.');
                } else {
                    alert('Ошибка обновления роли: ' + data.message);
                }
            })
            .catch(error => {
                alert('Ошибка обновления роли: ' + error.message);
            });
        });
    });
    
    // Обработчики удаления пользователей
    const deleteUserButtons = document.querySelectorAll('.delete-user');
    deleteUserButtons.forEach(button => {
        button.addEventListener('click', function() {
            const userId = this.getAttribute('data-user-id');
            
            if (confirm('Вы уверены, что хотите удалить этого пользователя?')) {
                // Отправляем запрос на удаление пользователя
                const formData = new FormData();
                formData.append('action', 'delete_user');
                formData.append('user_id', userId);
                
                fetch('index.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('Пользователь удален.');
                        window.location.reload();
                    } else {
                        alert('Ошибка удаления пользователя: ' + data.message);
                    }
                })
                .catch(error => {
                    alert('Ошибка удаления пользователя: ' + error.message);
                });
            }
        });
    });
}

// Инициализация обработчиков модальных окон
function initModalHandlers() {
    // Обработчики закрытия модальных окон
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Закрытие модального окна при клике вне его
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
}

// Инициализация обработчиков форм
function initFormHandlers() {
    // Обработчик формы добавления сервера
    const addServerForm = document.getElementById('add-server-form');
    if (addServerForm) {
        addServerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            formData.append('action', 'add_server');
            
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Сервер добавлен успешно!');
                    window.location.reload();
                } else {
                    alert('Ошибка добавления сервера: ' + data.message);
                }
            })
            .catch(error => {
                alert('Ошибка добавления сервера: ' + error.message);
            });
        });
    }
    
    // Обработчик формы добавления плагина
    const addPluginForm = document.getElementById('add-plugin-form');
    if (addPluginForm) {
        addPluginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            formData.append('action', 'add_plugin');
            
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Плагин добавлен успешно!');
                    window.location.reload();
                } else {
                    alert('Ошибка добавления плагина: ' + data.message);
                }
            })
            .catch(error => {
                alert('Ошибка добавления плагина: ' + error.message);
            });
        });
    }
    
    // Обработчик формы настроек уведомлений
    const notificationsForm = document.getElementById('notifications-form');
    if (notificationsForm) {
        notificationsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            formData.append('action', 'save_notifications');
            
            // Собираем настройки уведомлений
            const settings = {
                email_enabled: this.querySelector('[name="email_enabled"]').checked,
                email_address: this.querySelector('[name="email_address"]').value,
                telegram_enabled: this.querySelector('[name="telegram_enabled"]').checked,
                telegram_token: this.querySelector('[name="telegram_token"]').value,
                telegram_chat_id: this.querySelector('[name="telegram_chat_id"]').value,
                discord_enabled: this.querySelector('[name="discord_enabled"]').checked,
                discord_webhook: this.querySelector('[name="discord_webhook"]').value,
                notifications: {}
            };
            
            // Собираем типы уведомлений
            const notificationCheckboxes = this.querySelectorAll('[name^="notifications["]');
            notificationCheckboxes.forEach(checkbox => {
                const name = checkbox.name.match(/\[(.*?)\]/)[1];
                settings.notifications[name] = checkbox.checked;
            });
            
            formData.append('settings', JSON.stringify(settings));
            
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Настройки уведомлений сохранены!');
                } else {
                    alert('Ошибка сохранения настроек: ' + data.message);
                }
            })
            .catch(error => {
                alert('Ошибка сохранения настроек: ' + error.message);
            });
        });
    }
    
    // Обработчик формы добавления задачи
    const addTaskForm = document.getElementById('add-task-form');
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            formData.append('action', 'add_task');
            
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Задача добавлена успешно!');
                    window.location.reload();
                } else {
                    alert('Ошибка добавления задачи: ' + data.message);
                }
            })
            .catch(error => {
                alert('Ошибка добавления задачи: ' + error.message);
            });
        });
    }
}