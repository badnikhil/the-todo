import logging

# Configure logger for email service
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("EmailService")

def send_verification_email(email: str):
    """Simulate sending a verification email to a new user."""
    logger.info(f"📧 Sending Verification Email to {email}")
    logger.info(f"Subject: Welcome to TodoApp - Verify your email")
    logger.info(f"Body: Please click the link to verify your email address.")
    return True

def send_reminder_email(email: str, todo_title: str, due_date: str):
    """Simulate sending a reminder email for an overdue todo."""
    logger.info(f"📧 Sending Reminder Email to {email}")
    logger.info(f"Subject: Reminder - Task '{todo_title}' is overdue!")
    logger.info(f"Body: Your task '{todo_title}' was due on {due_date}. Please complete it soon.")
    return True
