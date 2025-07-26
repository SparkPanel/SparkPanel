#!/bin/bash

# Удаление записи для 95.215.56.141 из known_hosts

KNOWN_HOSTS="~/.ssh/known_hosts"
TEMP_FILE="$(mktemp)"

if [ -f "$KNOWN_HOSTS" ]; then
    grep -v "^95.215.56.141\[[:space:]]\|^\[95.215.56.141\]:" "$KNOWN_HOSTS" > "$TEMP_FILE"
    mv "$TEMP_FILE" "$KNOWN_HOSTS"
    echo "Запись для 95.215.56.141 удалена из known_hosts"
else
    echo "Файл known_hosts не найден"
fi