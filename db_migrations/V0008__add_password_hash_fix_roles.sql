-- Добавляем колонку для хранения хэша пароля
ALTER TABLE assignees ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Исправляем роль УК — исполнитель, не постановщик
UPDATE assignees SET is_setter = FALSE WHERE email = '3@dosfond.ru';

-- Исправляем роль Николая — он может ставить задачи (setter)
UPDATE assignees SET is_setter = TRUE WHERE email = '7@dosfond.ru';

-- Оставляем только "правильные" записи по каждому уникальному email:
-- удалять нельзя, поэтому отмечаем дубли через обнуление email у старых записей (без telegram_username)
UPDATE assignees SET email = NULL
WHERE telegram_username IS NULL
  AND email IN ('test@example.com', 'oleggur0912@icloud.com', '7@dosfond.ru')
  AND id NOT IN (
    SELECT MIN(id) FROM assignees
    WHERE telegram_username IS NULL AND email IS NOT NULL
    GROUP BY email
  );
