import json
import os
import urllib.request
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

SENDERS = ["7@dosfond.ru", "1@dosfond.ru"]

def send_email(to_email: str, assignee_name: str, assignee_tag: str, task_title: str, deadline: str, status: str, setter: str):
    """Отправляет уведомление исполнителю о новой/изменённой задаче через Resend."""
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key or not to_email:
        return

    filter_url = f"https://zadachi.dosfond.ru/?assignee={assignee_tag.lstrip('@')}"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1E3A5F;">
      <div style="background: #1E3A5F; padding: 20px 28px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 16px; font-weight: 600;">Журнал задач — новое задание</h2>
      </div>
      <div style="background: #F4F6F9; padding: 24px 28px; border-radius: 0 0 8px 8px; border: 1px solid #E0E6EF; border-top: none;">
        <p style="margin: 0 0 16px 0; font-size: 14px;">Привет, <strong>{assignee_name}</strong>!</p>
        <p style="margin: 0 0 20px 0; font-size: 14px;">Тебе назначена задача:</p>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
          <tr style="background: white;">
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF; color: #666; width: 120px;">Задача</td>
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF; font-weight: 600;">{task_title}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF; color: #666; background: #F9FBFC;">Срок</td>
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF; background: #F9FBFC;">{deadline}</td>
          </tr>
          <tr style="background: white;">
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF; color: #666;">Статус</td>
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF;">{status}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF; color: #666; background: #F9FBFC;">Постановщик</td>
            <td style="padding: 10px 14px; border: 1px solid #E0E6EF; background: #F9FBFC;">{setter}</td>
          </tr>
        </table>

        <a href="{filter_url}" style="display: inline-block; background: #1E3A5F; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
          Открыть мои задачи
        </a>

        <p style="margin: 20px 0 0 0; font-size: 11px; color: #999;">Твой тег: <strong>{assignee_tag}</strong></p>
      </div>
    </div>
    """

    payload = json.dumps({
        "from": "Журнал задач <onboarding@resend.dev>",
        "to": [to_email],
        "reply_to": setter if setter in SENDERS else "7@dosfond.ru",
        "subject": f"Новая задача: {task_title}",
        "html": html,
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass

def handler(event: dict, context) -> dict:
    """CRUD для задач. При создании/обновлении задачи с исполнителем отправляет email-уведомление."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    method = event.get('httpMethod', 'GET')
    conn = get_conn()
    cur = conn.cursor()

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
                'id': r[0],
                'title': r[1],
                'deadline': str(r[2]),
                'status': r[3],
                'created_at': str(r[4]),
                'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None
            })
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(data, ensure_ascii=False)}

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
                   a.id, a.name, a.tag, a.email
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()
        conn.close()

        if r[5] and r[8]:
            d = str(r[2])
            parts = d.split("-")
            deadline_fmt = f"{parts[2]}.{parts[1]}.{parts[0]}" if len(parts) == 3 else d
            send_email(r[8], r[6], r[7], r[1], deadline_fmt, r[3], setter)

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
                   a.id, a.name, a.tag, a.email
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()
        conn.close()

        if r[5] and r[8]:
            d = str(r[2])
            parts = d.split("-")
            deadline_fmt = f"{parts[2]}.{parts[1]}.{parts[0]}" if len(parts) == 3 else d
            send_email(r[8], r[6], r[7], r[1], deadline_fmt, r[3], setter)

        result = {
            'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
            'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None
        }
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}