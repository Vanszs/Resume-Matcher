"""Email service for sending OTPs and notifications."""

import logging
import random
import string
from datetime import datetime, timedelta, timezone
import resend

from app.config import settings
from app.prisma_db import prisma

logger = logging.getLogger(__name__)

# Configure Resend with API key from settings
if settings.resend_api_key:
    resend.api_key = settings.resend_api_key

def generate_otp(length: int = 6) -> str:
    """Generate a random numeric OTP."""
    digits = string.digits
    return "".join(random.choice(digits) for _ in range(length))

async def create_verification_token(user_id: str, token_type: str = "EMAIL_VERIFICATION", expires_in_minutes: int = 15) -> str:
    """
    Generate a new OTP, invalidate old ones of the same type, and save to database.
    Returns the newly generated 6-digit OTP code (plaintext).
    """
    # 1. Invalidate any existing active tokens of the same type for this user
    await prisma.verificationtoken.update_many(
        where={
            "userId": user_id,
            "type": token_type,
            "isRevoked": False,
        },
        data={"isRevoked": True},
    )

    # 2. Generate new OTP and expiration time
    otp_code = generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes)

    # 3. Save to database
    await prisma.verificationtoken.create(
        data={
            "userId": user_id,
            "token": otp_code,
            "type": token_type,
            "expiresAt": expires_at,
            "isRevoked": False,
        }
    )

    return otp_code

async def send_verification_email(email_address: str, otp_code: str) -> bool:
    """
    Send the 6-digit OTP to the user's email address using Resend.
    Returns True if successful, False otherwise.
    """
    if not settings.resend_api_key:
        logger.warning(
            f"RESEND_API_KEY is missing. In a real environment, we would send OTP '{otp_code}' to {email_address}."
        )
        return False

    try:
        # Brutalist / Swiss Style HTML Email Template
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    background-color: #F0F0E8;
                    color: #101922;
                    margin: 0;
                    padding: 40px;
                }}
                .container {{
                    max-width: 500px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border: 4px solid #101922;
                    padding: 30px;
                    box-shadow: 8px 8px 0px 0px #101922;
                }}
                .header {{
                    border-bottom: 2px solid #101922;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }}
                .logo-text {{
                    font-size: 24px;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: -0.05em;
                }}
                .title {{
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }}
                .otp-box {{
                    background-color: #FDFBF7;
                    border: 2px solid #101922;
                    padding: 20px;
                    text-align: center;
                    margin: 20px 0;
                    box-shadow: 4px 4px 0px 0px #1D4ED8;
                }}
                .otp-code {{
                    font-family: 'SF Mono', Consolas, monospace;
                    font-size: 36px;
                    font-weight: bold;
                    letter-spacing: 0.2em;
                    color: #1D4ED8;
                }}
                .footer {{
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 2px solid #101922;
                    font-size: 12px;
                    color: #4B5563;
                }}
                .warning {{
                    display: inline-block;
                    background-color: #F97316;
                    color: white;
                    padding: 2px 6px;
                    font-weight: bold;
                    font-size: 10px;
                    text-transform: uppercase;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo-text">✦ Resume Matcher</span>
                </div>
                
                <div class="title">Verify your email address</div>
                <p>Please use the following verification code to complete your sign in process.</p>
                
                <div class="otp-box">
                    <div class="otp-code">{otp_code}</div>
                </div>
                
                <p><strong>This code will expire in 15 minutes.</strong></p>
                <p>If you didn't request this code, you can safely ignore this email.</p>
                
                <div class="footer">
                    <p><span class="warning">Notice</span> This is an automated message. Please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """

        response = resend.Emails.send({
            "from": f"Resume Matcher <{settings.resend_from_email}>",
            "to": [email_address],
            "subject": f"{otp_code} is your Resume Matcher verification code",
            "html": html_content,
        })
        
        logger.info(f"OTP verification email sent to {email_address}, Resend ID: {response.get('id')}")
        return True

    except Exception as e:
        logger.error(f"Failed to send verification email to {email_address}: {str(e)}")
        return False
