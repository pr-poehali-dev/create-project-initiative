import json
import os
import urllib.request
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

SENDERS = ["7@dosfond.ru", "1@dosfond.ru"]

def send_telegram(tg_username: str, assignee_name: str, assignee_tag: str, task_title: str, deadline: str, status: str, setter: str):
    """Отправляет уведомление исполнителю в Telegram через бота."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token or not tg_username:
        return

    username = tg_username.lstrip("@")
    text = (
        f"📋 *Новая задача*\n\n"
        f"*{task_title}*\n\n"
        f"📅 Срок: {deadline}\n"
        f"🔖 Статус: {status}\n"
        f"👤 Постановщик: {setter}\n\n"
        f"Твой тег: `{assignee_tag}`"
    )

    payload = json.dumps({
        "chat_id": f"@{username}",
        "text": text,
        "parse_mode": "Markdown",
    }).encode()

    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass

def handler(event: dict, context) -> dict:
    """CRUD для задач и комментариев. GET ?comments=1&task_id=X — список комментариев. POST/PUT — задачи. POST ?action=comment — добавить комментарий."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    conn = get_conn()
    cur = conn.cursor()

    # GET комментариев: ?comments=1&task_id=X
    if method == 'GET' and params.get('comments'):
        task_id = params.get('task_id')
        if not task_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'task_id required'})}
        cur.execute("""
            SELECT c.id, c.task_id, c.text, c.created_at, a.id, a.name, a.tag
            FROM task_comments c
            JOIN assignees a ON c.assignee_id = a.id
            WHERE c.task_id = %s
            ORDER BY c.created_at ASC
        """, (task_id,))
        rows = cur.fetchall()
        data = [{
            'id': r[0], 'task_id': r[1], 'text': r[2], 'created_at': str(r[3]),
            'assignee': {'id': r[4], 'name': r[5], 'tag': r[6]}
        } for r in rows]
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(data, ensure_ascii=False)}

    # GET задач
    if method == 'GET':
        cur.execute("""
            SELECT t.id, t.title, t.deadline, t.status, t.created_at,
                   a.id, a.name, a.tag
            FROM tasks t
            LEFT JOIN assignees a ON t.assignee_id = a.id
            ORDER BY t.created_at DESC
        """)
        rows = cur.fetchall()
        data = []
        for r in rows:
            data.append({
                'id': r[0], 'title': r[1], 'deadline': str(r[2]),
                'status': r[3], 'created_at': str(r[4]),
                'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None
            })
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(data, ensure_ascii=False)}

    # POST комментария: ?action=comment
    if method == 'POST' and params.get('action') == 'comment':
        body = json.loads(event.get('body') or '{}')
        task_id = body.get('task_id')
        assignee_id = body.get('assignee_id')
        text = (body.get('text') or '').strip()[:100]
        if not task_id or not assignee_id or not text:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'task_id, assignee_id, text required'})}
        cur.execute(
            "INSERT INTO task_comments (task_id, assignee_id, text) VALUES (%s, %s, %s) RETURNING id, task_id, text, created_at",
            (task_id, assignee_id, text)
        )
        r = cur.fetchone()
        conn.commit()
        cur.execute("SELECT id, name, tag FROM assignees WHERE id = %s", (assignee_id,))
        a = cur.fetchone()
        conn.close()
        result = {
            'id': r[0], 'task_id': r[1], 'text': r[2], 'created_at': str(r[3]),
            'assignee': {'id': a[0], 'name': a[1], 'tag': a[2]}
        }
        return {'statusCode': 201, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    # POST новой задачи
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        title = (body.get('title') or '').strip()
        deadline = body.get('deadline')
        assignee_id = body.get('assignee_id')
        status = body.get('status', 'Новая')
        setter = body.get('setter', '7@dosfond.ru')

        if not title or not deadline:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'title and deadline required'})}

        cur.execute(
            "INSERT INTO tasks (title, assignee_id, deadline, status) VALUES (%s, %s, %s, %s) RETURNING id",
            (title, assignee_id, deadline, status)
        )
        task_id = cur.fetchone()[0]
        conn.commit()

        cur.execute("""
            SELECT t.id, t.title, t.deadline, t.status, t.created_at,
                   a.id, a.name, a.tag, a.telegram_username
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()
        conn.close()

        if r[5] and r[8]:
            d = str(r[2])
            parts = d.split("-")
            deadline_fmt = f"{parts[2]}.{parts[1]}.{parts[0]}" if len(parts) == 3 else d
            send_telegram(r[8], r[6], r[7], r[1], deadline_fmt, r[3], setter)

        result = {
            'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
            'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None
        }
        return {'statusCode': 201, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        task_id = body.get('id')
        setter = body.get('setter', '7@dosfond.ru')
        if not task_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'id required'})}

        fields, values = [], []
        for f in ['title', 'deadline', 'status', 'assignee_id']:
            if f in body:
                fields.append(f"{f} = %s")
                values.append(body[f])
        if not fields:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'no fields to update'})}

        values.append(task_id)
        cur.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()

        cur.execute("""
            SELECT t.id, t.title, t.deadline, t.status, t.created_at,
                   a.id, a.name, a.tag, a.telegram_username
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()
        conn.close()

        if r[5] and r[8]:
            d = str(r[2])
            parts = d.split("-")
            deadline_fmt = f"{parts[2]}.{parts[1]}.{parts[0]}" if len(parts) == 3 else d
            send_telegram(r[8], r[6], r[7], r[1], deadline_fmt, r[3], setter)

        result = {
            'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
            'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None
        }
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}
