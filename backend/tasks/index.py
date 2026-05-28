import json
import os
import urllib.request
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def send_email(to_email: str, to_name: str, task_title: str, deadline: str, status: str, setter_email: str):
    """Отправляет email через Resend API."""
    import sys
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        print(f"[EMAIL] ERROR: RESEND_API_KEY not set", file=sys.stderr)
        return
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <div style="background: #1E3A5F; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
        <h2 style="color: white; margin: 0; font-size: 18px;">📋 Новая задача</h2>
        <p style="color: rgba(255,255,255,0.6); margin: 4px 0 0; font-size: 12px;">Журнал задач · ДОС Фонд</p>
      </div>
      <h3 style="color: #1E3A5F; font-size: 16px; margin: 0 0 16px;">{task_title}</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #444;">
        <tr><td style="padding: 6px 0; color: #888;">Срок:</td><td style="padding: 6px 0; font-weight: bold; color: #1E3A5F;">{deadline}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Статус:</td><td style="padding: 6px 0;">{status}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Постановщик:</td><td style="padding: 6px 0;">{setter_email}</td></tr>
      </table>
    </div>
    """
    payload = json.dumps({
        "from": "Журнал задач <tasks@dosfond.ru>",
        "to": [{"email": to_email, "name": to_name}],
        "subject": f"📋 Новая задача: {task_title}",
        "html": html,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        print(f"[EMAIL] sent to {to_email}, status={resp.status}", file=sys.stderr)
    except Exception as e:
        print(f"[EMAIL] ERROR sending to {to_email}: {e}", file=sys.stderr)

def notify_assignee(cur, assignee_id, task_title: str, deadline: str, status: str, setter_email: str):
    """Отправляет уведомление исполнителю по email."""
    import sys
    if not assignee_id:
        return
    cur.execute("SELECT name, email FROM assignees WHERE id = %s", (assignee_id,))
    row = cur.fetchone()
    if not row:
        print(f"[EMAIL] assignee id={assignee_id} not found", file=sys.stderr)
        return
    name, email = row
    if not email:
        print(f"[EMAIL] {name} has no email", file=sys.stderr)
        return
    print(f"[EMAIL] notify_assignee: sending to {name} ({email})", file=sys.stderr)
    send_email(email, name, task_title, deadline, status, setter_email)

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
        setter_email = body.get('setter_email', '')

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
            notify_assignee(cur, assignee_id, title, fmt_deadline(r[2]), status, setter_email)

        conn.close()
        result = {'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
                  'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None}
        return {'statusCode': 201, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    # PUT — обновить задачу
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        task_id = body.get('id')
        setter_email = body.get('setter_email', '')
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
            notify_assignee(cur, r[5], r[1], fmt_deadline(r[2]), r[3], setter_email)

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