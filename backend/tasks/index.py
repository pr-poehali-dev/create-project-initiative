import json
import os
import urllib.request
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def send_telegram(chat_id: int, text: str):
    """Отправляет сообщение в Telegram по числовому chat_id."""
    import sys
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        print(f"[TG] ERROR: TELEGRAM_BOT_TOKEN not set", file=sys.stderr)
        return
    if not chat_id:
        print(f"[TG] ERROR: chat_id is empty", file=sys.stderr)
        return
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        print(f"[TG] sent to chat_id={chat_id}, status={resp.status}", file=sys.stderr)
    except Exception as e:
        print(f"[TG] ERROR sending to chat_id={chat_id}: {e}", file=sys.stderr)

def notify_assignee(cur, assignee_id, task_title: str, deadline: str, status: str, setter_tg: str):
    """Отправляет уведомление исполнителю если у него есть telegram_chat_id."""
    import sys
    if not assignee_id:
        print(f"[TG] notify_assignee: assignee_id is empty", file=sys.stderr)
        return
    cur.execute("SELECT name, telegram_chat_id, telegram_username FROM assignees WHERE id = %s", (assignee_id,))
    row = cur.fetchone()
    if not row:
        print(f"[TG] notify_assignee: assignee id={assignee_id} not found", file=sys.stderr)
        return
    name, chat_id, tg_username = row
    if not chat_id:
        print(f"[TG] notify_assignee: {name} ({tg_username}) has no telegram_chat_id — они не писали боту /start", file=sys.stderr)
        return
    text = (
        f"\U0001f4cb *Новая задача*\n\n"
        f"*{task_title}*\n\n"
        f"\U0001f4c5 Срок: {deadline}\n"
        f"\U0001f516 Статус: {status}\n"
        f"\U0001f464 Постановщик: @{setter_tg}"
    )
    print(f"[TG] notify_assignee: sending to {name} (chat_id={chat_id})", file=sys.stderr)
    send_telegram(chat_id, text)

def fmt_deadline(d):
    parts = str(d).split("-")
    return f"{parts[2]}.{parts[1]}.{parts[0]}" if len(parts) == 3 else str(d)

def handler(event: dict, context) -> dict:
    """CRUD задач + комментарии + удаление. Уведомления в Telegram при назначении задачи."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    conn = get_conn()
    cur = conn.cursor()

    # GET ?comments=1&task_id=X
    if method == 'GET' and params.get('comments'):
        task_id = params.get('task_id')
        if not task_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'task_id required'})}
        cur.execute("""
            SELECT c.id, c.task_id, c.text, c.created_at, a.id, a.name, a.telegram_username
            FROM task_comments c
            JOIN assignees a ON c.assignee_id = a.id
            WHERE c.task_id = %s
            ORDER BY c.created_at ASC
        """, (task_id,))
        rows = cur.fetchall()
        data = [{'id': r[0], 'task_id': r[1], 'text': r[2], 'created_at': str(r[3]),
                 'assignee': {'id': r[4], 'name': r[5], 'tag': r[6]}} for r in rows]
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(data, ensure_ascii=False)}

    # GET задач (archived=1 для архива)
    if method == 'GET':
        archived = params.get('archived') == '1'
        status_filter = "t.status = 'Выполнена'" if archived else "t.status != 'Выполнена'"
        cur.execute(f"""
            SELECT t.id, t.title, t.deadline, t.status, t.created_at,
                   a.id, a.name, a.telegram_username
            FROM tasks t
            LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE {status_filter}
            ORDER BY t.created_at DESC
        """)
        rows = cur.fetchall()
        data = [{'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
                 'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None} for r in rows]
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(data, ensure_ascii=False)}

    # POST ?action=comment
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
        cur.execute("SELECT id, name, telegram_username FROM assignees WHERE id = %s", (assignee_id,))
        a = cur.fetchone()
        conn.close()
        result = {'id': r[0], 'task_id': r[1], 'text': r[2], 'created_at': str(r[3]),
                  'assignee': {'id': a[0], 'name': a[1], 'tag': a[2]}}
        return {'statusCode': 201, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    # POST — создать задачу
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        title = (body.get('title') or '').strip()
        deadline = body.get('deadline')
        assignee_id = body.get('assignee_id') or None
        status = body.get('status', 'Новая')
        setter_tg = body.get('setter_tg', '')

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
                   a.id, a.name, a.telegram_username
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()

        if assignee_id:
            notify_assignee(cur, assignee_id, title, fmt_deadline(r[2]), status, setter_tg)

        conn.close()
        result = {'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
                  'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None}
        return {'statusCode': 201, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    # PUT — обновить задачу
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        task_id = body.get('id')
        setter_tg = body.get('setter_tg', '')
        if not task_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'id required'})}

        fields, values = [], []
        for f in ['title', 'deadline', 'status', 'assignee_id']:
            if f in body:
                fields.append(f"{f} = %s")
                values.append(body[f] if f != 'assignee_id' else (body[f] or None))
        if not fields:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'no fields to update'})}

        # Запомним старого исполнителя до обновления
        cur.execute("SELECT assignee_id FROM tasks WHERE id = %s", (task_id,))
        old_row = cur.fetchone()
        old_assignee_id = old_row[0] if old_row else None
        new_assignee_id = body.get('assignee_id') or None

        values.append(task_id)
        cur.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()

        cur.execute("""
            SELECT t.id, t.title, t.deadline, t.status, t.created_at,
                   a.id, a.name, a.telegram_username
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()

        # Уведомляем только если исполнитель изменился (новое назначение)
        assignee_changed = 'assignee_id' in body and str(new_assignee_id) != str(old_assignee_id)
        if r[5] and assignee_changed and r[3] != 'Выполнена':
            notify_assignee(cur, r[5], r[1], fmt_deadline(r[2]), r[3], setter_tg)

        conn.close()
        result = {'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
                  'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None}
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    # DELETE — удалить задачу
    if method == 'DELETE':
        params_del = event.get('queryStringParameters') or {}
        task_id = params_del.get('id')
        if not task_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'id required'})}
        cur.execute("DELETE FROM task_comments WHERE task_id = %s", (task_id,))
        cur.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps({'ok': True})}

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}