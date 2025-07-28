#!/usr/bin/env python3
"""
Модуль мониторинга ресурсов сервера SparkPanel
"""

import psutil
import time
import json
import threading
from datetime import datetime
from typing import Dict, List, Any, Callable


class ResourceMonitor:
    """Класс для мониторинга ресурсов сервера"""
    
    def __init__(self):
        """Инициализация монитора ресурсов"""
        self.metrics = {
            'cpu': [],
            'memory': [],
            'disk': [],
            'network': [],
            'minecraft': []
        }
        self.alerts = []
        self.is_monitoring = False
        self.monitoring_thread = None
        self.alert_thresholds = {
            'cpu': 80,  # Порог CPU в процентах
            'memory': 85,  # Порог памяти в процентах
            'disk': 90,  # Порог диска в процентах
        }
        self.alert_callbacks: List[Callable] = []
        
    def start_monitoring(self, interval: int = 5):
        """
        Запуск мониторинга ресурсов
        
        Args:
            interval (int): Интервал мониторинга в секундах
        """
        if not self.is_monitoring:
            self.is_monitoring = True
            self.monitoring_thread = threading.Thread(
                target=self._monitor_loop, 
                args=(interval,),
                daemon=True
            )
            self.monitoring_thread.start()
            
    def stop_monitoring(self):
        """Остановка мониторинга ресурсов"""
        self.is_monitoring = False
        if self.monitoring_thread:
            self.monitoring_thread.join()
            
    def _monitor_loop(self, interval: int):
        """
        Основной цикл мониторинга
        
        Args:
            interval (int): Интервал мониторинга в секундах
        """
        while self.is_monitoring:
            try:
                # Сбор метрик
                metrics = self._collect_metrics()
                
                # Сохранение метрик
                self._store_metrics(metrics)
                
                # Проверка пороговых значений
                self._check_alerts(metrics)
                
                # Ожидание до следующего сбора
                time.sleep(interval)
                
            except Exception as e:
                print(f"Ошибка мониторинга: {e}")
                
    def _collect_metrics(self) -> Dict[str, Any]:
        """
        Сбор метрик системы
        
        Returns:
            Dict[str, Any]: Словарь с метриками
        """
        metrics = {}
        
        # Сбор метрик CPU
        metrics['cpu'] = {
            'percent': psutil.cpu_percent(interval=1),
            'cores': psutil.cpu_count(),
            'freq': psutil.cpu_freq().current if psutil.cpu_freq() else 0
        }
        
        # Сбор метрик памяти
        memory = psutil.virtual_memory()
        metrics['memory'] = {
            'total': memory.total,
            'available': memory.available,
            'used': memory.used,
            'percent': memory.percent
        }
        
        # Сбор метрик диска
        disk = psutil.disk_usage('/')
        metrics['disk'] = {
            'total': disk.total,
            'used': disk.used,
            'free': disk.free,
            'percent': (disk.used / disk.total) * 100 if disk.total > 0 else 0
        }
        
        # Сбор метрик сети
        net_io = psutil.net_io_counters()
        metrics['network'] = {
            'bytes_sent': net_io.bytes_sent,
            'bytes_recv': net_io.bytes_recv,
            'packets_sent': net_io.packets_sent,
            'packets_recv': net_io.packets_recv
        }
        
        # Сбор метрик Minecraft (симуляция)
        metrics['minecraft'] = self._collect_minecraft_metrics()
        
        # Добавление временной метки
        metrics['timestamp'] = datetime.now().isoformat()
        
        return metrics
        
    def _collect_minecraft_metrics(self) -> Dict[str, Any]:
        """
        Сбор метрик Minecraft-сервера (симуляция)
        
        Returns:
            Dict[str, Any]: Словарь с метриками Minecraft
        """
        # В реальной реализации здесь будет взаимодействие с сервером
        # Например, через RCON или API
        
        return {
            'players_online': 12,  # Симуляция
            'players_max': 20,
            'tps': 19.8,  #_ticks per second
            'uptime': 3600,  # секунд
            'chunks_loaded': 1250,
            'entities': 450
        }
        
    def _store_metrics(self, metrics: Dict[str, Any]):
        """
        Сохранение метрик
        
        Args:
            metrics (Dict[str, Any]): Метрики для сохранения
        """
        timestamp = metrics['timestamp']
        
        # Сохраняем метрики с ограничением по количеству записей
        max_records = 1000  # Максимум записей для каждой метрики
        
        for metric_type in ['cpu', 'memory', 'disk', 'network', 'minecraft']:
            if metric_type in metrics:
                self.metrics[metric_type].append({
                    'timestamp': timestamp,
                    'data': metrics[metric_type]
                })
                
                # Ограничиваем количество записей
                if len(self.metrics[metric_type]) > max_records:
                    self.metrics[metric_type] = self.metrics[metric_type][-max_records:]
                    
    def _check_alerts(self, metrics: Dict[str, Any]):
        """
        Проверка пороговых значений и генерация оповещений
        
        Args:
            metrics (Dict[str, Any]): Метрики для проверки
        """
        alerts = []
        
        # Проверка CPU
        if metrics['cpu']['percent'] > self.alert_thresholds['cpu']:
            alerts.append({
                'type': 'cpu',
                'level': 'warning',
                'message': f'Высокая нагрузка CPU: {metrics["cpu"]["percent"]:.1f}%',
                'timestamp': metrics['timestamp']
            })
            
        # Проверка памяти
        if metrics['memory']['percent'] > self.alert_thresholds['memory']:
            alerts.append({
                'type': 'memory',
                'level': 'warning',
                'message': f'Высокое использование памяти: {metrics["memory"]["percent"]:.1f}%',
                'timestamp': metrics['timestamp']
            })
            
        # Проверка диска
        if metrics['disk']['percent'] > self.alert_thresholds['disk']:
            alerts.append({
                'type': 'disk',
                'level': 'critical',
                'message': f'Недостаточно места на диске: {metrics["disk"]["percent"]:.1f}% занято',
                'timestamp': metrics['timestamp']
            })
            
        # Проверка TPS Minecraft
        if metrics['minecraft']['tps'] < 15:
            alerts.append({
                'type': 'minecraft',
                'level': 'warning',
                'message': f'Низкий TPS сервера: {metrics["minecraft"]["tps"]:.1f}',
                'timestamp': metrics['timestamp']
            })
            
        # Добавляем оповещения
        for alert in alerts:
            self.add_alert(alert)
            
    def add_alert(self, alert: Dict[str, Any]):
        """
        Добавление оповещения
        
        Args:
            alert (Dict[str, Any]): Оповещение для добавления
        """
        self.alerts.append(alert)
        
        # Ограничиваем количество оповещений
        if len(self.alerts) > 100:
            self.alerts = self.alerts[-100:]
            
        # Вызываем callback функции
        for callback in self.alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                print(f"Ошибка вызова callback функции: {e}")
                
    def add_alert_callback(self, callback: Callable):
        """
        Добавление callback функции для оповещений
        
        Args:
            callback (Callable): Функция для вызова при оповещениях
        """
        self.alert_callbacks.append(callback)
        
    def get_metrics_history(self, metric_type: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Получение истории метрик
        
        Args:
            metric_type (str): Тип метрик
            limit (int): Максимальное количество записей
            
        Returns:
            List[Dict[str, Any]]: История метрик
        """
        if metric_type in self.metrics:
            return self.metrics[metric_type][-limit:]
        return []
        
    def get_current_metrics(self) -> Dict[str, Any]:
        """
        Получение текущих метрик
        
        Returns:
            Dict[str, Any]: Текущие метрики
        """
        current_metrics = {}
        for metric_type in self.metrics:
            if self.metrics[metric_type]:
                current_metrics[metric_type] = self.metrics[metric_type][-1]['data']
        return current_metrics
        
    def get_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Получение списка оповещений
        
        Args:
            limit (int): Максимальное количество оповещений
            
        Returns:
            List[Dict[str, Any]]: Список оповещений
        """
        return self.alerts[-limit:]
        
    def clear_alerts(self):
        """Очистка списка оповещений"""
        self.alerts.clear()
        
    def set_alert_threshold(self, metric_type: str, threshold: float):
        """
        Установка порогового значения для оповещений
        
        Args:
            metric_type (str): Тип метрики
            threshold (float): Пороговое значение
        """
        if metric_type in self.alert_thresholds:
            self.alert_thresholds[metric_type] = threshold
            
    def get_alert_thresholds(self) -> Dict[str, float]:
        """
        Получение пороговых значений для оповещений
        
        Returns:
            Dict[str, float]: Пороговые значения
        """
        return self.alert_thresholds.copy()


class MinecraftServerMonitor:
    """Класс для мониторинга Minecraft-сервера"""
    
    def __init__(self, server_address: str, rcon_port: int = 25575, rcon_password: str = ""):
        """
        Инициализация монитора Minecraft-сервера
        
        Args:
            server_address (str): Адрес сервера
            rcon_port (int): Порт RCON
            rcon_password (str): Пароль RCON
        """
        self.server_address = server_address
        self.rcon_port = rcon_port
        self.rcon_password = rcon_password
        self.is_connected = False
        
    def connect_rcon(self) -> bool:
        """
        Подключение к RCON сервера
        
        Returns:
            bool: Результат подключения
        """
        # В реальной реализации здесь будет код подключения к RCON
        # Пока возвращаем True для симуляции
        self.is_connected = True
        return True
        
    def disconnect_rcon(self):
        """Отключение от RCON сервера"""
        self.is_connected = False
        
    def get_server_status(self) -> Dict[str, Any]:
        """
        Получение статуса сервера
        
        Returns:
            Dict[str, Any]: Статус сервера
        """
        # В реальной реализации здесь будет код получения статуса через RCON
        # Пока возвращаем симулированные данные
        return {
            'online': True,
            'players': {
                'online': 12,
                'max': 20,
                'list': ['Player1', 'Player2', 'Player3']  # Пример
            },
            'version': '1.20.1',
            'motd': 'SparkPanel Minecraft Server',
            'tps': 19.8
        }
        
    def send_rcon_command(self, command: str) -> str:
        """
        Отправка команды через RCON
        
        Args:
            command (str): Команда для отправки
            
        Returns:
            str: Результат выполнения команды
        """
        # В реальной реализации здесь будет код отправки команды через RCON
        # Пока возвращаем симулированный ответ
        if command == 'list':
            return "There are 12 of a max 20 players online: Player1, Player2, Player3"
        elif command == 'tps':
            return "TPS: 19.8"
        else:
            return f"Command '{command}' executed"


def main():
    """Тестирование модуля мониторинга"""
    print("Тестирование модуля мониторинга SparkPanel")
    
    # Создание монитора
    monitor = ResourceMonitor()
    
    # Добавление callback для оповещений
    def alert_callback(alert):
        print(f"Оповещение: {alert['message']}")
        
    monitor.add_alert_callback(alert_callback)
    
    # Запуск мониторинга
    print("Запуск мониторинга...")
    monitor.start_monitoring(interval=2)
    
    # Ожидание некоторое время
    time.sleep(10)
    
    # Получение текущих метрик
    current_metrics = monitor.get_current_metrics()
    print("\nТекущие метрики:")
    for metric_type, data in current_metrics.items():
        print(f"  {metric_type}: {data}")
        
    # Получение истории CPU
    cpu_history = monitor.get_metrics_history('cpu', limit=5)
    print(f"\nИстория CPU (последние 5 записей): {len(cpu_history)}")
    
    # Получение оповещений
    alerts = monitor.get_alerts()
    print(f"\nОповещения: {len(alerts)}")
    
    # Остановка мониторинга
    print("\nОстановка мониторинга...")
    monitor.stop_monitoring()
    
    # Тестирование монитора Minecraft
    print("\nТестирование монитора Minecraft...")
    mc_monitor = MinecraftServerMonitor("localhost")
    mc_status = mc_monitor.get_server_status()
    print(f"Статус сервера: {mc_status}")


if __name__ == "__main__":
    main()