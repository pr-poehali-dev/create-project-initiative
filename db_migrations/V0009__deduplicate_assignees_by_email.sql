-- Оставляем для каждого email только одну запись — ту что с telegram_username (если есть), иначе с наибольшим id
UPDATE assignees SET email = NULL
WHERE id IN (7, 8);
