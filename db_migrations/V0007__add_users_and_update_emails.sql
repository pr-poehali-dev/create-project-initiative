-- Обновляем email Вячеславу (id=17)
UPDATE assignees SET email = '1@dosfond.ru' WHERE id = 17;

-- Обновляем email Олегу (id=15, без email)
UPDATE assignees SET email = 'oleggur0912@icloud.com' WHERE id = 15;

-- Добавляем УК (постановщик)
INSERT INTO assignees (name, tag, email, is_setter)
VALUES ('УК', '@uk_dosfond', '3@dosfond.ru', TRUE);

-- Добавляем Веронику (исполнитель)
INSERT INTO assignees (name, tag, email, is_setter)
VALUES ('Вероника', '@veronika_dof', 'sva.dof@gmail.com', FALSE);
