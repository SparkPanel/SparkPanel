<?php

use Illuminate\Support\Str;
use SparkPanel\Helpers\Time;

return [
    /*
    |--------------------------------------------------------------------------
    | Default Database Connection Name
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the database connections below you wish
    | to use as your default connection for database operations. This is
    | the connection which will be utilized unless another connection
    | is explicitly specified when you execute a query / statement.
    |
    */

    'default' => env('DB_CONNECTION', 'mysql'),

    /*
    |--------------------------------------------------------------------------
    | Database Connections
    |--------------------------------------------------------------------------
    |
    | Here are each of the database connections setup for your application.
    | Of course, examples of configuring each database platform that is
    | supported by Laravel is shown below to make development simple.
    |
    |
    | All database work in Laravel is done through the PHP PDO facilities
    | so make sure you have the driver for your particular database of
    | choice installed on your machine before you begin development.
    |
    */

    'connections' => [
        'mysql' => [
            'driver' => 'mysql',
            'url' => env('DATABASE_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'forge'),
            'username' => env('DB_USERNAME', 'forge'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                PDO::MYSQL_ATTR_SSL_CA => env('DB_SSL_CA'),
            ]) : [],
        ],

        'mariadb' => [
            'driver' => 'mariadb',
            'url' => env('DATABASE_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'forge'),
            'username' => env('DB_USERNAME', 'forge'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                PDO::MYSQL_ATTR_SSL_CA => env('DB_SSL_CA'),
            ]) : [],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Migration Repository Table
    |--------------------------------------------------------------------------
    |
    | This table keeps track of all the migrations that have already run for
    | your application. Using this information, we can determine which of
    | the migrations on disk haven't actually been run on the database.
    |
    */

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redis Databases
    |--------------------------------------------------------------------------
    |
    | Redis is an open source, fast, and advanced key-value store that also
    | provides a richer body of commands than a typical key-value system
    | such as Memcached. You may define your connection settings here.
    |
    */

    'redis' => [
        'client' => env('REDIS_CLIENT', 'predis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug(env('APP_NAME', 'sparkpanel'), '_') . '_database_'),
        ],

        'default' => [
            'scheme' => env('REDIS_SCHEME', 'tcp'),
            'path' => env('REDIS_PATH', '/run/redis/redis.sock'),
            'host' => env('REDIS_HOST', 'localhost'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', 6379),
            'database' => env('REDIS_DATABASE', 0),
            'context' => extension_loaded('redis') && env('REDIS_CLIENT') === 'phpredis' ? [
                'stream' => array_filter([
                    'verify_peer' => env('REDIS_VERIFY_PEER', true),
                    'verify_peer_name' => env('REDIS_VERIFY_PEER_NAME', true),
                    'cafile' => env('REDIS_CAFILE'),
                    'local_cert' => env('REDIS_LOCAL_CERT'),
                    'local_pk' => env('REDIS_LOCAL_PK'),
                ]),
            ] : [],
        ],

        'sessions' => [
            'scheme' => env('REDIS_SCHEME', 'tcp'),
            'path' => env('REDIS_PATH', '/run/redis/redis.sock'),
            'host' => env('REDIS_HOST', 'localhost'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', 6379),
            'database' => env('REDIS_DATABASE_SESSIONS', 1),
            'context' => extension_loaded('redis') && env('REDIS_CLIENT') === 'phpredis' ? [
                'stream' => array_filter([
                    'verify_peer' => env('REDIS_VERIFY_PEER', true),
                    'verify_peer_name' => env('REDIS_VERIFY_PEER_NAME', true),
                    'cafile' => env('REDIS_CAFILE'),
                    'local_cert' => env('REDIS_LOCAL_CERT'),
                    'local_pk' => env('REDIS_LOCAL_PK'),
                ]),
            ] : [],
        ],
    ],
];
