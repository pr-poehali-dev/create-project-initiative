import json
import os
import psycopg2

# Фиксированный список пользователей
SETTERS = ["vyacheslav_dof", "big_nick87"]
ALLOWED_EXECUTORS = ["oleg_petrovisch", "abramovakatya03", "ozxcvb19"]

EXECUTOR_NAMES = {
    "oleg_petrovisch": "Олег",
    "abramovakatya03": "Екатерина",
    "ozxcvb19": "Пользователь",
}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def send_telegram_message(chat_id: int, text: str):
    import urllib.request
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token or not chat_id:
        return
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass

def handler(event: dict, context) -> dict:
    """Управление исполнителями: вход по TG-username, webhook бота, список."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    conn = get_conn()
    cur = conn.cursor()

    # GET /assignees — только исполнители (не постановщики)
    if method == 'GET' and not params.get('action'):
        cur.execute(
            "SELECT id, name, telegram_username, telegram_chat_id FROM assignees "
            "WHERE is_setter = FALSE ORDER BY name"
        )
        rows = cur.fetchall()
        data = [{'id': r[0], 'name': r[1], 'telegram_username': r[2], 'telegram_chat_id': r[3]} for r in rows]
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(data, ensure_ascii=False)}

    # GET ?action=login&tg=@username — вход по TG-username
    if method == 'GET' and params.get('action') == 'login':
        tg_raw = (params.get('tg') or '').strip().lstrip('@').lower()
        if not tg_raw:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'tg required'})}

        # Постановщик
        if tg_raw in SETTERS:
            cur.execute("SELECT id FROM assignees WHERE LOWER(telegram_username) = %s", (f"@{tg_raw}",))
            if not cur.fetchone():
                name = "Вячеслав" if tg_raw == "vyacheslav_dof" else "Николай"
                cur.execute(
                    "INSERT INTO assignees (name, tag, telegram_username, is_setter) VALUES (%s, %s, %s, TRUE)",
                    (name, f"@{tg_raw}", f"@{tg_raw}")
                )
                conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': cors, 'body': json.dumps({'role': 'setter', 'tg': tg_raw})}

        # Исполнитель не из списка
        if tg_raw not in ALLOWED_EXECUTORS:
            conn.close()
            return {'statusCode': 403, 'headers': cors, 'body': json.dumps({'error': 'not_allowed'})}

        # Ищем или создаём исполнителя
        cur.execute(
            "SELECT id, name, telegram_username, telegram_chat_id FROM assignees "
            "WHERE LOWER(telegram_username) = %s",
            (f"@{tg_raw}",)
        )
        row = cur.fetchone()
        if not row:
            name = EXECUTOR_NAMES.get(tg_raw, tg_raw)
            cur.execute(
                "INSERT INTO assignees (name, tag, telegram_username, is_setter) VALUES (%s, %s, %s, FALSE) "
                "RETURNING id, name, telegram_username, telegram_chat_id",
                (name, f"@{tg_raw}", f"@{tg_raw}")
            )
            row = cur.fetchone()
            conn.commit()

        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps({
            'role': 'executor',
            'id': row[0], 'name': row[1], 'telegram_username': row[2], 'telegram_chat_id': row[3]
        })}

    # POST ?action=webhook — обработка обновлений от Telegram-бота
    if method == 'POST' and params.get('action') == 'webhook':
        try:
            body = json.loads(event.get('body') or '{}')
        except Exception:
            conn.close()
            return {'statusCode': 200, 'headers': cors, 'body': '{}'}

        message = body.get('message') or {}
        from_user = message.get('from') or {}
        chat = message.get('chat') or {}
        chat_id = chat.get('id')
        username = (from_user.get('username') or '').lower()

        if chat_id and username:
            cur.execute(
                "UPDATE assignees SET telegram_chat_id = %s WHERE LOWER(telegram_username) = %s "
                "RETURNING id, name",
                (chat_id, f"@{username}")
            )
            row = cur.fetchone()
            conn.commit()
            if row:
                send_telegram_message(chat_id, f"Привет, {row[1]}! Теперь я буду присылать тебе уведомления о новых задачах.")

        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': '{}'}

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}