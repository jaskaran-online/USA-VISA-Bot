import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

# Load .env file
load_dotenv()

SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))

def send_email(subject, body, to_email):
    """Send an email notification."""
    if not SMTP_USER or not SMTP_PASSWORD:
        print("⚠️ Email credentials are missing. Skipping email notification.")
        return False

    try:
        print(f"📧 Sending email to {to_email} via {SMTP_HOST}:{SMTP_PORT}")

        msg = MIMEMultipart()
        msg["From"] = SMTP_USER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))

        # Try both TLS (587) and SSL (465)
        try:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
            server.set_debuglevel(1)  # Debug SMTP connection
            server.starttls()
        except:
            print("⚠️ TLS failed, trying SSL...")
            server = smtplib.SMTP_SSL(SMTP_HOST, 465, timeout=10)

        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()

        print("✅ Email sent successfully!")
        return True
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")
        return False

# Test the function
send_email("Test Subject", "<h1>Hello from Python!</h1>", "recipient@example.com")
