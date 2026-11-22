#!/bin/sh
# Обновление «Орбиты» на сервере до последней версии из main.
# Запуск: sudo sh /opt/orbita/deploy/update.sh
set -eu
cd /opt/orbita
echo "→ Скачиваю обновления"
runuser -u orbita -- git pull --ff-only origin main
echo "→ Ставлю зависимости"
runuser -u orbita -- npm ci --omit=dev --no-audit --no-fund
echo "→ Перезапускаю службу"
systemctl restart orbita
sleep 2
if curl -fsS http://127.0.0.1:3000/healthz >/dev/null; then
  echo "✓ Готово: $(runuser -u orbita -- git log -1 --format='%h %s')"
else
  echo "✗ Сервис не отвечает. Логи: journalctl -u orbita -n 50"; exit 1
fi
