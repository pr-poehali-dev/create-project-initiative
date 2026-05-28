import json
import os
import psycopg2
import bcrypt

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    """Управление исполнителями: вход по email+пароль, установка пароля, список."""
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

    # GET /assignees — только исполнители с email (не постановщики)
    if method == 'GET' and not params.get('action'):
        cur.execute(
            "SELECT id, name, email FROM assignees "
            "WHERE is_setter = FALSE AND email IS NOT NULL ORDER BY name"
        )
        rows = cur.fetchall()
        data = [{'id': r[0], 'name': r[1], 'email': r[2]} for r in rows]
        conn.close()
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps(data, ensure_ascii=False)}

    # POST ?action=login — вход по email + пароль
    if method == 'POST' and params.get('action') == 'login':
        body = json.loads(event.get('body') or '{}')
        email_raw = (body.get('email') or '').strip().lower()
        password = (body.get('password') or '').strip()

        if not email_raw or not password:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'email and password required'})}

        cur.execute(
            "SELECT id, name, email, is_setter, password_hash FROM assignees "
            "WHERE LOWER(email) = %s AND email IS NOT NULL ORDER BY id DESC LIMIT 1",
            (email_raw,)
        )
        row = cur.fetchone()
        conn.close()

        if not row:
            return {'statusCode': 403, 'headers': cors, 'body': json.dumps({'error': 'not_allowed'})}

        assignee_id, name, email, is_setter, password_hash = row

        if not password_hash:
            return {'statusCode': 403, 'headers': cors, 'body': json.dumps({'error': 'no_password'})}

        if not bcrypt.checkpw(password.encode(), password_hash.encode()):
            return {'statusCode': 403, 'headers': cors, 'body': json.dumps({'error': 'wrong_password'})}

        role = 'setter' if is_setter else 'executor'
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps({
            'role': role, 'id': assignee_id, 'name': name, 'email': email
        })}

    # POST ?action=set_password — первичная установка пароля
    if method == 'POST' and params.get('action') == 'set_password':
        body = json.loads(event.get('body') or '{}')
        email_raw = (body.get('email') or '').strip().lower()
        password = (body.get('password') or '').strip()

        if not email_raw or not password:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'email and password required'})}

        if len(password) < 4:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'password_too_short'})}

        cur.execute(
            "SELECT id, name, email, is_setter, password_hash FROM assignees "
            "WHERE LOWER(email) = %s AND email IS NOT NULL ORDER BY id DESC LIMIT 1",
            (email_raw,)
        )
        row = cur.fetchone()

        if not row:
            conn.close()
            return {'statusCode': 403, 'headers': cors, 'body': json.dumps({'error': 'not_allowed'})}

        assignee_id, name, email, is_setter, password_hash = row

        if password_hash:
            conn.close()
            return {'statusCode': 409, 'headers': cors, 'body': json.dumps({'error': 'password_already_set'})}

        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute("UPDATE assignees SET password_hash = %s WHERE id = %s", (hashed, assignee_id))
        conn.commit()
        conn.close()

        role = 'setter' if is_setter else 'executor'
        return {'statusCode': 200, 'headers': cors, 'body': json.dumps({
            'role': role, 'id': assignee_id, 'name': name, 'email': email
        })}

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}
