"""One-off bootstrap: promote a user to admin/super_admin by email.

There's no self-serve "become an admin" flow (by design), so the very first admin
account has to be created this way. Run from backend/:

    python scripts/set_admin.py someone@example.com --role super_admin
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.users.models import SystemRole, User  # noqa: E402


async def main(email: str, role: SystemRole) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"No user found with email {email}")
            return
        user.system_role = role
        await db.commit()
        print(f"{email} is now {role.value}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--role", choices=[r.value for r in SystemRole], default="admin")
    args = parser.parse_args()
    asyncio.run(main(args.email, SystemRole(args.role)))
