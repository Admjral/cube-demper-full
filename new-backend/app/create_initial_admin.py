"""
@file: create_initial_admin.py
@description: Утилита для создания первоначального администратора в базе данных
@dependencies: app.config.Settings, app.core.security.get_password_hash
@created: 2026-01-28
"""

import asyncio
import uuid
from datetime import datetime

import asyncpg

from .config import settings
from .core.security import get_password_hash
from typing import Optional


async def create_admin(email: str, password: str, full_name: Optional[str] = None) -> None:
  """
  Создаёт пользователя с ролью admin, если такого email ещё нет.
  Использовать как скрипт и вызывать вручную при деплое.
  """
  conn: Optional[asyncpg.Connection] = None
  try:
    conn = await asyncpg.connect(settings.database_url)

    existing = await conn.fetchrow(
      "SELECT id, role FROM users WHERE email = $1",
      email,
    )

    if existing:
      print(f"[create_initial_admin] Пользователь {email} уже существует с ролью {existing['role']}")
      if existing["role"] != "admin":
        await conn.execute(
          "UPDATE users SET role = 'admin' WHERE id = $1",
          existing["id"],
        )
        print(f"[create_initial_admin] Роль пользователя {email} обновлена до admin")
      return

    password_hash = get_password_hash(password)
    now = datetime.utcnow()

    user_id = uuid.uuid4()
    await conn.execute(
      """
      INSERT INTO users (id, email, password_hash, full_name, role, is_blocked, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'admin', false, $5, $6)
      """,
      user_id,
      email,
      password_hash,
      full_name,
      now,
      now,
    )

    print(f"[create_initial_admin] Администратор {email} успешно создан (id={user_id})")
  finally:
    if conn:
      await conn.close()


if __name__ == "__main__":
  """
  Пример использования:

  PYTHONPATH=new-backend python -m app.create_initial_admin \\
    admin@example.com "SuperSecurePassword123" "Главный администратор"

  Для production рекомендуется передавать пароль через переменные окружения
  или секреты, а не хранить его в коде.
  """
  import argparse

  parser = argparse.ArgumentParser(description="Создание первоначального администратора")
  parser.add_argument("email", help="Email администратора")
  parser.add_argument("password", help="Пароль администратора")
  parser.add_argument(
    "--full-name",
    help="Полное имя администратора",
    default="Администратор",
  )

  args = parser.parse_args()

  asyncio.run(create_admin(args.email, args.password, args.full_name))

