# Перенос «Орбиты» на свой сервер

Пошаговая инструкция для VPS на Ubuntu 22.04, 24.04 или 26.04 (на Debian 12 команды те же). По ней «Орбита» развернута на VPS в Москве (1 ядро, 2 ГБ памяти); заметки с того развертывания — в [`SERVER-NOTES.md`](SERVER-NOTES.md).
Результат: сайт открывается по `https://ваш-домен`, сам перезапускается после сбоев и перезагрузки сервера, сертификат продлевается автоматически, демо-данные обновляются каждую ночь.

## Хватит ли сервера

Да, с большим запасом.

| Ресурс | Есть | Нужно «Орбите» |
| --- | --- | --- |
| Процессор | 1 ядро | Хватит на десятки одновременных пользователей |
| Память | 2 ГБ | Около 100–150 МБ (Node.js) + 30–50 МБ (Caddy) |
| Диск | 30 ГБ NVMe | Код, зависимости и база: около 150 МБ. Система: 3–5 ГБ |
| Сеть | до 25 Гбит/с | Страницы весят сотни килобайт |

База — один файл SQLite, отдельный сервер базы данных не нужен.

## Как это будет устроено

```
Браузер ──HTTPS──► Caddy (порты 80/443, сертификат Let's Encrypt)
                     │
                     └──► Node.js «Орбита» на 127.0.0.1:3000 (служба systemd)
                              │
                              └──► /var/lib/orbita/orbita.db (SQLite)
```

- **Caddy** — веб-сервер, который сам получает и продлевает HTTPS-сертификат. Настраивается тремя строками.
- **systemd** запускает приложение при старте сервера и перезапускает его при сбое.
- Приложение слушает только `127.0.0.1`, поэтому снаружи его порт не виден. Пользователи попадают на сайт только через Caddy.

> **Почему HTTPS обязателен.** В боевом режиме (`NODE_ENV=production`) cookie входа помечены флагом `Secure` и префиксом `__Host-`. Браузер не сохранит их на сайте без HTTPS, и войти не получится. Поэтому нужен домен или HTTPS по IP-адресу: с 2026 года Let's Encrypt выдает короткоживущие сертификаты и на IP (см. шаг 10, вариант без домена).

## Что подготовить

1. **Сервер** с Ubuntu, его IP-адрес и пароль root (или SSH-ключ). Все это есть в письме или панели хостинга.
2. **Домен** или поддомен, например `orbita.mysite.ru`. Подойдет купленный у любого регистратора. Бесплатный вариант — поддомен в DuckDNS (`имя.duckdns.org`).
3. **Терминал** на своем компьютере: на macOS и Linux — «Терминал», на Windows — PowerShell. Программа `ssh` в них уже есть.

Ниже `203.0.113.10` — IP вашего сервера, `orbita.mysite.ru` — ваш домен. Подставляйте свои значения.

---

## Шаг 1. Направьте домен на сервер

В панели регистратора домена (раздел DNS) добавьте запись:

| Тип | Имя | Значение | TTL |
| --- | --- | --- | --- |
| A | `orbita` (или `@` для корня домена) | `203.0.113.10` | 300 |

Запись начинает работать через 5–30 минут. Проверить можно с компьютера:

```bash
ping orbita.mysite.ru
```

В ответе должен быть IP вашего сервера. Пока запись распространяется, можно делать шаги 2–7.

## Шаг 2. Подключитесь к серверу

```bash
ssh root@203.0.113.10
```

При первом подключении ответьте `yes`, затем введите пароль (символы при вводе не отображаются).

Если хостинг выдал обычного пользователя вместо root, подключайтесь под ним, а перед командами ниже выполните `sudo -i`.

## Шаг 3. Обновите систему и выставите часовой пояс

```bash
apt update && apt -y upgrade
```

```bash
apt -y install git curl ufw ca-certificates gnupg
```

```bash
timedatectl set-timezone Europe/Moscow
```

Часовой пояс нужен, чтобы ночной сброс демо-данных шел по московскому времени. Само приложение всегда считает время по Москве.

## Шаг 4. Включите файрвол

Откройте только SSH и веб-порты:

```bash
ufw allow OpenSSH
```

```bash
ufw allow 80/tcp
```

```bash
ufw allow 443/tcp
```

```bash
ufw --force enable
```

