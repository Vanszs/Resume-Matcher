import asyncio
import argparse
from prisma import Prisma
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

import sys
import os

# Add the parent directory to sys.path to allow absolute imports from 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings

async def main():
    email = settings.default_admin_email
    password = settings.default_admin_password
    username = settings.default_admin_username

    prisma = Prisma()
    await prisma.connect()

    try:
        # Check if admin role exists
        admin_role = await prisma.role.find_unique(where={"name": "admin"})
        if not admin_role:
            admin_role = await prisma.role.create(
                data={
                    "name": "admin",
                    "permissions": '["*"]'
                }
            )
            print("Created 'admin' role.")

        # Ensure 'user' role exists for self-registration and admin Add User form
        user_role = await prisma.role.find_unique(where={"name": "user"})
        if not user_role:
            await prisma.role.create(
                data={
                    "name": "user",
                    "permissions": "[]"
                }
            )
            print("Created 'user' role.")

        # Check if user already exists
        existing_user = await prisma.user.find_unique(where={"email": email})
        if existing_user:
            print(f"User with email {email} already exists.")
            return

        # Create user
        hashed_password = pwd_context.hash(password)
        user = await prisma.user.create(
            data={
                "email": email,
                "username": username,
                "passwordHash": hashed_password,
                "roleId": admin_role.id,
                "isActive": True
            }
        )
        print(f"Successfully created admin user: {user.email}")

    except Exception as e:
        print(f"Error seeding admin: {e}")
    finally:
        await prisma.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
