"""Template engine for notification rendering.

Uses Jinja2 for variable substitution. Supports:
- HTML + plain text templates
- Dynamic variables ({{ user_name }}, {{ ticket_id }}, etc.)
- Per-tenant branding wrapper (logo, colors, footer)
- Multi-language
- HTML sanitization (optional)
"""

import re
from typing import Any

from jinja2 import Environment, BaseLoader, select_autoescape
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Jinja2 environment (sandboxed — no file system access)
_jinja_env = Environment(
    loader=BaseLoader(),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


class TemplateEngine:
    """Renders notification templates with Jinja2."""

    def render(
        self,
        template_str: str,
        variables: dict[str, Any] | None = None,
    ) -> str:
        """Render a Jinja2 template string with variables."""
        if not template_str:
            return ""
        try:
            template = _jinja_env.from_string(template_str)
            return template.render(**(variables or {}))
        except Exception as e:
            logger.warning("template_render_failed", error=str(e), template=template_str[:200])
            # Return the raw template on error (better than crashing)
            return template_str

    def render_email(
        self,
        *,
        subject_template: str | None = None,
        html_template: str | None = None,
        text_template: str | None = None,
        variables: dict[str, Any] | None = None,
        branding_html: str | None = None,
        apply_branding: bool = True,
    ) -> dict[str, str | None]:
        """Render an email template (subject + HTML + text).

        If apply_branding is True and branding_html is provided, the HTML
        body is wrapped in the branding template (which must contain
        {{ content }}).
        """
        subject = self.render(subject_template or "", variables) if subject_template else None
        html = self.render(html_template or "", variables) if html_template else None
        text = self.render(text_template or "", variables) if text_template else None

        # Wrap HTML in branding template
        if apply_branding and html and branding_html:
            try:
                from markupsafe import Markup
                branding_template = _jinja_env.from_string(branding_html)
                html = branding_template.render(content=Markup(html), **(variables or {}))
            except Exception as e:
                logger.warning("branding_render_failed", error=str(e))

        return {"subject": subject, "html": html, "text": text}

    def render_sms(
        self,
        body_template: str,
        variables: dict[str, Any] | None = None,
    ) -> str:
        """Render an SMS template (plain text only)."""
        return self.render(body_template, variables)

    def render_push(
        self,
        *,
        title_template: str,
        body_template: str,
        variables: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """Render a push notification template."""
        return {
            "title": self.render(title_template, variables),
            "body": self.render(body_template, variables),
        }

    @staticmethod
    def extract_variables(template_str: str) -> list[str]:
        """Extract variable names from a Jinja2 template string."""
        pattern = r"\{\{\s*(\w+)\s*\}\}"
        matches = re.findall(pattern, template_str or "")
        return list(set(matches))

    @staticmethod
    def sanitize_html(html: str) -> str:
        """Basic HTML sanitization (removes script tags)."""
        if not settings.TEMPLATE_SANITIZE_HTML:
            return html
        # Remove <script> tags
        html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.IGNORECASE | re.DOTALL)
        # Remove on* attributes
        html = re.sub(r'\s+on\w+\s*=\s*"[^"]*"', "", html, flags=re.IGNORECASE)
        html = re.sub(r"\s+on\w+\s*=\s*'[^']*'", "", html, flags=re.IGNORECASE)
        return html

    @staticmethod
    def default_email_wrapper(
        *,
        company_name: str = "Dayjoy AI",
        logo_url: str | None = None,
        primary_color: str = "#2563eb",
        background_color: str = "#f8fafc",
        text_color: str = "#1e293b",
        footer_text: str | None = None,
    ) -> str:
        """Generate a default HTML email wrapper with branding."""
        logo_html = f'<img src="{logo_url}" alt="{company_name}" style="max-height:40px;margin-bottom:20px"/>' if logo_url else ""
        footer_html = f'<p style="font-size:12px;color:#94a3b8;margin-top:30px">{footer_text}</p>' if footer_text else ""

        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:{background_color};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:{text_color}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{background_color};padding:20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<tr><td style="padding:30px 40px;background:{primary_color}">{logo_html}<h1 style="color:#ffffff;margin:0;font-size:20px">{company_name}</h1></td></tr>
<tr><td style="padding:30px 40px">{{{{ content }}}}</td></tr>
<tr><td style="padding:20px 40px;background:{background_color};border-top:1px solid #e2e8f0">{footer_html}<p style="font-size:12px;color:#94a3b8;margin:0">&copy; {company_name}</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
