import asyncio
import argparse
from prisma import Prisma
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def main(email: str, password: str, username: str):
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
    parser = argparse.ArgumentParser(description="Seed the initial admin user.")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password")
    parser.add_argument("--username", default="admin", help="Admin username")
    
    args = parser.parse_args()
    asyncio.run(main(args.email, args.password, args.username))
