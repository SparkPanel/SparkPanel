<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>@yield('title') | SparkPanel</title>
        <!-- Tell the browser to be responsive to screen width -->
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <!-- SparkPanel Styles -->
        <link rel="stylesheet" href="/css/sparkpanel.css">
        <!-- Custom Admin Theme -->
        <link rel="stylesheet" href="/css/admin-custom.css">
        <!-- Theme Scripts -->
        <script>
            // Проверка предпочитаемой темы пользователя
            const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)").matches;
            
            // Установка темы из localStorage или по умолчанию темной
            const currentTheme = localStorage.getItem("theme") || (prefersDarkScheme ? "dark" : "light");
            if (currentTheme === "dark") {
                document.documentElement.classList.add("dark-theme");
            }
            
            // Функция для переключения темы
            function toggleTheme() {
                document.documentElement.classList.toggle("dark-theme");
                const newTheme = document.documentElement.classList.contains("dark-theme") ? "dark" : "light";
                localStorage.setItem("theme", newTheme);
            }
        </script>
        @stack('head-scripts')
    </head>
    <body class="spark-body">
        <!-- Mobile Menu -->
        <div id="mobile-menu" class="spark-mobile-menu">
            <div class="p-4">
                <div class="flex justify-between items-center mb-6">
                    <div class="flex items-center">
                        <svg class="h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span class="ml-2 text-xl font-bold text-indigo-400">SparkPanel</span>
                    </div>
                    <button onclick="toggleMobileMenu()" class="text-gray-400 hover:text-white">
                        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                        </svg>
                    </button>
                </div>
                
                <nav class="space-y-2">
                    <a href="{{ route('admin.index') }}" class="flex items-center px-4 py-3 rounded-lg text-indigo-100 bg-indigo-700">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
                        </svg>
                        Главная
                    </a>
                    <a href="{{ route('admin.servers') }}" class="flex items-center px-4 py-3 rounded-lg text-gray-300 hover:bg-indigo-700 hover:text-white transition-colors duration-200">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm10 10H5a1 1 0 010-2h10a1 1 0 010 2z" clip-rule="evenodd"></path>
                        </svg>
                        Серверы
                    </a>
                    <a href="{{ route('admin.users') }}" class="flex items-center px-4 py-3 rounded-lg text-gray-300 hover:bg-indigo-700 hover:text-white transition-colors duration-200">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 012 2v6a2 2 0 01-2 2H2a2 2 0 01-2-2V10a2 2 0 012-2h16z"></path>
                        </svg>
                        Пользователи
                    </a>
                    <a href="{{ route('admin.settings') }}" class="flex items-center px-4 py-3 rounded-lg text-gray-300 hover:bg-indigo-700 hover:text-white transition-colors duration-200">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"></path>
                        </svg>
                        Настройки
                    </a>
                </nav>
            </div>
        </div>
        
        <!-- Mobile Menu Overlay -->
        <div id="mobile-menu-overlay" class="spark-mobile-menu-overlay" onclick="toggleMobileMenu()"></div>
        
        <!-- Main Content Wrapper -->
        <div class="flex">
            <!-- Sidebar Desktop -->
            <div class="hidden md:block md:w-64 flex-shrink-0">
                <nav class="space-y-2 p-4">
                    <a href="{{ route('admin.index') }}" class="flex items-center px-4 py-3 rounded-lg text-indigo-100 bg-indigo-700">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
                        </svg>
                        Главная
                    </a>
                    <a href="{{ route('admin.servers') }}" class="flex items-center px-4 py-3 rounded-lg text-gray-300 hover:bg-indigo-700 hover:text-white transition-colors duration-200">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm10 10H5a1 1 0 010-2h10a1 1 0 010 2z" clip-rule="evenodd"></path>
                        </svg>
                        Серверы
                    </a>
                    <a href="{{ route('admin.users') }}" class="flex items-center px-4 py-3 rounded-lg text-gray-300 hover:bg-indigo-700 hover:text-white transition-colors duration-200">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 012 2v6a2 2 0 01-2 2H2a2 2 0 01-2-2V10a2 2 0 012-2h16z"></path>
                        </svg>
                        Пользователи
                    </a>
                    <a href="{{ route('admin.settings') }}" class="flex items-center px-4 py-3 rounded-lg text-gray-300 hover:bg-indigo-700 hover:text-white transition-colors duration-200">
                        <svg class="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"></path>
                        </svg>
                        Настройки
                    </a>
                </nav>
            </div>
            
            <!-- Main Content -->
            <div class="flex-1">
                <div class="mb-6 pb-4 border-b border-gray-700">
                    <h1 class="text-2xl font-bold text-white">@yield('title')</h1>
                    @if(isset($breadcrumbs))
                        <nav class="mt-1 flex" aria-label="Breadcrumb">
                            <ol class="spark-breadcrumbs flex items-center space-x-1">
                                @foreach ($breadcrumbs as $breadcrumb)
                                    <li>
                                        @if (!$loop->last)
                                            <a href="{{ $breadcrumb['url'] }}">{{ $breadcrumb['name'] }}</a>
                                            <span class="separator">/</span>
                                        @else
                                            <span>{{ $breadcrumb['name'] }}</span>
                                        @endif
                                    </li>
                                @endforeach
                            </ol>
                        </nav>
                    @endif
                </div>

                <div class="py-4">
                    @if(session('success'))
                        <div class="mb-4 p-4 bg-green-800 text-green-100 rounded-lg shadow-md">
                            {{ session('success') }}
                        </div>
                    @endif

                    @if($errors->any())
                        <div class="mb-4 p-4 bg-red-800 text-red-100 rounded-lg shadow-md">
                            <ul class="list-disc pl-5 space-y-1">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    @endif

                    <!-- Flash Notifications -->
                    @if(session('success'))
                        <script>
                            document.addEventListener('DOMContentLoaded', function() {
                                showNotification('{{ session('success') }}', 'success');
                            });
                        </script>
                    @endif

                    @if(session('error'))
                        <script>
                            document.addEventListener('DOMContentLoaded', function() {
                                showNotification('{{ session('error') }}', 'error');
                            });
                        </script>
                    @endif

                    @if(session('warning'))
                        <script>
                            document.addEventListener('DOMContentLoaded', function() {
                                showNotification('{{ session('warning') }}', 'warning');
                            });
                        </script>
                    @endif

                    @yield('content')
                </div>
            </div>
        </div>
        @section('footer-scripts')
            <script src="/js/keyboard.polyfill.js" type="application/javascript"></script>
            <script>keyboardeventKeyPolyfill.polyfill();</script>

            {!! Theme::js('vendor/jquery/jquery.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/sweetalert/sweetalert.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/bootstrap/bootstrap.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/slimscroll/jquery.slimscroll.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/adminlte/app.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/bootstrap-notify/bootstrap-notify.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/select2/select2.full.min.js?t={cache-version}') !!}
            {!! Theme::js('js/admin/functions.js?t={cache-version}') !!}
            <script src="/js/autocomplete.js" type="application/javascript"></script>

            @if(Auth::user()->root_admin)
                <script>
                    $('#logoutButton').on('click', function (event) {
                        event.preventDefault();

                        var that = this;
                        swal({
                            title: 'Do you want to log out?',
                            type: 'warning',
                            showCancelButton: true,
                            confirmButtonColor: '#d9534f',
                            cancelButtonColor: '#d33',
                            confirmButtonText: 'Log out'
                        }, function () {
                             $.ajax({
                                type: 'POST',
                                url: '{{ route('auth.logout') }}',
                                data: {
                                    _token: '{{ csrf_token() }}'
                                },complete: function () {
                                    window.location.href = '{{route('auth.login')}}';
                                }
                        });
                    });
                });
                </script>
            @endif

            <script>
                $(function () {
                    $('[data-toggle="tooltip"]').tooltip();
                })
            </script>
        @show

    <!-- Footer -->
    <footer class="spark-footer">
        <div class="spark-container">
            <p>© {{ date('Y') }} SparkPanel. Все права защищены.</p>
            <p class="mt-2 text-sm">Версия: {{ config('app.version', '1.0.0') }}</p>
        </div>
    </footer>
    
    <!-- SparkPanel Scripts -->
    <script>
        // Мобильное меню
        function toggleMobileMenu() {
            const mobileMenu = document.getElementById('mobile-menu');
            const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
            mobileMenu.classList.toggle('open');
            mobileMenuOverlay.classList.toggle('show');
        }
        
        // Пользовательское меню
        function toggleUserMenu() {
            const userMenu = document.getElementById('user-menu');
            userMenu.classList.toggle('hidden');
        }
        
        // Переключение темы
        function toggleTheme() {
            document.documentElement.classList.toggle('dark-theme');
            const isDark = document.documentElement.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            
            // Обновление иконки темы
            const themeIcon = document.getElementById('theme-icon');
            if (isDark) {
                themeIcon.innerHTML = `
                    <path d="M20.354 15.354A9 9 0 018.646 10.646" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                `;
            } else {
                themeIcon.innerHTML = `
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                `;
            }
        }
        
        // Закрытие меню при клике вне их области
        document.addEventListener('click', function(event) {
            const userMenu = document.getElementById('user-menu');
            const userButton = document.querySelector('[onclick="toggleUserMenu()"]');
            
            if (!userMenu.contains(event.target) && !userButton.contains(event.target)) {
                userMenu.classList.add('hidden');
            }
        });
        
        // Уведомления
        function showNotification(message, type = 'success') {
            const notification = document.createElement('div');
            notification.className = `spark-notification ${type === 'success' ? 'success' : type === 'error' ? 'error' : 'warning'}`;
            notification.innerHTML = `
                <div class="spark-notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div>${message}</div>
                <div class="spark-notification-close" onclick="this.parentElement.remove()">&times;</div>
            `;
            
            document.body.appendChild(notification);
            
            // Автоматическое исчезновение через 5 секунд
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }, 5000);
            
            // Анимация появления
            requestAnimationFrame(() => {
                notification.classList.add('show');
            });
        }
        
        // Пример использования уведомлений
        @if(session('success'))
            window.addEventListener('DOMContentLoaded', () => {
                showNotification('{{ session('success') }}', 'success');
            });
        @endif
        
        @if($errors->any())
            window.addEventListener('DOMContentLoaded', () => {
                @foreach ($errors->all() as $error)
                    showNotification('{{ $error }}', 'error');
                @endforeach
            });
        @endif
    </script>
    @stack('scripts')
</body>
</html>
