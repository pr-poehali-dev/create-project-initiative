import json
import os
import re
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def transliterate(text: str) -> str:
    """Транслитерация русского текста в латиницу для генерации тега."""
    table = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo',
        'ж':'zh','з':'z','и':'i','й':'j','к':'k','л':'l','м':'m',
        'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
        'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
        'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    }
    result = ""
    for ch in text.lower():
        result += table.get(ch, ch)
    return result

def generate_tag(name: str, existing_tags: list) -> str:
    """Генерирует уникальный короткий тег: фамилия + первая буква имени."""
    parts = name.strip().split()
    if len(parts) >= 2:
        base = transliterate(parts[0]) + transliterate(parts[1][:1])
    else:
        base = transliterate(parts[0])
    base = re.sub(r'[^a-z0-9]', '', base)[:12]
    tag = f"@{base}"
    if tag not in existing_tags:
        return tag
    i = 2
    while f"@{base}{i}" in existing_tags:
        i += 1
    return f"@{base}{i}"

def handler(event: dict, context) -> dict:
    """CRUD для исполнителей задач. Поддерживает поле email."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    method = event.get('httpMethod', 'GET')
    conn = get_conn()
    cur = conn.cursor()

    if method == 'GET':
        cur.execute("SELECT id, name, tag, email, created_at FROM assignees ORDER BY name")
        rows = cur.fetchall()
        data = [{'id': r[0], 'name': r[1], 'tag': r[2], 'email': r[3], 'created_at': str(r[4])} for r in rows]
        conn.close()
        return {'statusCode': 200, 'headers': {**cors, 'Content-Type': 'application/json'}, 'body': json.dumps(data, ensure_ascii=False)}

    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        name = (body.get('name') or '').strip()
        email = (body.get('email') or '').strip() or None
        if not name:
            conn.close()
            return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'name required'})}

        cur.execute("SELECT tag FROM assignees")
        existing_tags = [r[0] for r in cur.fetchall()]
        tag = generate_tag(name, existing_tags)

        cur.execute(
            "INSERT INTO assignees (name, tag, email) VALUES (%s, %s, %s) RETURNING id, name, tag, email, created_at",
            (name, tag, email)
        )
        row = cur.fetchone()
        conn.commit()
        conn.close()
        return {
            'statusCode': 201,
            'headers': cors,
            'body': json.dumps({'id': row[0], 'name': row[1], 'tag': row[2], 'email': row[3], 'created_at': str(row[4])}, ensure_ascii=False)
        }

    conn.close()
    return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}