Проверка: `ufw status` должен показать три разрешенных правила. Если у хостинга есть свой файрвол в панели управления, откройте там те же порты 22, 80 и 443.

## Шаг 5. Добавьте файл подкачки (рекомендуется)

При 2 ГБ памяти подкачка — страховка на время установки зависимостей и обновлений системы:

```bash
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

```bash
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Проверка: в выводе `free -h` строка `Swap` показывает 1.0Gi.

## Шаг 6. Установите Node.js 22

«Орбите» нужен Node.js 22.13 или новее (в нем есть встроенный `node:sqlite`). В стандартных репозиториях Ubuntu версия старее, поэтому ставим из официального репозитория NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
```

```bash
bash /tmp/nodesource_setup.sh
```

```bash
apt -y install nodejs
```

Проверка:

```bash
node -v && node --no-warnings -e "require('node:sqlite'); console.log('sqlite ok')"
```

Должно быть `v22.13.0` или выше и `sqlite ok`.

> **Ubuntu 26.04.** В ее репозитории есть свой пакет `nodejs`, и по номеру версии он может оказаться выше пакета NodeSource. Чтобы apt ставил именно NodeSource, до `apt install` закрепите источник:
>
> ```bash
> printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 1001\n' > /etc/apt/preferences.d/99-nodesource-nodejs
> ```

## Шаг 7. Создайте пользователя и скачайте код

Приложение будет работать под отдельным пользователем без прав администратора:

```bash
useradd --system --create-home --home-dir /home/orbita --shell /bin/bash orbita
```

```bash
mkdir -p /opt/orbita /var/lib/orbita && chown orbita:orbita /opt/orbita /var/lib/orbita && chmod 750 /var/lib/orbita
```

Дальше вариант зависит от того, открытый у вас репозиторий или закрытый.

### Вариант А: репозиторий открытый

```bash
runuser -u orbita -- git clone https://github.com/jeenien/e-dekanat.git /opt/orbita
```

### Вариант Б: репозиторий закрытый (deploy key)

Создайте ключ, который дает серверу доступ только на чтение одного репозитория:

```bash
runuser -u orbita -- mkdir -p -m 700 /home/orbita/.ssh
```

```bash
runuser -u orbita -- ssh-keygen -t ed25519 -N "" -f /home/orbita/.ssh/id_ed25519 -C "orbita-server"
```

```bash
cat /home/orbita/.ssh/id_ed25519.pub
```

Скопируйте выведенную строку целиком. На GitHub откройте репозиторий → **Settings → Deploy keys → Add deploy key**, вставьте строку и **не** ставьте галочку «Allow write access». Затем на сервере:

```bash
runuser -u orbita -- ssh -o StrictHostKeyChecking=accept-new -T git@github.com
```

(Ответ «Hi jeenien/e-dekanat! You've successfully authenticated» — значит, все в порядке.)

```bash
runuser -u orbita -- git clone git@github.com:jeenien/e-dekanat.git /opt/orbita
```

### Установите зависимости

```bash
cd /opt/orbita && runuser -u orbita -- npm ci --omit=dev --no-audit --no-fund
```

Это займет около минуты.

## Шаг 8. Задайте настройки и секреты

Все настройки хранятся в одном файле `/etc/orbita.env`, вне папки с кодом. Создайте его вместе со случайным ключом шифрования:

```bash
cat > /etc/orbita.env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATA_DIR=/var/lib/orbita
DATA_KEY=$(openssl rand -base64 32)
EOF
```

```bash
chown root:orbita /etc/orbita.env && chmod 640 /etc/orbita.env
```

Что здесь что:

| Переменная | Зачем |
| --- | --- |
| `NODE_ENV=production` | Боевой режим: защищенные cookie, без отладочных сообщений |
| `HOST=127.0.0.1` | Приложение доступно только через Caddy, напрямую снаружи — нет |
| `PORT=3000` | Внутренний порт, на него смотрит Caddy |
| `DATA_DIR` | Где лежит база |
| `DATA_KEY` | Ключ AES-256 для шифрования персональных полей (зачетка, телефон, e-mail, дата рождения) |

> **Берегите `DATA_KEY`.** Если ключ потерять или поменять, зашифрованные поля в базе нельзя будет прочитать. Для демо-версии это не страшно (база пересоздается, см. шаг 12), но ключ все равно не публикуйте и не коммитьте.

**ИИ-помощник (необязательно).** Без ключа помощник работает на локальных правилах. Чтобы подключить Claude, добавьте строку:

```bash
echo 'ANTHROPIC_API_KEY=ваш_ключ' >> /etc/orbita.env
```

Учтите: API Anthropic доступен не во всех странах. Если сервер находится в неподдерживаемом регионе, запросы будут отклоняться. Тогда помощник продолжит работать в локальном режиме.

## Шаг 9. Запустите приложение как службу

Готовый файл службы лежит в репозитории (`deploy/orbita.service`):

```bash
cp /opt/orbita/deploy/orbita.service /etc/systemd/system/orbita.service
```

```bash
systemctl daemon-reload && systemctl enable --now orbita
```

Проверка:

```bash
systemctl status orbita --no-pager
```

Должно быть `active (running)`. Затем:

```bash
curl -s http://127.0.0.1:3000/healthz
```

Ответ `{"ok":true}` — приложение работает. При первом запуске оно само создает базу с демо-данными.

Служба настроена с защитой: процесс работает от пользователя `orbita` и может писать только в `/var/lib/orbita`. Память ограничена 600 МБ. После сбоя служба перезапускается через 3 секунды.

## Шаг 10. Установите Caddy и включите HTTPS

Установка из официального репозитория Caddy:

```bash
apt -y install debian-keyring debian-archive-keyring apt-transport-https
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
```

```bash
apt update && apt -y install caddy
```

Положите конфиг из репозитория и впишите свой домен:

```bash
cp /opt/orbita/deploy/Caddyfile /etc/caddy/Caddyfile
```

```bash
sed -i 's/orbita.example.ru/orbita.mysite.ru/' /etc/caddy/Caddyfile
```

```bash
systemctl reload caddy
```

К этому моменту DNS-запись из шага 1 должна уже работать: при первом обращении Caddy получит сертификат Let's Encrypt, это занимает до минуты.

### Вариант без домена или в дополнение к нему: HTTPS по IP-адресу

Let's Encrypt выдает сертификаты и на IP-адреса (короткоживущие, около шести дней, Caddy продлевает их сам). Это запасной адрес на случай, если домен у кого-то не открывается. Добавьте в `/etc/caddy/Caddyfile` второй блок со своим IP:

```
203.0.113.10 {
	tls {
		issuer acme {
			profile shortlived
		}
	}
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

Если `caddy validate` не знает слово `profile`, обновите Caddy: `apt -y install --only-upgrade caddy`. Сайт откроется по `https://203.0.113.10`, QR-коды справок, выданных по этому адресу, будут вести на него же.

## Шаг 11. Проверьте сайт

Откройте в браузере `https://orbita.mysite.ru`:

- в адресной строке замок, страница входа открывается;
- вход под `anna` / `Orbita-Anna-2026` работает;
- `https://orbita.mysite.ru/lite` открывает облегченную версию;
- справка из раздела «Заявки» скачивается в PDF, а ее QR-код ведет на `https://orbita.mysite.ru/verify/...`.

Ссылка в QR-коде строится по адресу, с которого открыт сайт. Поэтому новые справки сразу указывают на ваш домен.

## Шаг 12. Ежедневное обновление демо-данных

Даты в демо-данных (пары, дедлайны, мероприятия) отсчитываются от дня создания базы. На Render база пересоздавалась при каждом деплое, а на своем сервере она живет постоянно, и через несколько дней «сегодняшние» события уйдут в прошлое. Таймер пересоздает базу каждую ночь в 04:30:

```bash
cp /opt/orbita/deploy/orbita-reset.service /opt/orbita/deploy/orbita-reset.timer /etc/systemd/system/
```

```bash
systemctl daemon-reload && systemctl enable --now orbita-reset.timer
```

Проверка:

```bash
systemctl list-timers orbita-reset.timer --no-pager
```

В колонке `NEXT` должно стоять ближайшее 04:30. Пересоздать базу прямо сейчас (например, перед показом жюри):

```bash
systemctl start orbita-reset.service
```

Сброс удаляет все, что пользователи сделали на сайте: заявки, отметки, пароли. Демо-аккаунты возвращаются к исходному состоянию. Если сброс не нужен, таймер можно выключить: `systemctl disable --now orbita-reset.timer`.

## Шаг 13. Обновление сайта после изменений в репозитории

После каждого слияния в `main` на сервере выполните одну команду:

```bash
sh /opt/orbita/deploy/update.sh
```

Скрипт скачает изменения, обновит зависимости, перезапустит службу и проверит, что она отвечает. Обновление занимает около 30 секунд, из них несколько секунд сайт недоступен.

## Шаг 14. Отключите Render

Когда сайт на своем сервере заработал, на Render откройте сервис `orbita-dekanat` → **Settings → Suspend** (приостановить) или **Delete**. Иначе в сети будут две копии сайта. Если меняли ссылку в материалах конкурса (README, видео, документ процесса), замените ее на новый домен.

---

## Полезные команды

| Что | Команда |
| --- | --- |
| Состояние приложения | `systemctl status orbita` |
| Логи приложения (последние 100 строк) | `journalctl -u orbita -n 100 --no-pager` |
| Логи в реальном времени | `journalctl -u orbita -f` |
| Перезапустить приложение | `systemctl restart orbita` |
| Логи Caddy (сертификаты, ошибки прокси) | `journalctl -u caddy -n 100 --no-pager` |
| Свободное место | `df -h /` |
| Память | `free -h` |
| Обновить систему | `apt update && apt -y upgrade` |

## Если что-то не работает

**`systemctl status orbita` показывает `failed`.** Посмотрите `journalctl -u orbita -n 50 --no-pager`. Частые причины:
- `node: not found` или ошибка `node:sqlite` — версия Node.js ниже 22.13, повторите шаг 6;
- `EADDRINUSE` — порт 3000 занят другой программой; поменяйте `PORT` в `/etc/orbita.env` и адрес в `/etc/caddy/Caddyfile`;
- `DATA_KEY слишком короткий` — ключ в `/etc/orbita.env` испорчен; сгенерируйте новый командой `openssl rand -base64 32`.

**Браузер пишет, что сертификат недействителен, или сайт не открывается.** Проверьте:
- `ping ваш-домен` показывает IP сервера;
- порты 80 и 443 открыты и в `ufw`, и в панели хостинга;
- в `journalctl -u caddy` нет ошибок `challenge failed`.

После исправления выполните `systemctl reload caddy`.

**Ошибка 502 Bad Gateway.** Caddy работает, а приложение нет. Смотрите первый пункт.

**Вход не срабатывает: страница перезагружается, но остается на форме.** Сайт открыт по `http://` или по IP-адресу. Cookie входа работают только через `https://` и домен.

**Нет места на диске.** Очистите старые логи: `journalctl --vacuum-size=200M`.

## Безопасность сервера (рекомендуется)

1. **Вход по SSH-ключу вместо пароля.** На своем компьютере выполните `ssh-keygen -t ed25519` (если ключа еще нет), затем `ssh-copy-id root@203.0.113.10`. Проверьте, что вход без пароля работает. После этого в `/etc/ssh/sshd_config` поставьте `PasswordAuthentication no` и выполните `systemctl restart ssh`.
2. **Автоматические обновления безопасности:** `apt -y install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.
3. **Защита от перебора паролей SSH:** `apt -y install fail2ban`. Настройки по умолчанию уже защищают SSH.

В самом приложении защита уже есть:
- пароли хранятся как хэши scrypt;
- персональные поля зашифрованы;
- после 5 неудачных попыток входа аккаунт блокируется на 10 минут;
- изменяющие запросы защищены от CSRF;
- заголовки безопасности и CSP выставлены.

## Альтернатива: Docker

В репозитории есть `Dockerfile`. Если на сервере уже стоит Docker, вместо шагов 6–9 можно выполнить:

```bash
cd /opt/orbita && docker build -t orbita .
```

```bash
docker run -d --name orbita --restart unless-stopped --env-file /etc/orbita.env -e HOST=0.0.0.0 -e DATA_DIR=/app/data -p 127.0.0.1:3000:3000 -v /var/lib/orbita:/app/data orbita
```

Внутри контейнера приложение работает от пользователя с UID 1000, поэтому папке с базой нужен тот же владелец: `chown 1000:1000 /var/lib/orbita`. Caddy (шаг 10) настраивается так же. Но на сервере с 2 ГБ памяти Docker расходует лишние ресурсы, поэтому для этого случая основной вариант — systemd.
