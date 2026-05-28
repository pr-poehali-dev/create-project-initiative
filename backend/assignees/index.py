import json
import os
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    """Управление исполнителями: вход по email, список исполнителей."""
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

    # GET ?action=login&email=... — вход по email
    if method == 'GET' and params.get('action') == 'login':
        email_raw = (params.get('email') or '').strip().lower()
        if not email_raw:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'email required'})}

        cur.execute(
            "SELECT id, name, email, is_setter FROM assignees "
            "WHERE LOWER(email) = %s ORDER BY id LIMIT 1",
            (email_raw,)
        )
        row = cur.fetchone()
        conn.close()

        if not row:
            return {'statusCode': 403, 'headers': cors, 'body': json.dumps({'error': 'not_allowed'})}

        assignee_id, name, email, is_setter = row
        if is_setter:
            return {'statusCode': 200, 'headers': cors, 'body': json.dumps({
                'role': 'setter', 'id': assignee_id, 'name': name, 'email': email
            })}
        else:
            return {'statusCode': 200, 'headers': cors, 'body': json.dumps({
                'role': 'executor', 'id': assignee_id, 'name': name, 'email': email
            })}

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}
