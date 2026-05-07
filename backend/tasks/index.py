import json
import os
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    """CRUD для задач с привязкой к исполнителям."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    conn = get_conn()
    cur = conn.cursor()

    # GET /  — список задач с данными исполнителя
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

    # POST / — создать задачу
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        title = (body.get('title') or '').strip()
        deadline = body.get('deadline')
        assignee_id = body.get('assignee_id')
        status = body.get('status', 'Новая')

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
                   a.id, a.name, a.tag
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()
        conn.close()
        result = {
            'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
            'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None
        }
        return {'statusCode': 201, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    # PUT / — обновить задачу
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        task_id = body.get('id')
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
                   a.id, a.name, a.tag
            FROM tasks t LEFT JOIN assignees a ON t.assignee_id = a.id
            WHERE t.id = %s
        """, (task_id,))
        r = cur.fetchone()
        conn.close()
        result = {
            'id': r[0], 'title': r[1], 'deadline': str(r[2]), 'status': r[3], 'created_at': str(r[4]),
            'assignee': {'id': r[5], 'name': r[6], 'tag': r[7]} if r[5] else None
        }
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(result, ensure_ascii=False)}

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}
